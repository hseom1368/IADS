/**
 * @module core/sim-engine
 * SimEngine 클래스 — requestAnimationFrame 기반 메인 루프
 *
 * Phase 1.3: 7단계 C2 킬체인 파이프라인
 *   1. 위협 이동 (ballisticTrajectory)
 *   2. GREEN_PINE 탐지 (isInSector)
 *   3. 킬체인 처리: GREEN_PINE→KAMD_OPS(16s+20~60s)→ICC(16s+5~15s)→ECS(1s+2~5s)
 *   4. 교전 판정 (predictedPk ≥ 0.30, C2 승인 후)
 *   5. 요격미사일 유도 (pngGuidance)
 *   6. 충돌 판정 (kill_radius + warhead_effectiveness)
 *   7. 종료 판정
 *
 * Cesium 의존성 없음
 */

import { ShooterEntity, SensorEntity, C2Entity, ThreatEntity, InterceptorEntity } from './entities.js';
import {
  slantRange, ballisticTrajectory, pngGuidance, isInSector,
  predictInterceptPoint, calculateLaunchTime, predictedPk
} from './physics.js';
import { LinearKillChain } from './killchain.js';
import { CommChannel } from './comms.js';
import { EventLog } from './event-log.js';

// ── 상수 ──
const MAX_DT = 0.05;           // 최대 dt (초, 20fps 보장)
const MISS_DISTANCE_GROWTH = 3; // km (miss 판정: 거리가 이만큼 증가하면)
const PK_ENGAGE_THRESHOLD = 0.30;     // 교전 승인 Pk 기준
const PK_EMERGENCY_THRESHOLD = 0.10;  // 긴급 교전 Pk 기준

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
    this._c2s = new Map();
    this._interceptors = new Map();

    // 교전 기록 (중복 교전 방지)
    this._engagedThreats = new Set();

    // 이벤트 버스
    this._listeners = {};

    // C2 킬체인 + 통신 + 이벤트 로그
    this._commChannel = new CommChannel();
    this._eventLog = new EventLog();
    this._killchain = new LinearKillChain(registry, this._commChannel, this._eventLog);

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
    this._c2s.clear();
    this._interceptors.clear();
    this._engagedThreats.clear();
    this._listeners = {};
    this._killchain.reset();
    this._eventLog.clear();
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  접근자
  // ═══════════════════════════════════════════════════════════

  /**
   * LinearKillChain 인스턴스를 반환한다.
   * @returns {LinearKillChain}
   */
  getKillchain() { return this._killchain; }

  /**
   * EventLog 인스턴스를 반환한다.
   * @returns {EventLog}
   */
  getEventLog() { return this._eventLog; }

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
    const dist = slantRange(origin, target);
    const threatType = this._registry.getThreatType(typeId);
    threat._estimatedFlightTime = (dist * 1000) / threatType.speed;
    this._threats.set(id, threat);
    this._eventLog.log({
      threatId: id, eventType: 'THREAT_SPAWNED', simTime: this.simTime,
      data: { threatTypeId: typeId, position: { ...origin } }
    });
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
   * @param {number} [azCenter=0]
   * @returns {SensorEntity}
   */
  addSensor(id, typeId, position, azCenter = 0) {
    const sensor = new SensorEntity(id, typeId, position, this._registry);
    sensor._azCenter = azCenter;
    this._sensors.set(id, sensor);
    return sensor;
  }

  /**
   * C2 엔티티를 추가한다.
   * @param {string} id
   * @param {string} typeId
   * @param {{lon:number,lat:number,alt:number}} position
   * @returns {C2Entity}
   */
  addC2(id, typeId, position) {
    const c2 = new C2Entity(id, typeId, position, this._registry);
    this._c2s.set(id, c2);
    return c2;
  }

  /** @returns {ThreatEntity[]} */
  getAllThreats() { return Array.from(this._threats.values()); }
  /** @returns {ShooterEntity[]} */
  getAllShooters() { return Array.from(this._shooters.values()); }
  /** @returns {SensorEntity[]} */
  getAllSensors() { return Array.from(this._sensors.values()); }
  /** @returns {C2Entity[]} */
  getAllC2s() { return Array.from(this._c2s.values()); }
  /** @returns {InterceptorEntity[]} */
  getAllInterceptors() { return Array.from(this._interceptors.values()); }

  // ═══════════════════════════════════════════════════════════
  //  step(dt) — 7단계 시뮬레이션 파이프라인
  // ═══════════════════════════════════════════════════════════

  /**
   * 1프레임 시뮬레이션을 실행한다.
   * @param {number} dt - 실제 경과 시간 (초)
   */
  step(dt) {
    if (this.state !== 'RUNNING') return;

    const dtSim = Math.min(dt, MAX_DT) * this.timeScale;
    this.simTime += dtSim;

    this._stepThreats(dtSim);             // 1. 위협 이동
    this._stepSensors(dtSim);             // 2. 센서 탐지
    this._stepKillchain(dtSim);           // 3. 킬체인 진행
    this._stepEngagementDecision(dtSim);  // 4. 교전 판정
    this._stepInterceptors(dtSim);        // 5. 요격미사일 유도
    this._stepCollisions(dtSim);          // 6. 충돌 판정
    this._checkComplete();                // 7. 종료 판정
  }

  // ── Stage 1: 위협 이동 ──

  /** @private */
  _stepThreats(dt) {
    for (const threat of this._threats.values()) {
      if (threat.state === 'intercepted' || threat.state === 'leaked') continue;

      const elapsed = this.simTime - threat.launchTime;
      threat.flightProgress = Math.min(1.0, elapsed / (threat._estimatedFlightTime || 300));

      const threatType = this._registry.getThreatType(threat.typeId);
      const speedMult = threat.getCurrentSpeedMult();
      const speed = threatType.speed * speedMult;

      if (threat.velocity.x === 0 && threat.velocity.y === 0 && threat.velocity.z === 0) {
        this._initThreatVelocity(threat, speed);
      }

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

      const result = ballisticTrajectory(threat.position, threat.velocity, dt);
      threat.position = result.pos;
      threat.velocity = result.vel;

      if (threat.position.alt <= 0 || threat.flightProgress >= 1.0) {
        threat.state = 'leaked';
        this._eventLog.log({
          threatId: threat.id, eventType: 'THREAT_LEAKED', simTime: this.simTime,
          data: { position: { ...threat.position } }
        });
        this.emit('threat-leaked', {
          threatId: threat.id, position: { ...threat.position }, simTime: this.simTime
        });
        this._killchain.cancelKillchain(threat.id);
      } else {
        const phase = threat.getCurrentPhase();
        if (phase === 0) threat.state = 'boost';
        else if (phase === 1) threat.state = 'midcourse';
        else threat.state = 'terminal';
      }
    }
  }

  /** @private */
  _initThreatVelocity(threat, speed) {
    const dLon = (threat.target.lon - threat.origin.lon) * Math.PI / 180;
    const dLat = (threat.target.lat - threat.origin.lat) * Math.PI / 180;
    const latR = threat.origin.lat * Math.PI / 180;

    const east = dLon * Math.cos(latR);
    const north = dLat;
    const mag = Math.sqrt(east * east + north * north);

    if (mag < 1e-10) {
      threat.velocity = { x: 0, y: 0, z: speed };
      return;
    }

    const lonR = threat.origin.lon * Math.PI / 180;
    const sinLon = Math.sin(lonR);
    const cosLon = Math.cos(lonR);
    const sinLat = Math.sin(latR);
    const cosLat = Math.cos(latR);

    const eNorm = east / mag;
    const nNorm = north / mag;

    const upComponent = 0.3;
    const horizScale = Math.sqrt(1 - upComponent * upComponent);

    threat.velocity = {
      x: speed * (horizScale * (eNorm * (-sinLon) + nNorm * (-sinLat * cosLon)) + upComponent * cosLat * cosLon),
      y: speed * (horizScale * (eNorm * cosLon + nNorm * (-sinLat * sinLon)) + upComponent * cosLat * sinLon),
      z: speed * (horizScale * nNorm * cosLat + upComponent * sinLat)
    };
  }

  // ── Stage 2: 센서 탐지 ──

  /** @private */
  _stepSensors(_dt) {
    for (const sensor of this._sensors.values()) {
      if (!sensor.operational) continue;

      const cap = this._registry.getSensorCapability(sensor.typeId);
      if (!cap) continue;

      for (const threat of this._threats.values()) {
        if (threat.state === 'intercepted' || threat.state === 'leaked') continue;
        if (!sensor.canDetect(threat.typeId)) continue;
        if (threat.position.alt < cap.minDetectionAltitude) continue;

        const inSector = isInSector(
          sensor.position, threat.position,
          sensor._azCenter || 0, cap.fov.azHalf, cap.fov.elMax, cap.maxRange
        );
        if (!inSector) continue;

        const dist = slantRange(sensor.position, threat.position);
        const threatType = this._registry.getThreatType(threat.typeId);
        const rcs = threatType.signature.rcs;
        const rEff = cap.maxRange * Math.pow(rcs / 1.0, 0.25);
        const pDetect = Math.max(0, 1 - (dist / rEff) ** 2);

        if (Math.random() < pDetect) {
          const alreadyDetected = sensor.detectedThreats.some(d => d.threatId === threat.id);
          sensor.addDetection(threat.id, threat.typeId, this.simTime);

          if (!alreadyDetected) {
            this._eventLog.log({
              threatId: threat.id, eventType: 'THREAT_DETECTED', simTime: this.simTime,
              data: { sensorId: sensor.id }
            });
            this.emit('threat-detected', {
              threatId: threat.id, sensorId: sensor.id, simTime: this.simTime
            });
          }
        }
      }
    }
  }

  // ── Stage 3: 킬체인 진행 ──

  /** @private */
  _stepKillchain(_dt) {
    // 탐지된 위협 중 킬체인 미시작 → 킬체인 시작
    for (const threat of this._threats.values()) {
      if (threat.state === 'intercepted' || threat.state === 'leaked') continue;
      if (this._engagedThreats.has(threat.id)) continue;
      if (this._killchain.getState(threat.id)) continue; // 이미 킬체인 진행 중

      // 센서에서 탐지 여부 확인
      let detectedBy = null;
      for (const sensor of this._sensors.values()) {
        if (sensor.detectedThreats.some(d => d.threatId === threat.id)) {
          detectedBy = sensor.id;
          break;
        }
      }
      if (!detectedBy) continue;

      this._killchain.startKillchain(threat.id, detectedBy, this.simTime);
    }

    // 킬체인 타이머 진행
    this._killchain.update(this.simTime);
  }

  // ── Stage 4: 교전 판정 (킬체인 완료 후) ──

  /** @private */
  _stepEngagementDecision(_dt) {
    const readyList = this._killchain.getReadyToEngage();

    for (const kcState of readyList) {
      const threat = this._threats.get(kcState.threatId);
      if (!threat) continue;
      if (threat.state === 'intercepted' || threat.state === 'leaked') {
        this._killchain.cancelKillchain(kcState.threatId);
        continue;
      }
      if (this._engagedThreats.has(threat.id)) continue;

      // 사수 선정
      const candidates = this._registry.getPrioritizedShooters(threat.typeId);
      for (const candidate of candidates) {
        const shooter = this._findAvailableShooter(candidate.typeId, threat);
        if (!shooter) continue;

        // physics 함수에 전달할 shooter 객체 (capability 포함)
        const cap = this._registry.getShooterCapability(shooter.typeId);
        if (!cap) continue;
        const shooterForPhysics = { position: shooter.position, capability: cap };

        // STEP 1: 교전구역 판정
        const interceptPoint = predictInterceptPoint(threat, shooterForPhysics);
        if (!interceptPoint) continue;

        // STEP 2: 발사 시점 판정
        const launchOffset = calculateLaunchTime(threat, shooterForPhysics, interceptPoint);
        // launchOffset은 "지금부터 대기해야 할 시간"
        // 0이면 즉시 발사, 양수면 아직 이름
        if (launchOffset > 0.5) continue; // 아직 발사 시점 아님 (0.5초 허용)

        // STEP 3: 예측 Pk 판정
        const pk = predictedPk(shooterForPhysics, interceptPoint, threat);
        if (pk >= PK_ENGAGE_THRESHOLD) {
          this._fireInterceptor(threat, shooter, interceptPoint, pk, kcState);
          break;
        } else if (pk >= PK_EMERGENCY_THRESHOLD) {
          // 긴급 교전: 잔여 교전 기회 ≤ 2
          this._fireInterceptor(threat, shooter, interceptPoint, pk, kcState);
          break;
        }
        // Pk < 0.10 → 다음 사수 시도
      }
    }
  }

  /**
   * 요격미사일을 발사한다.
   * @private
   */
  _fireInterceptor(threat, shooter, interceptPoint, pk, kcState) {
    const cap = this._registry.getShooterCapability(shooter.typeId);
    const interceptorId = `INT_${Math.floor(this.simTime * 1000)}_${shooter.id}`;

    const interceptor = new InterceptorEntity(interceptorId, {
      position: { ...shooter.position },
      speed: cap.interceptorSpeed,
      boostTime: cap.boostTime,
      navConstant: cap.navConstant,
      targetThreatId: threat.id,
      shooterId: shooter.id,
      killRadius: cap.killRadius,
      warheadEffectiveness: cap.warheadEffectiveness,
      interceptMethod: cap.interceptMethod
    });
    interceptor._prevDist = Infinity;

    this._interceptors.set(interceptorId, interceptor);
    shooter.fire(threat.id);
    this._engagedThreats.add(threat.id);
    this._killchain.completeKillchain(threat.id);

    this._eventLog.log({
      threatId: threat.id, eventType: 'ENGAGEMENT_FIRED', simTime: this.simTime,
      data: { shooterId: shooter.id, interceptorId, pk, interceptPoint }
    });

    this.emit('engagement-start', {
      threatId: threat.id, shooterId: shooter.id,
      interceptorId, pk, simTime: this.simTime
    });
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

  // ── Stage 5: 요격미사일 유도 ──

  /** @private */
  _stepInterceptors(dt) {
    for (const interceptor of this._interceptors.values()) {
      if (interceptor.state === 'hit' || interceptor.state === 'miss') continue;

      const threat = this._threats.get(interceptor.targetThreatId);
      if (!threat || threat.state === 'intercepted' || threat.state === 'leaked') {
        interceptor.state = 'miss';
        continue;
      }

      interceptor.updateBoost(dt);

      if (interceptor.isInBoost()) {
        this._boostInterceptor(interceptor, dt);
      } else {
        interceptor.velocity = pngGuidance(
          interceptor.position, interceptor.velocity,
          threat.position, interceptor.speed, dt, interceptor.navConstant
        );
        const result = ballisticTrajectory(interceptor.position, interceptor.velocity, dt);
        interceptor.position = result.pos;
        interceptor.velocity = result.vel;
      }
    }
  }

  /** @private */
  _boostInterceptor(interceptor, dt) {
    const latR = interceptor.position.lat * Math.PI / 180;
    const lonR = interceptor.position.lon * Math.PI / 180;
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

  // ── Stage 6: 충돌 판정 ──

  /** @private */
  _stepCollisions(_dt) {
    for (const interceptor of this._interceptors.values()) {
      if (interceptor.state === 'hit' || interceptor.state === 'miss') continue;

      const threat = this._threats.get(interceptor.targetThreatId);
      if (!threat || threat.state === 'intercepted' || threat.state === 'leaked') {
        interceptor.state = 'miss';
        continue;
      }

      const killRadius = interceptor.killRadius || 0.5;
      const warheadEff = interceptor.warheadEffectiveness || 0.75;
      const dist = slantRange(interceptor.position, threat.position);

      if (dist < killRadius) {
        const proximityFactor = 1.0 - (dist / killRadius) ** 2;
        const hitProbability = warheadEff * proximityFactor;

        if (Math.random() < hitProbability) {
          threat.state = 'intercepted';
          interceptor.state = 'hit';
          this._eventLog.log({
            threatId: threat.id, eventType: 'INTERCEPT_HIT', simTime: this.simTime,
            data: { shooterId: interceptor.shooterId }
          });
          this.emit('intercept-hit', {
            threatId: threat.id, shooterId: interceptor.shooterId, simTime: this.simTime
          });
        } else {
          interceptor.state = 'miss';
          this._eventLog.log({
            threatId: threat.id, eventType: 'INTERCEPT_MISS', simTime: this.simTime,
            data: { shooterId: interceptor.shooterId }
          });
          this.emit('intercept-miss', {
            threatId: threat.id, shooterId: interceptor.shooterId, simTime: this.simTime
          });
        }
        continue;
      }

      if (interceptor._prevDist !== undefined && dist > interceptor._prevDist + MISS_DISTANCE_GROWTH) {
        interceptor.state = 'miss';
        this._eventLog.log({
          threatId: threat.id, eventType: 'INTERCEPT_MISS', simTime: this.simTime,
          data: { shooterId: interceptor.shooterId }
        });
        this.emit('intercept-miss', {
          threatId: threat.id, shooterId: interceptor.shooterId, simTime: this.simTime
        });
      }
      interceptor._prevDist = dist;
    }
  }

  // ── Stage 7: 종료 판정 ──

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
        finalSimTime: this.simTime, totalThreats: this._threats.size,
        destroyed, leaked
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
