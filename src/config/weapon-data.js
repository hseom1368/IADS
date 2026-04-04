/**
 * @module config/weapon-data
 * 무기체계 타입 + 능력(capability) + 관계(relation) 선언적 정의
 * SSOT: 모든 무기체계 파라미터의 단일 소스
 * 새 체계 추가 시 이 파일만 수정
 */

/**
 * 객체를 재귀적으로 freeze한다.
 * @param {Object} obj
 * @returns {Object} frozen object
 */
function deepFreeze(obj) {
  Object.freeze(obj);
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

// ═══════════════════════════════════════════════════════════
//  사수 타입 (SHOOTER_TYPES)
// ═══════════════════════════════════════════════════════════

/** @type {Object<string, Object>} */
export const SHOOTER_TYPES = deepFreeze({
  LSAM_ABM: {
    name: 'L-SAM (탄도탄)',
    capability: {
      maxRange: 150,          // km
      minRange: 20,           // km
      maxAlt: 60,             // km
      minAlt: 40,             // km
      pkTable: { SRBM: 0.85 },
      ammoCount: 6,
      interceptMethod: 'hit-to-kill',
      interceptorSpeed: 1500, // m/s
      boostTime: 2.0,         // s (수직 발사 부스트)
      navConstant: 4.5        // PNG 항법상수 N
    },
    relations: {
      reportingC2: 'KAMD_OPS',
      engageableThreats: ['SRBM'],
      requiredSensors: ['GREEN_PINE', 'MSAM_MFR'],
      c2Axis: 'KAMD'
    }
  }
});

// ═══════════════════════════════════════════════════════════
//  센서 타입 (SENSOR_TYPES)
// ═══════════════════════════════════════════════════════════

/** @type {Object<string, Object>} */
export const SENSOR_TYPES = deepFreeze({
  MSAM_MFR: {
    name: 'MSAM MFR (천궁-II 레이더)',
    capability: {
      maxRange: 100,                // km
      trackingCapacity: 50,
      scanRate: 30,                 // rpm
      minDetectionAltitude: 30,     // m
      fov: { azHalf: 60, elMax: 90 }, // degrees
      detectableThreats: ['SRBM', 'CRUISE_MISSILE', 'AIRCRAFT', 'MLRS_GUIDED', 'UAS']
    },
    relations: {
      reportingC2: 'BATTALION_TOC',
      role: 'fire_control'
    }
  },
  GREEN_PINE: {
    name: 'Green Pine (탄도탄 조기경보)',
    capability: {
      maxRange: 800,                // km
      trackingCapacity: 150,
      scanRate: 10,                 // rpm
      minDetectionAltitude: 10000,  // m (10km)
      fov: { azHalf: 60, elMax: 90 },
      detectableThreats: ['SRBM']
    },
    relations: {
      reportingC2: 'KAMD_OPS',
      role: 'early_warning+fire_control'
    }
  }
});

// ═══════════════════════════════════════════════════════════
//  C2 타입 (C2_TYPES)
// ═══════════════════════════════════════════════════════════

/** @type {Object<string, Object>} */
export const C2_TYPES = deepFreeze({
  KAMD_OPS: {
    name: 'KAMD 작전통제소',
    processingDelay: { min: 20, max: 120 }, // seconds
    simultaneousCapacity: 2,
    role: 'ballistic_defense',
    axis: 'KAMD'
  }
});

// ═══════════════════════════════════════════════════════════
//  위협 타입 (THREAT_TYPES)
// ═══════════════════════════════════════════════════════════

/** @type {Object<string, Object>} */
export const THREAT_TYPES = deepFreeze({
  SRBM: {
    name: 'SRBM (단거리 탄도미사일)',
    speed: 2040,            // m/s (Mach 6)
    flightProfile: {
      type: 'ballistic',
      phases: [
        {
          range: [0, 0.25],
          altitude: [0, 150],       // km
          speedMult: [0.5, 1.0],
          maneuver: false
        },
        {
          range: [0.25, 0.70],
          altitude: [150, 150],
          speedMult: [1.0, 1.0],
          maneuver: false
        },
        {
          range: [0.70, 1.0],
          altitude: [150, 0],
          speedMult: [1.0, 1.5],
          maneuver: true
        }
      ]
    },
    signature: {
      rcs: 0.1,              // m²
      radarSignature: 'ballistic',
      costRatio: 1.0
    }
  }
});

/** @type {Object<string, Object>} 토폴로지 관계 (Phase 4에서 확장) */
export const TOPOLOGY_RELATIONS = deepFreeze({});
