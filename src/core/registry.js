/**
 * core/registry.js — EADSIM-Lite 질의 엔진
 *
 * weapon-data.js의 선언적 데이터를 질의하는 인터페이스.
 * 능력(불변) 조회 전용 — 상태(가변)는 entities에서 관리.
 */
import {
  SENSOR_TYPES,
  SHOOTER_TYPES,
  C2_TYPES,
  THREAT_TYPES,
  LINK_DELAYS,
  LINEAR_TOPOLOGY,
} from '../config/weapon-data.js';

export class Registry {
  constructor() {
    this.sensors = SENSOR_TYPES;
    this.shooters = SHOOTER_TYPES;
    this.c2s = C2_TYPES;
    this.threats = THREAT_TYPES;
    this.linkDelays = LINK_DELAYS;
  }

  // ──────────────────────────────────────────────────────────
  // 센서 조회
  // ──────────────────────────────────────────────────────────

  /**
   * 센서 탐지/추적/교전급 거리 조회
   * @param {string} sensorTypeId - 센서 타입 ID
   * @param {string} [threatCategory='ballistic'] - 위협 카테고리 ('ballistic' | 'aircraft')
   * @returns {{ detect: number, track: number, fireControl: number|null }} 거리 (km)
   */
  getSensorRanges(sensorTypeId, threatCategory = 'ballistic') {
    const sensor = this.sensors[sensorTypeId];
    if (!sensor) return null;

    const r = sensor.ranges;
    // 단일 값이면 그대로, 객체면 카테고리별
    return {
      detect: typeof r.detect === 'number' ? r.detect : (r.detect[threatCategory] ?? r.detect.ballistic),
      track: typeof r.track === 'number' ? r.track : (r.track[threatCategory] ?? r.track.ballistic),
      fireControl: r.fireControl === null ? null :
        (typeof r.fireControl === 'number' ? r.fireControl : (r.fireControl[threatCategory] ?? r.fireControl.ballistic)),
    };
  }

  /**
   * 센서별 기준 RCS 조회 (SNR 공식용)
   * @param {string} sensorTypeId
   * @returns {number} RCS_ref (m²)
   */
  getRcsRef(sensorTypeId) {
    const sensor = this.sensors[sensorTypeId];
    return sensor ? sensor.rcsRef : null;
  }

  /**
   * 센서 상태 전이 시간 조회
   * @param {string} sensorTypeId
   * @returns {{ detectToTrack: number, trackToFC: number|undefined }}
   */
  getSensorTransitionTimes(sensorTypeId) {
    const sensor = this.sensors[sensorTypeId];
    return sensor ? { ...sensor.transitionTime } : null;
  }

  /**
   * 밴드별 재밍 감수성 조회
   * @param {string} sensorTypeId
   * @returns {number} 0~1 (0=면역, 1=매우취약)
   */
  getJammingSusceptibility(sensorTypeId) {
    const sensor = this.sensors[sensorTypeId];
    return sensor ? sensor.jammingSusceptibility : null;
  }

  /**
   * 센서가 특정 위협을 탐지 가능한지 확인
   * @param {string} sensorTypeId
   * @param {string} threatTypeId
   * @returns {boolean}
   */
  canDetect(sensorTypeId, threatTypeId) {
    const sensor = this.sensors[sensorTypeId];
    return sensor ? sensor.detectableThreats.includes(threatTypeId) : false;
  }

  /**
   * 센서가 교전급 추적 능력을 가지는지 확인
   * @param {string} sensorTypeId
   * @returns {boolean}
   */
  hasFireControlCapability(sensorTypeId) {
    const sensor = this.sensors[sensorTypeId];
    if (!sensor) return false;
    return sensor.role === 'fire_control';
  }

  // ──────────────────────────────────────────────────────────
  // PSSEK 조회
  // ──────────────────────────────────────────────────────────

  /**
   * PSSEK 조회: 무기-위협-거리구간-접근각 → Pk
   * @param {string} shooterTypeId - 사수 타입 ID
   * @param {string} missileType - 미사일 타입 ('ABM' | 'AAM')
   * @param {string} threatTypeId - 위협 타입 ID
   * @param {number} rangeKm - 사수~PIP 거리 (km)
   * @param {string} aspect - 접근각 ('front' | 'side' | 'rear')
   * @returns {number|null} Pk 값 (0~1), 조회 실패 시 null
   */
  lookupPSSEK(shooterTypeId, missileType, threatTypeId, rangeKm, aspect) {
    const shooter = this.shooters[shooterTypeId];
    if (!shooter) return null;

    const missile = shooter.missiles[missileType];
    if (!missile) return null;

    const threatTable = missile.pssekTable[threatTypeId];
    if (!threatTable) return null;

    const aspectTable = threatTable[aspect];
    if (!aspectTable) return null;

    // 거리구간 매칭
    for (const [rangeBin, pk] of Object.entries(aspectTable)) {
      const [rMin, rMax] = rangeBin.split('-').map(Number);
      if (rangeKm >= rMin && rangeKm <= rMax) {
        return pk;
      }
    }

    return null; // 거리구간 범위 밖
  }

  /**
   * 특정 사수의 PSSEK 거리구간 목록 반환
   * @param {string} shooterTypeId
   * @param {string} missileType
   * @returns {Array<{min: number, max: number}>}
   */
  getRangeBins(shooterTypeId, missileType) {
    const shooter = this.shooters[shooterTypeId];
    if (!shooter || !shooter.missiles[missileType]) return [];

    const table = shooter.missiles[missileType].pssekTable;
    const firstThreat = Object.keys(table)[0];
    if (!firstThreat) return [];

    const firstAspect = Object.keys(table[firstThreat])[0];
    if (!firstAspect) return [];

    return Object.keys(table[firstThreat][firstAspect]).map(bin => {
      const [min, max] = bin.split('-').map(Number);
      return { min, max };
    });
  }

  // ──────────────────────────────────────────────────────────
  // 교전 봉투
  // ──────────────────────────────────────────────────────────

  /**
   * 교전 봉투 판정: PIP가 봉투 내에 있는가?
   * @param {string} shooterTypeId
   * @param {string} missileType
   * @param {{ rangeKm: number, altKm: number }} pip - PIP (거리 km, 고도 km)
   * @returns {boolean}
   */
  isInEnvelope(shooterTypeId, missileType, pip) {
    const shooter = this.shooters[shooterTypeId];
    if (!shooter) return false;

    const missile = shooter.missiles[missileType];
    if (!missile) return false;

    const env = missile.engagementEnvelope;
    return pip.rangeKm >= env.Rmin && pip.rangeKm <= env.Rmax &&
           pip.altKm >= env.Hmin && pip.altKm <= env.Hmax;
  }

  /**
   * 교전 봉투 조회
   * @param {string} shooterTypeId
   * @param {string} missileType
   * @returns {{ Rmin: number, Rmax: number, Hmin: number, Hmax: number }|null}
   */
  getEnvelope(shooterTypeId, missileType) {
    const shooter = this.shooters[shooterTypeId];
    if (!shooter || !shooter.missiles[missileType]) return null;
    return { ...shooter.missiles[missileType].engagementEnvelope };
  }

  // ──────────────────────────────────────────────────────────
  // 사수 조회
  // ──────────────────────────────────────────────────────────

  /**
   * 특정 위협에 교전 가능한 사수 목록 (PSSEK 최대값 내림차순)
   * @param {string} threatTypeId
   * @param {{ rangeKm: number, altKm: number }} pip
   * @returns {Array<{ shooterTypeId: string, missileType: string, maxPk: number }>}
   */
  getPrioritizedShooters(threatTypeId, pip) {
    const results = [];

    for (const [shooterTypeId, shooter] of Object.entries(this.shooters)) {
      for (const [missileType, missile] of Object.entries(shooter.missiles)) {
        // 봉투 체크
        if (!this.isInEnvelope(shooterTypeId, missileType, pip)) continue;

        // PSSEK 최대값 조회 (최적 접근각 기준)
        const threatTable = missile.pssekTable[threatTypeId];
        if (!threatTable) continue;

        let maxPk = 0;
        for (const aspectTable of Object.values(threatTable)) {
          for (const pk of Object.values(aspectTable)) {
            if (pk > maxPk) maxPk = pk;
          }
        }

        if (maxPk > 0) {
          results.push({ shooterTypeId, missileType, maxPk });
        }
      }
    }

    // PSSEK 최대값 내림차순 정렬
    results.sort((a, b) => b.maxPk - a.maxPk);
    return results;
  }

  /**
   * 포대 동시교전 상한 조회
   * @param {string} sensorTypeId - MFR 센서 타입 ID
   * @param {string} [threatCategory='ballistic']
   * @returns {number}
   */
  getSimultaneousLimit(sensorTypeId, threatCategory = 'ballistic') {
    const sensor = this.sensors[sensorTypeId];
    if (!sensor || !sensor.simultaneousEngagement) return Infinity;

    const se = sensor.simultaneousEngagement;
    return typeof se === 'number' ? se : (se[threatCategory] ?? Infinity);
  }

  /**
   * 미사일 파라미터 조회
   * @param {string} shooterTypeId
   * @param {string} missileType
   * @returns {object|null}
   */
  getMissileParams(shooterTypeId, missileType) {
    const shooter = this.shooters[shooterTypeId];
    if (!shooter || !shooter.missiles[missileType]) return null;
    return { ...shooter.missiles[missileType] };
  }

  /**
   * 포대 구성 정보 조회
   * @param {string} shooterTypeId
   * @returns {object|null}
   */
  getBatteryConfig(shooterTypeId) {
    const shooter = this.shooters[shooterTypeId];
    return shooter ? { ...shooter.battery } : null;
  }

  // ──────────────────────────────────────────────────────────
  // C2 조회
  // ──────────────────────────────────────────────────────────

  /**
   * C2 노드의 처리 시간 조회
   * @param {string} c2TypeId
   * @param {string} operatorSkill - 'high' | 'mid' | 'low'
   * @returns {{ systemTime: number, operatorTime: number, totalTime: number }|null}
   */
  getC2ProcessingTime(c2TypeId, operatorSkill = 'mid') {
    const c2 = this.c2s[c2TypeId];
    if (!c2) return null;

    // 시스템 처리 시간: 범위 중간값
    const [sysMin, sysMax] = c2.processing.system;
    const systemTime = (sysMin + sysMax) / 2;
    const operatorTime = c2.processing.operator[operatorSkill] ?? c2.processing.operator.mid;

    return { systemTime, operatorTime, totalTime: systemTime + operatorTime };
  }

  // ──────────────────────────────────────────────────────────
  // 토폴로지
  // ──────────────────────────────────────────────────────────

  /**
   * C2 토폴로지 그래프 생성
   * @param {'linear'|'killweb'} architecture
   * @returns {{ nodes: string[], edges: Array<{ from: string, to: string, delay: number }> }}
   */
  buildTopology(architecture) {
    if (architecture === 'linear') {
      return {
        nodes: [...LINEAR_TOPOLOGY.nodes],
        edges: LINEAR_TOPOLOGY.edges.map(e => ({
          from: e.from,
          to: e.to,
          delay: this.linkDelays[e.delay],
        })),
      };
    }
    // Kill Web은 Phase 3에서 구현
    return { nodes: [], edges: [] };
  }

  // ──────────────────────────────────────────────────────────
  // 위협 조회
  // ──────────────────────────────────────────────────────────

  /**
   * 위협 타입 정보 조회
   * @param {string} threatTypeId
   * @returns {object|null}
   */
  getThreatInfo(threatTypeId) {
    const threat = this.threats[threatTypeId];
    return threat ? { ...threat } : null;
  }

  /**
   * 위협의 비행 단계별 RCS 조회
   * @param {string} threatTypeId
   * @param {number} phase - 비행 단계 (0, 1, 2)
   * @returns {number} RCS (m²)
   */
  getThreatRCS(threatTypeId, phase) {
    const threat = this.threats[threatTypeId];
    if (!threat) return 1.0;
    const p = threat.flightProfile.phases[phase];
    return p ? p.rcs : 1.0;
  }

  /**
   * 위협의 ECM 보정계수 조회
   * @param {string} threatTypeId
   * @returns {number} 0~1
   */
  getEcmFactor(threatTypeId) {
    const threat = this.threats[threatTypeId];
    return threat ? threat.ecmFactor : 0;
  }
}
