/**
 * tests/sensor-model.test.js — 센서 모델 테스트
 *
 * SNR 탐지확률, 재밍 보정, 3단계 상태 전이, 접근각 계산
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateDetectionProbability,
  applyJammingCorrection,
  updateSensorState,
  getAspectAngle,
} from '../src/core/sensor-model.js';
import { SENSOR_STATE, SensorEntity, ThreatEntity, resetEntityIdCounter } from '../src/core/entities.js';
import { Registry } from '../src/core/registry.js';

let registry;
beforeEach(() => {
  registry = new Registry();
  resetEntityIdCounter();
});

// ════════════════════════════════════════════════════════════
// SNR 기반 탐지확률
// ════════════════════════════════════════════════════════════
describe('calculateDetectionProbability', () => {
  it('GREEN_PINE vs SRBM(RCS=0.1) at 900km → 0.95 (공칭거리)', () => {
    // SNR = (900/900)⁴ × (0.1/0.1) = 1.0, P = 1.0^0.5 × 0.95 = 0.95
    const p = calculateDetectionProbability(900, 900, 0.1, 0.1);
    expect(p).toBeCloseTo(0.95, 2);
  });

  it('GREEN_PINE vs SRBM(RCS=0.1) at 600km → 0.99 (가까움)', () => {
    // SNR = (900/600)⁴ × 1.0 = 5.06, P = min(0.99, 2.25 × 0.95) = 0.99
    const p = calculateDetectionProbability(900, 600, 0.1, 0.1);
    expect(p).toBe(0.99);
  });

  it('LSAM_MFR vs SRBM(RCS=0.1) at 310km → ~0.30', () => {
    // SNR = (310/310)⁴ × (0.1/1.0) = 0.1, P = 0.316 × 0.95 ≈ 0.30
    const p = calculateDetectionProbability(310, 310, 0.1, 1.0);
    expect(p).toBeCloseTo(0.30, 1);
  });

  it('LSAM_MFR vs AIRCRAFT(RCS=5.0) at 400km → 0.95', () => {
    // SNR = (400/400)⁴ × (5.0/1.0) = 5.0, P = min(0.99, 2.24 × 0.95) = 0.99
    const p = calculateDetectionProbability(400, 400, 5.0, 1.0);
    expect(p).toBe(0.99);
  });

  it('매우 먼 거리 → 탐지확률 0에 근접', () => {
    const p = calculateDetectionProbability(100, 500, 1.0, 1.0);
    expect(p).toBeLessThan(0.05);
  });

  it('거리 0 → 0.99', () => {
    const p = calculateDetectionProbability(900, 0, 0.1, 0.1);
    expect(p).toBe(0.99);
  });

  it('RCS 매우 작으면 탐지확률 감소', () => {
    const pNormal = calculateDetectionProbability(310, 200, 1.0, 1.0);
    const pSmall = calculateDetectionProbability(310, 200, 0.001, 1.0);
    expect(pSmall).toBeLessThan(pNormal);
  });
});

// ════════════════════════════════════════════════════════════
// 재밍 보정
// ════════════════════════════════════════════════════════════
describe('applyJammingCorrection', () => {
  it('재밍 없음 → 원래 확률 유지', () => {
    expect(applyJammingCorrection(0.90, 0, 0.5, 0)).toBe(0.90);
  });

  it('L밴드(감수성 0.3) 재밍 레벨 1.0 → P × 0.7', () => {
    const p = applyJammingCorrection(0.90, 1.0, 0.3, 0);
    expect(p).toBeCloseTo(0.63, 2);
  });

  it('X밴드(감수성 1.0) 재밍 레벨 1.0 → P × 0', () => {
    const p = applyJammingCorrection(0.90, 1.0, 1.0, 0);
    expect(p).toBeCloseTo(0, 2);
  });

  it('채프(ECM 0.15) 적용 → P × 0.85', () => {
    const p = applyJammingCorrection(0.90, 0, 0.5, 0.15);
    expect(p).toBeCloseTo(0.765, 2);
  });

  it('재밍 + ECM 복합 → 곱셈', () => {
    const p = applyJammingCorrection(0.90, 0.5, 0.5, 0.15);
    // 0.90 × (1 - 0.25) × (1 - 0.15) = 0.90 × 0.75 × 0.85 = 0.57375
    expect(p).toBeCloseTo(0.574, 2);
  });
});

// ════════════════════════════════════════════════════════════
// 3단계 센서 상태 전이 테스트
// ════════════════════════════════════════════════════════════
describe('updateSensorState — 상태 전이', () => {
  const SENSOR_POS = { lon: 127.0, lat: 37.0, alt: 150 };

  function makeThreat(pos) {
    const t = new ThreatEntity('SRBM', pos, { lon: 127.0, lat: 37.0, alt: 0 });
    t.currentRCS = 0.1;
    return t;
  }

  it('UNDETECTED → DETECTED (탐지 성공)', () => {
    const sensor = new SensorEntity('LSAM_MFR', SENSOR_POS);
    const threat = makeThreat({ lon: 127.0, lat: 38.0, alt: 50000 });

    const result = updateSensorState(sensor, threat, registry, 0, 1, () => 0); // 항상 성공
    expect(result.state).toBe(SENSOR_STATE.DETECTED);
    expect(result.transitioned).toBe(true);
    expect(result.event).toBe('SENSOR_DETECTED');
  });

  it('UNDETECTED 유지 (탐지 실패)', () => {
    const sensor = new SensorEntity('LSAM_MFR', SENSOR_POS);
    const threat = makeThreat({ lon: 127.0, lat: 38.0, alt: 50000 });

    const result = updateSensorState(sensor, threat, registry, 0, 1, () => 0.999); // 항상 실패
    expect(result.state).toBe(SENSOR_STATE.UNDETECTED);
    expect(result.transitioned).toBe(false);
  });

  it('DETECTED → TRACKED (전이 시간 5s 경과)', () => {
    const sensor = new SensorEntity('LSAM_MFR', SENSOR_POS);
    const threat = makeThreat({ lon: 127.0, lat: 37.5, alt: 50000 });

    // 탐지
    updateSensorState(sensor, threat, registry, 0, 1, () => 0);
    expect(sensor.getTrackState(threat.id).state).toBe(SENSOR_STATE.DETECTED);

    // 5초 동안 반복 갱신 (dt=1초씩)
    for (let i = 0; i < 5; i++) {
      updateSensorState(sensor, threat, registry, 0, 1, () => 0);
    }
    expect(sensor.getTrackState(threat.id).state).toBe(SENSOR_STATE.TRACKED);
  });

  it('TRACKED → FIRE_CONTROL (전이 시간 8s 경과)', () => {
    const sensor = new SensorEntity('LSAM_MFR', SENSOR_POS);
    const threat = makeThreat({ lon: 127.0, lat: 37.5, alt: 50000 });

    // DETECTED까지
    updateSensorState(sensor, threat, registry, 0, 1, () => 0);
    // TRACKED까지 (5s)
    for (let i = 0; i < 5; i++) {
      updateSensorState(sensor, threat, registry, 0, 1, () => 0);
    }
    expect(sensor.getTrackState(threat.id).state).toBe(SENSOR_STATE.TRACKED);

    // FIRE_CONTROL까지 (8s)
    for (let i = 0; i < 8; i++) {
      updateSensorState(sensor, threat, registry, 0, 1, () => 0);
    }
    expect(sensor.getTrackState(threat.id).state).toBe(SENSOR_STATE.FIRE_CONTROL);
  });

  it('GREEN_PINE_B: TRACKED까지만 (교전급 없음)', () => {
    const sensor = new SensorEntity('GREEN_PINE_B', SENSOR_POS);
    const threat = makeThreat({ lon: 127.0, lat: 40.0, alt: 100000 });

    // 탐지
    updateSensorState(sensor, threat, registry, 0, 1, () => 0);
    // 10s (detectToTrack)
    for (let i = 0; i < 10; i++) {
      updateSensorState(sensor, threat, registry, 0, 1, () => 0);
    }
    expect(sensor.getTrackState(threat.id).state).toBe(SENSOR_STATE.TRACKED);

    // 추가 20s → 여전히 TRACKED (교전급 능력 없음)
    for (let i = 0; i < 20; i++) {
      updateSensorState(sensor, threat, registry, 0, 1, () => 0);
    }
    expect(sensor.getTrackState(threat.id).state).toBe(SENSOR_STATE.TRACKED);
  });

  it('3회 연속 미탐지 → DETECTED에서 추적 상실', () => {
    const sensor = new SensorEntity('LSAM_MFR', SENSOR_POS);
    const threat = makeThreat({ lon: 127.0, lat: 37.5, alt: 50000 });

    // DETECTED로 전이
    updateSensorState(sensor, threat, registry, 0, 1, () => 0);
    expect(sensor.getTrackState(threat.id).state).toBe(SENSOR_STATE.DETECTED);

    // 3회 연속 실패
    for (let i = 0; i < 3; i++) {
      updateSensorState(sensor, threat, registry, 0, 1, () => 0.999);
    }
    expect(sensor.getTrackState(threat.id).state).toBe(SENSOR_STATE.UNDETECTED);
  });

  it('3회 연속 미탐지 → TRACKED에서 추적 상실', () => {
    const sensor = new SensorEntity('LSAM_MFR', SENSOR_POS);
    const threat = makeThreat({ lon: 127.0, lat: 37.5, alt: 50000 });

    // TRACKED까지
    updateSensorState(sensor, threat, registry, 0, 1, () => 0);
    for (let i = 0; i < 5; i++) {
      updateSensorState(sensor, threat, registry, 0, 1, () => 0);
    }
    expect(sensor.getTrackState(threat.id).state).toBe(SENSOR_STATE.TRACKED);

    // 3회 실패
    for (let i = 0; i < 3; i++) {
      updateSensorState(sensor, threat, registry, 0, 1, () => 0.999);
    }
    expect(sensor.getTrackState(threat.id).state).toBe(SENSOR_STATE.UNDETECTED);
  });

  it('3회 연속 미탐지 → FIRE_CONTROL에서 TRACKED로 열화', () => {
    const sensor = new SensorEntity('LSAM_MFR', SENSOR_POS);
    const threat = makeThreat({ lon: 127.0, lat: 37.5, alt: 50000 });

    // FIRE_CONTROL까지
    updateSensorState(sensor, threat, registry, 0, 1, () => 0);
    for (let i = 0; i < 5; i++) {
      updateSensorState(sensor, threat, registry, 0, 1, () => 0);
    }
    for (let i = 0; i < 8; i++) {
      updateSensorState(sensor, threat, registry, 0, 1, () => 0);
    }
    expect(sensor.getTrackState(threat.id).state).toBe(SENSOR_STATE.FIRE_CONTROL);

    // 3회 실패 → TRACKED (UNDETECTED가 아님!)
    for (let i = 0; i < 3; i++) {
      updateSensorState(sensor, threat, registry, 0, 1, () => 0.999);
    }
    expect(sensor.getTrackState(threat.id).state).toBe(SENSOR_STATE.TRACKED);
  });

  it('중간에 탐지 성공하면 consecutiveMisses 리셋', () => {
    const sensor = new SensorEntity('LSAM_MFR', SENSOR_POS);
    const threat = makeThreat({ lon: 127.0, lat: 37.5, alt: 50000 });

    // DETECTED
    updateSensorState(sensor, threat, registry, 0, 1, () => 0);
    // 2회 실패
    updateSensorState(sensor, threat, registry, 0, 1, () => 0.999);
    updateSensorState(sensor, threat, registry, 0, 1, () => 0.999);
    expect(sensor.getTrackState(threat.id).consecutiveMisses).toBe(2);

    // 1회 성공 → 리셋
    updateSensorState(sensor, threat, registry, 0, 1, () => 0);
    expect(sensor.getTrackState(threat.id).consecutiveMisses).toBe(0);
    expect(sensor.getTrackState(threat.id).state).toBe(SENSOR_STATE.DETECTED); // 아직 전이 시간 미충족
  });

  it('탐지 불가능한 위협 → UNDETECTED 유지', () => {
    const sensor = new SensorEntity('GREEN_PINE_B', SENSOR_POS);
    const aircraft = new ThreatEntity('AIRCRAFT', { lon: 127.0, lat: 38.0, alt: 10000 }, SENSOR_POS);
    aircraft.currentRCS = 5.0;

    // GREEN_PINE_B는 AIRCRAFT 탐지 불가
    const result = updateSensorState(sensor, aircraft, registry, 0, 1, () => 0);
    expect(result.state).toBe(SENSOR_STATE.UNDETECTED);
  });
});

// ════════════════════════════════════════════════════════════
// BDA 타이머 테스트
// ════════════════════════════════════════════════════════════
describe('BDA timer integration (via BatteryEntity)', () => {
  // BDA 자체는 entities.test.js에서 테스트, 여기는 S-L-S 흐름 확인
  it('S-L-S: BDA 지연 8초 후 재발사 판단 가능', async () => {
    const { BatteryEntity } = await import('../src/core/entities.js');
    const bat = new BatteryEntity('LSAM', { lon: 127, lat: 37, alt: 150 }, 'mfr', 'ecs', { ABM: 12 }, 10);

    bat.fire('ABM');
    bat.startBDA('int_1', 't1', 8);

    // 7초 경과 → 미완료
    let completed = bat.updateBDA(7);
    expect(completed).toHaveLength(0);

    // 1초 더 → 완료
    completed = bat.updateBDA(1);
    expect(completed).toHaveLength(1);
    expect(completed[0].interceptorId).toBe('int_1');
  });
});

// ════════════════════════════════════════════════════════════
// 접근각 계산
// ════════════════════════════════════════════════════════════
describe('getAspectAngle', () => {
  it('위협이 사수를 향해 남하 → front', () => {
    const shooter = { lon: 127.0, lat: 37.0, alt: 150 };
    const threat = { lon: 127.0, lat: 38.0, alt: 50000 };
    const target = { lon: 127.0, lat: 36.5, alt: 0 };
    expect(getAspectAngle(shooter, threat, target)).toBe('front');
  });

  it('위협이 동서로 이동 (사수는 남쪽) → side', () => {
    const shooter = { lon: 127.0, lat: 37.0, alt: 150 };
    const threat = { lon: 126.5, lat: 38.0, alt: 10000 };
    const target = { lon: 128.0, lat: 38.0, alt: 10000 };
    expect(getAspectAngle(shooter, threat, target)).toBe('side');
  });

  it('위협이 사수에서 멀어짐 → rear', () => {
    const shooter = { lon: 127.0, lat: 37.0, alt: 150 };
    const threat = { lon: 127.0, lat: 37.5, alt: 50000 };
    const target = { lon: 127.0, lat: 39.0, alt: 0 }; // 북상
    expect(getAspectAngle(shooter, threat, target)).toBe('rear');
  });
});
