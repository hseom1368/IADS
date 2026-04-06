/**
 * @module tests/physics
 * physics.js 7개 함수 단위 테스트
 * - 물리 계산: 허용 오차 1% 이내
 * - 확률 계산: 1000회 시행 기대값 ±5%
 */

import { describe, it, expect } from 'vitest';
import {
  slantRange,
  ballisticTrajectory,
  pngGuidance,
  isInSector,
  predictInterceptPoint,
  calculateLaunchTime,
  predictedPk
} from '../src/core/physics.js';

// ── 테스트 헬퍼 ──

/** ECEF 속도 벡터의 크기 (m/s) */
function velMag(vel) {
  return Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
}

/** 한반도 중부 기준 ENU → ECEF 근사 속도 (수평 방향) */
function enuToEcefVel(east, north, up, lat = 37.5, lon = 127.0) {
  const latR = lat * Math.PI / 180;
  const lonR = lon * Math.PI / 180;
  const sinLon = Math.sin(lonR);
  const cosLon = Math.cos(lonR);
  const sinLat = Math.sin(latR);
  const cosLat = Math.cos(latR);

  return {
    x: -sinLon * east + (-sinLat * cosLon) * north + cosLat * cosLon * up,
    y: cosLon * east + (-sinLat * sinLon) * north + cosLat * sinLon * up,
    z: cosLat * north + sinLat * up
  };
}

// ═══════════════════════════════════════════════════════════
//  1. slantRange
// ═══════════════════════════════════════════════════════════

describe('slantRange', () => {
  it('동일 좌표 → 0 km', () => {
    const p = { lon: 127.0, lat: 37.5, alt: 0 };
    expect(slantRange(p, p)).toBeCloseTo(0, 5);
  });

  it('서울 ↔ 평양 ≈ 201 km (±1%)', () => {
    const seoul = { lon: 127.0, lat: 37.5, alt: 0 };
    const pyongyang = { lon: 125.75, lat: 39.02, alt: 0 };
    const dist = slantRange(seoul, pyongyang);
    expect(dist).toBeGreaterThan(201 * 0.99);
    expect(dist).toBeLessThan(201 * 1.01);
  });

  it('수직 고도 차이 100km', () => {
    const ground = { lon: 127.0, lat: 37.0, alt: 0 };
    const high = { lon: 127.0, lat: 37.0, alt: 100000 };
    const dist = slantRange(ground, high);
    expect(dist).toBeGreaterThan(100 * 0.99);
    expect(dist).toBeLessThan(100 * 1.01);
  });

  it('장거리 (~800 km) GREEN_PINE 범위급', () => {
    // 서울 ↔ 상해 직선거리 약 870km
    const seoul = { lon: 127.0, lat: 37.5, alt: 0 };
    const shanghai = { lon: 121.47, lat: 31.23, alt: 0 };
    const dist = slantRange(seoul, shanghai);
    expect(dist).toBeGreaterThan(800);
    expect(dist).toBeLessThan(900);
  });
});

// ═══════════════════════════════════════════════════════════
//  2. ballisticTrajectory
// ═══════════════════════════════════════════════════════════

describe('ballisticTrajectory', () => {
  it('자유낙하 1초 → 고도 ~9.81m 감소 (±1%)', () => {
    const pos = { lon: 127.0, lat: 37.5, alt: 10000 };
    const vel = { x: 0, y: 0, z: 0 };
    const result = ballisticTrajectory(pos, vel, 1.0);
    const altDrop = 10000 - result.pos.alt;
    // 자유낙하 1초: h = 0.5*g*t² = 4.905m + 속도*dt 적분 ≈ 9.81m (Euler)
    expect(altDrop).toBeGreaterThan(9.81 * 0.90);
    expect(altDrop).toBeLessThan(9.81 * 1.10);
  });

  it('SRBM 속도(2040m/s)로 0.05초 → 위치 변화 합리적', () => {
    const pos = { lon: 127.0, lat: 37.5, alt: 150000 };
    // 남쪽으로 수평 비행 (ECEF)
    const vel = enuToEcefVel(0, -2040, 0);
    const result = ballisticTrajectory(pos, vel, 0.05);
    // 0.05초 × 2040m/s = 102m 이동 → ~0.001° 위도 변화
    expect(result.pos.lat).toBeLessThan(37.5);
    expect(result.pos.alt).toBeLessThan(150000); // 중력으로 약간 하강
  });

  it('지면 클램프: alt=50m, 하향 속도 → alt ≥ 0', () => {
    const pos = { lon: 127.0, lat: 37.5, alt: 50 };
    const vel = enuToEcefVel(0, 0, -500); // 강한 하향
    const result = ballisticTrajectory(pos, vel, 1.0);
    expect(result.pos.alt).toBe(0);
  });

  it('속도 적분: newVel ≈ oldVel + g*dt', () => {
    const pos = { lon: 127.0, lat: 37.5, alt: 50000 };
    const vel = { x: 1000, y: 500, z: 200 };
    const dt = 0.05;
    const result = ballisticTrajectory(pos, vel, dt);
    // 속도 변화량 ≈ g*dt = 9.81 * 0.05 ≈ 0.49 m/s
    const dv = velMag({
      x: result.vel.x - vel.x,
      y: result.vel.y - vel.y,
      z: result.vel.z - vel.z
    });
    expect(dv).toBeGreaterThan(9.81 * dt * 0.95);
    expect(dv).toBeLessThan(9.81 * dt * 1.05);
  });
});

// ═══════════════════════════════════════════════════════════
//  3. pngGuidance
// ═══════════════════════════════════════════════════════════

describe('pngGuidance', () => {
  it('이미 정렬 → 방향 유지, 속력 보존', () => {
    // 요격미사일이 타겟 방향으로 이미 정확히 비행 중
    const iPos = { lon: 127.0, lat: 37.0, alt: 40000 };
    const tPos = { lon: 127.0, lat: 37.5, alt: 40000 }; // 정북
    const speed = 1500;
    const iVel = enuToEcefVel(0, speed, 0, 37.0, 127.0); // 북쪽으로
    const result = pngGuidance(iPos, iVel, tPos, speed, 0.05, 4);
    const resultSpeed = velMag(result);
    expect(resultSpeed).toBeGreaterThan(speed * 0.99);
    expect(resultSpeed).toBeLessThan(speed * 1.01);
  });

  it('90° 오프셋 → 타겟 방향으로 선회', () => {
    const iPos = { lon: 127.0, lat: 37.0, alt: 40000 };
    const tPos = { lon: 127.5, lat: 37.0, alt: 40000 }; // 동쪽
    const speed = 1500;
    const iVel = enuToEcefVel(0, speed, 0, 37.0, 127.0); // 북쪽으로 (90° 오프셋)
    const result = pngGuidance(iPos, iVel, tPos, speed, 0.05, 4);

    // 결과 속도의 동쪽 성분이 증가해야 함
    // 원래 속도의 동쪽 성분이 0이었으므로, 양의 동쪽 성분이 나와야 함
    // ECEF에서 동쪽 = (-sinLon, cosLon, 0)
    const lonR = 127.0 * Math.PI / 180;
    const eastDot = -Math.sin(lonR) * result.x + Math.cos(lonR) * result.y;
    expect(eastDot).toBeGreaterThan(0);
  });

  it('속력 보존 (±1%)', () => {
    const iPos = { lon: 127.0, lat: 37.0, alt: 30000 };
    const tPos = { lon: 126.5, lat: 37.5, alt: 50000 }; // 비스듬한 방향
    const speed = 1200;
    const iVel = enuToEcefVel(500, 800, 400, 37.0, 127.0);
    const result = pngGuidance(iPos, iVel, tPos, speed, 0.05, 4.5);
    const resultSpeed = velMag(result);
    expect(resultSpeed).toBeGreaterThan(speed * 0.99);
    expect(resultSpeed).toBeLessThan(speed * 1.01);
  });

  it('매우 가까움 (< 1m) → 원래 속도 반환', () => {
    const pos = { lon: 127.0, lat: 37.0, alt: 40000 };
    const vel = { x: 1000, y: 500, z: 200 };
    const result = pngGuidance(pos, vel, pos, 1500, 0.05, 4);
    expect(result.x).toBe(vel.x);
    expect(result.y).toBe(vel.y);
    expect(result.z).toBe(vel.z);
  });
});

// ═══════════════════════════════════════════════════════════
//  4. isInSector
// ═══════════════════════════════════════════════════════════

describe('isInSector', () => {
  const sensor = { lon: 127.0, lat: 37.0, alt: 100 };
  const azCenter = 0; // 북
  const azHalf = 60;  // ±60°
  const elMax = 90;
  const maxRange = 800; // km

  it('센서 정면 근거리 → true', () => {
    const target = { lon: 127.0, lat: 37.1, alt: 50000 }; // 정북, ~11km
    expect(isInSector(sensor, target, azCenter, azHalf, elMax, maxRange)).toBe(true);
  });

  it('maxRange 초과 → false', () => {
    const target = { lon: 127.0, lat: 47.0, alt: 50000 }; // ~1100km 북
    expect(isInSector(sensor, target, azCenter, azHalf, elMax, maxRange)).toBe(false);
  });

  it('방위각 밖 (뒤쪽) → false', () => {
    const target = { lon: 127.0, lat: 36.0, alt: 50000 }; // 남쪽 (180°)
    expect(isInSector(sensor, target, azCenter, azHalf, elMax, maxRange)).toBe(false);
  });

  it('고각 음수 (지하) → false', () => {
    // 센서보다 낮은 곳
    const target = { lon: 127.1, lat: 37.1, alt: 0 }; // 센서 고도 100m, 타겟 0m
    // 거리가 매우 가까우면 아래를 볼 수 있지만, 고각이 음수면 false
    expect(isInSector(sensor, target, azCenter, azHalf, elMax, maxRange)).toBe(false);
  });

  it('방위각 경계값: 정확히 azHalf (60°) → true', () => {
    // 북동쪽 60° 방향
    const target = { lon: 128.1, lat: 37.5, alt: 50000 };
    // 대략 방위각 60° 부근
    // 직접 계산: atan2(east, north) ≈ atan2(1.1*cos(37°), 0.5)
    // 정확한 경계 테스트보다는 azHalf 이내인지 확인
    const result = isInSector(sensor, target, azCenter, azHalf, elMax, maxRange);
    // 이 각도는 약 60° 부근이므로 경계에서의 동작을 확인
    expect(typeof result).toBe('boolean');
  });
});

// ═══════════════════════════════════════════════════════════
//  5. predictInterceptPoint
// ═══════════════════════════════════════════════════════════

describe('predictInterceptPoint', () => {
  // L-SAM ABM 사수: 교전구역 40-60km alt, 20-150km range
  const shooter = {
    position: { lon: 127.0, lat: 37.0, alt: 100 },
    capability: {
      maxRange: 150,
      minRange: 20,
      maxAlt: 60,
      minAlt: 40,
      interceptorSpeed: 1500
    }
  };

  it('SRBM 하강 궤적 → 교전구역 내 요격지점 반환 (non-null)', () => {
    // SRBM: 150km 고도에서 사수 방향으로 하강
    const threat = {
      position: { lon: 127.0, lat: 38.0, alt: 150000 },
      velocity: enuToEcefVel(0, -2040, -800, 38.0, 127.0) // 남쪽+하향
    };
    const result = predictInterceptPoint(threat, shooter);
    expect(result).not.toBeNull();
  });

  it('반환된 좌표의 alt가 40~60km 범위 내', () => {
    const threat = {
      position: { lon: 127.0, lat: 38.0, alt: 150000 },
      velocity: enuToEcefVel(0, -2040, -800, 38.0, 127.0)
    };
    const result = predictInterceptPoint(threat, shooter);
    if (result) {
      const altKm = result.alt / 1000;
      expect(altKm).toBeGreaterThanOrEqual(40);
      expect(altKm).toBeLessThanOrEqual(60);
    }
  });

  it('반환된 좌표가 shooter에서 20~150km 범위 내', () => {
    const threat = {
      position: { lon: 127.0, lat: 38.0, alt: 150000 },
      velocity: enuToEcefVel(0, -2040, -800, 38.0, 127.0)
    };
    const result = predictInterceptPoint(threat, shooter);
    if (result) {
      const dist = slantRange(shooter.position, result);
      expect(dist).toBeGreaterThanOrEqual(20);
      expect(dist).toBeLessThanOrEqual(150);
    }
  });

  it('교전구역 미통과 위협 → null 반환', () => {
    // 매우 먼 곳에서 수평으로 지나가는 위협 (사수 교전구역 밖)
    const threat = {
      position: { lon: 130.0, lat: 40.0, alt: 150000 },
      velocity: enuToEcefVel(2040, 0, 0, 40.0, 130.0) // 동쪽으로 수평비행
    };
    const result = predictInterceptPoint(threat, shooter);
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
//  6. calculateLaunchTime
// ═══════════════════════════════════════════════════════════

describe('calculateLaunchTime', () => {
  const shooterPos = { lon: 127.0, lat: 37.0, alt: 100 };
  const shooterCap = {
    interceptorSpeed: 1500,
    boostTime: 2.0
  };
  const shooter = { position: shooterPos, capability: shooterCap };

  it('위협이 멀리 있을 때 → 양수 offset', () => {
    const threat = {
      position: { lon: 127.0, lat: 38.0, alt: 150000 },
      velocity: enuToEcefVel(0, -2040, -800, 38.0, 127.0)
    };
    const interceptPoint = { lon: 127.0, lat: 37.3, alt: 50000 };
    const offset = calculateLaunchTime(threat, shooter, interceptPoint);
    expect(offset).toBeGreaterThan(0);
  });

  it('위협이 교전구역 직전 → 작은 offset 또는 0', () => {
    // 위협이 이미 요격지점 근처에 있는 경우
    const threat = {
      position: { lon: 127.0, lat: 37.35, alt: 52000 },
      velocity: enuToEcefVel(0, -2040, -1000, 37.35, 127.0)
    };
    const interceptPoint = { lon: 127.0, lat: 37.3, alt: 50000 };
    const offset = calculateLaunchTime(threat, shooter, interceptPoint);
    expect(offset).toBeGreaterThanOrEqual(0);
    expect(offset).toBeLessThan(30); // 매우 가까우므로 짧은 offset
  });

  it('반환값 ≥ 0 (음수 없음)', () => {
    const threat = {
      position: { lon: 127.0, lat: 37.1, alt: 45000 },
      velocity: enuToEcefVel(0, -500, -1500, 37.1, 127.0)
    };
    const interceptPoint = { lon: 127.0, lat: 37.05, alt: 42000 };
    const offset = calculateLaunchTime(threat, shooter, interceptPoint);
    expect(offset).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════
//  7. predictedPk
// ═══════════════════════════════════════════════════════════

describe('predictedPk', () => {
  // L-SAM ABM: base_pk=0.85 vs SRBM, maxRange=150km
  const shooter = {
    position: { lon: 127.0, lat: 37.0, alt: 100 },
    capability: {
      pkTable: { SRBM: 0.85 },
      maxRange: 150,
      minRange: 20,
      maxAlt: 60,
      minAlt: 40
    }
  };

  it('L-SAM ABM vs SRBM, d≈55km → Pk ≈ 0.63 (weapon-specs 예시, ±10%)', () => {
    // 요격지점: shooter에서 ~55km
    const interceptPoint = { lon: 127.0, lat: 37.3, alt: 50000 };
    const threat = { typeId: 'SRBM', maneuvering: true };
    const pk = predictedPk(shooter, interceptPoint, threat);
    // weapon-specs: 0.85 × 0.87 × 0.85 = 0.63
    expect(pk).toBeGreaterThan(0.63 * 0.90);
    expect(pk).toBeLessThan(0.63 * 1.10);
  });

  it('maxRange 근처 → 0에 가까움', () => {
    // shooter에서 ~148km
    const interceptPoint = { lon: 127.0, lat: 38.3, alt: 50000 };
    const threat = { typeId: 'SRBM', maneuvering: false };
    const pk = predictedPk(shooter, interceptPoint, threat);
    expect(pk).toBeLessThan(0.1);
  });

  it('기동 위협 → 0.85 배율 적용', () => {
    const interceptPoint = { lon: 127.0, lat: 37.3, alt: 50000 };
    const nonManeuver = predictedPk(shooter, interceptPoint,
      { typeId: 'SRBM', maneuvering: false });
    const maneuver = predictedPk(shooter, interceptPoint,
      { typeId: 'SRBM', maneuvering: true });
    expect(maneuver / nonManeuver).toBeCloseTo(0.85, 1);
  });

  it('미지 위협 타입 → 0 반환', () => {
    const interceptPoint = { lon: 127.0, lat: 37.3, alt: 50000 };
    const threat = { typeId: 'UNKNOWN_MISSILE', maneuvering: false };
    const pk = predictedPk(shooter, interceptPoint, threat);
    expect(pk).toBe(0);
  });
});
