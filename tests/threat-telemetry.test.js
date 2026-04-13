/**
 * tests/threat-telemetry.test.js — ThreatEntity 텔레메트리 링 버퍼 + 시리즈 API 테스트
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ThreatEntity, resetEntityIdCounter } from '../src/core/entities.js';
import {
  toTimeSeries,
  timeAltitudeSeries,
  timeRangeSeries,
  timeSpeedSeries,
  exportThreatTelemetry,
  exportAllTelemetry,
  getLatestSample,
} from '../src/core/telemetry.js';

beforeEach(() => {
  resetEntityIdCounter();
});

// 테스트 헬퍼: SRBM 위협 + 궤적 스텁
function makeThreat() {
  return new ThreatEntity('SRBM',
    { lon: 127.0, lat: 39.0, alt: 0 },
    { lon: 127.0, lat: 37.0, alt: 0 });
}

function stubTrajectory(alt, speed, phase = 1) {
  return {
    position: { lon: 127.0, lat: 38.0, alt },
    speed,
    phase,
    rcsMultiplier: 1.0,
  };
}

// ════════════════════════════════════════════════════════════
// ThreatEntity 텔레메트리 필드
// ════════════════════════════════════════════════════════════
describe('ThreatEntity telemetry fields', () => {
  it('초기 상태: telemetry 빈 배열, currentSpeed=0, lastTelemetryT=-Infinity', () => {
    const threat = makeThreat();
    expect(threat.telemetry).toEqual([]);
    expect(threat.currentSpeed).toBe(0);
    expect(threat.lastTelemetryT).toBe(-Infinity);
  });

  it('updateFlight 호출 시 currentSpeed = trajectory.speed', () => {
    const threat = makeThreat();
    threat.updateFlight(0.3, stubTrajectory(55000, 2040, 1), 0.1);
    expect(threat.currentSpeed).toBe(2040);
    expect(threat.position.alt).toBe(55000);
  });

  it('updateFlight: trajectory.speed 없으면 0으로 폴백', () => {
    const threat = makeThreat();
    threat.updateFlight(0.3, { position: { lon: 127, lat: 38, alt: 50000 }, phase: 1 }, 0.1);
    expect(threat.currentSpeed).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════
// recordTelemetry
// ════════════════════════════════════════════════════════════
describe('ThreatEntity.recordTelemetry', () => {
  it('샘플 1건 기록 시 모든 필드 존재', () => {
    const threat = makeThreat();
    threat.updateFlight(0.3, stubTrajectory(55000, 2040, 1), 0.1);
    threat.recordTelemetry(12.5, 180);

    expect(threat.telemetry).toHaveLength(1);
    const s = threat.telemetry[0];
    expect(s.t).toBe(12.5);
    expect(s.alt).toBe(55000);
    expect(s.altKm).toBe(55);
    expect(s.speed).toBe(2040);
    expect(s.mach).toBeCloseTo(6.0, 1);
    expect(s.rangeToTargetKm).toBe(180);
    expect(s.progress).toBe(0.3);
    expect(s.phase).toBe(1);
    expect(s.rcs).toBe(0.1);
    expect(s.state).toBe('flying');
    expect(s.lon).toBe(127.0);
    expect(s.lat).toBe(38.0);
  });

  it('lastTelemetryT 갱신', () => {
    const threat = makeThreat();
    threat.updateFlight(0.1, stubTrajectory(10000, 1000), 1.0);
    threat.recordTelemetry(5.0, 200);
    expect(threat.lastTelemetryT).toBe(5.0);

    threat.recordTelemetry(10.0, 190);
    expect(threat.lastTelemetryT).toBe(10.0);
  });

  it('링 버퍼: maxSamples 초과 시 가장 오래된 샘플 삭제', () => {
    const threat = makeThreat();
    threat.updateFlight(0.1, stubTrajectory(10000, 1000), 1.0);

    // maxSamples=3으로 4건 기록
    threat.recordTelemetry(1.0, 200, 3);
    threat.recordTelemetry(2.0, 190, 3);
    threat.recordTelemetry(3.0, 180, 3);
    threat.recordTelemetry(4.0, 170, 3);

    expect(threat.telemetry).toHaveLength(3);
    // 가장 오래된 것(t=1.0)은 삭제됨
    expect(threat.telemetry[0].t).toBe(2.0);
    expect(threat.telemetry[2].t).toBe(4.0);
  });

  it('기본 maxSamples=600 적용', () => {
    const threat = makeThreat();
    threat.updateFlight(0.1, stubTrajectory(10000, 1000), 1.0);
    for (let i = 0; i < 700; i++) {
      threat.recordTelemetry(i * 0.5, 200 - i * 0.1);
    }
    expect(threat.telemetry).toHaveLength(600);
    // 가장 오래된 100개가 삭제됨 → 첫 샘플 t = 100 * 0.5 = 50
    expect(threat.telemetry[0].t).toBe(50);
  });
});

// ════════════════════════════════════════════════════════════
// telemetry.js 시리즈 API
// ════════════════════════════════════════════════════════════
describe('telemetry series API', () => {
  function populateThreat() {
    const threat = makeThreat();
    const points = [
      { t: 0, alt: 0, speed: 100, range: 300 },
      { t: 0.5, alt: 10000, speed: 500, range: 290 },
      { t: 1.0, alt: 30000, speed: 1500, range: 270 },
      { t: 1.5, alt: 55000, speed: 2040, range: 240 },
    ];
    for (const p of points) {
      threat.updateFlight(0.1, stubTrajectory(p.alt, p.speed), 0.1);
      threat.recordTelemetry(p.t, p.range);
    }
    return threat;
  }

  it('toTimeSeries: 임의 필드 추출', () => {
    const threat = populateThreat();
    const s = toTimeSeries(threat, 'altKm');
    expect(s.t).toEqual([0, 0.5, 1.0, 1.5]);
    expect(s.y).toEqual([0, 10, 30, 55]);
  });

  it('toTimeSeries: 빈 위협 → 빈 시리즈', () => {
    const threat = makeThreat();
    const s = toTimeSeries(threat, 'altKm');
    expect(s.t).toEqual([]);
    expect(s.y).toEqual([]);
  });

  it('toTimeSeries: null 방어', () => {
    const s = toTimeSeries(null, 'altKm');
    expect(s).toEqual({ t: [], y: [] });
  });

  it('timeAltitudeSeries: 시간-고도 (km)', () => {
    const threat = populateThreat();
    const s = timeAltitudeSeries(threat);
    expect(s.y).toEqual([0, 10, 30, 55]);
  });

  it('timeRangeSeries: 시간-잔여거리 (단조 감소)', () => {
    const threat = populateThreat();
    const s = timeRangeSeries(threat);
    expect(s.y).toEqual([300, 290, 270, 240]);
    // 단조 감소 검증
    for (let i = 1; i < s.y.length; i++) {
      expect(s.y[i]).toBeLessThan(s.y[i - 1]);
    }
  });

  it('timeSpeedSeries: 시간-Mach', () => {
    const threat = populateThreat();
    const s = timeSpeedSeries(threat);
    expect(s.y[0]).toBeCloseTo(100 / 340, 3);
    expect(s.y[3]).toBeCloseTo(2040 / 340, 3);
  });

  it('exportThreatTelemetry: 독립 복사본 반환', () => {
    const threat = populateThreat();
    const exp = exportThreatTelemetry(threat);
    expect(exp.id).toBe(threat.id);
    expect(exp.typeId).toBe('SRBM');
    expect(exp.samples).toHaveLength(4);
    // 원본 수정이 export에 영향 없음 (깊은 복사)
    threat.telemetry[0].altKm = 999;
    expect(exp.samples[0].altKm).toBe(0);
  });

  it('exportAllTelemetry: 다중 위협', () => {
    const t1 = populateThreat();
    const t2 = populateThreat();
    const all = exportAllTelemetry([t1, t2]);
    expect(all).toHaveLength(2);
    expect(all[0].samples).toHaveLength(4);
    expect(all[1].samples).toHaveLength(4);
  });

  it('getLatestSample: 최근 샘플 반환', () => {
    const threat = populateThreat();
    const latest = getLatestSample(threat);
    expect(latest.t).toBe(1.5);
    expect(latest.altKm).toBe(55);
  });

  it('getLatestSample: 빈 위협 → null', () => {
    const threat = makeThreat();
    expect(getLatestSample(threat)).toBeNull();
    expect(getLatestSample(null)).toBeNull();
  });
});
