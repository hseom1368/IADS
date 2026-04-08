/**
 * core/entities.js — EADSIM-Lite 런타임 엔티티
 *
 * 능력(불변) → weapon-data / registry
 * 상태(가변) → 여기서 관리 (탄약, 교전큐, 센서상태 등)
 */

// ──────────────────────────────────────────────────────────
// 센서 추적 상태 상수
// ──────────────────────────────────────────────────────────
export const SENSOR_STATE = Object.freeze({
  UNDETECTED: 'UNDETECTED',
  DETECTED: 'DETECTED',
  TRACKED: 'TRACKED',
  FIRE_CONTROL: 'FIRE_CONTROL',
});

// ──────────────────────────────────────────────────────────
// BaseEntity
// ──────────────────────────────────────────────────────────
let _entityIdCounter = 0;

export class BaseEntity {
  /**
   * @param {string} typeId - weapon-data 타입 ID
   * @param {{ lon: number, lat: number, alt: number }} position - WGS84 좌표
   */
  constructor(typeId, position) {
    this.id = `${typeId}_${++_entityIdCounter}`;
    this.typeId = typeId;
    this.position = { ...position };
    this.operational = true;
  }
}

// ──────────────────────────────────────────────────────────
// SensorEntity — 3단계 센서 상태머신
// ──────────────────────────────────────────────────────────
export class SensorEntity extends BaseEntity {
  /**
   * @param {string} typeId - 센서 타입 ID (예: 'GREEN_PINE_B')
   * @param {{ lon: number, lat: number, alt: number }} position
   */
  constructor(typeId, position) {
    super(typeId, position);
    /** @type {Map<string, { state: string, transitionTimer: number, consecutiveMisses: number }>} */
    this.trackStates = new Map();
  }

  /**
   * 특정 위협의 추적 상태 조회 (없으면 초기화)
   * @param {string} threatId
   * @returns {{ state: string, transitionTimer: number, consecutiveMisses: number }}
   */
  getTrackState(threatId) {
    if (!this.trackStates.has(threatId)) {
      this.trackStates.set(threatId, {
        state: SENSOR_STATE.UNDETECTED,
        transitionTimer: 0,
        consecutiveMisses: 0,
      });
    }
    return this.trackStates.get(threatId);
  }

  /**
   * 추적 상태 설정
   * @param {string} threatId
   * @param {string} newState
   */
  setTrackState(threatId, newState) {
    const ts = this.getTrackState(threatId);
    ts.state = newState;
    ts.transitionTimer = 0;
    ts.consecutiveMisses = 0;
  }

  /**
   * 위협의 추적 상태 제거 (위협 소멸 시)
   * @param {string} threatId
   */
  removeTrack(threatId) {
    this.trackStates.delete(threatId);
  }
}

// ──────────────────────────────────────────────────────────
// C2Entity — 지휘통제 노드
// ──────────────────────────────────────────────────────────
export class C2Entity extends BaseEntity {
  /**
   * @param {string} typeId - C2 타입 ID (예: 'KAMD_OPS')
   * @param {{ lon: number, lat: number, alt: number }} position
   * @param {'high'|'mid'|'low'} [operatorSkill='mid']
   */
  constructor(typeId, position, operatorSkill = 'mid') {
    super(typeId, position);
    this.operatorSkill = operatorSkill;
    /** @type {Array<{ threatId: string, receivedAt: number, processedAt: number|null }>} */
    this.processingQueue = [];
    /** @type {Array<{ threatId: string, assignedShooter: string|null }>} */
    this.engagementPlan = [];
  }

  /**
   * 처리 큐에 위협 추가
   * @param {string} threatId
   * @param {number} simTime - 수신 시각
   * @returns {boolean} 용량 초과 시 false
   */
  enqueue(threatId, simTime) {
    // 이미 큐에 있으면 중복 추가 방지
    if (this.processingQueue.some(item => item.threatId === threatId)) return true;
    this.processingQueue.push({ threatId, receivedAt: simTime, processedAt: null });
    return true;
  }

  /**
   * 처리 완료된 항목 조회
   * @param {number} simTime
   * @param {number} processingTime - 필요 처리 시간 (s)
   * @returns {Array<{ threatId: string }>}
   */
  getProcessedItems(simTime, processingTime) {
    const processed = [];
    for (const item of this.processingQueue) {
      if (item.processedAt !== null) continue;
      if (simTime - item.receivedAt >= processingTime) {
        item.processedAt = simTime;
        processed.push({ threatId: item.threatId });
      }
    }
    return processed;
  }

  /**
   * 큐에서 위협 제거
   * @param {string} threatId
   */
  dequeue(threatId) {
    this.processingQueue = this.processingQueue.filter(item => item.threatId !== threatId);
  }
}

// ──────────────────────────────────────────────────────────
// BatteryEntity — 포대
// ──────────────────────────────────────────────────────────
export class BatteryEntity extends BaseEntity {
  /**
   * @param {string} shooterTypeId - 사수 타입 ID (예: 'LSAM')
   * @param {{ lon: number, lat: number, alt: number }} position
   * @param {string} mfrSensorId - 소속 MFR 센서 엔티티 ID
   * @param {string} ecsC2Id - 소속 ECS C2 엔티티 ID
   * @param {{ ABM?: number, AAM?: number }} totalRounds - 초기 탄약 (하위 호환)
   * @param {number} maxSimultaneous - 동시교전 상한
   * @param {object} [batteryConfig] - weapon-data의 battery 구성 (launchers 정보)
   */
  constructor(shooterTypeId, position, mfrSensorId, ecsC2Id, totalRounds, maxSimultaneous, batteryConfig) {
    super(shooterTypeId, position);
    this.shooterTypeId = shooterTypeId;
    this.mfrSensorId = mfrSensorId;
    this.ecsC2Id = ecsC2Id;
    this.activeEngagements = 0;
    this.maxSimultaneous = maxSimultaneous;

    // 발사대(TEL) 개별 모델링
    if (batteryConfig && batteryConfig.launchers) {
      this.launchers = [];
      let launcherIdx = 0;
      for (const [missileType, count] of Object.entries(batteryConfig.launchers)) {
        for (let i = 0; i < count; i++) {
          this.launchers.push({
            id: `${this.id}_TEL${++launcherIdx}`,
            missileType,
            capacity: batteryConfig.roundsPerLauncher,
            remaining: batteryConfig.roundsPerLauncher,
          });
        }
      }
    } else {
      // 하위 호환: totalRounds 기반 단일 가상 발사대
      this.launchers = [];
      for (const [missileType, total] of Object.entries(totalRounds)) {
        this.launchers.push({
          id: `${this.id}_TEL_${missileType}`,
          missileType,
          capacity: total,
          remaining: total,
        });
      }
    }

    // 하위 호환: ammo 집계 getter
    this.ammo = new Proxy({}, {
      get: (_, prop) => {
        if (prop === Symbol.toPrimitive || typeof prop === 'symbol') return undefined;
        return this.launchers
          .filter(l => l.missileType === prop)
          .reduce((sum, l) => sum + l.remaining, 0);
      },
    });

    /** @type {Array<{ missileType: string, threatId: string, scheduledAt: number }>} */
    this.launchQueue = [];
    /** @type {Map<string, { timer: number, threatId: string }>} */
    this.bdaPending = new Map();
  }

  /**
   * 특정 미사일 타입의 잔여 탄약 합계
   * @param {string} missileType
   * @returns {number}
   */
  getAmmo(missileType) {
    return this.launchers
      .filter(l => l.missileType === missileType)
      .reduce((sum, l) => sum + l.remaining, 0);
  }

  /**
   * 발사 가능한 발사대 선택
   * @param {string} missileType
   * @returns {{ id: string, missileType: string, capacity: number, remaining: number }|null}
   */
  selectLauncher(missileType) {
    return this.launchers.find(l => l.missileType === missileType && l.remaining > 0) || null;
  }

  /**
   * 미사일 발사 가능 여부
   * @param {string} missileType
   * @returns {boolean}
   */
  canFire(missileType) {
    if (!this.operational) return false;
    if (this.activeEngagements >= this.maxSimultaneous) return false;
    if (!this.selectLauncher(missileType)) return false;
    return true;
  }

  /**
   * 미사일 발사 (발사대 탄약 차감 + 교전 수 증가)
   * @param {string} missileType
   * @returns {{ launcherId: string }|false}
   */
  fire(missileType) {
    if (!this.canFire(missileType)) return false;
    const launcher = this.selectLauncher(missileType);
    launcher.remaining--;
    this.activeEngagements++;
    return { launcherId: launcher.id };
  }

  /**
   * 교전 완료 (교전 수 감소)
   */
  completeEngagement() {
    if (this.activeEngagements > 0) {
      this.activeEngagements--;
    }
  }

  /**
   * BDA 대기 등록
   * @param {string} interceptorId
   * @param {string} threatId
   * @param {number} bdaDelay
   */
  startBDA(interceptorId, threatId, bdaDelay) {
    this.bdaPending.set(interceptorId, { timer: bdaDelay, threatId });
  }

  /**
   * BDA 타이머 갱신
   * @param {number} dt - 경과 시간 (s)
   * @returns {Array<{ interceptorId: string, threatId: string }>} 완료된 BDA 목록
   */
  updateBDA(dt) {
    const completed = [];
    for (const [interceptorId, bda] of this.bdaPending) {
      bda.timer -= dt;
      if (bda.timer <= 0) {
        completed.push({ interceptorId, threatId: bda.threatId });
        this.bdaPending.delete(interceptorId);
      }
    }
    return completed;
  }
}

// ──────────────────────────────────────────────────────────
// ThreatEntity — 위협
// ──────────────────────────────────────────────────────────
export class ThreatEntity extends BaseEntity {
  /**
   * @param {string} typeId - 위협 타입 ID (예: 'SRBM')
   * @param {{ lon: number, lat: number, alt: number }} startPos
   * @param {{ lon: number, lat: number, alt: number }} targetPos
   */
  constructor(typeId, startPos, targetPos) {
    super(typeId, startPos);
    this.startPos = { ...startPos };
    this.targetPos = { ...targetPos };
    this.velocity = { dLon: 0, dLat: 0, dAlt: 0 };
    this.flightPhase = 0;
    this.currentRCS = 1.0;
    this.maneuvering = false;
    this.ecmActive = false;
    this.state = 'flying';    // flying | detected | engaging | intercepted | leaked | destroyed
    this.progress = 0;        // 비행 진행률 (0~1)
    this.identifiedAs = null; // 식별된 위협 타입 (오인식 가능)
    this.prevPosition = { ...startPos }; // 이전 위치 (연속 충돌 감지용)
  }

  /**
   * 비행 진행 갱신
   * @param {number} newProgress - 새 진행률 (0~1)
   * @param {{ position: { lon: number, lat: number, alt: number }, speed: number, phase: number, rcsMultiplier: number }} trajectory
   * @param {number} baseRCS - 기준 RCS (m²)
   */
  updateFlight(newProgress, trajectory, phaseRCS) {
    this.progress = newProgress;
    this.prevPosition = { ...this.position };
    this.position = { ...trajectory.position };
    this.flightPhase = trajectory.phase;
    // RCS: registry에서 조회한 위협 타입×비행 단계별 값 사용
    this.currentRCS = phaseRCS;
  }
}

// ──────────────────────────────────────────────────────────
// InterceptorEntity — 요격미사일
// ──────────────────────────────────────────────────────────
export class InterceptorEntity extends BaseEntity {
  /**
   * @param {string} shooterTypeId - 발사 사수 타입 ID
   * @param {string} missileType - 미사일 타입 ('ABM' | 'AAM')
   * @param {{ lon: number, lat: number, alt: number }} position - 발사 위치
   * @param {string} targetThreatId - 표적 위협 ID
   * @param {number} missileSpeed - 미사일 속도 (m/s)
   * @param {number} pssekPk - 발사 시점 PSSEK Pk
   * @param {number} killRadius - 킬 반경 (m)
   * @param {'PNG'|'CLOS'} [guidanceType='PNG']
   */
  constructor(shooterTypeId, missileType, position, targetThreatId, missileSpeed, pssekPk, killRadius, guidanceType = 'PNG') {
    super(`${shooterTypeId}_${missileType}`, position);
    this.shooterTypeId = shooterTypeId;
    this.missileType = missileType;
    this.targetThreatId = targetThreatId;
    this.missileSpeed = missileSpeed;
    this.pssekPk = pssekPk;
    this.killRadius = killRadius;
    this.guidanceType = guidanceType;
    this.velocity = { x: 0, y: 0, z: 0 }; // ENU (m/s)
    this.prevPosition = { ...position };  // 이전 위치 (연속 충돌 감지용)
    this.fuelRemaining = 60;    // seconds
    this.state = 'boosting';    // boosting | guiding | detonated | missed
    this.boostTime = 2.0;       // 부스터 시간 (s)
    this.elapsedTime = 0;       // 경과 시간 (s)
    this.flyoutTime = null;     // 예상 비행시간 (s) — 경과 시 PSSEK 판정
    this.batteryId = null;      // 발사 포대 ID
  }

  /**
   * 연료 소진 여부
   * @returns {boolean}
   */
  isFuelDepleted() {
    return this.fuelRemaining <= 0;
  }

  /**
   * 시간 경과
   * @param {number} dt
   */
  tick(dt) {
    this.elapsedTime += dt;
    this.fuelRemaining -= dt;
    if (this.elapsedTime >= this.boostTime && this.state === 'boosting') {
      this.state = 'guiding';
    }
  }
}

/**
 * 엔티티 ID 카운터 리셋 (테스트용)
 */
export function resetEntityIdCounter() {
  _entityIdCounter = 0;
}
