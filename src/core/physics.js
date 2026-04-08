/**
 * core/physics.js — EADSIM-Lite 물리 엔진
 *
 * 규칙:
 * - 거리: km (내부), m (Cesium 전달 시 ×1000)
 * - 시간: 초(s)
 * - 좌표: WGS84 { lon, lat, alt } (도, 도, m)
 * - 속도: m/s
 * - 각도: 도(°) 저장, 계산 시 라디안
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371;
const GRAVITY = 9.80665; // m/s²

/**
 * WGS84 좌표 두 점 사이의 직선거리(slant range) 계산
 * @param {{ lon: number, lat: number, alt: number }} pos1 - 위치 1 (도, 도, m)
 * @param {{ lon: number, lat: number, alt: number }} pos2 - 위치 2 (도, 도, m)
 * @returns {number} 직선거리 (km)
 */
export function slantRange(pos1, pos2) {
  const lat1 = pos1.lat * DEG2RAD;
  const lat2 = pos2.lat * DEG2RAD;
  const dLat = (pos2.lat - pos1.lat) * DEG2RAD;
  const dLon = (pos2.lon - pos1.lon) * DEG2RAD;

  // Haversine for ground distance
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const groundDistKm = EARTH_RADIUS_KM * c;

  // Altitude difference in km
  const dAltKm = (pos2.alt - pos1.alt) / 1000;

  return Math.sqrt(groundDistKm ** 2 + dAltKm ** 2);
}

/**
 * SRBM 3단계 탄도 궤적 계산
 *
 * Phase 1 (부스트): 0~25%, 고도 0→maxAlt, 속도 ×0.5→×1.0
 * Phase 2 (중간):  25~70%, 고도 maxAlt 유지, 속도 ×1.0
 * Phase 3 (종말):  70~100%, 고도 maxAlt→0, 속도 ×1.0→×1.5
 *
 * @param {{ lon: number, lat: number, alt: number }} start - 발사 위치
 * @param {{ lon: number, lat: number, alt: number }} target - 표적 위치
 * @param {number} maxAltitude - 최대 고도 (m)
 * @param {number} baseSpeed - 기본 속도 (m/s)
 * @param {number} progress - 비행 진행률 (0~1)
 * @returns {{ position: { lon: number, lat: number, alt: number }, speed: number, phase: number, rcsMultiplier: number }}
 */
export function ballisticTrajectory(start, target, maxAltitude, baseSpeed, progress) {
  const t = Math.max(0, Math.min(1, progress));

  // Ground position: linear interpolation
  const lon = start.lon + (target.lon - start.lon) * t;
  const lat = start.lat + (target.lat - start.lat) * t;

  // 포물선 고도: sin(π*t) → t=0: 0, t=0.5: maxAlt, t=1: 0
  const alt = maxAltitude * Math.sin(Math.PI * t);

  // Phase 구분은 속도/RCS 용도로 유지
  let speed, phase, rcsMultiplier;

  if (t <= 0.25) {
    // Phase 0: Boost — 속도 증가, RCS 대 (부스터 플룸)
    phase = 0;
    const phaseT = t / 0.25;
    speed = baseSpeed * (0.5 + 0.5 * phaseT);
    rcsMultiplier = 3.0;
  } else if (t <= 0.70) {
    // Phase 1: Midcourse — 일정 속도, RCS 중
    phase = 1;
    speed = baseSpeed;
    rcsMultiplier = 0.1 / 0.1; // RCS 0.1m² (기준값 대비 1.0)
  } else {
    // Phase 2: Terminal — 속도 증가, RCS 소 (재돌입체)
    phase = 2;
    const phaseT = (t - 0.70) / 0.30;
    speed = baseSpeed * (1.0 + 0.5 * phaseT);
    rcsMultiplier = 0.05 / 0.1;
  }

  return {
    position: { lon, lat, alt },
    speed,
    phase,
    rcsMultiplier,
  };
}

/**
 * 비례항법유도 (Proportional Navigation Guidance)
 * patriot-sim.html의 pngGuide 모듈화 (Cesium 무의존)
 *
 * @param {{ x: number, y: number, z: number }} vel - 현재 속도벡터 (m/s, ENU)
 * @param {{ x: number, y: number, z: number }} targetPos - 표적 위치 (m, ENU)
 * @param {{ x: number, y: number, z: number }} myPos - 미사일 위치 (m, ENU)
 * @param {number} speed - 미사일 속력 (m/s)
 * @param {number} dt - 시간 간격 (s)
 * @param {number} [N=4] - 항법상수
 * @returns {{ x: number, y: number, z: number }} 새 속도벡터 (m/s)
 */
export function pngGuidance(vel, targetPos, myPos, speed, dt, N = 4) {
  // LOS (Line Of Sight) 벡터
  const los = {
    x: targetPos.x - myPos.x,
    y: targetPos.y - myPos.y,
    z: targetPos.z - myPos.z,
  };
  const losDist = Math.sqrt(los.x ** 2 + los.y ** 2 + los.z ** 2);
  if (losDist < 1) return { ...vel };

  // 정규화
  const losN = { x: los.x / losDist, y: los.y / losDist, z: los.z / losDist };
  const velMag = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
  if (velMag < 0.001) return { ...vel };
  const velN = { x: vel.x / velMag, y: vel.y / velMag, z: vel.z / velMag };

  // 각도 오차
  const dot = Math.max(-1, Math.min(1, velN.x * losN.x + velN.y * losN.y + velN.z * losN.z));
  const angleErr = Math.acos(dot);
  if (angleErr < 0.001) return { ...vel };

  // 회전축 (vel × los)
  const axis = {
    x: velN.y * losN.z - velN.z * losN.y,
    y: velN.z * losN.x - velN.x * losN.z,
    z: velN.x * losN.y - velN.y * losN.x,
  };
  const axisMag = Math.sqrt(axis.x ** 2 + axis.y ** 2 + axis.z ** 2);
  if (axisMag < 0.0001) return { ...vel };
  axis.x /= axisMag;
  axis.y /= axisMag;
  axis.z /= axisMag;

  // 최대 선회율 제한
  const maxTurnRate = N * 30 * DEG2RAD * dt;
  const turnAngle = Math.min(angleErr * N * dt, maxTurnRate);

  // 로드리게스 회전
  const cosA = Math.cos(turnAngle);
  const sinA = Math.sin(turnAngle);
  const axisDotVel = axis.x * velN.x + axis.y * velN.y + axis.z * velN.z;

  const newVN = {
    x: velN.x * cosA + (axis.y * velN.z - axis.z * velN.y) * sinA + axis.x * axisDotVel * (1 - cosA),
    y: velN.y * cosA + (axis.z * velN.x - axis.x * velN.z) * sinA + axis.y * axisDotVel * (1 - cosA),
    z: velN.z * cosA + (axis.x * velN.y - axis.y * velN.x) * sinA + axis.z * axisDotVel * (1 - cosA),
  };

  return { x: newVN.x * speed, y: newVN.y * speed, z: newVN.z * speed };
}

/**
 * 3D 구면 부채꼴 탐지 판정 (Cesium 무의존)
 *
 * @param {{ lon: number, lat: number, alt: number }} sensorPos - 센서 위치
 * @param {{ lon: number, lat: number, alt: number }} targetPos - 표적 위치
 * @param {number} maxRange - 최대 탐지거리 (km)
 * @param {number} azimuthCenter - 방위각 중심 (도, 북=0, 시계방향)
 * @param {number} azimuthHalf - 방위각 반각 (도)
 * @param {number} elevationMax - 최대 고각 (도)
 * @param {number} [minAltitude=0] - 최소 탐지고도 (m)
 * @returns {boolean} 탐지 범위 내 여부
 */
export function isInSector(sensorPos, targetPos, maxRange, azimuthCenter, azimuthHalf, elevationMax, minAltitude = 0) {
  // 고도 체크
  if (targetPos.alt < minAltitude) return false;

  // 거리 체크
  const range = slantRange(sensorPos, targetPos);
  if (range > maxRange) return false;

  // ENU 변환 (센서 기준 지역 좌표)
  const dLon = (targetPos.lon - sensorPos.lon) * DEG2RAD;
  const dLat = (targetPos.lat - sensorPos.lat) * DEG2RAD;
  const cosLat = Math.cos(sensorPos.lat * DEG2RAD);

  // ENU: x=동(m), y=북(m), z=위(m)
  const east = dLon * cosLat * EARTH_RADIUS_KM * 1000;
  const north = dLat * EARTH_RADIUS_KM * 1000;
  const up = targetPos.alt - sensorPos.alt;

  // 방위각 (북=0, 시계방향)
  const azDeg = Math.atan2(east, north) * RAD2DEG;
  // 고각
  const groundDist = Math.sqrt(east ** 2 + north ** 2);
  const elDeg = Math.atan2(up, groundDist) * RAD2DEG;

  // 방위각 차이 (-180 ~ +180)
  const azDiff = ((azDeg - azimuthCenter + 540) % 360) - 180;
  if (Math.abs(azDiff) > azimuthHalf) return false;

  // 고각 체크
  if (elDeg < 0 || elDeg > elevationMax) return false;

  return true;
}

/**
 * 위협 궤적 예측 → 예상 교전점(PIP) 산출
 *
 * 위협의 현재 위치와 속도벡터로 미래 위치를 선형 예측하고,
 * 교전 봉투(Rmin~Rmax, Hmin~Hmax)에 진입하는 지점을 PIP로 산출.
 *
 * @param {{ lon: number, lat: number, alt: number }} threatPos - 위협 현재 위치
 * @param {{ dLon: number, dLat: number, dAlt: number }} threatVel - 위협 속도 (도/s, 도/s, m/s)
 * @param {{ lon: number, lat: number, alt: number }} shooterPos - 사수 위치
 * @param {{ Rmin: number, Rmax: number, Hmin: number, Hmax: number }} envelope - 교전 봉투 (km, km)
 * @param {number} [dtStep=1] - 예측 시간 간격 (s)
 * @param {number} [maxTime=600] - 최대 예측 시간 (s)
 * @returns {{ position: { lon: number, lat: number, alt: number }, timeToReach: number } | null}
 */
export function predictInterceptPoint(threatPos, threatVel, shooterPos, envelope, dtStep = 1, maxTime = 600) {
  let bestPip = null;
  let bestTime = Infinity;

  for (let t = 0; t <= maxTime; t += dtStep) {
    const futurePos = {
      lon: threatPos.lon + threatVel.dLon * t,
      lat: threatPos.lat + threatVel.dLat * t,
      alt: threatPos.alt + threatVel.dAlt * t,
    };

    const range = slantRange(shooterPos, futurePos);
    const altKm = futurePos.alt / 1000;

    // 봉투 진입 판정
    if (range >= envelope.Rmin && range <= envelope.Rmax &&
        altKm >= envelope.Hmin && altKm <= envelope.Hmax) {
      if (t < bestTime) {
        bestTime = t;
        bestPip = { position: futurePos, timeToReach: t };
      }
      break; // 최초 봉투 진입 시점이 PIP
    }
  }

  return bestPip;
}

/**
 * 미사일 속도 기반 발사 시점(t_launch) 역산
 *
 * t_launch = t_threat_at_pip - t_flyout - safetyMargin
 * t_flyout = slantRange(shooter, pip) × 1000 / missileSpeed
 *
 * @param {{ lon: number, lat: number, alt: number }} shooterPos - 사수 위치
 * @param {{ lon: number, lat: number, alt: number }} pipPosition - PIP 위치
 * @param {number} timeToReachPip - 위협이 PIP에 도달하는 시간 (s, 현재 시점부터)
 * @param {number} missileSpeed - 미사일 속도 (m/s)
 * @param {number} [safetyMargin=3] - 안전 여유 (s)
 * @returns {{ launchTime: number, flyoutTime: number, overdue: boolean } | null}
 *   launchTime: 현재 시점부터 발사까지 (s, 0이면 즉시 발사)
 *   overdue: true이면 최적 발사 시점 경과 (즉시 발사 필요)
 *   null: 미사일이 PIP까지 도달 불가 (flyoutTime > timeToReachPip 이고 PIP가 봉투를 벗어남)
 */
export function calculateLaunchTime(shooterPos, pipPosition, timeToReachPip, missileSpeed, safetyMargin = 3) {
  const rangeToPipKm = slantRange(shooterPos, pipPosition);
  const rangeToPipM = rangeToPipKm * 1000;
  const flyoutTime = rangeToPipM / missileSpeed;
  const launchTime = timeToReachPip - flyoutTime - safetyMargin;

  if (launchTime < 0) {
    // 최적 발사 시점 경과 — 즉시 발사 필요
    return { launchTime: 0, flyoutTime, overdue: true };
  }

  return { launchTime, flyoutTime, overdue: false };
}

/**
 * 두 선분(A: prevA→curA, B: prevB→curB) 사이의 최소 거리 계산
 * (연속 충돌 감지 — 고속 물체 2개가 서로 지나치는 문제 해결)
 *
 * 미사일과 위협 모두 이동하므로 양쪽을 선분으로 취급.
 * Phase 2+ 에서 기동 위협(순항미사일 ±5G 등)에도 정확.
 *
 * @param {{ lon: number, lat: number, alt: number }} prevA - 물체 A 이전 위치
 * @param {{ lon: number, lat: number, alt: number }} curA - 물체 A 현재 위치
 * @param {{ lon: number, lat: number, alt: number }} prevB - 물체 B 이전 위치
 * @param {{ lon: number, lat: number, alt: number }} curB - 물체 B 현재 위치
 * @returns {number} 최소 거리 (km)
 */
export function closestApproachDistance(prevA, curA, prevB, curB) {
  // WGS84 → 로컬 미터 근사 (prevA 기준)
  const cosLat = Math.cos(prevA.lat * DEG2RAD);
  const R = EARTH_RADIUS_KM * 1000;
  const mPerDegLon = DEG2RAD * cosLat * R;
  const mPerDegLat = DEG2RAD * R;

  function toENU(pos) {
    return {
      x: (pos.lon - prevA.lon) * mPerDegLon,
      y: (pos.lat - prevA.lat) * mPerDegLat,
      z: pos.alt - prevA.alt,
    };
  }

  const a0 = { x: 0, y: 0, z: 0 }; // prevA in ENU
  const a1 = toENU(curA);
  const b0 = toENU(prevB);
  const b1 = toENU(curB);

  // 방향 벡터
  const dA = { x: a1.x - a0.x, y: a1.y - a0.y, z: a1.z - a0.z };
  const dB = { x: b1.x - b0.x, y: b1.y - b0.y, z: b1.z - b0.z };
  const w0 = { x: a0.x - b0.x, y: a0.y - b0.y, z: a0.z - b0.z };

  const dot = (u, v) => u.x * v.x + u.y * v.y + u.z * v.z;

  const a = dot(dA, dA);
  const b = dot(dA, dB);
  const c = dot(dB, dB);
  const d = dot(dA, w0);
  const e = dot(dB, w0);

  const denom = a * c - b * b;
  let s, t;

  if (denom < 1e-10) {
    // 평행 선분
    s = 0;
    t = c > 1e-10 ? e / c : 0;
  } else {
    s = (b * e - c * d) / denom;
    t = (a * e - b * d) / denom;
  }

  // [0,1] 클램핑 + 재최적화
  s = Math.max(0, Math.min(1, s));
  // s 클램핑 후 최적 t 재계산
  if (c > 1e-10) {
    t = (b * s + e) / c;
    t = Math.max(0, Math.min(1, t));
  } else {
    t = 0;
  }
  // t 클램핑 후 최적 s 재계산
  if (a > 1e-10) {
    s = (b * t - d) / a;
    s = Math.max(0, Math.min(1, s));
  }

  // 최근접점 차이 벡터
  const closest = {
    x: (a0.x + dA.x * s) - (b0.x + dB.x * t),
    y: (a0.y + dA.y * s) - (b0.y + dB.y * t),
    z: (a0.z + dA.z * s) - (b0.z + dB.z * t),
  };

  return Math.sqrt(closest.x ** 2 + closest.y ** 2 + closest.z ** 2) / 1000; // km
}

/**
 * 하위 호환: 단일 점(정지 표적) 대상 segment-to-point 래퍼
 * @param {{ lon: number, lat: number, alt: number }} prevPos
 * @param {{ lon: number, lat: number, alt: number }} curPos
 * @param {{ lon: number, lat: number, alt: number }} targetPos
 * @returns {number} 최소 거리 (km)
 */
export function closestApproachOnSegment(prevPos, curPos, targetPos) {
  return closestApproachDistance(prevPos, curPos, targetPos, targetPos);
}

// 내부 상수 내보내기 (테스트용)
export { DEG2RAD, RAD2DEG, EARTH_RADIUS_KM, GRAVITY };
