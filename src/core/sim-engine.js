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
import { ballisticTrajectory, slantRange, pngGuidance } from './physics.js';
import { updateSensorState } from './sensor-model.js';
import { evaluateEngagement, checkInterceptResult, ENGAGEMENT_RESULT } from './engagement-model.js';
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
    this.killchainStates.set(threat.id, { stage: KC_STAGE.WAITING_DETECTION, stageStartTime: this.simTime });
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
      const config = this.registry.getBatteryConfig(b.shooterTypeId);
      if (config) b.ammo = { ...config.totalRounds };
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
    this.simTime += scaledDt;

    // 1. 위협 이동
    this._stepThreats(scaledDt);

    // 2. 센서 갱신
    this._stepSensors(scaledDt);

    // 3. 킬체인 진행
    this._stepKillchain(scaledDt);

    // 4. 교전 판정
    this._stepEngagement();

    // 5. 요격미사일 유도
    this._stepInterceptors(scaledDt);

    // 6. BDA 판정
    this._stepBDA(scaledDt);

    // 7. 완료 체크
    this._checkCompletion();
  }

  // ──────────────────────────────────────────────────────────
  // STEP 1: 위협 이동
  // ──────────────────────────────────────────────────────────

  _stepThreats(dt) {
    const threatInfo = this.registry.getThreatInfo('SRBM');
    if (!threatInfo) return;

    for (const threat of this.threats) {
      if (threat.state === 'intercepted' || threat.state === 'leaked' || threat.state === 'destroyed') continue;

      // 총 비행 시간 추정
      const totalDistM = slantRange(threat.startPos, threat.targetPos) * 1000;
      const totalFlightTime = totalDistM / threatInfo.baseSpeed;

      // 진행률 갱신
      threat.progress += dt / totalFlightTime;
      if (threat.progress > 1) threat.progress = 1;

      // 탄도 궤적 계산
      const trajectory = ballisticTrajectory(
        threat.startPos, threat.targetPos,
        threatInfo.maxAltitude, threatInfo.baseSpeed, threat.progress
      );

      threat.updateFlight(threat.progress, trajectory, 0.1);

      // 지면 도달 → 관통 (leaked)
      if (threat.progress >= 1 && threat.state !== 'intercepted') {
        threat.state = 'leaked';
        this.eventLog.log(EVENT_TYPE.THREAT_LEAKED, this.simTime, threat.id, {});
        this.emit('threat-leaked', { threat });
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

      // 포대 및 MFR 센서 찾기
      const battery = this.batteries[0]; // Phase 1: 단일 포대
      if (!battery) continue;

      const mfrSensor = this.sensors.find(s => s.id === battery.mfrSensorId);
      if (!mfrSensor) continue;

      const result = evaluateEngagement(threat, battery, mfrSensor, this.registry, this.simTime, {
        jammingLevel: this.jammingLevel,
        architecture: this.architecture,
      });

      if (result.result === ENGAGEMENT_RESULT.FIRE) {
        // 발사!
        if (battery.fire(result.missileType)) {
          threat.state = 'engaging';

          const intc = new InterceptorEntity(
            battery.shooterTypeId, result.missileType,
            { ...battery.position }, threat.id,
            result.missileSpeed, result.pk, result.killRadius,
            result.guidance === 'PNG' ? 'PNG' : 'CLOS'
          );
          intc.batteryId = battery.id;

          // 초기 속도: 수직 상승 (부스터)
          intc.velocity = { x: 0, y: 0, z: result.missileSpeed };
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
  // STEP 5: 요격미사일 유도
  // ──────────────────────────────────────────────────────────

  _stepInterceptors(dt) {
    for (const intc of this.interceptors) {
      if (intc.state === 'detonated' || intc.state === 'missed') continue;

      intc.tick(dt);

      // 연료 소진
      if (intc.isFuelDepleted()) {
        intc.state = 'missed';
        continue;
      }

      // 표적 찾기
      const threat = this.threats.find(t => t.id === intc.targetThreatId);
      if (!threat || threat.state === 'intercepted' || threat.state === 'leaked') {
        intc.state = 'missed';
        continue;
      }

      // PNG 유도 (부스터 이후)
      if (intc.state === 'guiding') {
        // 위협 위치를 ENU 근사 좌표로 변환 (intc.position 기준)
        const DEG2RAD = Math.PI / 180;
        const EARTH_R = 6371000; // m
        const cosLat = Math.cos(intc.position.lat * DEG2RAD);

        const targetENU = {
          x: (threat.position.lon - intc.position.lon) * DEG2RAD * cosLat * EARTH_R,
          y: (threat.position.lat - intc.position.lat) * DEG2RAD * EARTH_R,
          z: threat.position.alt - intc.position.alt,
        };
        const myENU = { x: 0, y: 0, z: 0 };

        const newVel = pngGuidance(intc.velocity, targetENU, myENU, intc.missileSpeed, dt, 4);
        intc.velocity = newVel;
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
    // 요격미사일 도달 확인
    for (const intc of this.interceptors) {
      if (intc.state === 'detonated' || intc.state === 'missed') continue;

      const threat = this.threats.find(t => t.id === intc.targetThreatId);
      if (!threat) continue;

      const result = checkInterceptResult(intc, threat);
      if (!result) continue; // 아직 kill_radius 밖

      if (result.hit) {
        intc.state = 'detonated';
        threat.state = 'intercepted';
        this.eventLog.log(EVENT_TYPE.INTERCEPT_HIT, this.simTime, threat.id, {
          interceptorId: intc.id, pk: intc.pssekPk, distance: result.distance,
        });
        this.emit('bda-result', { threat, interceptor: intc, hit: true });
      } else {
        intc.state = 'missed';
        this.eventLog.log(EVENT_TYPE.INTERCEPT_MISS, this.simTime, threat.id, {
          interceptorId: intc.id, pk: intc.pssekPk, distance: result.distance,
        });
        this.emit('bda-result', { threat, interceptor: intc, hit: false });
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
