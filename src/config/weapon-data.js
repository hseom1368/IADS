/**
 * config/weapon-data.js — EADSIM-Lite 선언적 타입 레지스트리
 *
 * SSOT: 모든 무기체계 파라미터의 단일 소스
 * Phase 1 최소 구성: GREEN_PINE_B, LSAM_MFR, KAMD_OPS, ICC, ECS, L-SAM, SRBM
 *
 * 규칙:
 * - 거리: km
 * - 시간: 초(s)
 * - 속도: m/s
 * - 고도: m (교전봉투의 Hmin/Hmax는 km)
 * - 각도: 도(°)
 * - RCS: m²
 */

// ════════════════════════════════════════════════════════════
// 센서 타입
// ════════════════════════════════════════════════════════════
export const SENSOR_TYPES = Object.freeze({
  GREEN_PINE_B: {
    name: 'Green Pine Block-B',
    band: 'L',
    ranges: { detect: 900, track: 600, fireControl: null },
    transitionTime: { detectToTrack: 10 },
    trackCapacity: 30,
    role: 'early_warning',
    detectableThreats: ['SRBM'],
    minAltitude: 5000,
    jammingSusceptibility: 0.3,
    rcsRef: 0.1,
    antennaHeight: 10,  // m (차량 탑재 안테나 기준, 배치 위치 alt에 가산)
    scanRate: 360,      // 회전형 (도/s, 전방위)
    azimuthHalf: 180,   // 전방위
    elevationMax: 90,
  },
  LSAM_MFR: {
    name: 'L-SAM MFR',
    band: 'S',
    ranges: {
      detect: { ballistic: 310, aircraft: 400 },
      track: { ballistic: 250, aircraft: 300 },
      fireControl: { ballistic: 200, aircraft: 250 },
    },
    transitionTime: { detectToTrack: 5, trackToFC: 8 },
    trackCapacity: { aircraft: 100, ballistic: 10 },
    simultaneousEngagement: { aircraft: 20, ballistic: 10 },
    role: 'fire_control',
    detectableThreats: ['SRBM', 'AIRCRAFT', 'CRUISE_MISSILE', 'UAS', 'MLRS_GUIDED'],
    minAltitude: 50,
    jammingSusceptibility: 0.5,
    rcsRef: 1.0,
    antennaHeight: 8,   // m (차량 탑재)
    azimuthHalf: 180,
    elevationMax: 90,
  },
});

// ════════════════════════════════════════════════════════════
// 사수 타입
// ════════════════════════════════════════════════════════════
export const SHOOTER_TYPES = Object.freeze({
  LSAM: {
    name: 'L-SAM',
    missiles: {
      ABM: {
        engagementEnvelope: { Rmin: 20, Rmax: 150, Hmin: 50, Hmax: 60 },
        missileSpeed: 3100,      // m/s (Mach 9)
        pssekTable: {
          SRBM: {
            front: { '20-60': 0.90, '60-100': 0.85, '100-150': 0.70 },
            side:  { '20-60': 0.75, '60-100': 0.65, '100-150': 0.50 },
            rear:  { '20-60': 0.60, '60-100': 0.50, '100-150': 0.35 },
          },
        },
        interceptMethod: 'hit-to-kill',
        killRadius: 50,          // meters
        guidance: 'PNG',
        doctrine: 'SLS',
        bdaDelay: 8,             // seconds
        launchInterval: 5,       // seconds
      },
      AAM: {
        engagementEnvelope: { Rmin: 10, Rmax: 150, Hmin: 0.05, Hmax: 25 },
        missileSpeed: 1700,      // m/s (Mach ~5)
        pssekTable: {
          AIRCRAFT:       { front: { '10-50': 0.92, '50-100': 0.88, '100-150': 0.75 } },
          CRUISE_MISSILE: { front: { '10-50': 0.85, '50-100': 0.78, '100-150': 0.60 } },
          UAS:            { front: { '10-50': 0.70, '50-100': 0.55, '100-150': 0.35 } },
        },
        interceptMethod: 'guided',
        killRadius: 500,
        guidance: 'PNG',
        doctrine: 'SLS',
        bdaDelay: 10,
        launchInterval: 5,
      },
    },
    priority: 'ABM_FIRST',
    battery: {
      mfr: 'LSAM_MFR',
      launchers: { ABM: 2, AAM: 2 },
      roundsPerLauncher: 6,
      totalRounds: { ABM: 12, AAM: 12 },
    },
    relations: {
      ecs: 'ECS',
      icc: 'ICC',
      commandC2: ['KAMD_OPS'],
      c2Axis: ['KAMD'],
      engageableThreats: ['SRBM', 'AIRCRAFT', 'CRUISE_MISSILE', 'UAS'],
      requiredSensors: ['GREEN_PINE_B', 'LSAM_MFR'],
    },
  },
});

// ════════════════════════════════════════════════════════════
// C2 지휘통제 노드 타입
// ════════════════════════════════════════════════════════════
export const C2_TYPES = Object.freeze({
  KAMD_OPS: {
    name: 'KAMD 작전통제소',
    processing: { system: [5, 10], operator: { high: 15, mid: 30, low: 50 } },
    simultaneousCapacity: 3,
    tier: 'command',
  },
  ICC: {
    name: '대대급 정보통합센터',
    processing: { system: [3, 5], operator: { high: 2, mid: 5, low: 10 } },
    simultaneousCapacity: 5,
    tier: 'battalion',
  },
  ECS: {
    name: '교전통제소',
    processing: { system: [1, 2], operator: { high: 1, mid: 2, low: 3 } },
    simultaneousCapacity: 8,
    tier: 'battery',
  },
});

// ════════════════════════════════════════════════════════════
// 데이터링크 지연
// ════════════════════════════════════════════════════════════
export const LINK_DELAYS = Object.freeze({
  longRange: 16,    // GREEN_PINE→KAMD, KAMD→ICC
  shortRange: 1,    // ICC→ECS, ECS→발사대
  internal: 0.5,    // MFR→ECS
  ifcn: 1,          // Kill Web 모든 링크
});

// ════════════════════════════════════════════════════════════
// 위협 타입
// ════════════════════════════════════════════════════════════
export const THREAT_TYPES = Object.freeze({
  SRBM: {
    name: '단거리 탄도미사일',
    baseSpeed: 2040,         // m/s (Mach 6)
    maxAltitude: 150000,     // m (150km)
    flightProfile: {
      phases: [
        { range: [0, 0.25], altFactor: [0, 1], speedFactor: [0.5, 1.0], rcs: 3.0, maneuvering: false },
        { range: [0.25, 0.70], altFactor: [1, 1], speedFactor: [1.0, 1.0], rcs: 0.1, maneuvering: false },
        { range: [0.70, 1.0], altFactor: [1, 0], speedFactor: [1.0, 1.5], rcs: 0.05, maneuvering: true },
      ],
    },
    maneuverG: 3,
    countermeasures: null,
    ecmFactor: 0,
    costRatio: 1.0,
  },
});

// ════════════════════════════════════════════════════════════
// 선형 C2 토폴로지 (Phase 1)
// ════════════════════════════════════════════════════════════
export const LINEAR_TOPOLOGY = Object.freeze({
  nodes: ['GREEN_PINE_B', 'KAMD_OPS', 'ICC', 'ECS', 'LSAM'],
  edges: [
    { from: 'GREEN_PINE_B', to: 'KAMD_OPS', delay: 'longRange' },
    { from: 'KAMD_OPS', to: 'ICC', delay: 'longRange' },
    { from: 'ICC', to: 'ECS', delay: 'shortRange' },
    { from: 'ECS', to: 'LSAM', delay: 'shortRange' },
  ],
});
