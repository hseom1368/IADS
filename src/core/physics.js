/**
 * @module core/physics
 * 물리 엔진 — 탄도궤적, PNG 유도, 구면 탐지, 경사거리
 * Cesium 의존성 없음: 순수 JS 수학으로 WGS84/ECEF 변환, 벡터 연산 구현
 */

// ── 상수 ──
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const GRAVITY = 9.81; // m/s²
const WGS84_A = 6378137.0; // 장반축 (m)
const WGS84_F = 1 / 298.257223563;
const WGS84_B = WGS84_A * (1 - WGS84_F); // 단반축
const WGS84_E2 = 1 - (WGS84_B * WGS84_B) / (WGS84_A * WGS84_A); // 제1이심률²

// ── 벡터 연산 ──

/** @param {{x:number,y:number,z:number}} a @param {{x:number,y:number,z:number}} b */
function vec3Sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vec3Add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function vec3Scale(v, s) {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function vec3Dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vec3Cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function vec3Mag(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function vec3Norm(v) {
  const m = vec3Mag(v);
  if (m < 1e-12) return { x: 0, y: 0, z: 0 };
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

// ── WGS84 좌표 변환 ──

/**
 * WGS84 측지좌표 → ECEF 직교좌표
 * @param {number} lon - 경도 (degrees)
 * @param {number} lat - 위도 (degrees)
 * @param {number} alt - 해수면 고도 (meters)
 * @returns {{x:number, y:number, z:number}} ECEF (meters)
 */
function geodeticToEcef(lon, lat, alt) {
  const lonR = lon * DEG2RAD;
  const latR = lat * DEG2RAD;
  const sinLat = Math.sin(latR);
  const cosLat = Math.cos(latR);
  const sinLon = Math.sin(lonR);
  const cosLon = Math.cos(lonR);

  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  return {
    x: (N + alt) * cosLat * cosLon,
    y: (N + alt) * cosLat * sinLon,
    z: (N * (1 - WGS84_E2) + alt) * sinLat
  };
}

/**
 * ECEF 직교좌표 → WGS84 측지좌표 (Bowring 반복법)
 * @param {number} x @param {number} y @param {number} z - ECEF (meters)
 * @returns {{lon:number, lat:number, alt:number}} degrees, degrees, meters
 */
function ecefToGeodetic(x, y, z) {
  const lon = Math.atan2(y, x) * RAD2DEG;
  const p = Math.sqrt(x * x + y * y);

  // Bowring 초기값
  let lat = Math.atan2(z, p * (1 - WGS84_E2));

  for (let i = 0; i < 5; i++) {
    const sinLat = Math.sin(lat);
    const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    lat = Math.atan2(z + WGS84_E2 * N * sinLat, p);
  }

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);

  let alt;
  if (Math.abs(cosLat) > 1e-10) {
    alt = p / cosLat - N;
  } else {
    alt = Math.abs(z) - WGS84_B;
  }

  return { lon, lat: lat * RAD2DEG, alt };
}

// ═══════════════════════════════════════════════════════════
//  Exported 함수
// ═══════════════════════════════════════════════════════════

/**
 * 두 점 사이의 3D 경사거리를 계산한다.
 * @param {{lon:number, lat:number, alt:number}} pos1
 * @param {{lon:number, lat:number, alt:number}} pos2
 * @returns {number} 경사거리 (km)
 */
export function slantRange(pos1, pos2) {
  const a = geodeticToEcef(pos1.lon, pos1.lat, pos1.alt);
  const b = geodeticToEcef(pos2.lon, pos2.lat, pos2.alt);
  const d = vec3Sub(a, b);
  return vec3Mag(d) / 1000;
}

// ── 대기 저항 상수 ──
const RHO_SEA_LEVEL = 1.225; // 해수면 대기 밀도 (kg/m³)
const SCALE_HEIGHT = 8500;    // 대기 스케일 높이 (m)
const DRAG_CD = 0.3;          // 탄도미사일 항력계수
const DRAG_AREA = 0.5;        // 유효 단면적 (m²)
const DRAG_MASS = 1000;       // 탄두 질량 (kg)

/**
 * 탄도 궤적을 1스텝 적분한다 (중력 + 대기저항).
 * @param {{lon:number, lat:number, alt:number}} pos - 현재 위치
 * @param {{x:number, y:number, z:number}} vel - ECEF 속도 (m/s)
 * @param {number} dt - 시간 스텝 (초)
 * @returns {{pos:{lon:number,lat:number,alt:number}, vel:{x:number,y:number,z:number}}}
 */
export function ballisticTrajectory(pos, vel, dt) {
  const ecefPos = geodeticToEcef(pos.lon, pos.lat, pos.alt);

  // 중력 방향: 지구 중심 방향 = -normalize(ecefPos)
  const gravDir = vec3Norm({ x: -ecefPos.x, y: -ecefPos.y, z: -ecefPos.z });
  const gravAccel = vec3Scale(gravDir, GRAVITY * dt);

  // 대기 저항: rho = rho0 * exp(-alt/H), F_drag = 0.5 * rho * Cd * A * v²
  const alt = Math.max(0, pos.alt);
  const rho = RHO_SEA_LEVEL * Math.exp(-alt / SCALE_HEIGHT);
  const speed = vec3Mag(vel);
  let dragAccel = { x: 0, y: 0, z: 0 };
  if (speed > 0 && rho > 1e-10) {
    const dragForcePerMass = 0.5 * rho * DRAG_CD * DRAG_AREA * speed / DRAG_MASS;
    const velDir = vec3Norm(vel);
    dragAccel = vec3Scale(velDir, -dragForcePerMass * dt);
  }

  // 속도 적분: v(t+dt) = v(t) + g*dt + drag*dt
  const newVel = vec3Add(vec3Add(vel, gravAccel), dragAccel);

  // 위치 적분: x(t+dt) = x(t) + v(t+dt)*dt
  const newEcef = vec3Add(ecefPos, vec3Scale(newVel, dt));

  // ECEF → 측지좌표 역변환
  const newPos = ecefToGeodetic(newEcef.x, newEcef.y, newEcef.z);

  // 지면 클램프
  if (newPos.alt <= 0) {
    newPos.alt = 0;
  }

  return { pos: newPos, vel: newVel };
}

/**
 * PNG 비례항법유도 — patriot-sim.html pngGuide 모듈화 (Cesium-free)
 * @param {{lon:number,lat:number,alt:number}} iPos - 요격미사일 위치
 * @param {{x:number,y:number,z:number}} iVel - 요격미사일 ECEF 속도 (m/s)
 * @param {{lon:number,lat:number,alt:number}} tPos - 타겟 위치
 * @param {number} speed - 요격미사일 속력 (m/s)
 * @param {number} dt - 시간 스텝 (초)
 * @param {number} [N=4] - 항법상수
 * @returns {{x:number,y:number,z:number}} 새 속도 벡터 ECEF (m/s)
 */
export function pngGuidance(iPos, iVel, tPos, speed, dt, N = 4) {
  const myEcef = geodeticToEcef(iPos.lon, iPos.lat, iPos.alt);
  const tgtEcef = geodeticToEcef(tPos.lon, tPos.lat, tPos.alt);

  // 시선벡터 (LOS)
  const los = vec3Sub(tgtEcef, myEcef);
  const losDist = vec3Mag(los);
  if (losDist < 1) return iVel; // 매우 가까움

  const losNorm = vec3Norm(los);
  const velNorm = vec3Norm(iVel);

  // LOS-속도 각도 오차
  const dot = Math.max(-1, Math.min(1, vec3Dot(velNorm, losNorm)));
  const angleErr = Math.acos(dot);
  if (angleErr < 0.001) return vec3Scale(velNorm, speed); // 이미 정렬

  // 회전축
  const axis = vec3Cross(velNorm, losNorm);
  if (vec3Mag(axis) < 0.0001) return vec3Scale(velNorm, speed);
  const axisNorm = vec3Norm(axis);

  // 선회각 제한
  const maxTurnRate = (N * 30 * DEG2RAD) * dt;
  const turnAngle = Math.min(angleErr * N * dt, maxTurnRate);

  // Rodriguez 회전: v' = v·cosθ + (k×v)·sinθ + k·(k·v)·(1-cosθ)
  const cosA = Math.cos(turnAngle);
  const sinA = Math.sin(turnAngle);
  const kDotV = vec3Dot(axisNorm, velNorm);
  const kCrossV = vec3Cross(axisNorm, velNorm);

  const newVelNorm = {
    x: velNorm.x * cosA + kCrossV.x * sinA + axisNorm.x * kDotV * (1 - cosA),
    y: velNorm.y * cosA + kCrossV.y * sinA + axisNorm.y * kDotV * (1 - cosA),
    z: velNorm.z * cosA + kCrossV.z * sinA + axisNorm.z * kDotV * (1 - cosA)
  };

  return vec3Scale(newVelNorm, speed);
}

/**
 * 구면 부채꼴 탐지 판정 (ENU 좌표 변환)
 * @param {{lon:number,lat:number,alt:number}} sensorPos - 센서 위치
 * @param {{lon:number,lat:number,alt:number}} targetPos - 타겟 위치
 * @param {number} azCenter - 레이더 중심 방위각 (degrees, 0=북)
 * @param {number} azHalf - 방위각 반각 (degrees)
 * @param {number} elMax - 최대 고각 (degrees)
 * @param {number} maxRange - 최대 탐지거리 (km)
 * @returns {boolean}
 */
export function isInSector(sensorPos, targetPos, azCenter, azHalf, elMax, maxRange) {
  // 1. 거리 체크
  const range = slantRange(sensorPos, targetPos);
  if (range > maxRange) return false;

  // 2. ECEF 변환
  const sEcef = geodeticToEcef(sensorPos.lon, sensorPos.lat, sensorPos.alt);
  const tEcef = geodeticToEcef(targetPos.lon, targetPos.lat, targetPos.alt);

  // 3. 센서 위치에서 ENU 기저벡터
  const lonR = sensorPos.lon * DEG2RAD;
  const latR = sensorPos.lat * DEG2RAD;
  const sinLon = Math.sin(lonR);
  const cosLon = Math.cos(lonR);
  const sinLat = Math.sin(latR);
  const cosLat = Math.cos(latR);

  const east = { x: -sinLon, y: cosLon, z: 0 };
  const north = { x: -sinLat * cosLon, y: -sinLat * sinLon, z: cosLat };
  const up = { x: cosLat * cosLon, y: cosLat * sinLon, z: sinLat };

  // 4. 타겟-센서 ECEF 차이를 ENU로 변환
  const diff = vec3Sub(tEcef, sEcef);
  const e = vec3Dot(diff, east);
  const n = vec3Dot(diff, north);
  const u = vec3Dot(diff, up);

  // 5. 방위각 (atan2(east, north), 0=북, 시계방향 양수)
  const az = Math.atan2(e, n) * RAD2DEG;

  // 6. 고각
  const horizDist = Math.sqrt(e * e + n * n);
  const el = Math.atan2(u, horizDist) * RAD2DEG;

  // 7. 방위각 차이 정규화 (-180 ~ +180)
  const azDiff = ((az - azCenter + 540) % 360) - 180;

  // 8. 방위각/고각 판정
  if (Math.abs(azDiff) > azHalf) return false;
  if (el < 0 || el > elMax) return false;

  // 9. 레이더 수평선(radar horizon) 체크 — 지구 곡률 반영
  // d_horizon = sqrt(2·Re·h_sensor) + sqrt(2·Re·h_target)
  // 대기 굴절 보정 계수 k=4/3 적용 (유효 지구 반경 = Re × 4/3)
  const Re = WGS84_A * (4 / 3); // 유효 지구 반경 (대기 굴절 보정)
  const hSensor = Math.max(0, sensorPos.alt);
  const hTarget = Math.max(0, targetPos.alt);
  const dHorizon = (Math.sqrt(2 * Re * hSensor) + Math.sqrt(2 * Re * hTarget)) / 1000; // m→km
  if (range > dHorizon) return false;

  return true;
}

// ═══════════════════════════════════════════════════════════
//  Phase 1.1 물리 함수
// ═══════════════════════════════════════════════════════════

const PREDICT_DT = 0.5;       // 전진 전파 시간 스텝 (초)
const PREDICT_MAX_TIME = 600;  // 전진 전파 최대 시간 (초)
const ARRIVAL_THRESHOLD = 1.0; // 도착 판정 거리 (km)

/**
 * 위협 궤적을 예측하여 사수 교전 구역 내 요격 지점을 계산한다.
 * ballisticTrajectory로 전진 전파하며 교전구역 진입 지점을 찾는다.
 * @param {{position:{lon:number,lat:number,alt:number}, velocity:{x:number,y:number,z:number}}} threat - 위협 현재 상태
 * @param {{position:{lon:number,lat:number,alt:number}, capability:{maxRange:number, minRange:number, maxAlt:number, minAlt:number}}} shooter - 사수 위치+능력
 * @returns {{lon:number, lat:number, alt:number}|null} 예측 요격지점 또는 null (교전 불가)
 */
export function predictInterceptPoint(threat, shooter) {
  const cap = shooter.capability;

  // 원본 변경 방지: 복사
  let pos = { ...threat.position };
  let vel = { ...threat.velocity };

  for (let t = 0; t < PREDICT_MAX_TIME; t += PREDICT_DT) {
    const result = ballisticTrajectory(pos, vel, PREDICT_DT);
    pos = result.pos;
    vel = result.vel;

    // 지면 도달 → 교전 불가
    if (pos.alt <= 0) return null;

    const altKm = pos.alt / 1000;
    const dist = slantRange(shooter.position, pos);

    // 교전구역 판정: minRange ≤ dist ≤ maxRange AND minAlt ≤ altKm ≤ maxAlt
    if (dist >= cap.minRange && dist <= cap.maxRange &&
        altKm >= cap.minAlt && altKm <= cap.maxAlt) {
      return { lon: pos.lon, lat: pos.lat, alt: pos.alt };
    }
  }

  return null;
}

/**
 * 요격미사일 비행시간을 역산하여 선제 발사 시점 오프셋을 결정한다.
 * weapon-specs 7.1: 발사 시점 = t_threat - t_interceptor - safety_margin
 * @param {{position:{lon:number,lat:number,alt:number}, velocity:{x:number,y:number,z:number}}} threat
 * @param {{position:{lon:number,lat:number,alt:number}, capability:{interceptorSpeed:number, boostTime?:number}}} shooter
 * @param {{lon:number, lat:number, alt:number}} interceptPoint - 예측 요격지점
 * @param {number} [safetyMargin=2.0] - 안전 여유시간 (초)
 * @returns {number} 발사까지 대기 시간 (초, 0 = 즉시 발사)
 */
export function calculateLaunchTime(threat, shooter, interceptPoint, safetyMargin = 2.0) {
  const cap = shooter.capability;

  // 1. 요격미사일 비행시간 추정
  const interceptDist = slantRange(shooter.position, interceptPoint);
  const boostTime = cap.boostTime || 0;
  const tInterceptor = (interceptDist * 1000) / cap.interceptorSpeed + boostTime;

  // 2. 위협→요격지점 도달 시간 추정 (전진 전파)
  let pos = { ...threat.position };
  let vel = { ...threat.velocity };
  let tThreat = 0;

  for (let t = 0; t < PREDICT_MAX_TIME; t += PREDICT_DT) {
    const result = ballisticTrajectory(pos, vel, PREDICT_DT);
    pos = result.pos;
    vel = result.vel;
    tThreat += PREDICT_DT;

    if (pos.alt <= 0) break;

    const dist = slantRange(pos, interceptPoint);
    if (dist < ARRIVAL_THRESHOLD) break;
  }

  // 3. 발사 오프셋 = 위협 도달시간 - 요격미사일 비행시간 - safety_margin
  return Math.max(0, tThreat - tInterceptor - safetyMargin);
}

/**
 * 예측 요격지점에서의 Pk를 계산한다 (교전 의사결정용).
 * weapon-specs 섹션 6.1: predicted_Pk = base_pk × range_factor × maneuver_penalty × jamming_penalty
 * @param {{position:{lon:number,lat:number,alt:number}, capability:{pkTable:Object, maxRange:number}}} shooter
 * @param {{lon:number, lat:number, alt:number}} interceptPoint
 * @param {{typeId:string, maneuvering?:boolean}} threat
 * @param {number} [jammingLevel=0] - 재밍 수준 (0~1), jamming_penalty = 1 - jammingLevel
 * @returns {number} 0~1 사이의 예측 Pk
 */
export function predictedPk(shooter, interceptPoint, threat, jammingLevel = 0) {
  const cap = shooter.capability;
  const basePk = (cap.pkTable && cap.pkTable[threat.typeId]) || 0;
  if (basePk === 0) return 0;

  const dIntercept = slantRange(shooter.position, interceptPoint);
  const rangeFactor = Math.max(0, 1 - (dIntercept / cap.maxRange) ** 2);
  const maneuverPenalty = threat.maneuvering ? 0.85 : 1.0;
  const jammingPenalty = 1 - jammingLevel;

  return basePk * rangeFactor * maneuverPenalty * jammingPenalty;
}
