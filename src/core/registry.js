/**
 * @module core/registry
 * 엔티티 레지스트리 — weapon-data 조회 엔진
 * 킬체인 로직은 반드시 이 모듈을 경유하여 타입 정보 조회 (하드코딩 금지)
 * Cesium 의존성 없음
 */

export class Registry {
  /**
   * @param {Object} weaponData - { SHOOTER_TYPES, SENSOR_TYPES, C2_TYPES, THREAT_TYPES }
   */
  constructor(weaponData) {
    this._shooters = weaponData.SHOOTER_TYPES;
    this._sensors = weaponData.SENSOR_TYPES;
    this._c2s = weaponData.C2_TYPES;
    this._threats = weaponData.THREAT_TYPES;
  }

  /**
   * 특정 위협에 대해 Pk>0인 사수를 Pk 내림차순으로 반환한다.
   * @param {string} threatTypeId
   * @returns {{typeId: string, pk: number}[]}
   */
  getPrioritizedShooters(threatTypeId) {
    const result = [];
    for (const [typeId, shooter] of Object.entries(this._shooters)) {
      const pk = shooter.capability.pkTable[threatTypeId];
      if (pk && pk > 0) {
        result.push({ typeId, pk });
      }
    }
    result.sort((a, b) => b.pk - a.pk);
    return result;
  }

  /**
   * 센서가 탐지할 수 있는 위협 타입 목록을 반환한다.
   * @param {string} sensorTypeId
   * @returns {string[]}
   */
  getDetectableThreats(sensorTypeId) {
    const sensor = this._sensors[sensorTypeId];
    if (!sensor) return [];
    return [...sensor.capability.detectableThreats];
  }

  /**
   * 특정 C2에 보고하는 센서 타입 목록을 반환한다.
   * @param {string} c2TypeId
   * @returns {string[]}
   */
  getSensorsForC2(c2TypeId) {
    const result = [];
    for (const [typeId, sensor] of Object.entries(this._sensors)) {
      if (sensor.relations.reportingC2 === c2TypeId) {
        result.push(typeId);
      }
    }
    return result;
  }

  /**
   * 특정 C2에 보고하는 사수 타입 목록을 반환한다.
   * @param {string} c2TypeId
   * @returns {string[]}
   */
  getShootersForC2(c2TypeId) {
    const result = [];
    for (const [typeId, shooter] of Object.entries(this._shooters)) {
      if (shooter.relations.reportingC2 === c2TypeId) {
        result.push(typeId);
      }
    }
    return result;
  }

  /**
   * 사수의 3축 소속을 반환한다.
   * @param {string} shooterTypeId
   * @returns {string|null}
   */
  getAxisForShooter(shooterTypeId) {
    const shooter = this._shooters[shooterTypeId];
    if (!shooter) return null;
    return shooter.relations.c2Axis;
  }

  /**
   * 사수 타입의 capability를 반환한다.
   * @param {string} shooterTypeId
   * @returns {Object|null}
   */
  getShooterCapability(shooterTypeId) {
    const shooter = this._shooters[shooterTypeId];
    if (!shooter) return null;
    return shooter.capability;
  }

  /**
   * 센서 타입의 capability를 반환한다.
   * @param {string} sensorTypeId
   * @returns {Object|null}
   */
  getSensorCapability(sensorTypeId) {
    const sensor = this._sensors[sensorTypeId];
    if (!sensor) return null;
    return sensor.capability;
  }

  /**
   * 위협 타입 정보를 반환한다.
   * @param {string} threatTypeId
   * @returns {Object|null}
   */
  getThreatType(threatTypeId) {
    return this._threats[threatTypeId] || null;
  }

  /**
   * C2 타입 정보를 반환한다.
   * @param {string} c2TypeId
   * @returns {Object|null}
   */
  getC2Type(c2TypeId) {
    return this._c2s[c2TypeId] || null;
  }

  /**
   * 아키텍처별 토폴로지를 구축한다.
   * TOPOLOGY_RELATIONS에 정의된 킬체인 경로를 기반으로
   * 엔티티 간 연결 관계를 반환한다.
   * @param {'linear'|'killweb'} architecture
   * @param {Object} [topologyData] - TOPOLOGY_RELATIONS (외부 주입 가능)
   * @returns {{nodes: string[], edges: Array<{from:string, to:string, delay:number}>}|null}
   */
  buildTopology(architecture, topologyData) {
    // Phase 1.3에서 구현
    throw new Error('Not implemented: buildTopology');
  }
}
