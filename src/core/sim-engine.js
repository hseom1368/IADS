/**
 * core/sim-engine.js — EADSIM-Lite 시뮬레이션 엔진
 *
 * step(dt) 7단계:
 *  1. 위협 이동 (ballisticTrajectory)
 *  2. 센서 3단계 갱신 (updateSensorState)
 *  3. 선형 킬체인 (C2 노드별 처리)
 *  4. PSSEK 5단계 교전 판정
 *  5. 요격미사일 PNG 유도 비행
 *  6. BDA 판정 (kill_radius + Pk)
 *  7. 이벤트 로그 기록
 *
 * 상태: READY → RUNNING → PAUSED → COMPLETE
 * Cesium 무의존 (core 모듈)
 */
import { ballisticTrajectory, cruiseTrajectory, aircraftTrajectory, slantRange, pngGuidance } from './physics.js';
import { updateSensorState } from './sensor-model.js';
import { evaluateEngagement, checkInterceptResult, selectMissileType, ENGAGEMENT_RESULT } from './engagement-model.js';
import { SENSOR_STATE, InterceptorEntity } from './entities.js';
import { EventLog, EVENT_TYPE } from './event-log.js';
import { CommChannel } from './comms.js';

export const SIM_STATE = Object.freeze({
  READY: 'READY',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETE: 'COMPLETE',
});

/**
 * 킬체인 단계 상수 (위협별 추적)
 */
const KC_STAGE = Object.freeze({
  WAITING_DETECTION: 0,
  GP_DETECTED: 1,
  KAMD_PROCESSING: 2,
  KAMD_DONE: 3,
  ICC_PROCESSING: 4,
  ICC_DONE: 5,
  ECS_PROCESSING: 6,
  ECS_DONE: 7,
  ENGAGEMENT_READY: 8,
});

export class SimEngine {
  /**
   * @param {import('./registry.js').Registry} registry
   * @param {object} options
   * @param {'linear'|'killweb'} [options.architecture='linear']
   * @param {'high'|'mid'|'low'} [options.operatorSkill='mid']
   * @param {number} [options.jammingLevel=0]
   */
  constructor(registry, options = {}) {
    this.registry = registry;
    this.architecture = options.architecture ?? 'linear';
    this.operatorSkill = options.operatorSkill ?? 'mid';
    this.jammingLevel = options.jammingLevel ?? 0;

    this.state = SIM_STATE.READY;
    this.simTime = 0;
    this.timeScale = 1;

    // 엔티티 컬렉션
    /** @type {import('./entities.js').SensorEntity[]} */
    this.sensors = [];
    /** @type {import('./entities.js').C2Entity[]} */
    this.c2s = [];
    /** @type {import('./entities.js').BatteryEntity[]} */
    this.batteries = [];
    /** @type {import('./entities.js').ThreatEntity[]} */
    this.threats = [];
    /** @type {import('./entities.js').InterceptorEntity[]} */
    this.interceptors = [];

    // 킬체인 상태 (위협별)
    /** @type {Map<string, { stage: number, stageStartTime: number }>} */
    this.killchainStates = new Map();

    // 인프라
    this.eventLog = new EventLog();
    this.comms = new CommChannel(this.architecture);

    // 이벤트 버스 (viz 구독용)
    /** @type {Map<string, Array<function>>} */
    this._eventHandlers = new Map();
  }

  // ──────────────────────────────────────────────────────────
  // 이벤트 버스
  // ──────────────────────────────────────────────────────────

  /**
   * @param {string} event
   * @param {function} handler
   */
  on(event, handler) {
    if (!this._eventHandlers.has(event)) this._eventHandlers.set(event, []);
    this._eventHandlers.get(event).push(handler);
  }

  /** @param {string} event */
  off(event, handler) {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      this._eventHandlers.set(event, handlers.filter(h => h !== handler));
    }
  }

  /** @param {string} event @param {object} data */
  emit(event, data) {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      for (const h of handlers) h(data);
    }
  }

  // ──────────────────────────────────────────────────────────
  // 엔티티 등록
  // ──────────────────────────────────────────────────────────

  addSensor(sensor) { this.sensors.push(sensor); }
  addC2(c2) { this.c2s.push(c2); }
  addBattery(battery) { this.batteries.push(battery); }

  addThreat(threat) {
    this.threats.push(threat);
    this.killchainStates.set(threat.id, { stage: KC_STAGE.WAITING_DETECTION, stageStartTime: this.simTime, assignedShooter: null });
    this.eventLog.log(EVENT_TYPE.THREAT_SPAWNED, this.simTime, threat.id, { typeId: threat.typeId });
    this.emit('threat-spawned', { threat });
  }

  // ──────────────────────────────────────────────────────────
  // 엔티티 조회 헬퍼
  // ──────────────────────────────────────────────────────────

  findSensor(id) { return this.sensors.find(s => s.id === id); }
  findC2(typeId) { return this.c2s.find(c => c.typeId === typeId); }
  findBattery(shooterTypeId) { return this.batteries.find(b => b.shooterTypeId === shooterTypeId); }

  // ──────────────────────────────────────────────────────────
  // 상태 제어
  // ──────────────────────────────────────────────────────────

  start() {
    if (this.state === SIM_STATE.READY || this.state === SIM_STATE.PAUSED) {
      this.state = SIM_STATE.RUNNING;
    }
  }

  pause() {
    if (this.state === SIM_STATE.RUNNING) {
      this.state = SIM_STATE.PAUSED;
    }
  }

  reset() {
    this.state = SIM_STATE.READY;
    this.simTime = 0;
    this.threats = [];
    this.interceptors = [];
    this.killchainStates.clear();
    this.eventLog.clear();
    this.comms.clear();
    for (const s of this.sensors) s.trackStates.clear();
    for (const c of this.c2s) { c.processingQueue = []; c.engagementPlan = []; }
    for (const b of this.batteries) {
      // 발사대별 탄약 복원
      for (const launcher of b.launchers) {
        launcher.remaining = launcher.capacity;
      }
      b.activeEngagements = 0;
      b.launchQueue = [];
      b.bdaPending.clear();
    }
  }

  // ──────────────────────────────────────────────────────────
  // 메인 step(dt) — 7단계
  // ──────────────────────────────────────────────────────────

  /**
   * @param {number} dt - 실시간 경과 (s)
   */
  step(dt) {
    if (this.state !== SIM_STATE.RUNNING) return;

    const scaledDt = dt * this.timeScale;

    // 물리 서브스텝: 고속 물체(Mach 9=3100m/s)의 CCD 정확도 보장
    // MAX_SUBSTEP=0.02초 → 3100×0.02=62m/step (kill_radius 50m와 동급)
    const MAX_SUBSTEP = 0.02;
    const numSubsteps = Math.max(1, Math.ceil(scaledDt / MAX_SUBSTEP));
    const subDt = scaledDt / numSubsteps;

    for (let sub = 0; sub < numSubsteps; sub++) {
      this.simTime += subDt;

      // 2. 센서 갱신 (서브스텝마다 — 탐지 타이밍 정확도)
      this._stepSensors(subDt);

      // 3. 킬체인 진행
      this._stepKillchain(subDt);

      // 4. 교전 판정 (킬체인 완료 직후 즉시 발사 가능)
      this._stepEngagement();

      // 6. BDA 판정 (위협 이동 전에 flyout 판정)
      this._stepBDA(subDt);

      // 1. 위협 이동
      this._stepThreats(subDt);

      // 5. 요격미사일 유도
      this._stepInterceptors(subDt);
    }

    // 7. 완료 체크
    this._checkCompletion();
  }

  // ──────────────────────────────────────────────────────────
  // STEP 1: 위협 이동
  // ──────────────────────────────────────────────────────────

  _stepThreats(dt) {
    for (const threat of this.threats) {
      if (threat.state === 'intercepted' || threat.state === 'leaked' || threat.state === 'destroyed') continue;

      // typeId별 위협 정보 조회 (SRBM, CRUISE_MISSILE, AIRCRAFT 등)
      const threatInfo = this.registry.getThreatInfo(threat.typeId);
      if (!threatInfo) continue;

      // 총 비행 시간 추정
      const totalDistM = slantRange(threat.startPos, threat.targetPos) * 1000;
      const totalFlightTime = totalDistM / threatInfo.baseSpeed;

      // 진행률 갱신
      threat.progress += dt / totalFlightTime;
      if (threat.progress > 1) threat.progress = 1;

      // typeId별 궤적 분기
      let trajectory;
      if (threat.typeId === 'CRUISE_MISSILE') {
        trajectory = cruiseTrajectory(
          threat.startPos, threat.targetPos,
          30, threatInfo.baseSpeed, threat.progress  // 해면밀착 30m
        );
      } else if (threat.typeId === 'AIRCRAFT') {
        trajectory = aircraftTrajectory(
          threat.startPos, threat.targetPos,
          10000, threatInfo.baseSpeed, threat.progress  // 순항 10km
        );
      } else {
        // SRBM, MLRS_GUIDED 등 탄도탄
        trajectory = ballisticTrajectory(
          threat.startPos, threat.targetPos,
          threatInfo.maxAltitude, threatInfo.baseSpeed, threat.progress
        );
      }

      // RCS를 registry에서 조회 (하드코딩 제거)
      const phaseRCS = this.registry.getThreatRCS(threat.typeId, trajectory.phase);
      threat.updateFlight(threat.progress, trajectory, phaseRCS);

      // 지면 도달 → 관통 판정 전에 활성 요격미사일 판정 먼저 실행
      if (threat.progress >= 1 && threat.state !== 'intercepted') {
        // 이 위협을 향한 활성 요격미사일이 있으면 즉시 판정
        for (const intc of this.interceptors) {
          if (intc.state === 'detonated' || intc.state === 'missed') continue;
          if (intc.targetThreatId !== threat.id) continue;

          // 발사 시점에 미리 결정된 결과 적용
          if (intc.predeterminedHit) {
            intc.state = 'detonated';
            threat.state = 'intercepted';
            this.eventLog.log(EVENT_TYPE.INTERCEPT_HIT, this.simTime, threat.id, {
              interceptorId: intc.id, pk: intc.pssekPk,
            });
            this.emit('bda-result', { threat, interceptor: intc, hit: true });
          } else {
            intc.state = 'missed';
            this.eventLog.log(EVENT_TYPE.INTERCEPT_MISS, this.simTime, threat.id, {
              interceptorId: intc.id, pk: intc.pssekPk,
            });
            this.emit('bda-result', { threat, interceptor: intc, hit: false });
            this.emit('interceptor-selfdestructed', { interceptor: intc, reason: 'miss' });
          }
          break; // S-L-S: 1발만 판정
        }

        // intercepted가 아니면 관통
        if (threat.state !== 'intercepted') {
          threat.state = 'leaked';
          this.eventLog.log(EVENT_TYPE.THREAT_LEAKED, this.simTime, threat.id, {});
          this.emit('threat-leaked', { threat });
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // STEP 2: 센서 갱신
  // ──────────────────────────────────────────────────────────

  _stepSensors(dt) {
    for (const sensor of this.sensors) {
      if (!sensor.operational) continue;

      for (const threat of this.threats) {
        if (threat.state === 'intercepted' || threat.state === 'leaked' || threat.state === 'destroyed') continue;

        const result = updateSensorState(sensor, threat, this.registry, this.jammingLevel, dt);

        if (result.transitioned && result.event) {
          // 이벤트 로그 + 버스
          const eventMap = {
            'SENSOR_DETECTED': EVENT_TYPE.SENSOR_DETECTED,
            'SENSOR_TRACKED': EVENT_TYPE.SENSOR_TRACKED,
            'SENSOR_FIRE_CONTROL': EVENT_TYPE.SENSOR_FIRE_CONTROL,
            'SENSOR_TRACK_LOST': EVENT_TYPE.SENSOR_TRACK_LOST,
            'SENSOR_FC_DEGRADED': EVENT_TYPE.SENSOR_FC_DEGRADED,
          };
          const eventType = eventMap[result.event];
          if (eventType) {
            this.eventLog.log(eventType, this.simTime, threat.id, {
              sensorId: sensor.id, sensorType: sensor.typeId, pFinal: result.pFinal,
            });
            this.emit('sensor-state-change', { sensor, threat, state: result.state, event: result.event });
          }
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // STEP 3: 선형 킬체인
  // ──────────────────────────────────────────────────────────

  _stepKillchain(dt) {
    for (const threat of this.threats) {
      if (threat.state === 'intercepted' || threat.state === 'leaked' || threat.state === 'destroyed') continue;

      const kc = this.killchainStates.get(threat.id);
      if (!kc) continue;

      const elapsed = this.simTime - kc.stageStartTime;

      switch (kc.stage) {
        case KC_STAGE.WAITING_DETECTION: {
          // GREEN_PINE가 탐지하면 킬체인 시작
          const gp = this.sensors.find(s => s.typeId === 'GREEN_PINE_B');
          if (gp) {
            const ts = gp.getTrackState(threat.id);
            if (ts.state !== SENSOR_STATE.UNDETECTED) {
              kc.stage = KC_STAGE.GP_DETECTED;
              kc.stageStartTime = this.simTime;
              // 메시지 전송: GREEN_PINE → KAMD_OPS (16s)
              this.comms.send('GREEN_PINE_B', 'KAMD_OPS', 'longRange',
                { threatId: threat.id, type: 'detection' }, this.simTime, this.jammingLevel);
              this.eventLog.log(EVENT_TYPE.KILLCHAIN_STARTED, this.simTime, threat.id, { sensor: 'GREEN_PINE_B' });
              this.emit('killchain-step', { threat, stage: 'GP_DETECTED' });
            }
          }
          break;
        }

        case KC_STAGE.GP_DETECTED: {
          // KAMD_OPS가 메시지 수신 대기
          const msgs = this.comms.receive('KAMD_OPS', this.simTime);
          const relevant = msgs.find(m => m.payload.threatId === threat.id);
          if (relevant) {
            kc.stage = KC_STAGE.KAMD_PROCESSING;
            kc.stageStartTime = this.simTime;
            const kamd = this.findC2('KAMD_OPS');
            if (kamd) kamd.enqueue(threat.id, this.simTime);
            this.eventLog.log(EVENT_TYPE.C2_PROCESSING, this.simTime, threat.id, { c2: 'KAMD_OPS' });
            this.emit('killchain-step', { threat, stage: 'KAMD_PROCESSING' });
          }
          break;
        }

        case KC_STAGE.KAMD_PROCESSING: {
          const kamd = this.findC2('KAMD_OPS');
          if (kamd) {
            const procTime = this.registry.getC2ProcessingTime('KAMD_OPS', this.operatorSkill);
            if (elapsed >= procTime.totalTime) {
              kc.stage = KC_STAGE.KAMD_DONE;
              kc.stageStartTime = this.simTime;
              kamd.dequeue(threat.id);
              // 전송: KAMD → ICC (16s)
              this.comms.send('KAMD_OPS', 'ICC', 'longRange',
                { threatId: threat.id, type: 'engagement_order' }, this.simTime, this.jammingLevel);
              this.eventLog.log(EVENT_TYPE.C2_AUTHORIZED, this.simTime, threat.id, { c2: 'KAMD_OPS' });
              this.emit('killchain-step', { threat, stage: 'KAMD_DONE' });
            }
          }
          break;
        }

        case KC_STAGE.KAMD_DONE: {
          const msgs = this.comms.receive('ICC', this.simTime);
          const relevant = msgs.find(m => m.payload.threatId === threat.id);
          if (relevant) {
            kc.stage = KC_STAGE.ICC_PROCESSING;
            kc.stageStartTime = this.simTime;
            const icc = this.findC2('ICC');
            if (icc) icc.enqueue(threat.id, this.simTime);
            this.eventLog.log(EVENT_TYPE.C2_PROCESSING, this.simTime, threat.id, { c2: 'ICC' });
            this.emit('killchain-step', { threat, stage: 'ICC_PROCESSING' });
          }
          break;
        }

        case KC_STAGE.ICC_PROCESSING: {
          const icc = this.findC2('ICC');
          if (icc) {
            const procTime = this.registry.getC2ProcessingTime('ICC', this.operatorSkill);
            if (elapsed >= procTime.totalTime) {
              kc.stage = KC_STAGE.ICC_DONE;
              kc.stageStartTime = this.simTime;
              icc.dequeue(threat.id);
              // 전송: ICC → ECS (1s)
              this.comms.send('ICC', 'ECS', 'shortRange',
                { threatId: threat.id, type: 'fire_order' }, this.simTime, this.jammingLevel);
              this.eventLog.log(EVENT_TYPE.C2_AUTHORIZED, this.simTime, threat.id, { c2: 'ICC' });
              this.emit('killchain-step', { threat, stage: 'ICC_DONE' });
            }
          }
          break;
        }

        case KC_STAGE.ICC_DONE: {
          const msgs = this.comms.receive('ECS', this.simTime);
          const relevant = msgs.find(m => m.payload.threatId === threat.id);
          if (relevant) {
            kc.stage = KC_STAGE.ECS_PROCESSING;
            kc.stageStartTime = this.simTime;
            const ecs = this.findC2('ECS');
            if (ecs) ecs.enqueue(threat.id, this.simTime);
            this.eventLog.log(EVENT_TYPE.C2_PROCESSING, this.simTime, threat.id, { c2: 'ECS' });
            this.emit('killchain-step', { threat, stage: 'ECS_PROCESSING' });
          }
          break;
        }

        case KC_STAGE.ECS_PROCESSING: {
          const ecs = this.findC2('ECS');
          if (ecs) {
            const procTime = this.registry.getC2ProcessingTime('ECS', this.operatorSkill);
            if (elapsed >= procTime.totalTime) {
              kc.stage = KC_STAGE.ECS_DONE;
              kc.stageStartTime = this.simTime;
              ecs.dequeue(threat.id);
              this.eventLog.log(EVENT_TYPE.C2_AUTHORIZED, this.simTime, threat.id, { c2: 'ECS' });
              this.emit('killchain-step', { threat, stage: 'ECS_DONE' });
            }
          }
          break;
        }

        case KC_STAGE.ECS_DONE: {
          kc.stage = KC_STAGE.ENGAGEMENT_READY;
          kc.stageStartTime = this.simTime;
          this.eventLog.log(EVENT_TYPE.SHOOTER_ASSIGNED, this.simTime, threat.id, { shooter: 'LSAM' });
          this.emit('killchain-step', { threat, stage: 'ENGAGEMENT_READY' });
          break;
        }

        // ENGAGEMENT_READY → Step 4에서 처리
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // STEP 4: 교전 판정
  // ──────────────────────────────────────────────────────────

  _stepEngagement() {
    for (const threat of this.threats) {
      if (threat.state === 'intercepted' || threat.state === 'leaked' || threat.state === 'destroyed') continue;
      if (threat.state === 'engaging') continue; // 이미 교전 중

      const kc = this.killchainStates.get(threat.id);
      if (!kc || kc.stage !== KC_STAGE.ENGAGEMENT_READY) continue;

      // 다중 포대 선택: 봉투 적합 + 탄약 가용 + 부하 최소 포대
      const battery = this._selectBattery(threat);
      if (!battery) continue;

      const mfrSensor = this.sensors.find(s => s.id === battery.mfrSensorId);
      if (!mfrSensor) continue;

      const result = evaluateEngagement(threat, battery, mfrSensor, this.registry, this.simTime, {
        jammingLevel: this.jammingLevel,
        architecture: this.architecture,
      });

      if (result.result === ENGAGEMENT_RESULT.FIRE) {
        // 발사!
        const fireResult = battery.fire(result.missileType);
        if (fireResult) {
          threat.state = 'engaging';

          const intc = new InterceptorEntity(
            battery.shooterTypeId, result.missileType,
            { ...battery.position }, threat.id,
            result.missileSpeed, result.pk, result.killRadius,
            result.guidance === 'PNG' ? 'PNG' : 'CLOS'
          );
          intc.batteryId = battery.id;

          // EADSIM-Lite 핵심: 발사 시점에 PSSEK로 결과 즉시 결정
          // 물리 비행(PNG)은 시각화용. 결과는 이미 결정됨.
          intc.predeterminedHit = Math.random() < result.pk;
          const flyout = result.launchInfo ? result.launchInfo.flyoutTime : 30;
          intc.flyoutTime = flyout;

          // hit-to-kill PIP: flyoutTime 후 위협의 예측 위치
          // 위협 속도 추정 → flyout초 후 위치 산출
          const threatInfo = this.registry.getThreatInfo(threat.typeId);
          const totalDistM = slantRange(threat.startPos, threat.targetPos) * 1000;
          const totalFlightTime = totalDistM / (threatInfo ? threatInfo.baseSpeed : 2040);
          const futureProgress = Math.min(1, threat.progress + flyout / totalFlightTime);

          let futureTraj;
          if (threat.typeId === 'CRUISE_MISSILE') {
            futureTraj = cruiseTrajectory(threat.startPos, threat.targetPos, 30, threatInfo.baseSpeed, futureProgress);
          } else if (threat.typeId === 'AIRCRAFT') {
            futureTraj = aircraftTrajectory(threat.startPos, threat.targetPos, 10000, threatInfo.baseSpeed, futureProgress);
          } else {
            futureTraj = ballisticTrajectory(threat.startPos, threat.targetPos, threatInfo.maxAltitude, threatInfo.baseSpeed, futureProgress);
          }
          intc.pipPosition = { ...futureTraj.position };

          // 초기 속도: 예측 PIP 방향으로 직접 지향
          const DEG2RAD_L = Math.PI / 180;
          const EARTH_R_L = 6371000;
          const cosLatL = Math.cos(battery.position.lat * DEG2RAD_L);
          const aimTarget = result.pip ? result.pip.position : threat.position;
          const dx = (aimTarget.lon - battery.position.lon) * DEG2RAD_L * cosLatL * EARTH_R_L;
          const dy = (aimTarget.lat - battery.position.lat) * DEG2RAD_L * EARTH_R_L;
          const dz = aimTarget.alt - battery.position.alt;
          const dist3D = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist3D > 1) {
            intc.velocity = {
              x: (dx / dist3D) * result.missileSpeed,
              y: (dy / dist3D) * result.missileSpeed,
              z: (dz / dist3D) * result.missileSpeed,
            };
          } else {
            intc.velocity = { x: 0, y: 0, z: result.missileSpeed };
          }
          this.interceptors.push(intc);

          // BDA 등록 (S-L-S)
          battery.startBDA(intc.id, threat.id, result.bdaDelay);

          this.eventLog.log(EVENT_TYPE.ENGAGEMENT_FIRED, this.simTime, threat.id, {
            batteryId: battery.id, missileType: result.missileType,
            pk: result.pk, doctrine: result.doctrine,
            interceptorId: intc.id,
          });
          this.emit('engagement-fired', { threat, interceptor: intc, pk: result.pk });
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // 포대 선택: 봉투 적합 + 탄약 가용 + 부하 최소
  // ──────────────────────────────────────────────────────────

  /**
   * 위협에 최적 포대 선택 (다중 포대 순회)
   * @param {import('./entities.js').ThreatEntity} threat
   * @returns {import('./entities.js').BatteryEntity|null}
   */
  _selectBattery(threat) {
    // 킬체인에 이미 배정된 사수가 있으면 우선
    const kc = this.killchainStates.get(threat.id);
    if (kc?.assignedShooter) {
      const assigned = this.batteries.find(b => b.shooterTypeId === kc.assignedShooter && b.operational);
      if (assigned) return assigned;
    }

    let bestBattery = null;
    let bestScore = -Infinity;

    for (const bat of this.batteries) {
      if (!bat.operational) continue;

      // 미사일 타입 확인
      const missileType = selectMissileType(bat.shooterTypeId, threat.typeId, this.registry);
      if (!missileType) continue;

      // 탄약 가용 체크
      if (!bat.canFire(missileType)) continue;

      // 점수: 탄약 잔여 비율 × (1 - 부하비율) × (1/거리)
      const totalCapacity = bat.launchers
        .filter(l => l.missileType === missileType)
        .reduce((s, l) => s + l.capacity, 0);
      const remaining = bat.getAmmo(missileType);
      const ammoRatio = totalCapacity > 0 ? remaining / totalCapacity : 0;
      const loadRatio = bat.maxSimultaneous > 0 ? bat.activeEngagements / bat.maxSimultaneous : 1;
      const dist = slantRange(bat.position, threat.position);
      const distFactor = dist > 0 ? 1 / dist : 1;

      const score = ammoRatio * (1 - loadRatio) * distFactor;
      if (score > bestScore) {
        bestScore = score;
        bestBattery = bat;
      }
    }

    // 킬체인에 배정 기록
    if (bestBattery && kc) {
      kc.assignedShooter = bestBattery.shooterTypeId;
    }

    return bestBattery;
  }

  // ──────────────────────────────────────────────────────────
  // STEP 5: 요격미사일 유도
  // ──────────────────────────────────────────────────────────

  _stepInterceptors(dt) {
    for (const intc of this.interceptors) {
      if (intc.state === 'detonated' || intc.state === 'missed') continue;

      // 이전 위치 저장 (연속 충돌 감지용)
      intc.prevPosition = { ...intc.position };

      intc.tick(dt);

      // 연료 소진 → 자폭
      if (intc.isFuelDepleted()) {
        intc.state = 'missed';
        this.emit('interceptor-selfdestructed', { interceptor: intc, reason: 'fuel' });
        continue;
      }

      // 표적 소멸/관통 → 미사일 종료 (계속 추적하지 않음)
      const threat = this.threats.find(t => t.id === intc.targetThreatId);
      if (!threat || threat.state === 'intercepted' || threat.state === 'leaked' || threat.state === 'destroyed') {
        intc.state = 'missed';
        this.emit('interceptor-selfdestructed', { interceptor: intc, reason: 'target_lost' });
        continue;
      }

      // 유도 방식별 비행 (부스터 이후)
      if (intc.state === 'guiding') {
        const DEG2RAD = Math.PI / 180;
        const EARTH_R = 6371000;
        const cosLat = Math.cos(intc.position.lat * DEG2RAD);

        if (intc.guidanceType === 'CLOS') {
          // CLOS: 천마 전용 — 운용자가 표적 추적, 미사일은 시선 일치
          // Phase 4에서 구현, 현재는 PNG 대체
          const targetENU = {
            x: (threat.position.lon - intc.position.lon) * DEG2RAD * cosLat * EARTH_R,
            y: (threat.position.lat - intc.position.lat) * DEG2RAD * EARTH_R,
            z: threat.position.alt - intc.position.alt,
          };
          intc.velocity = pngGuidance(intc.velocity, targetENU, { x: 0, y: 0, z: 0 }, intc.missileSpeed, dt, 4);
        } else {
          // hit-to-kill / guided: PIP(예상 교전점)를 향해 직선 비행
          // 실제 미사일은 중간유도(관성+데이터링크) → 종말유도(IIR/레이더)
          // 시각화: PIP로 직선 비행 (PNG tail-chase 아님)
          const pip = intc.pipPosition || threat.position;
          const dx = (pip.lon - intc.position.lon) * DEG2RAD * cosLat * EARTH_R;
          const dy = (pip.lat - intc.position.lat) * DEG2RAD * EARTH_R;
          const dz = pip.alt - intc.position.alt;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > 1) {
            intc.velocity = {
              x: (dx / dist) * intc.missileSpeed,
              y: (dy / dist) * intc.missileSpeed,
              z: (dz / dist) * intc.missileSpeed,
            };
          }
        }
      }

      // 위치 갱신 (ENU → WGS84 근사)
      const DEG2RAD = Math.PI / 180;
      const EARTH_R = 6371000;
      const cosLat = Math.cos(intc.position.lat * DEG2RAD);

      intc.position.lon += (intc.velocity.x * dt) / (cosLat * EARTH_R) / DEG2RAD;
      intc.position.lat += (intc.velocity.y * dt) / EARTH_R / DEG2RAD;
      intc.position.alt += intc.velocity.z * dt;
    }
  }

  // ──────────────────────────────────────────────────────────
  // STEP 6: BDA 판정
  // ──────────────────────────────────────────────────────────

  _stepBDA(dt) {
    // EADSIM-Lite 판정:
    // 결과는 발사 시점에 이미 결정됨 (predeterminedHit).
    // flyoutTime 경과 시 결과 적용. CCD는 시각적 충돌 감지 보조.
    // 위협이 이미 leaked면 → 요격 실패 (너무 늦음)
    for (const intc of this.interceptors) {
      if (intc.state === 'detonated' || intc.state === 'missed') continue;

      const threat = this.threats.find(t => t.id === intc.targetThreatId);
      if (!threat) continue;

      // flyoutTime 경과 확인 (발사 후 예상 비행시간 도달)
      const flyoutExpired = intc.flyoutTime && intc.elapsedTime >= intc.flyoutTime;
      // CCD 보조 체크 (물리적으로 근접한 경우)
      const ccdResult = checkInterceptResult(intc, threat);

      // flyout 미경과 + CCD 미감지 → 아직 대기
      // 단, 위협이 이미 leaked면 flyout 경과 여부와 무관하게 실패
      if (!flyoutExpired && !ccdResult) {
        if (threat.state === 'leaked' || threat.state === 'destroyed') {
          intc.state = 'missed';
          this.eventLog.log(EVENT_TYPE.INTERCEPT_MISS, this.simTime, threat.id, {
            interceptorId: intc.id, pk: intc.pssekPk, reason: 'threat_leaked_before_flyout',
          });
          this.emit('bda-result', { threat, interceptor: intc, hit: false });
          this.emit('interceptor-selfdestructed', { interceptor: intc, reason: 'target_leaked' });
        }
        continue;
      }

      // 발사 시점에 미리 결정된 결과 적용
      const hit = intc.predeterminedHit;
      const distance = ccdResult ? ccdResult.distance :
        slantRange(intc.position, threat.position) * 1000;

      if (hit) {
        intc.state = 'detonated';
        threat.state = 'intercepted';
        this.eventLog.log(EVENT_TYPE.INTERCEPT_HIT, this.simTime, threat.id, {
          interceptorId: intc.id, pk: intc.pssekPk, distance,
        });
        this.emit('bda-result', { threat, interceptor: intc, hit: true });
      } else {
        intc.state = 'missed';
        this.eventLog.log(EVENT_TYPE.INTERCEPT_MISS, this.simTime, threat.id, {
          interceptorId: intc.id, pk: intc.pssekPk, distance,
        });
        this.emit('bda-result', { threat, interceptor: intc, hit: false });
        this.emit('interceptor-selfdestructed', { interceptor: intc, reason: 'miss' });
      }
    }

    // BDA 타이머 갱신
    for (const battery of this.batteries) {
      const completed = battery.updateBDA(dt);
      for (const { interceptorId, threatId } of completed) {
        battery.completeEngagement();
        const intc = this.interceptors.find(i => i.id === interceptorId);
        const threat = this.threats.find(t => t.id === threatId);

        this.eventLog.log(EVENT_TYPE.BDA_COMPLETE, this.simTime, threatId, {
          interceptorId, result: intc?.state === 'detonated' ? 'HIT' : 'MISS',
        });

        // MISS 시 재교전 시도 (S-L-S)
        if (threat && threat.state === 'engaging' && intc?.state !== 'detonated') {
          threat.state = 'detected'; // 재교전 가능 상태로 복귀
          // 킬체인은 이미 ENGAGEMENT_READY이므로 다음 step에서 재판정
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // 완료 체크
  // ──────────────────────────────────────────────────────────

  _checkCompletion() {
    if (this.threats.length === 0) return;

    const allResolved = this.threats.every(t =>
      t.state === 'intercepted' || t.state === 'leaked' || t.state === 'destroyed'
    );

    if (allResolved) {
      this.state = SIM_STATE.COMPLETE;
      this.eventLog.log(EVENT_TYPE.SIMULATION_END, this.simTime, null, {
        totalThreats: this.threats.length,
        intercepted: this.threats.filter(t => t.state === 'intercepted').length,
        leaked: this.threats.filter(t => t.state === 'leaked').length,
      });
      this.emit('simulation-end', { simTime: this.simTime });
    }
  }
}
