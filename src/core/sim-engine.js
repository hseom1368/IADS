/**
 * @module core/sim-engine
 * SimEngine 클래스 — requestAnimationFrame 기반 메인 루프
 * step(dt): 위협 이동 → 센서 탐지 → 교전 판정 → 요격미사일 유도 → 충돌 판정
 * Cesium 의존성 없음
 */

import { ShooterEntity, SensorEntity, ThreatEntity, InterceptorEntity } from './entities.js';
import { slantRange, ballisticTrajectory, pngGuidance, isInSector } from './physics.js';

// ── 상수 ──
const KILL_RADIUS = 0.5;       // km (충돌 판정 거리)
const MAX_DT = 0.05;           // 최대 dt (초, 20fps 보장)
const MISS_DISTANCE_GROWTH = 3; // km (miss 판정: 거리가 이만큼 증가하면)

export class SimEngine {
  /**
   * @param {import('./registry.js').Registry} registry
   */
  constructor(registry) {
    this._registry = registry;

    // 시간 관리
    this.simTime = 0;
    this.timeScale = 1.0;

    // 상태 머신
    this.state = 'READY'; // READY|RUNNING|PAUSED|COMPLETE

    // 엔티티 컬렉션
    this._threats = new Map();
    this._shooters = new Map();
    this._sensors = new Map();
    this._interceptors = new Map();

    // 교전 기록 (중복 교전 방지)
    this._engagedThreats = new Set(); // 이미 교전 중인 위협 ID

    // 이벤트 버스
    this._listeners = {};

    // rAF
    this._rafId = null;
    this._lastTimestamp = 0;
  }

  // ═══════════════════════════════════════════════════════════
  //  이벤트 버스
  // ═══════════════════════════════════════════════════════════

  /**
   * 이벤트 핸들러를 등록한다.
   * @param {string} event
   * @param {Function} handler
   */
  on(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
  }

  /**
   * 이벤트 핸들러를 제거한다.
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(h => h !== handler);
  }

  /**
   * 이벤트를 발행한다.
   * @param {string} event
   * @param {Object} detail
   */
  emit(event, detail) {
    if (!this._listeners[event]) return;
    for (const handler of this._listeners[event]) {
      handler(detail);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  상태 머신
  // ═══════════════════════════════════════════════════════════

  /** READY|PAUSED → RUNNING */
  play() {
    if (this.state === 'READY' || this.state === 'PAUSED') {
      this.state = 'RUNNING';
    }
  }

  /** RUNNING → PAUSED */
  pause() {
    if (this.state === 'RUNNING') {
      this.state = 'PAUSED';
    }
  }

  /** any → READY (초기화) */
  reset() {
    this.state = 'READY';
    this.simTime = 0;
    this._threats.clear();
    this._shooters.clear();
    this._sensors.clear();
    this._interceptors.clear();
    this._engagedThreats.clear();
    this._listeners = {};
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  엔티티 관리
  // ═══════════════════════════════════════════════════════════

  /**
   * 위협을 추가한다.
   * @param {string} id
   * @param {string} typeId
   * @param {{lon:number,lat:number,alt:number}} origin
   * @param {{lon:number,lat:number,alt:number}} target
   * @param {number} launchTime
   * @returns {ThreatEntity}
   */
  addThreat(id, typeId, origin, target, launchTime) {
    const threat = new ThreatEntity(id, typeId, { origin, target, launchTime }, this._registry);
    // 비행 시간 추정 (origin→target 거리 / 기본 속도)
    const dist = slantRange(origin, target);
    const threatType = this._registry.getThreatType(typeId);
    threat._estimatedFlightTime = (dist * 1000) / threatType.speed;
    this._threats.set(id, threat);
    this.emit('threat-spawned', { threatId: id, threatTypeId: typeId, position: { ...origin } });
    return threat;
  }

  /**
   * 사수를 추가한다.
   * @param {string} id
   * @param {string} typeId
   * @param {{lon:number,lat:number,alt:number}} position
   * @returns {ShooterEntity}
   */
  addShooter(id, typeId, position) {
    const shooter = new ShooterEntity(id, typeId, position, this._registry);
    this._shooters.set(id, shooter);
    return shooter;
  }

  /**
   * 센서를 추가한다.
   * @param {string} id
   * @param {string} typeId
   * @param {{lon:number,lat:number,alt:number}} position
   * @param {number} [azCenter=0] - 레이더 중심 방위각 (degrees)
   * @returns {SensorEntity}
   */
  addSensor(id, typeId, position, azCenter = 0) {
    const sensor = new SensorEntity(id, typeId, position, this._registry);
    sensor._azCenter = azCenter;
    this._sensors.set(id, sensor);
    return sensor;
  }

  /** @returns {ThreatEntity[]} */
  getAllThreats() { return Array.from(this._threats.values()); }
  /** @returns {ShooterEntity[]} */
  getAllShooters() { return Array.from(this._shooters.values()); }
  /** @returns {SensorEntity[]} */
  getAllSensors() { return Array.from(this._sensors.values()); }
  /** @returns {InterceptorEntity[]} */
  getAllInterceptors() { return Array.from(this._interceptors.values()); }

  // ═══════════════════════════════════════════════════════════
  //  Pk 계산
  // ═══════════════════════════════════════════════════════════

  /**
   * 교전 확률을 계산한다.
   * @param {ThreatEntity} threat
   * @param {ShooterEntity} shooter
   * @returns {number} 0.0 ~ 1.0
   */
  computePk(threat, shooter) {
    const cap = this._registry.getShooterCapability(shooter.typeId);
    if (!cap) return 0;

    const basePk = cap.pkTable[threat.typeId];
    if (!basePk) return 0;

    const dist = slantRange(shooter.position, threat.position);
    if (dist > cap.maxRange) return 0;

    const rangeFactor = Math.max(0, 1 - (dist / cap.maxRange) ** 2);
    const maneuverPenalty = threat.isManeuvering() ? 0.85 : 1.0;

    return basePk * rangeFactor * maneuverPenalty;
  }

  // ═══════════════════════════════════════════════════════════
  //  step(dt) — 메인 시뮬레이션 루프
  // ═══════════════════════════════════════════════════════════

  /**
   * 1프레임 시뮬레이션을 실행한다.
   * @param {number} dt - 실제 경과 시간 (초)
   */
  step(dt) {
    if (this.state !== 'RUNNING') return;

    const dtSim = Math.min(dt, MAX_DT) * this.timeScale;
    this.simTime += dtSim;

    this._stepThreats(dtSim);
    this._stepSensors(dtSim);
    this._stepEngagements(dtSim);
    this._stepInterceptors(dtSim);
    this._stepCollisions(dtSim);
    this._checkComplete();
  }

  // ── Phase 1: 위협 이동 ──

  /** @private */
  _stepThreats(dt) {
    for (const threat of this._threats.values()) {
      if (threat.state === 'intercepted' || threat.state === 'leaked') continue;

      // 비행 진행률 업데이트
      const elapsed = this.simTime - threat.launchTime;
      threat.flightProgress = Math.min(1.0, elapsed / (threat._estimatedFlightTime || 300));

      // 속도 계산
      const threatType = this._registry.getThreatType(threat.typeId);
      const speedMult = threat.getCurrentSpeedMult();
      const speed = threatType.speed * speedMult;

      // 첫 프레임에서 초기 속도 설정 (origin → target 방향)
      if (threat.velocity.x === 0 && threat.velocity.y === 0 && threat.velocity.z === 0) {
        this._initThreatVelocity(threat, speed);
      }

      // 속도 크기 업데이트 (방향 유지, 크기만 변경)
      const velMag = Math.sqrt(
        threat.velocity.x ** 2 + threat.velocity.y ** 2 + threat.velocity.z ** 2
      );
      if (velMag > 0) {
        const scale = speed / velMag;
        threat.velocity = {
          x: threat.velocity.x * scale,
          y: threat.velocity.y * scale,
          z: threat.velocity.z * scale
        };
      }

      // 탄도 궤적 적분
      const result = ballisticTrajectory(threat.position, threat.velocity, dt);
      threat.position = result.pos;
      threat.velocity = result.vel;

      // 상태 업데이트
      if (threat.position.alt <= 0 || threat.flightProgress >= 1.0) {
        threat.state = 'leaked';
        this.emit('threat-leaked', {
          threatId: threat.id,
          position: { ...threat.position },
          simTime: this.simTime
        });
      } else {
        // 비행 단계 이름 업데이트
        const phase = threat.getCurrentPhase();
        if (phase === 0) threat.state = 'boost';
        else if (phase === 1) threat.state = 'midcourse';
        else threat.state = 'terminal';
      }
    }
  }

  /**
   * 위협의 초기 ECEF 속도를 origin→target 방향으로 설정한다.
   * @private
   */
  _initThreatVelocity(threat, speed) {
    // 간단한 방향 계산: lat/lon 차이 → 근사 ECEF 방향
    const dLon = (threat.target.lon - threat.origin.lon) * Math.PI / 180;
    const dLat = (threat.target.lat - threat.origin.lat) * Math.PI / 180;
    const latR = threat.origin.lat * Math.PI / 180;

    // ENU 방향 → ECEF 근사
    const east = dLon * Math.cos(latR);
    const north = dLat;
    const mag = Math.sqrt(east * east + north * north);

    if (mag < 1e-10) {
      threat.velocity = { x: 0, y: 0, z: speed };
      return;
    }

    // ENU를 ECEF로 근사 변환
    const lonR = threat.origin.lon * Math.PI / 180;
    const sinLon = Math.sin(lonR);
    const cosLon = Math.cos(lonR);
    const sinLat = Math.sin(latR);
    const cosLat = Math.cos(latR);

    const eNorm = east / mag;
    const nNorm = north / mag;

    // ECEF = eNorm * East + nNorm * North + upComponent
    // 탄도미사일: 초기 상승 성분 추가
    const upComponent = 0.3; // 부스트 단계 상승
    const horizScale = Math.sqrt(1 - upComponent * upComponent);

    threat.velocity = {
      x: speed * (horizScale * (eNorm * (-sinLon) + nNorm * (-sinLat * cosLon)) + upComponent * cosLat * cosLon),
      y: speed * (horizScale * (eNorm * cosLon + nNorm * (-sinLat * sinLon)) + upComponent * cosLat * sinLon),
      z: speed * (horizScale * nNorm * cosLat + upComponent * sinLat)
    };
  }

  // ── Phase 2: 센서 탐지 ──

  /** @private */
  _stepSensors(_dt) {
    for (const sensor of this._sensors.values()) {
      if (!sensor.operational) continue;

      const cap = this._registry.getSensorCapability(sensor.typeId);
      if (!cap) continue;

      for (const threat of this._threats.values()) {
        if (threat.state === 'intercepted' || threat.state === 'leaked') continue;
        if (!sensor.canDetect(threat.typeId)) continue;

        // 최소 탐지 고도 체크
        if (threat.position.alt < cap.minDetectionAltitude) continue;

        // 구면 부채꼴 탐지
        const inSector = isInSector(
          sensor.position,
          threat.position,
          sensor._azCenter || 0,
          cap.fov.azHalf,
          cap.fov.elMax,
          cap.maxRange
        );

        if (!inSector) {
          continue;
        }

        // 탐지 확률 계산
        const dist = slantRange(sensor.position, threat.position);
        const threatType = this._registry.getThreatType(threat.typeId);
        const rcs = threatType.signature.rcs;
        const rEff = cap.maxRange * Math.pow(rcs / 1.0, 0.25);
        const pDetect = Math.max(0, 1 - (dist / rEff) ** 2);

        if (Math.random() < pDetect) {
          const alreadyDetected = sensor.detectedThreats.some(d => d.threatId === threat.id);
          sensor.addDetection(threat.id, threat.typeId, this.simTime);

          if (!alreadyDetected) {
            this.emit('threat-detected', {
              threatId: threat.id,
              sensorId: sensor.id,
              simTime: this.simTime
            });
          }
        }
      }
    }
  }

  // ── Phase 3: 교전 판정 ──

  /** @private */
  _stepEngagements(_dt) {
    for (const threat of this._threats.values()) {
      if (threat.state === 'intercepted' || threat.state === 'leaked') continue;
      if (this._engagedThreats.has(threat.id)) continue;

      // 탐지 여부 확인
      let detected = false;
      for (const sensor of this._sensors.values()) {
        if (sensor.detectedThreats.some(d => d.threatId === threat.id)) {
          detected = true;
          break;
        }
      }
      if (!detected) continue;

      // 사수 선정
      const candidates = this._registry.getPrioritizedShooters(threat.typeId);
      for (const candidate of candidates) {
        // 해당 타입의 사수 인스턴스 찾기
        const shooter = this._findAvailableShooter(candidate.typeId, threat);
        if (!shooter) continue;

        const pk = this.computePk(threat, shooter);
        if (pk <= 0) continue;

        // 고도 체크
        const cap = this._registry.getShooterCapability(shooter.typeId);
        const threatAltKm = threat.position.alt / 1000;
        if (threatAltKm < cap.minAlt || threatAltKm > cap.maxAlt) continue;

        // 교전 실행
        const interceptorId = `INT_${Date.now()}_${shooter.id}`;
        const interceptor = new InterceptorEntity(interceptorId, {
          position: { ...shooter.position },
          speed: cap.interceptorSpeed,
          boostTime: cap.boostTime,
          navConstant: cap.navConstant,
          targetThreatId: threat.id,
          shooterId: shooter.id
        });
        interceptor._pk = pk;
        interceptor._prevDist = Infinity;

        this._interceptors.set(interceptorId, interceptor);
        shooter.fire(threat.id);
        this._engagedThreats.add(threat.id);

        this.emit('engagement-start', {
          threatId: threat.id,
          shooterId: shooter.id,
          interceptorId,
          pk,
          simTime: this.simTime
        });

        break; // 1위협 1사수 (Phase 1 MVP)
      }
    }
  }

  /**
   * 해당 타입의 교전 가능한 사수 인스턴스를 찾는다.
   * @private
   */
  _findAvailableShooter(typeId, threat) {
    for (const shooter of this._shooters.values()) {
      if (shooter.typeId !== typeId) continue;
      if (!shooter.canEngage(threat.typeId)) continue;
      if (shooter.status === 'engaged' || shooter.status === 'out_of_ammo') continue;
      return shooter;
    }
    return null;
  }

  // ── Phase 4: 요격미사일 유도 ──

  /** @private */
  _stepInterceptors(dt) {
    for (const interceptor of this._interceptors.values()) {
      if (interceptor.state === 'hit' || interceptor.state === 'miss') continue;

      const threat = this._threats.get(interceptor.targetThreatId);
      if (!threat || threat.state === 'intercepted' || threat.state === 'leaked') {
        interceptor.state = 'miss';
        continue;
      }

      // 부스트 업데이트
      interceptor.updateBoost(dt);

      if (interceptor.isInBoost()) {
        // 부스트: 수직 상승
        this._boostInterceptor(interceptor, dt);
      } else {
        // PNG 유도
        interceptor.velocity = pngGuidance(
          interceptor.position,
          interceptor.velocity,
          threat.position,
          interceptor.speed,
          dt,
          interceptor.navConstant
        );

        // 궤적 적분
        const result = ballisticTrajectory(interceptor.position, interceptor.velocity, dt);
        interceptor.position = result.pos;
        interceptor.velocity = result.vel;
      }
    }
  }

  /**
   * 부스트 단계: 수직 상승
   * @private
   */
  _boostInterceptor(interceptor, dt) {
    const latR = interceptor.position.lat * Math.PI / 180;
    const lonR = interceptor.position.lon * Math.PI / 180;

    // 수직 (Up) 방향 ECEF
    const upX = Math.cos(latR) * Math.cos(lonR);
    const upY = Math.cos(latR) * Math.sin(lonR);
    const upZ = Math.sin(latR);

    interceptor.velocity = {
      x: upX * interceptor.speed,
      y: upY * interceptor.speed,
      z: upZ * interceptor.speed
    };

    const result = ballisticTrajectory(interceptor.position, interceptor.velocity, dt);
    interceptor.position = result.pos;
    interceptor.velocity = result.vel;
  }

  // ── Phase 5: 충돌 판정 ──

  /** @private */
  _stepCollisions(_dt) {
    for (const interceptor of this._interceptors.values()) {
      if (interceptor.state === 'hit' || interceptor.state === 'miss') continue;

      const threat = this._threats.get(interceptor.targetThreatId);
      if (!threat || threat.state === 'intercepted' || threat.state === 'leaked') {
        interceptor.state = 'miss';
        continue;
      }

      const dist = slantRange(interceptor.position, threat.position);

      // 충돌 판정
      if (dist < KILL_RADIUS) {
        // Bernoulli 시행
        if (Math.random() < (interceptor._pk || 0.5)) {
          threat.state = 'intercepted';
          interceptor.state = 'hit';
          this.emit('intercept-hit', {
            threatId: threat.id,
            shooterId: interceptor.shooterId,
            simTime: this.simTime
          });
        } else {
          interceptor.state = 'miss';
          this.emit('intercept-miss', {
            threatId: threat.id,
            shooterId: interceptor.shooterId,
            simTime: this.simTime
          });
        }
        continue;
      }

      // miss 판정: 거리가 증가하면 지나친 것
      if (interceptor._prevDist !== undefined && dist > interceptor._prevDist + MISS_DISTANCE_GROWTH) {
        interceptor.state = 'miss';
        this.emit('intercept-miss', {
          threatId: threat.id,
          shooterId: interceptor.shooterId,
          simTime: this.simTime
        });
      }
      interceptor._prevDist = dist;
    }
  }

  // ── 종료 판정 ──

  /** @private */
  _checkComplete() {
    if (this._threats.size === 0) return;

    const allResolved = Array.from(this._threats.values())
      .every(t => t.state === 'intercepted' || t.state === 'leaked');

    if (allResolved) {
      this.state = 'COMPLETE';
      const destroyed = Array.from(this._threats.values())
        .filter(t => t.state === 'intercepted').length;
      const leaked = Array.from(this._threats.values())
        .filter(t => t.state === 'leaked').length;

      this.emit('simulation-end', {
        finalSimTime: this.simTime,
        totalThreats: this._threats.size,
        destroyed,
        leaked
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  rAF 루프 (브라우저 환경용)
  // ═══════════════════════════════════════════════════════════

  /**
   * requestAnimationFrame 루프를 시작한다.
   */
  startLoop() {
    if (typeof requestAnimationFrame === 'undefined') return;

    this._lastTimestamp = performance.now();

    const loop = (timestamp) => {
      const dtReal = Math.min((timestamp - this._lastTimestamp) / 1000, MAX_DT);
      this._lastTimestamp = timestamp;

      this.step(dtReal);

      if (this.state === 'RUNNING') {
        this._rafId = requestAnimationFrame(loop);
      }
    };

    this._rafId = requestAnimationFrame(loop);
  }
}
