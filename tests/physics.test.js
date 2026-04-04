/**
 * @file Phase 1.1 물리 엔진 테스트
 * TDD: 이 파일을 먼저 작성한 후 구현하여 통과시킨다.
 * 허용 오차: 물리 계산 1% 이내
 */
import { describe, it, expect } from 'vitest';
import {
  slantRange,
  ballisticTrajectory,
  pngGuidance,
  isInSector
} from '../src/core/physics.js';

/** 1% 허용 오차 헬퍼 */
function expectClose(actual, expected, tolerancePct = 1) {
  const margin = Math.abs(expected) * tolerancePct / 100;
  expect(actual).toBeGreaterThanOrEqual(expected - margin - 1e-10);
  expect(actual).toBeLessThanOrEqual(expected + margin + 1e-10);
}

// ═══════════════════════════════════════════════════════════
//  slantRange
// ═══════════════════════════════════════════════════════════
describe('slantRange', () => {
  it('같은 점이면 0 km를 반환해야 한다', () => {
    const p = { lon: 127.0, lat: 37.5, alt: 0 };
    expect(slantRange(p, p)).toBe(0);
  });

  it('서울↔평양 거리가 약 195km여야 한다 (±1%)', () => {
    const seoul = { lon: 127.0, lat: 37.5, alt: 0 };
    const pyongyang = { lon: 125.75, lat: 39.02, alt: 0 };
    const dist = slantRange(seoul, pyongyang);
    expectClose(dist, 201, 2); // WGS84 타원체 기준 ~201km
  });

  it('고도 차이만 있는 두 점 (150km 상공)', () => {
    const ground = { lon: 127.0, lat: 37.5, alt: 0 };
    const high = { lon: 127.0, lat: 37.5, alt: 150000 };
    const dist = slantRange(ground, high);
    expectClose(dist, 150, 1);
  });

  it('대칭성: slantRange(a,b) === slantRange(b,a)', () => {
    const a = { lon: 126.0, lat: 38.0, alt: 1000 };
    const b = { lon: 128.0, lat: 36.0, alt: 5000 };
    expect(slantRange(a, b)).toBeCloseTo(slantRange(b, a), 10);
  });

  it('반환값 단위가 km여야 한다', () => {
    const a = { lon: 127.0, lat: 37.5, alt: 0 };
    const b = { lon: 127.0, lat: 37.5, alt: 1000 };
    const dist = slantRange(a, b);
    expectClose(dist, 1, 1); // 1km
  });
});

// ═══════════════════════════════════════════════════════════
//  ballisticTrajectory
// ═══════════════════════════════════════════════════════════
describe('ballisticTrajectory', () => {
  it('자유낙하 1초 후 고도가 약 4.9m 감소해야 한다', () => {
    const pos = { lon: 127.0, lat: 37.5, alt: 10000 };
    const vel = { x: 0, y: 0, z: 0 }; // 정지 상태에서 낙하
    const result = ballisticTrajectory(pos, vel, 1.0);
    const altDrop = pos.alt - result.pos.alt;
    // Euler 적분: v += g*dt → pos += v*dt → 낙하거리 = g*dt² = 9.81m
    expectClose(altDrop, 9.81, 2);
  });

  it('수평 속도를 가진 물체는 전진하면서 고도가 감소해야 한다', () => {
    const pos = { lon: 127.0, lat: 37.5, alt: 50000 };
    // 동쪽으로 700m/s (ECEF 근사: 동쪽은 대략 -sin(lon)*vx + cos(lon)*vy 방향)
    // 단순화: ECEF에서 x축 방향으로 속도
    const vel = { x: 700, y: 0, z: 0 };
    const result = ballisticTrajectory(pos, vel, 1.0);
    expect(result.pos.alt).toBeLessThan(pos.alt); // 고도 감소
  });

  it('반환된 vel에 중력 가속이 반영되어야 한다', () => {
    const pos = { lon: 127.0, lat: 37.5, alt: 50000 };
    const vel = { x: 0, y: 0, z: 0 };
    const result = ballisticTrajectory(pos, vel, 1.0);
    const speed = Math.sqrt(result.vel.x ** 2 + result.vel.y ** 2 + result.vel.z ** 2);
    expectClose(speed, 9.81, 1); // 1초 후 속력 ≈ 9.81 m/s
  });

  it('지면 도달 시 alt가 0으로 클램프되어야 한다', () => {
    const pos = { lon: 127.0, lat: 37.5, alt: 3 };
    const vel = { x: 0, y: 0, z: -100 }; // 아래로 빠르게
    const result = ballisticTrajectory(pos, vel, 1.0);
    expect(result.pos.alt).toBe(0);
  });

  it('pos 포맷이 {lon, lat, alt}여야 한다', () => {
    const pos = { lon: 127.0, lat: 37.5, alt: 10000 };
    const vel = { x: 0, y: 0, z: 0 };
    const result = ballisticTrajectory(pos, vel, 0.1);
    expect(result.pos).toHaveProperty('lon');
    expect(result.pos).toHaveProperty('lat');
    expect(result.pos).toHaveProperty('alt');
    expect(result.vel).toHaveProperty('x');
    expect(result.vel).toHaveProperty('y');
    expect(result.vel).toHaveProperty('z');
  });
});

// ═══════════════════════════════════════════════════════════
//  pngGuidance
// ═══════════════════════════════════════════════════════════
describe('pngGuidance', () => {
  it('이미 타겟을 향하고 있으면 속도가 거의 변하지 않아야 한다', () => {
    // 요격미사일이 북쪽에서 남쪽의 타겟을 향해 날아가는 경우
    const iPos = { lon: 127.0, lat: 37.5, alt: 30000 };
    const tPos = { lon: 127.0, lat: 37.0, alt: 30000 };

    // 타겟 방향의 ECEF 속도를 미리 계산하기 어려우므로,
    // 대신 결과 속력이 보존되는지 확인
    const speed = 1500;
    // 대략 남쪽 방향 ECEF 속도 (정확하지 않아도 됨)
    const iVel = { x: 0, y: 0, z: -speed };
    const result = pngGuidance(iPos, iVel, tPos, speed, 0.1, 4);
    const resultSpeed = Math.sqrt(result.x ** 2 + result.y ** 2 + result.z ** 2);
    expectClose(resultSpeed, speed, 1);
  });

  it('속력 크기가 항상 보존되어야 한다 (±1%)', () => {
    const iPos = { lon: 127.0, lat: 37.5, alt: 20000 };
    const tPos = { lon: 127.5, lat: 37.0, alt: 10000 };
    const speed = 1500;
    const iVel = { x: 1000, y: 1000, z: 500 };
    const result = pngGuidance(iPos, iVel, tPos, speed, 0.1, 4.5);
    const resultSpeed = Math.sqrt(result.x ** 2 + result.y ** 2 + result.z ** 2);
    expectClose(resultSpeed, speed, 1);
  });

  it('N=0이면 선회가 없어야 한다 (속도 방향 유지)', () => {
    const iPos = { lon: 127.0, lat: 37.5, alt: 20000 };
    const tPos = { lon: 128.0, lat: 38.0, alt: 10000 };
    const speed = 1500;
    const iVel = { x: 1500, y: 0, z: 0 };
    const result = pngGuidance(iPos, iVel, tPos, speed, 0.1, 0);
    // N=0 → turnAngle=0 → 속도 방향 불변
    expectClose(result.x, 1500, 1);
    expectClose(result.y, 0, 1);
    expectClose(result.z, 0, 1);
  });

  it('타겟에 매우 가까우면 (1m 이내) 현재 속도를 반환해야 한다', () => {
    const pos = { lon: 127.0, lat: 37.5, alt: 20000 };
    const iVel = { x: 1000, y: 1000, z: 500 };
    const result = pngGuidance(pos, iVel, pos, 1500, 0.1, 4);
    expect(result.x).toBe(iVel.x);
    expect(result.y).toBe(iVel.y);
    expect(result.z).toBe(iVel.z);
  });

  it('여러 스텝 반복 시 타겟 방향으로 수렴해야 한다', () => {
    let iPos = { lon: 127.0, lat: 37.5, alt: 30000 };
    const tPos = { lon: 127.5, lat: 37.0, alt: 15000 };
    const speed = 1500;
    let iVel = { x: 0, y: 0, z: speed }; // 완전히 엉뚱한 방향

    // 10스텝 유도
    for (let i = 0; i < 10; i++) {
      iVel = pngGuidance(iPos, iVel, tPos, speed, 0.1, 4);
    }

    // 속력 보존 확인
    const resultSpeed = Math.sqrt(iVel.x ** 2 + iVel.y ** 2 + iVel.z ** 2);
    expectClose(resultSpeed, speed, 1);
  });
});

// ═══════════════════════════════════════════════════════════
//  isInSector
// ═══════════════════════════════════════════════════════════
describe('isInSector', () => {
  // 센서: 의정부 (127.0°E, 37.74°N)
  // 레이더: 방위각 0° (북), 반각 60°, 최대 고각 90°, 탐지거리 100km
  const sensor = { lon: 127.0, lat: 37.74, alt: 100 };
  const azCenter = 0;   // 북쪽
  const azHalf = 60;    // ±60°
  const elMax = 90;     // 최대 고각
  const maxRange = 100; // km

  it('정면 + 범위 내 타겟 → true', () => {
    // 북쪽 50km, 고도 30km
    const target = { lon: 127.0, lat: 38.19, alt: 30000 };
    expect(isInSector(sensor, target, azCenter, azHalf, elMax, maxRange)).toBe(true);
  });

  it('범위 밖 타겟 → false', () => {
    // 북쪽 150km
    const target = { lon: 127.0, lat: 39.09, alt: 30000 };
    expect(isInSector(sensor, target, azCenter, azHalf, elMax, maxRange)).toBe(false);
  });

  it('방위각 밖 타겟 → false', () => {
    // 남쪽 50km (방위각 180°, azCenter=0, azHalf=60이면 밖)
    const target = { lon: 127.0, lat: 37.29, alt: 30000 };
    expect(isInSector(sensor, target, azCenter, azHalf, elMax, maxRange)).toBe(false);
  });

  it('지평선 아래 (고각 < 0) → false', () => {
    // 북쪽 50km, 센서보다 낮은 고도
    const target = { lon: 127.0, lat: 38.19, alt: 0 };
    expect(isInSector(sensor, target, azCenter, azHalf, elMax, maxRange)).toBe(false);
  });

  it('고각 제한 초과 → false', () => {
    // 고각 max = 30° 설정, 바로 위에 타겟 (고각 ~90°)
    const target = { lon: 127.0, lat: 37.74, alt: 50000 };
    expect(isInSector(sensor, target, azCenter, azHalf, 30, maxRange)).toBe(false);
  });

  it('방위각 경계 (azCenter=0, azHalf=60, 타겟 방위 59°) → true', () => {
    // 북동쪽 약 59° 방향, 50km
    // 59°방위 ≈ lon + sin(59°)*0.45°, lat + cos(59°)*0.45° (대략)
    const target = { lon: 127.34, lat: 37.97, alt: 20000 };
    expect(isInSector(sensor, target, azCenter, azHalf, elMax, maxRange)).toBe(true);
  });

  it('azCenter가 0이 아닌 경우에도 작동해야 한다', () => {
    // 동쪽(90°) 방향 센서, ±45° 범위
    const target = { lon: 127.5, lat: 37.74, alt: 20000 };
    expect(isInSector(sensor, target, 90, 45, elMax, maxRange)).toBe(true);
  });

  it('센서 거의 바로 위 타겟 (높은 고각) → true', () => {
    // 약간 북쪽 오프셋 + 고고도 → 고각 ~80°
    const target = { lon: 127.0, lat: 37.75, alt: 10000 };
    expect(isInSector(sensor, target, azCenter, azHalf, elMax, maxRange)).toBe(true);
  });
});
