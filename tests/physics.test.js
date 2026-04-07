/**
 * tests/physics.test.js — core/physics.js 단위 테스트
 *
 * 물리 계산 오차 1% 이내 (CLAUDE.md 규칙)
 */
import { describe, it, expect } from 'vitest';
import {
  slantRange,
  ballisticTrajectory,
  pngGuidance,
  isInSector,
  predictInterceptPoint,
  calculateLaunchTime,
  DEG2RAD,
  EARTH_RADIUS_KM,
} from '../src/core/physics.js';

// ────────────────────────────────────────────────────────────
// Helper: 오차 1% 이내 확인
// ────────────────────────────────────────────────────────────
function expectClose(actual, expected, tolerancePercent = 1) {
  const tolerance = Math.abs(expected) * tolerancePercent / 100;
  expect(actual).toBeGreaterThanOrEqual(expected - tolerance - 1e-9);
  expect(actual).toBeLessThanOrEqual(expected + tolerance + 1e-9);
}

// ════════════════════════════════════════════════════════════
// 1. slantRange — 직선거리
// ════════════════════════════════════════════════════════════
describe('slantRange', () => {
  it('동일 위치 → 0 km', () => {
    const pos = { lon: 127.0, lat: 37.0, alt: 100 };
    expect(slantRange(pos, pos)).toBe(0);
  });

  it('서울→부산 약 325 km (지상)', () => {
    const seoul = { lon: 127.0, lat: 37.5, alt: 0 };
    const busan = { lon: 129.0, lat: 35.1, alt: 0 };
    const range = slantRange(seoul, busan);
    // 실제 서울-부산 직선거리 약 325 km
    expectClose(range, 325, 5);
  });

  it('고도차 반영: 수직 10km 차이', () => {
    const ground = { lon: 127.0, lat: 37.0, alt: 0 };
    const air = { lon: 127.0, lat: 37.0, alt: 10000 };
    const range = slantRange(ground, air);
    expectClose(range, 10, 1); // 10 km
  });

  it('수평+수직 복합 거리', () => {
    const a = { lon: 127.0, lat: 37.0, alt: 0 };
    const b = { lon: 127.0, lat: 37.09, alt: 10000 }; // ~10km 북 + 10km 위
    const range = slantRange(a, b);
    // sqrt(10^2 + 10^2) ≈ 14.14
    expectClose(range, 14.14, 2);
  });

  it('GREEN_PINE 탐지거리 테스트: 900km 거리', () => {
    // 충남(36.5, 127.0) → 북한 미사일(40.5, 127.0) 약 445km
    const gp = { lon: 127.0, lat: 36.5, alt: 0 };
    const threat = { lon: 127.0, lat: 40.5, alt: 150000 };
    const range = slantRange(gp, threat);
    // 지상거리 ~445km, 고도차 150km → sqrt(445^2+150^2) ≈ 470km
    expect(range).toBeLessThan(900); // GREEN_PINE 탐지거리 이내
    expect(range).toBeGreaterThan(400);
  });
});

// ════════════════════════════════════════════════════════════
// 2. ballisticTrajectory — 탄도탄 3단계 프로파일
// ════════════════════════════════════════════════════════════
describe('ballisticTrajectory', () => {
  const start = { lon: 125.5, lat: 39.0, alt: 0 };
  const target = { lon: 127.0, lat: 37.5, alt: 0 };
  const maxAlt = 150000; // 150km
  const baseSpeed = 2040; // Mach 6

  it('progress=0 → 발사 지점, Phase 0, 속도 0.5배', () => {
    const result = ballisticTrajectory(start, target, maxAlt, baseSpeed, 0);
    expect(result.position.lon).toBe(start.lon);
    expect(result.position.lat).toBe(start.lat);
    expect(result.position.alt).toBe(0);
    expect(result.phase).toBe(0);
    expectClose(result.speed, baseSpeed * 0.5, 1);
    expect(result.rcsMultiplier).toBe(3.0);
  });

  it('progress=0.25 → Phase 0 끝, 최대 고도 도달, 속도 1.0배', () => {
    const result = ballisticTrajectory(start, target, maxAlt, baseSpeed, 0.25);
    expect(result.phase).toBe(0);
    expectClose(result.position.alt, maxAlt, 1);
    expectClose(result.speed, baseSpeed, 1);
  });

  it('progress=0.5 → Phase 1, 최대 고도 유지, RCS 1.0', () => {
    const result = ballisticTrajectory(start, target, maxAlt, baseSpeed, 0.5);
    expect(result.phase).toBe(1);
    expect(result.position.alt).toBe(maxAlt);
    expect(result.speed).toBe(baseSpeed);
    expectClose(result.rcsMultiplier, 1.0, 1);
  });

  it('progress=0.85 → Phase 2, 고도 하강 중, 속도 증가', () => {
    const result = ballisticTrajectory(start, target, maxAlt, baseSpeed, 0.85);
    expect(result.phase).toBe(2);
    expect(result.position.alt).toBeLessThan(maxAlt);
    expect(result.position.alt).toBeGreaterThan(0);
    expect(result.speed).toBeGreaterThan(baseSpeed);
  });

  it('progress=1.0 → 표적 도달, Phase 2, 속도 1.5배', () => {
    const result = ballisticTrajectory(start, target, maxAlt, baseSpeed, 1.0);
    expect(result.phase).toBe(2);
    expectClose(result.position.lon, target.lon, 1);
    expectClose(result.position.lat, target.lat, 1);
    expectClose(result.position.alt, 0, 1);
    expectClose(result.speed, baseSpeed * 1.5, 1);
  });

  it('progress 범위 초과 시 클램프', () => {
    const r1 = ballisticTrajectory(start, target, maxAlt, baseSpeed, -0.5);
    expect(r1.position.lon).toBe(start.lon);
    const r2 = ballisticTrajectory(start, target, maxAlt, baseSpeed, 1.5);
    expectClose(r2.position.lon, target.lon, 1);
  });

  it('Phase별 RCS 변화: 부스트(3.0) → 중간(1.0) → 종말(0.5)', () => {
    const boost = ballisticTrajectory(start, target, maxAlt, baseSpeed, 0.1);
    const mid = ballisticTrajectory(start, target, maxAlt, baseSpeed, 0.5);
    const terminal = ballisticTrajectory(start, target, maxAlt, baseSpeed, 0.9);
    expect(boost.rcsMultiplier).toBe(3.0);
    expectClose(mid.rcsMultiplier, 1.0, 1);
    expectClose(terminal.rcsMultiplier, 0.5, 1);
  });
});

// ════════════════════════════════════════════════════════════
// 3. pngGuidance — 비례항법유도
// ════════════════════════════════════════════════════════════
describe('pngGuidance', () => {
  it('이미 표적 방향으로 정렬 → 속도 변화 없음', () => {
    const vel = { x: 0, y: 1000, z: 0 };
    const target = { x: 0, y: 5000, z: 0 };
    const myPos = { x: 0, y: 0, z: 0 };
    const result = pngGuidance(vel, target, myPos, 1000, 0.1);
    expectClose(result.x, 0, 1);
    expectClose(result.y, 1000, 1);
    expectClose(result.z, 0, 1);
  });

  it('표적이 우측 → 우측으로 선회', () => {
    const vel = { x: 0, y: 1000, z: 0 }; // 북쪽으로 비행
    const target = { x: 5000, y: 5000, z: 0 }; // 북동쪽
    const myPos = { x: 0, y: 0, z: 0 };
    const result = pngGuidance(vel, target, myPos, 1000, 0.1, 4);
    expect(result.x).toBeGreaterThan(0); // 동쪽 성분 증가
  });

  it('속도 크기 유지 (±1%)', () => {
    const vel = { x: 100, y: 800, z: 600 };
    const target = { x: 5000, y: 2000, z: 1000 };
    const myPos = { x: 0, y: 0, z: 0 };
    const speed = 1000;
    const result = pngGuidance(vel, target, myPos, speed, 0.1, 4);
    const resultSpeed = Math.sqrt(result.x ** 2 + result.y ** 2 + result.z ** 2);
    expectClose(resultSpeed, speed, 1);
  });

  it('거리 매우 가까울 때 원래 속도 반환', () => {
    const vel = { x: 0, y: 1000, z: 0 };
    const target = { x: 0.5, y: 0.5, z: 0 };
    const myPos = { x: 0, y: 0, z: 0 };
    const result = pngGuidance(vel, target, myPos, 1000, 0.1);
    // 거리 < 1m이면 원래 속도 반환
    expect(result.y).toBe(1000);
  });

  it('3D 공간에서 유도 — 고도 변화 포함', () => {
    const vel = { x: 0, y: 1000, z: 0 }; // 수평 비행
    const target = { x: 0, y: 5000, z: 5000 }; // 위쪽 표적
    const myPos = { x: 0, y: 0, z: 0 };
    const result = pngGuidance(vel, target, myPos, 1000, 0.1, 4);
    expect(result.z).toBeGreaterThan(0); // 상승 성분 증가
  });
});

// ════════════════════════════════════════════════════════════
// 4. isInSector — 구면 부채꼴 탐지 판정
// ════════════════════════════════════════════════════════════
describe('isInSector', () => {
  const sensor = { lon: 127.0, lat: 37.0, alt: 100 };

  it('센서 바로 위 (범위 내) → true', () => {
    const target = { lon: 127.0, lat: 37.001, alt: 5000 };
    expect(isInSector(sensor, target, 100, 0, 180, 90)).toBe(true);
  });

  it('범위 밖 (거리 초과) → false', () => {
    const target = { lon: 130.0, lat: 40.0, alt: 10000 };
    expect(isInSector(sensor, target, 100, 0, 180, 90)).toBe(false);
  });

  it('방위각 범위 밖 → false', () => {
    // 센서가 북쪽(0도) ±30도만 커버
    // 표적이 동쪽(~90도)
    const target = { lon: 127.5, lat: 37.0, alt: 5000 };
    expect(isInSector(sensor, target, 100, 0, 30, 90)).toBe(false);
  });

  it('방위각 범위 내 → true', () => {
    // 북쪽 표적
    const target = { lon: 127.0, lat: 37.3, alt: 5000 };
    expect(isInSector(sensor, target, 100, 0, 60, 90)).toBe(true);
  });

  it('고각 범위 밖 (음의 고각) → false', () => {
    // 표적이 센서보다 낮음
    const target = { lon: 127.0, lat: 37.1, alt: 0 };
    expect(isInSector(sensor, target, 100, 0, 180, 90)).toBe(false);
  });

  it('최소 탐지고도 미만 → false', () => {
    const target = { lon: 127.0, lat: 37.05, alt: 3000 };
    expect(isInSector(sensor, target, 100, 0, 180, 90, 5000)).toBe(false);
  });

  it('최소 탐지고도 이상 → true', () => {
    const target = { lon: 127.0, lat: 37.05, alt: 6000 };
    expect(isInSector(sensor, target, 100, 0, 180, 90, 5000)).toBe(true);
  });

  it('GREEN_PINE 시나리오: 900km, L밴드, 최소 고도 5000m', () => {
    const gp = { lon: 127.0, lat: 36.5, alt: 200 };
    // SRBM at ~400km 거리, 고도 100km
    const srbm = { lon: 127.0, lat: 40.1, alt: 100000 };
    expect(isInSector(gp, srbm, 900, 0, 180, 90, 5000)).toBe(true);
  });

  it('LSAM_MFR 시나리오: 310km, 최소 고도 50m', () => {
    const mfr = { lon: 127.0, lat: 37.0, alt: 150 };
    // SRBM at ~200km 거리, 고도 50km
    const srbm = { lon: 127.0, lat: 38.8, alt: 50000 };
    expect(isInSector(mfr, srbm, 310, 0, 180, 90, 50)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// 5. predictInterceptPoint — PIP 산출
// ════════════════════════════════════════════════════════════
describe('predictInterceptPoint', () => {
  it('봉투 내 진입하는 위협 → PIP 산출', () => {
    const threatPos = { lon: 127.0, lat: 39.0, alt: 100000 };
    // 남쪽으로 이동 (lat 감소)
    const threatVel = { dLon: 0, dLat: -0.005, dAlt: -200 };
    const shooterPos = { lon: 127.0, lat: 37.0, alt: 150 };
    const envelope = { Rmin: 20, Rmax: 150, Hmin: 0.05, Hmax: 60 };

    const pip = predictInterceptPoint(threatPos, threatVel, shooterPos, envelope, 1, 600);
    expect(pip).not.toBeNull();
    expect(pip.position.lat).toBeLessThan(39.0); // 남쪽으로 이동
    expect(pip.timeToReach).toBeGreaterThan(0);

    // PIP가 봉투 내인지 확인
    const range = slantRange(shooterPos, pip.position);
    expect(range).toBeGreaterThanOrEqual(envelope.Rmin);
    expect(range).toBeLessThanOrEqual(envelope.Rmax);
  });

  it('봉투에 진입하지 않는 위협 → null', () => {
    const threatPos = { lon: 130.0, lat: 39.0, alt: 100000 };
    // 동쪽으로 이동 (봉투 진입 불가)
    const threatVel = { dLon: 0.01, dLat: 0, dAlt: 0 };
    const shooterPos = { lon: 127.0, lat: 37.0, alt: 150 };
    const envelope = { Rmin: 20, Rmax: 150, Hmin: 0.05, Hmax: 60 };

    const pip = predictInterceptPoint(threatPos, threatVel, shooterPos, envelope, 1, 300);
    expect(pip).toBeNull();
  });

  it('이미 봉투 내 위협 → timeToReach=0', () => {
    const shooterPos = { lon: 127.0, lat: 37.0, alt: 150 };
    const threatPos = { lon: 127.0, lat: 37.5, alt: 30000 };
    const threatVel = { dLon: 0, dLat: -0.001, dAlt: -100 };
    const envelope = { Rmin: 20, Rmax: 150, Hmin: 0.05, Hmax: 60 };

    const pip = predictInterceptPoint(threatPos, threatVel, shooterPos, envelope);
    expect(pip).not.toBeNull();
    expect(pip.timeToReach).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════
// 6. calculateLaunchTime — 발사 시점 역산
// ════════════════════════════════════════════════════════════
describe('calculateLaunchTime', () => {
  it('기본 발사 시점 계산', () => {
    const shooterPos = { lon: 127.0, lat: 37.0, alt: 150 };
    const pipPos = { lon: 127.0, lat: 37.9, alt: 50000 };
    const timeToReachPip = 120; // 위협이 PIP에 120초 후 도착
    const missileSpeed = 3100; // L-SAM ABM Mach 9

    const result = calculateLaunchTime(shooterPos, pipPos, timeToReachPip, missileSpeed, 3);
    expect(result).not.toBeNull();
    expect(result.launchTime).toBeGreaterThan(0);
    expect(result.flyoutTime).toBeGreaterThan(0);
    // launchTime + flyoutTime + safetyMargin = timeToReachPip
    expectClose(result.launchTime + result.flyoutTime + 3, timeToReachPip, 1);
  });

  it('flyout 시간이 위협 도달 시간보다 길면 → null', () => {
    const shooterPos = { lon: 127.0, lat: 37.0, alt: 150 };
    const pipPos = { lon: 127.0, lat: 38.0, alt: 50000 };
    const timeToReachPip = 5; // 매우 짧은 시간
    const missileSpeed = 100; // 느린 미사일

    const result = calculateLaunchTime(shooterPos, pipPos, timeToReachPip, missileSpeed, 3);
    expect(result).toBeNull();
  });

  it('L-SAM ABM (Mach 9) — PIP 100km 거리', () => {
    const shooterPos = { lon: 127.0, lat: 37.0, alt: 150 };
    // PIP: ~100km 북쪽
    const pipPos = { lon: 127.0, lat: 37.9, alt: 50000 };
    const range = slantRange(shooterPos, pipPos);
    const missileSpeed = 3100; // m/s
    const expectedFlyout = range * 1000 / missileSpeed;

    const result = calculateLaunchTime(shooterPos, pipPos, 200, missileSpeed, 3);
    expect(result).not.toBeNull();
    expectClose(result.flyoutTime, expectedFlyout, 1);
  });

  it('safetyMargin 기본값 3초', () => {
    const shooterPos = { lon: 127.0, lat: 37.0, alt: 150 };
    const pipPos = { lon: 127.0, lat: 37.5, alt: 30000 };
    const result = calculateLaunchTime(shooterPos, pipPos, 200, 3100);
    expect(result).not.toBeNull();
    // launchTime + flyoutTime + 3 = 200
    expectClose(result.launchTime + result.flyoutTime + 3, 200, 1);
  });
});
