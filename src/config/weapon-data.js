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
      navConstant: 4.5,       // PNG 항법상수 N
      killRadius: 0.05,       // km (50m, 직격파괴 hit-to-kill)
      warheadEffectiveness: 0.95
    },
    relations: {
      priority: 'ABM_FIRST',
      ecs: 'ECS',
      icc: 'ICC',
      reportingC2: 'KAMD_OPS',
      commandC2: ['KAMD_OPS', 'MCRC'],
      c2Axis: ['KAMD', 'MCRC'],
      engageableThreats: ['SRBM'],
      requiredSensors: ['GREEN_PINE', 'MSAM_MFR'],
      pairedSystem: 'LSAM_AAM',
      systemGroup: 'LSAM'
    }
  },
  LSAM_AAM: {
    name: 'L-SAM (대공)',
    capability: {
      maxRange: 200,          // km
      minRange: 10,           // km
      maxAlt: 25,             // km
      minAlt: 0.05,           // km (50m)
      pkTable: { AIRCRAFT: 0.90, CRUISE_MISSILE: 0.80, UAS: 0.60 },
      ammoCount: 8,
      interceptMethod: 'guided',
      interceptorSpeed: 1200, // m/s
      boostTime: 2.0,         // s
      navConstant: 4.0,       // PNG 항법상수 N
      killRadius: 0.5,        // km (500m, guided 근접신관)
      warheadEffectiveness: 0.75
    },
    relations: {
      priority: 'AAM_SECOND',
      ecs: 'ECS',
      icc: 'ICC',
      reportingC2: 'KAMD_OPS',
      commandC2: ['KAMD_OPS', 'MCRC'],
      c2Axis: ['KAMD', 'MCRC'],
      engageableThreats: ['AIRCRAFT', 'CRUISE_MISSILE', 'UAS'],
      requiredSensors: ['MSAM_MFR'],
      pairedSystem: 'LSAM_ABM',
      systemGroup: 'LSAM'
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
      reportingC2: 'ECS',
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
    processingDelay: { min: 20, max: 60 },  // seconds
    simultaneousCapacity: 3,
    role: 'ballistic_defense',
    axis: 'KAMD',
    level: 'command',
    subordinates: ['ICC']
  },
  ICC: {
    name: 'ICC (정보조정소, 대대급)',
    processingDelay: { min: 5, max: 15 },   // seconds
    simultaneousCapacity: 5,
    role: 'battalion_coordination',
    axis: 'KAMD',
    level: 'battalion',
    superior: 'KAMD_OPS',
    subordinates: ['ECS']
  },
  ECS: {
    name: 'ECS (교전통제소, 포대급)',
    processingDelay: { min: 2, max: 5 },    // seconds
    simultaneousCapacity: 8,
    role: 'battery_fire_control',
    axis: 'KAMD',
    level: 'battery',
    superior: 'ICC',
    subordinates: []
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

/**
 * 토폴로지 관계 — 선형 C2 킬체인 + Kill Web 구조 정의
 * @type {Object<string, Object>}
 */
export const TOPOLOGY_RELATIONS = deepFreeze({
  linear: {
    name: '선형 3축 C2',
    description: 'GREEN_PINE → KAMD_OPS → ICC → ECS → L-SAM',
    killchain: [
      { from: 'GREEN_PINE', to: 'KAMD_OPS', linkType: 'long_range', delay: 16 },
      { from: 'KAMD_OPS', to: 'ICC',       linkType: 'long_range', delay: 16 },
      { from: 'ICC',       to: 'ECS',       linkType: 'short_range', delay: 1 },
      { from: 'ECS',       to: 'LSAM_ABM',  linkType: 'short_range', delay: 1 }
    ],
    s2sEstimate: { min: 61, max: 114 }
  },
  killweb: {
    name: 'Kill Web (IBCS)',
    description: '모든 센서 → IAOC → EOC → 사수',
    killchain: [
      { from: '*_SENSOR', to: 'IAOC', linkType: 'ifcn', delay: 1 },
      { from: 'IAOC',     to: 'EOC',  linkType: 'ifcn', delay: 1 },
      { from: 'EOC',      to: '*_SHOOTER', linkType: 'ifcn', delay: 1 }
    ],
    s2sEstimate: { min: 5, max: 9 }
  }
});
