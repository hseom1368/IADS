/**
 * core/engagement-model.js — EADSIM-Lite PSSEK 5단계 교전 모델
 *
 * STEP 1: 교전 봉투 판정
 * STEP 2: 센서 교전급 추적 확인
 * STEP 3: 발사 시점 판정 (t_flyout 역산)
 * STEP 4: PSSEK 조회 + 보정
 * STEP 5: 교전 교리 적용 (S-L-S / S-S)
 *
 * 발사 후: PNG 비행 → kill_radius 도달 → Pk 판정
 */
import { slantRange, predictInterceptPoint, calculateLaunchTime } from './physics.js';
import { SENSOR_STATE } from './entities.js';
import { getAspectAngle } from './sensor-model.js';

/**
 * 교전 판정 결과 상수
 */
export const ENGAGEMENT_RESULT = Object.freeze({
  FIRE: 'FIRE',       // 발사 승인
  WAIT: 'WAIT',       // 대기 (조건 미충족)
  SKIP: 'SKIP',       // 교전 불가
});

/**
 * 위협→사수 방향의 접근각에서 미사일 타입 선택
 * L-SAM: SRBM → ABM, 기타 → AAM
 * @param {string} shooterTypeId
 * @param {string} threatTypeId
 * @param {import('./registry.js').Registry} registry
 * @returns {string|null} missileType
 */
export function selectMissileType(shooterTypeId, threatTypeId, registry) {
  const shooter = registry.shooters[shooterTypeId];
  if (!shooter) return null;

  // ABM_FIRST: 탄도탄이면 ABM 우선
  if (shooter.priority === 'ABM_FIRST' && (threatTypeId === 'SRBM' || threatTypeId === 'MLRS_GUIDED')) {
    if (shooter.missiles.ABM && shooter.missiles.ABM.pssekTable[threatTypeId]) {
      return 'ABM';
    }
  }

  // AAM 또는 기타 미사일에서 해당 위협 대응 가능한 것
  for (const [missileType, missile] of Object.entries(shooter.missiles)) {
    if (missile.pssekTable[threatTypeId]) return missileType;
  }

  return null;
}

/**
 * PSSEK 5단계 교전 판정
 *
 * @param {import('./entities.js').ThreatEntity} threat
 * @param {import('./entities.js').BatteryEntity} battery
 * @param {import('./entities.js').SensorEntity} mfrSensor - 포대 소속 MFR 센서
 * @param {import('./registry.js').Registry} registry
 * @param {number} simTime - 현재 시뮬레이션 시각 (s)
 * @param {object} [options]
 * @param {number} [options.jammingLevel=0] - 재밍 레벨
 * @param {'linear'|'killweb'} [options.architecture='linear']
 * @returns {{ result: string, missileType: string|null, pk: number|null, pip: object|null, launchInfo: object|null, reason: string }}
 */
export function evaluateEngagement(threat, battery, mfrSensor, registry, simTime, options = {}) {
  const { jammingLevel = 0, architecture = 'linear' } = options;

  // 미사일 타입 선택
  const missileType = selectMissileType(battery.shooterTypeId, threat.typeId, registry);
  if (!missileType) {
    return { result: ENGAGEMENT_RESULT.SKIP, missileType: null, pk: null, pip: null, launchInfo: null, reason: 'no_missile_for_threat' };
  }

  const missileParams = registry.getMissileParams(battery.shooterTypeId, missileType);

  // ── STEP 1: 교전 봉투 판정 ──────────────────────────────
  // 위협 속도 벡터 추정 (위치→목표 방향)
  const totalDist = slantRange(threat.startPos, threat.targetPos);
  const totalDistM = totalDist * 1000;
  const threatInfo = registry.getThreatInfo(threat.typeId);
  const flightTimeEstimate = totalDistM / (threatInfo ? threatInfo.baseSpeed : 2040);

  const threatVel = {
    dLon: (threat.targetPos.lon - threat.startPos.lon) / flightTimeEstimate,
    dLat: (threat.targetPos.lat - threat.startPos.lat) / flightTimeEstimate,
    dAlt: (threat.targetPos.alt - threat.startPos.alt) / flightTimeEstimate,
  };

  const envelope = registry.getEnvelope(battery.shooterTypeId, missileType);
  const pip = predictInterceptPoint(threat.position, threatVel, battery.position, envelope, 1, 600);

  if (!pip) {
    return { result: ENGAGEMENT_RESULT.SKIP, missileType, pk: null, pip: null, launchInfo: null, reason: 'outside_envelope' };
  }

  const rangeToPipKm = slantRange(battery.position, pip.position);
  const altPipKm = pip.position.alt / 1000;

  if (!registry.isInEnvelope(battery.shooterTypeId, missileType, { rangeKm: rangeToPipKm, altKm: altPipKm })) {
    return { result: ENGAGEMENT_RESULT.SKIP, missileType, pk: null, pip, launchInfo: null, reason: 'pip_outside_envelope' };
  }

  // ── STEP 2: 센서 교전급 추적 확인 ──────────────────────
  const trackState = mfrSensor.getTrackState(threat.id);
  if (trackState.state !== SENSOR_STATE.FIRE_CONTROL) {
    return { result: ENGAGEMENT_RESULT.WAIT, missileType, pk: null, pip, launchInfo: null, reason: 'no_fire_control' };
  }

  // ── STEP 3: 발사 시점 판정 ──────────────────────────────
  const launchInfo = calculateLaunchTime(battery.position, pip.position, pip.timeToReach, missileParams.missileSpeed, 3);
  if (!launchInfo) {
    return { result: ENGAGEMENT_RESULT.SKIP, missileType, pk: null, pip, launchInfo: null, reason: 'launch_time_passed' };
  }

  if (launchInfo.launchTime > 0) {
    return { result: ENGAGEMENT_RESULT.WAIT, missileType, pk: null, pip, launchInfo, reason: 'too_early' };
  }

  // ── STEP 4: PSSEK 조회 + 보정 ──────────────────────────
  const aspect = getAspectAngle(battery.position, threat.position, threat.targetPos);
  let pk = registry.lookupPSSEK(battery.shooterTypeId, missileType, threat.typeId, rangeToPipKm, aspect);

  if (pk === null) {
    return { result: ENGAGEMENT_RESULT.SKIP, missileType, pk: null, pip, launchInfo, reason: 'no_pssek_data' };
  }

  // 재밍 보정
  pk *= (1 - jammingLevel * 0.5);
  // ECM 보정
  const ecmPenalty = threat.ecmActive ? registry.getEcmFactor(threat.typeId) : 0;
  pk *= (1 - ecmPenalty);
  // Kill Web 컴포지트 트래킹 보너스
  if (architecture === 'killweb') {
    pk = Math.min(0.99, pk * 1.10);
  }

  pk = Math.max(0, Math.min(0.99, pk));

  // ── STEP 5: 교전 교리 적용 ─────────────────────────────
  if (pk < 0.10) {
    return { result: ENGAGEMENT_RESULT.SKIP, missileType, pk, pip, launchInfo, reason: 'pk_too_low' };
  }

  // 동시교전 상한 체크
  if (!battery.canFire(missileType)) {
    return { result: ENGAGEMENT_RESULT.WAIT, missileType, pk, pip, launchInfo, reason: 'capacity_or_ammo' };
  }

  return {
    result: ENGAGEMENT_RESULT.FIRE,
    missileType,
    pk,
    pip,
    launchInfo,
    doctrine: missileParams.doctrine,
    bdaDelay: missileParams.bdaDelay,
    killRadius: missileParams.killRadius,
    missileSpeed: missileParams.missileSpeed,
    guidance: missileParams.guidance,
    reason: 'approved',
  };
}

/**
 * 요격미사일 도달 판정 (매 프레임 호출)
 *
 * kill_radius 도달 시 PSSEK 확률로 HIT/MISS 판정
 *
 * @param {import('./entities.js').InterceptorEntity} interceptor
 * @param {import('./entities.js').ThreatEntity} threat
 * @param {function} [randomFn=Math.random]
 * @returns {{ hit: boolean, distance: number }|null} null이면 아직 도달 안 함
 */
export function checkInterceptResult(interceptor, threat, randomFn = Math.random) {
  const distanceKm = slantRange(interceptor.position, threat.position);
  const distanceM = distanceKm * 1000;

  if (distanceM > interceptor.killRadius) return null;

  // PSSEK 확률 판정
  const hit = randomFn() < interceptor.pssekPk;
  return { hit, distance: distanceM };
}

/**
 * 교전 교리에 따른 발사 수 결정
 * @param {string} doctrine - 'SLS' | 'SS'
 * @returns {number} 발사 수 (1 또는 2)
 */
export function getShotsPerDoctrine(doctrine) {
  return doctrine === 'SS' ? 2 : 1;
}

/**
 * S-S 교리 복합 Pk 계산: P = 1 - (1 - Pk)²
 * @param {number} pk - 단발 Pk
 * @returns {number} 복합 Pk
 */
export function calculateSSPk(pk) {
  return 1 - Math.pow(1 - pk, 2);
}
