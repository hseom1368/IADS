/**
 * core/sensor-model.js — EADSIM-Lite SNR 기반 3단계 센서 모델
 *
 * 0. 기하 사전 필터: 레이더 수평선 + 방위각/고각 섹터 + minAltitude
 * 1. SNR 기반 탐지확률: SNR = (R_ref/d)⁴ × (RCS/RCS_ref)
 * 2. 밴드별 재밍 + ECM 보정
 * 3. 3단계 상태머신: UNDETECTED → DETECTED → TRACKED → FIRE_CONTROL
 *    - 전이 시간 적용
 *    - 3회 연속 미탐지 → 추적 상실
 */
import { slantRange, radarHorizon, isInSector } from './physics.js';
import { SENSOR_STATE } from './entities.js';

const BASE_DETECTION_RATE = 0.95;
const MAX_CONSECUTIVE_MISSES = 3;

/**
 * SNR 기반 탐지확률 계산
 * @param {number} rRef - 센서 공칭 탐지거리 (km)
 * @param {number} distanceKm - 센서~표적 직선거리 (km)
 * @param {number} rcs - 표적 현재 RCS (m²)
 * @param {number} rcsRef - 센서 기준 RCS (m²)
 * @returns {number} 탐지확률 (0~0.99)
 */
export function calculateDetectionProbability(rRef, distanceKm, rcs, rcsRef) {
  if (distanceKm <= 0 || rcsRef <= 0) return 0.99;

  const snr = Math.pow(rRef / distanceKm, 4) * (rcs / rcsRef);
  const pDetect = Math.min(0.99, Math.max(0, Math.pow(snr, 0.5) * BASE_DETECTION_RATE));
  return pDetect;
}

/**
 * 재밍 + ECM 보정 적용
 * @param {number} pDetect - 기본 탐지확률
 * @param {number} jammingLevel - 재밍 레벨 (0~1)
 * @param {number} jammingSusceptibility - 밴드별 재밍 감수성 (0~1)
 * @param {number} ecmFactor - ECM 보정계수 (0~1, 채프 0.15, 채프+플레어 0.20)
 * @returns {number} 최종 탐지확률
 */
export function applyJammingCorrection(pDetect, jammingLevel, jammingSusceptibility, ecmFactor) {
  const effectiveJamming = jammingLevel * jammingSusceptibility;
  return pDetect * (1 - effectiveJamming) * (1 - ecmFactor);
}

/**
 * 센서 상태머신 갱신 (매 스캔 주기 호출)
 *
 * @param {import('./entities.js').SensorEntity} sensor - 센서 엔티티
 * @param {import('./entities.js').ThreatEntity} threat - 위협 엔티티
 * @param {import('./registry.js').Registry} registry - 레지스트리
 * @param {number} jammingLevel - 재밍 레벨 (0~1)
 * @param {number} dt - 경과 시간 (s)
 * @param {function} [randomFn=Math.random] - 난수 함수 (테스트용 주입)
 * @returns {{ state: string, pFinal: number, transitioned: boolean, event: string|null }}
 */
export function updateSensorState(sensor, threat, registry, jammingLevel, dt, randomFn = Math.random) {
  const UNDETECTED_RESULT = { state: SENSOR_STATE.UNDETECTED, pFinal: 0, transitioned: false, event: null };

  // 센서가 해당 위협 탐지 불가하면 스킵
  if (!registry.canDetect(sensor.typeId, threat.typeId)) return UNDETECTED_RESULT;

  // 위협 카테고리 결정
  const threatCategory = threat.typeId === 'SRBM' || threat.typeId === 'MLRS_GUIDED'
    ? 'ballistic' : 'aircraft';

  // 센서 파라미터 조회
  const sensorSpec = registry.sensors[sensor.typeId];
  const ranges = registry.getSensorRanges(sensor.typeId, threatCategory);
  if (!ranges) return UNDETECTED_RESULT;

  // ── STEP 0: 기하 사전 필터 ──────────────────────────────

  // (a) minAltitude 체크
  const minAlt = sensorSpec?.minAltitude ?? 0;
  if (threat.position.alt < minAlt) return UNDETECTED_RESULT;

  // (b) 레이더 수평선 체크
  const antennaAltM = sensor.position.alt + (sensorSpec?.antennaHeight ?? 0);
  const horizonKm = radarHorizon(antennaAltM, threat.position.alt);
  const distanceKm = slantRange(sensor.position, threat.position);
  if (distanceKm > horizonKm) return UNDETECTED_RESULT;

  // (c) 방위각/고각 섹터 체크
  const azHalf = sensorSpec?.azimuthHalf ?? 180;
  const elMax = sensorSpec?.elevationMax ?? 90;
  if (!isInSector(sensor.position, threat.position, ranges.detect, 0, azHalf, elMax, minAlt)) {
    return UNDETECTED_RESULT;
  }

  // ── STEP 1: SNR 기반 탐지확률 ───────────────────────────

  const rcsRef = registry.getRcsRef(sensor.typeId);
  const susceptibility = registry.getJammingSusceptibility(sensor.typeId);
  const transitions = registry.getSensorTransitionTimes(sensor.typeId);
  const hasFC = registry.hasFireControlCapability(sensor.typeId);

  const pDetect = calculateDetectionProbability(ranges.detect, distanceKm, threat.currentRCS, rcsRef);

  // 2. 재밍 + ECM 보정
  const ecmFactor = threat.ecmActive ? registry.getEcmFactor(threat.typeId) : 0;
  const pFinal = applyJammingCorrection(pDetect, jammingLevel, susceptibility, ecmFactor);

  // 3. 상태 전이
  const ts = sensor.getTrackState(threat.id);
  const prevState = ts.state;
  let transitioned = false;
  let event = null;

  // 탐지 시도 (모든 상태에서 매 스캔마다)
  const detected = randomFn() < pFinal;

  switch (ts.state) {
    case SENSOR_STATE.UNDETECTED: {
      if (detected) {
        ts.state = SENSOR_STATE.DETECTED;
        ts.transitionTimer = 0;
        ts.consecutiveMisses = 0;
        transitioned = true;
        event = 'SENSOR_DETECTED';
      }
      break;
    }

    case SENSOR_STATE.DETECTED: {
      if (!detected) {
        ts.consecutiveMisses++;
        if (ts.consecutiveMisses >= MAX_CONSECUTIVE_MISSES) {
          ts.state = SENSOR_STATE.UNDETECTED;
          ts.transitionTimer = 0;
          ts.consecutiveMisses = 0;
          transitioned = true;
          event = 'SENSOR_TRACK_LOST';
        }
      } else {
        ts.consecutiveMisses = 0;
        ts.transitionTimer += dt;
        // detectToTrack 전이 시간 경과 → TRACKED
        if (ts.transitionTimer >= transitions.detectToTrack) {
          ts.state = SENSOR_STATE.TRACKED;
          ts.transitionTimer = 0;
          transitioned = true;
          event = 'SENSOR_TRACKED';
        }
      }
      break;
    }

    case SENSOR_STATE.TRACKED: {
      if (!detected) {
        ts.consecutiveMisses++;
        if (ts.consecutiveMisses >= MAX_CONSECUTIVE_MISSES) {
          ts.state = SENSOR_STATE.UNDETECTED;
          ts.transitionTimer = 0;
          ts.consecutiveMisses = 0;
          transitioned = true;
          event = 'SENSOR_TRACK_LOST';
        }
      } else {
        ts.consecutiveMisses = 0;
        // 교전급 추적 능력이 있고 trackToFC 전이 시간 있으면 진행
        if (hasFC && transitions.trackToFC !== undefined) {
          ts.transitionTimer += dt;
          if (ts.transitionTimer >= transitions.trackToFC) {
            ts.state = SENSOR_STATE.FIRE_CONTROL;
            ts.transitionTimer = 0;
            transitioned = true;
            event = 'SENSOR_FIRE_CONTROL';
          }
        }
      }
      break;
    }

    case SENSOR_STATE.FIRE_CONTROL: {
      if (!detected) {
        ts.consecutiveMisses++;
        if (ts.consecutiveMisses >= MAX_CONSECUTIVE_MISSES) {
          // 교전급 → TRACKED로 열화 (UNDETECTED가 아님)
          ts.state = SENSOR_STATE.TRACKED;
          ts.transitionTimer = 0;
          ts.consecutiveMisses = 0;
          transitioned = true;
          event = 'SENSOR_FC_DEGRADED';
        }
      } else {
        ts.consecutiveMisses = 0;
      }
      break;
    }
  }

  return { state: ts.state, pFinal, transitioned, event };
}

/**
 * 접근각 계산: 사수 위치 기준 위협의 접근 방향
 * @param {{ lon: number, lat: number, alt: number }} shooterPos
 * @param {{ lon: number, lat: number, alt: number }} threatPos
 * @param {{ lon: number, lat: number, alt: number }} threatTargetPos - 위협의 목표 위치
 * @returns {'front'|'side'|'rear'}
 */
export function getAspectAngle(shooterPos, threatPos, threatTargetPos) {
  // 위협 진행 방향 벡터 (threatPos → threatTargetPos)
  const threatDirLon = threatTargetPos.lon - threatPos.lon;
  const threatDirLat = threatTargetPos.lat - threatPos.lat;

  // 위협 → 사수 벡터 (사수가 위협 앞에 있으면 정면 교전)
  const toShooterLon = shooterPos.lon - threatPos.lon;
  const toShooterLat = shooterPos.lat - threatPos.lat;

  // 두 벡터 사이 각도 (dot product)
  const dotProduct = threatDirLon * toShooterLon + threatDirLat * toShooterLat;
  const magDir = Math.sqrt(threatDirLon ** 2 + threatDirLat ** 2);
  const magToShooter = Math.sqrt(toShooterLon ** 2 + toShooterLat ** 2);

  if (magDir < 1e-10 || magToShooter < 1e-10) return 'front';

  const cosAngle = dotProduct / (magDir * magToShooter);
  const angleDeg = Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);

  // 각도 작음: 위협이 사수 쪽으로 접근 → 정면 교전
  // 각도 ~90°: 측면 교전
  // 각도 큼: 위협이 사수에서 멀어짐 → 추격 교전
  if (angleDeg < 60) return 'front';
  if (angleDeg < 120) return 'side';
  return 'rear';
}
