/**
 * @module core/entities
 * 런타임 엔티티 인스턴스 — 능력(불변, weapon-data) vs 상태(가변, 인스턴스) 분리
 * Cesium 의존성 없음
 */

// ═══════════════════════════════════════════════════════════
//  BaseEntity
// ═══════════════════════════════════════════════════════════

export class BaseEntity {
  /**
   * @param {string} id - 고유 인스턴스 ID
   * @param {string} typeId - weapon-data 타입 키
   * @param {{lon:number, lat:number, alt:number}} position
   */
  constructor(id, typeId, position) {
    this.id = id;
    this.typeId = typeId;
    this.position = { ...position };
    this.operational = true;
  }
}

// ═══════════════════════════════════════════════════════════
//  ShooterEntity
// ═══════════════════════════════════════════════════════════

export class ShooterEntity extends BaseEntity {
  /**
   * @param {string} id
   * @param {string} typeId - SHOOTER_TYPES 키
   * @param {{lon:number, lat:number, alt:number}} position
   * @param {import('./registry.js').Registry} registry
   */
  constructor(id, typeId, position, registry) {
    super(id, typeId, position);
    this._registry = registry;
    const cap = registry.getShooterCapability(typeId);
    this.currentAmmo = cap ? cap.ammoCount : 0;
    this.engagedTarget = null;
    this.status = 'ready'; // ready|tracking|engaged|reloading|out_of_ammo|destroyed
  }

  /**
   * 해당 위협 타입에 교전 가능한지 판단한다.
   * @param {string} threatTypeId
   * @returns {boolean}
   */
  canEngage(threatTypeId) {
    if (this.currentAmmo <= 0) return false;
    if (!this.operational) return false;
    if (this.status === 'out_of_ammo' || this.status === 'destroyed') return false;

    const shooters = this._registry.getPrioritizedShooters(threatTypeId);
    return shooters.some(s => s.typeId === this.typeId);
  }

  /**
   * 위협에 대해 발사한다. 탄약 1 감소, 상태 변경.
   * @param {string} threatId
   */
  fire(threatId) {
    if (this.currentAmmo <= 0) return;
    this.currentAmmo--;
    this.engagedTarget = { threatId, interceptors: [] };
    this.status = this.currentAmmo > 0 ? 'engaged' : 'out_of_ammo';
  }
}

// ═══════════════════════════════════════════════════════════
//  SensorEntity
// ═══════════════════════════════════════════════════════════

export class SensorEntity extends BaseEntity {
  /**
   * @param {string} id
   * @param {string} typeId - SENSOR_TYPES 키
   * @param {{lon:number, lat:number, alt:number}} position
   * @param {import('./registry.js').Registry} registry
   */
  constructor(id, typeId, position, registry) {
    super(id, typeId, position);
    this._registry = registry;
    this.currentTracking = [];
    this.detectedThreats = [];
  }

  /**
   * 탐지 가능한 위협 타입인지 확인한다.
   * @param {string} threatTypeId
   * @returns {boolean}
   */
  canDetect(threatTypeId) {
    const threats = this._registry.getDetectableThreats(this.typeId);
    return threats.includes(threatTypeId);
  }

  /**
   * 위협 탐지를 기록한다.
   * @param {string} threatId
   * @param {string} threatTypeId
   * @param {number} simTime
   */
  addDetection(threatId, threatTypeId, simTime) {
    const existing = this.detectedThreats.find(d => d.threatId === threatId);
    if (existing) {
      existing.lastUpdated = simTime;
      return;
    }
    this.detectedThreats.push({
      threatId,
      threatTypeId,
      firstDetectedTime: simTime,
      lastUpdated: simTime
    });
  }

  /**
   * 위협 탐지를 제거한다.
   * @param {string} threatId
   */
  clearDetection(threatId) {
    this.detectedThreats = this.detectedThreats.filter(d => d.threatId !== threatId);
    this.currentTracking = this.currentTracking.filter(t => t.threatId !== threatId);
  }
}

// ═══════════════════════════════════════════════════════════
//  C2Entity
// ═══════════════════════════════════════════════════════════

export class C2Entity extends BaseEntity {
  /**
   * @param {string} id
   * @param {string} typeId - C2_TYPES 키
   * @param {{lon:number, lat:number, alt:number}} position
   */
  constructor(id, typeId, position) {
    super(id, typeId, position);
    this.pendingTracks = [];
    this.engagementPlan = [];
  }
}

// ═══════════════════════════════════════════════════════════
//  ThreatEntity
// ═══════════════════════════════════════════════════════════

export class ThreatEntity extends BaseEntity {
  /**
   * @param {string} id
   * @param {string} typeId - THREAT_TYPES 키
   * @param {Object} config - { origin, target, launchTime }
   * @param {import('./registry.js').Registry} registry
   */
  constructor(id, typeId, config, registry) {
    super(id, typeId, config.origin);
    this._registry = registry;
    this._threatType = registry.getThreatType(typeId);
    this.origin = { ...config.origin };
    this.target = { ...config.target };
    this.launchTime = config.launchTime;
    this.velocity = { x: 0, y: 0, z: 0 };
    this.state = 'launched'; // launched|boost|midcourse|terminal|intercepted|leaked
    this.flightProgress = 0; // 0.0 ~ 1.0
    this.identifiedAs = null;
  }

  /**
   * 현재 비행 진행률 기반으로 phase 인덱스를 반환한다.
   * @returns {number} 0, 1, 2 (3단계)
   */
  getCurrentPhase() {
    const phases = this._threatType.flightProfile.phases;
    for (let i = phases.length - 1; i >= 0; i--) {
      if (this.flightProgress >= phases[i].range[0]) return i;
    }
    return 0;
  }

  /**
   * 현재 phase 내 보간된 속도 배수를 반환한다.
   * @returns {number}
   */
  getCurrentSpeedMult() {
    const phase = this._threatType.flightProfile.phases[this.getCurrentPhase()];
    const t = this._phaseLocalT(phase);
    return phase.speedMult[0] + (phase.speedMult[1] - phase.speedMult[0]) * t;
  }

  /**
   * 현재 phase 내 보간된 목표 고도를 반환한다 (km).
   * @returns {number}
   */
  getCurrentAltitude() {
    const phase = this._threatType.flightProfile.phases[this.getCurrentPhase()];
    const t = this._phaseLocalT(phase);
    return phase.altitude[0] + (phase.altitude[1] - phase.altitude[0]) * t;
  }

  /**
   * terminal phase 여부를 반환한다.
   * @returns {boolean}
   */
  isTerminal() {
    const phases = this._threatType.flightProfile.phases;
    return this.getCurrentPhase() === phases.length - 1;
  }

  /**
   * 현재 기동 중인지 반환한다.
   * @returns {boolean}
   */
  isManeuvering() {
    const phase = this._threatType.flightProfile.phases[this.getCurrentPhase()];
    return phase.maneuver;
  }

  /**
   * 현재 phase 내 로컬 진행률 (0~1)
   * @param {Object} phase
   * @returns {number}
   * @private
   */
  _phaseLocalT(phase) {
    const phaseLen = phase.range[1] - phase.range[0];
    if (phaseLen <= 0) return 0;
    return Math.min(1, Math.max(0,
      (this.flightProgress - phase.range[0]) / phaseLen
    ));
  }
}

// ═══════════════════════════════════════════════════════════
//  InterceptorEntity
// ═══════════════════════════════════════════════════════════

export class InterceptorEntity extends BaseEntity {
  /**
   * @param {string} id
   * @param {Object} config - { position, speed, boostTime, navConstant, targetThreatId, shooterId }
   */
  constructor(id, config) {
    super(id, 'INTERCEPTOR', config.position);
    this.velocity = { x: 0, y: 0, z: 0 };
    this.speed = config.speed;
    this.boostTimeRemaining = config.boostTime;
    this.navConstant = config.navConstant;
    this.targetThreatId = config.targetThreatId;
    this.shooterId = config.shooterId;
    this.state = 'boost'; // boost|guidance|hit|miss
  }

  /**
   * 부스트 단계인지 반환한다.
   * @returns {boolean}
   */
  isInBoost() {
    return this.state === 'boost';
  }

  /**
   * 부스트 시간을 소진한다. 소진 시 guidance 전환.
   * @param {number} dt - 경과 시간 (초)
   */
  updateBoost(dt) {
    if (this.state !== 'boost') return;
    this.boostTimeRemaining = Math.max(0, this.boostTimeRemaining - dt);
    if (this.boostTimeRemaining <= 0) {
      this.state = 'guidance';
    }
  }
}
