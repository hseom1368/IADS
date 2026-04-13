/**
 * tests/registry.test.js — Registry 질의 엔진 테스트
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Registry } from '../src/core/registry.js';

let reg;
beforeEach(() => { reg = new Registry(); });

// ════════════════════════════════════════════════════════════
// PSSEK 조회 테스트
// ════════════════════════════════════════════════════════════
describe('lookupPSSEK', () => {
  it('L-SAM ABM vs SRBM 정면 20-60km → 0.90', () => {
    expect(reg.lookupPSSEK('LSAM', 'ABM', 'SRBM', 40, 'front')).toBe(0.90);
  });

  it('L-SAM ABM vs SRBM 정면 60-100km → 0.85', () => {
    expect(reg.lookupPSSEK('LSAM', 'ABM', 'SRBM', 80, 'front')).toBe(0.85);
  });

  it('L-SAM ABM vs SRBM 정면 100-150km → 0.70', () => {
    expect(reg.lookupPSSEK('LSAM', 'ABM', 'SRBM', 120, 'front')).toBe(0.70);
  });

  it('L-SAM ABM vs SRBM 측면 20-60km → 0.75', () => {
    expect(reg.lookupPSSEK('LSAM', 'ABM', 'SRBM', 30, 'side')).toBe(0.75);
  });

  it('L-SAM ABM vs SRBM 추격 60-100km → 0.50', () => {
    expect(reg.lookupPSSEK('LSAM', 'ABM', 'SRBM', 70, 'rear')).toBe(0.50);
  });

  it('L-SAM AAM vs AIRCRAFT 정면 10-50km → 0.92', () => {
    expect(reg.lookupPSSEK('LSAM', 'AAM', 'AIRCRAFT', 30, 'front')).toBe(0.92);
  });

  it('L-SAM AAM vs CRUISE_MISSILE 정면 50-100km → 0.78', () => {
    expect(reg.lookupPSSEK('LSAM', 'AAM', 'CRUISE_MISSILE', 75, 'front')).toBe(0.78);
  });

  it('거리 범위 밖 → null', () => {
    expect(reg.lookupPSSEK('LSAM', 'ABM', 'SRBM', 10, 'front')).toBeNull();
    expect(reg.lookupPSSEK('LSAM', 'ABM', 'SRBM', 200, 'front')).toBeNull();
  });

  it('존재하지 않는 사수 → null', () => {
    expect(reg.lookupPSSEK('UNKNOWN', 'ABM', 'SRBM', 40, 'front')).toBeNull();
  });

  it('존재하지 않는 위협 → null', () => {
    expect(reg.lookupPSSEK('LSAM', 'ABM', 'UNKNOWN', 40, 'front')).toBeNull();
  });

  it('경계값: 정확히 20km → 0.90', () => {
    expect(reg.lookupPSSEK('LSAM', 'ABM', 'SRBM', 20, 'front')).toBe(0.90);
  });

  it('경계값: 정확히 60km → ABM front', () => {
    // 60km는 '20-60' 구간에 포함
    expect(reg.lookupPSSEK('LSAM', 'ABM', 'SRBM', 60, 'front')).toBe(0.90);
  });
});

// ════════════════════════════════════════════════════════════
// 교전 봉투 판정
// ════════════════════════════════════════════════════════════
describe('isInEnvelope', () => {
  it('L-SAM ABM 봉투 내 → true', () => {
    expect(reg.isInEnvelope('LSAM', 'ABM', { rangeKm: 80, altKm: 55 })).toBe(true);
  });

  it('L-SAM ABM 봉투 밖 (거리 초과) → false', () => {
    expect(reg.isInEnvelope('LSAM', 'ABM', { rangeKm: 200, altKm: 55 })).toBe(false);
  });

  it('L-SAM ABM 봉투 밖 (고도 미달) → false', () => {
    expect(reg.isInEnvelope('LSAM', 'ABM', { rangeKm: 80, altKm: 30 })).toBe(false);
  });

  it('L-SAM AAM 봉투 내 → true', () => {
    expect(reg.isInEnvelope('LSAM', 'AAM', { rangeKm: 50, altKm: 10 })).toBe(true);
  });

  it('경계값: Rmin 정확히 → true', () => {
    expect(reg.isInEnvelope('LSAM', 'ABM', { rangeKm: 20, altKm: 55 })).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// 센서 조회
// ════════════════════════════════════════════════════════════
describe('getSensorRanges', () => {
  it('GREEN_PINE_B → detect 900, track 600, fc null', () => {
    const r = reg.getSensorRanges('GREEN_PINE_B');
    expect(r.detect).toBe(900);
    expect(r.track).toBe(600);
    expect(r.fireControl).toBeNull();
  });

  it('LSAM_MFR ballistic → detect 310, track 250, fc 200', () => {
    const r = reg.getSensorRanges('LSAM_MFR', 'ballistic');
    expect(r.detect).toBe(310);
    expect(r.track).toBe(250);
    expect(r.fireControl).toBe(200);
  });

  it('LSAM_MFR aircraft → detect 400, track 300, fc 250', () => {
    const r = reg.getSensorRanges('LSAM_MFR', 'aircraft');
    expect(r.detect).toBe(400);
    expect(r.track).toBe(300);
    expect(r.fireControl).toBe(250);
  });
});

describe('getRcsRef', () => {
  it('GREEN_PINE_B → 0.1', () => {
    expect(reg.getRcsRef('GREEN_PINE_B')).toBe(0.1);
  });

  it('LSAM_MFR → 1.0', () => {
    expect(reg.getRcsRef('LSAM_MFR')).toBe(1.0);
  });
});

describe('getJammingSusceptibility', () => {
  it('GREEN_PINE_B L밴드 → 0.3', () => {
    expect(reg.getJammingSusceptibility('GREEN_PINE_B')).toBe(0.3);
  });

  it('LSAM_MFR S밴드 → 0.5', () => {
    expect(reg.getJammingSusceptibility('LSAM_MFR')).toBe(0.5);
  });
});

describe('hasFireControlCapability', () => {
  it('GREEN_PINE_B → false (early_warning)', () => {
    expect(reg.hasFireControlCapability('GREEN_PINE_B')).toBe(false);
  });

  it('LSAM_MFR → true (fire_control)', () => {
    expect(reg.hasFireControlCapability('LSAM_MFR')).toBe(true);
  });
});

describe('canDetect', () => {
  it('GREEN_PINE_B can detect SRBM', () => {
    expect(reg.canDetect('GREEN_PINE_B', 'SRBM')).toBe(true);
  });

  it('GREEN_PINE_B cannot detect AIRCRAFT', () => {
    expect(reg.canDetect('GREEN_PINE_B', 'AIRCRAFT')).toBe(false);
  });

  it('LSAM_MFR can detect all threat types', () => {
    expect(reg.canDetect('LSAM_MFR', 'SRBM')).toBe(true);
    expect(reg.canDetect('LSAM_MFR', 'AIRCRAFT')).toBe(true);
    expect(reg.canDetect('LSAM_MFR', 'CRUISE_MISSILE')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// 사수 우선순위
// ════════════════════════════════════════════════════════════
describe('getPrioritizedShooters', () => {
  it('SRBM → L-SAM ABM 반환', () => {
    const result = reg.getPrioritizedShooters('SRBM', { rangeKm: 80, altKm: 55 });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].shooterTypeId).toBe('LSAM');
    expect(result[0].missileType).toBe('ABM');
    expect(result[0].maxPk).toBe(0.90);
  });

  it('SRBM 봉투 밖 → 빈 배열', () => {
    const result = reg.getPrioritizedShooters('SRBM', { rangeKm: 200, altKm: 55 });
    expect(result.length).toBe(0);
  });

  it('AIRCRAFT → L-SAM AAM 반환', () => {
    const result = reg.getPrioritizedShooters('AIRCRAFT', { rangeKm: 50, altKm: 10 });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].missileType).toBe('AAM');
    expect(result[0].maxPk).toBe(0.92);
  });
});

// ════════════════════════════════════════════════════════════
// 동시교전 상한
// ════════════════════════════════════════════════════════════
describe('getSimultaneousLimit', () => {
  it('LSAM_MFR ballistic → 10', () => {
    expect(reg.getSimultaneousLimit('LSAM_MFR', 'ballistic')).toBe(10);
  });

  it('LSAM_MFR aircraft → 20', () => {
    expect(reg.getSimultaneousLimit('LSAM_MFR', 'aircraft')).toBe(20);
  });

  it('GREEN_PINE_B (no simultaneous) → Infinity', () => {
    expect(reg.getSimultaneousLimit('GREEN_PINE_B')).toBe(Infinity);
  });
});

// ════════════════════════════════════════════════════════════
// C2 처리 시간
// ════════════════════════════════════════════════════════════
describe('getC2ProcessingTime', () => {
  it('KAMD_OPS 고숙련: system 7.5 + operator 15 = 22.5', () => {
    const t = reg.getC2ProcessingTime('KAMD_OPS', 'high');
    expect(t.systemTime).toBe(7.5);
    expect(t.operatorTime).toBe(15);
    expect(t.totalTime).toBe(22.5);
  });

  it('KAMD_OPS 저숙련: operator 50', () => {
    const t = reg.getC2ProcessingTime('KAMD_OPS', 'low');
    expect(t.operatorTime).toBe(50);
  });

  it('ECS 고숙련: system 1.5 + operator 1 = 2.5', () => {
    const t = reg.getC2ProcessingTime('ECS', 'high');
    expect(t.systemTime).toBe(1.5);
    expect(t.operatorTime).toBe(1);
    expect(t.totalTime).toBe(2.5);
  });
});

// ════════════════════════════════════════════════════════════
// 토폴로지
// ════════════════════════════════════════════════════════════
describe('buildTopology', () => {
  it('linear → 5 nodes, 4 edges', () => {
    const topo = reg.buildTopology('linear');
    expect(topo.nodes).toHaveLength(5);
    expect(topo.nodes).toContain('GREEN_PINE_B');
    expect(topo.nodes).toContain('LSAM');
    expect(topo.edges).toHaveLength(4);
  });

  it('linear edges have correct delays', () => {
    const topo = reg.buildTopology('linear');
    const gpToKamd = topo.edges.find(e => e.from === 'GREEN_PINE_B' && e.to === 'KAMD_OPS');
    expect(gpToKamd.delay).toBe(16); // longRange

    const iccToEcs = topo.edges.find(e => e.from === 'ICC' && e.to === 'ECS');
    expect(iccToEcs.delay).toBe(1); // shortRange
  });

  it('killweb → empty (Phase 3)', () => {
    const topo = reg.buildTopology('killweb');
    expect(topo.nodes).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════
// 위협 조회
// ════════════════════════════════════════════════════════════
describe('threat queries', () => {
  it('getThreatInfo SRBM', () => {
    const info = reg.getThreatInfo('SRBM');
    expect(info).not.toBeNull();
    expect(info.baseSpeed).toBe(2040);
    expect(info.maxAltitude).toBe(150000);
  });

  it('getThreatRCS SRBM phase 0 → 3.0 (부스트)', () => {
    expect(reg.getThreatRCS('SRBM', 0)).toBe(3.0);
  });

  it('getThreatRCS SRBM phase 1 → 0.1 (중간)', () => {
    expect(reg.getThreatRCS('SRBM', 1)).toBe(0.1);
  });

  it('getThreatRCS SRBM phase 2 → 0.05 (종말)', () => {
    expect(reg.getThreatRCS('SRBM', 2)).toBe(0.05);
  });

  it('getEcmFactor SRBM → 0', () => {
    expect(reg.getEcmFactor('SRBM')).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════
// 미사일/포대 파라미터
// ════════════════════════════════════════════════════════════
describe('missile and battery params', () => {
  it('getMissileParams L-SAM ABM', () => {
    const p = reg.getMissileParams('LSAM', 'ABM');
    expect(p.missileSpeed).toBe(3100);
    expect(p.killRadius).toBe(50);
    expect(p.doctrine).toBe('SLS');
    expect(p.bdaDelay).toBe(8);
  });

  it('getBatteryConfig L-SAM', () => {
    const c = reg.getBatteryConfig('LSAM');
    expect(c.mfr).toBe('LSAM_MFR');
    expect(c.totalRounds.ABM).toBe(12);
    expect(c.totalRounds.AAM).toBe(12);
  });

  it('getRangeBins L-SAM ABM → 3 bins', () => {
    const bins = reg.getRangeBins('LSAM', 'ABM');
    expect(bins).toHaveLength(3);
    expect(bins[0]).toEqual({ min: 20, max: 60 });
    expect(bins[1]).toEqual({ min: 60, max: 100 });
    expect(bins[2]).toEqual({ min: 100, max: 150 });
  });

  it('getSensorTransitionTimes GREEN_PINE_B', () => {
    const t = reg.getSensorTransitionTimes('GREEN_PINE_B');
    expect(t.detectToTrack).toBe(10);
    expect(t.trackToFC).toBeUndefined();
  });

  it('getSensorTransitionTimes LSAM_MFR', () => {
    const t = reg.getSensorTransitionTimes('LSAM_MFR');
    expect(t.detectToTrack).toBe(5);
    expect(t.trackToFC).toBe(8);
  });
});
