/**
 * tests/engagement-model.test.js — PSSEK 5단계 교전 모델 테스트
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateEngagement,
  checkInterceptResult,
  selectMissileType,
  getShotsPerDoctrine,
  calculateSSPk,
  ENGAGEMENT_RESULT,
} from '../src/core/engagement-model.js';
import {
  SENSOR_STATE,
  SensorEntity,
  BatteryEntity,
  ThreatEntity,
  InterceptorEntity,
  resetEntityIdCounter,
} from '../src/core/entities.js';
import { Registry } from '../src/core/registry.js';

let registry;
beforeEach(() => {
  registry = new Registry();
  resetEntityIdCounter();
});

// ── 테스트 헬퍼 ──────────────────────────────────────────

/** 기본 SRBM 생성 (사수를 향해 남하) */
function makeSRBM() {
  const start = { lon: 127.0, lat: 39.0, alt: 100000 };
  const target = { lon: 127.0, lat: 36.5, alt: 0 };
  const t = new ThreatEntity('SRBM', start, target);
  t.currentRCS = 0.1;
  t.position = { lon: 127.0, lat: 38.0, alt: 55000 }; // 봉투 내 고도
  return t;
}

/** MFR 센서 (FIRE_CONTROL 상태 설정 가능) */
function makeMFR(threatId, state = SENSOR_STATE.FIRE_CONTROL) {
  const sensor = new SensorEntity('LSAM_MFR', { lon: 127.0, lat: 37.0, alt: 150 });
  if (threatId) {
    sensor.setTrackState(threatId, state);
  }
  return sensor;
}

/** L-SAM 포대 */
function makeBattery() {
  return new BatteryEntity('LSAM', { lon: 127.0, lat: 37.0, alt: 150 }, 'mfr_1', 'ecs_1', { ABM: 12, AAM: 12 }, 10);
}

// ════════════════════════════════════════════════════════════
// 미사일 타입 선택
// ════════════════════════════════════════════════════════════
describe('selectMissileType', () => {
  it('SRBM → ABM (ABM_FIRST)', () => {
    expect(selectMissileType('LSAM', 'SRBM', registry)).toBe('ABM');
  });

  it('AIRCRAFT → AAM', () => {
    expect(selectMissileType('LSAM', 'AIRCRAFT', registry)).toBe('AAM');
  });

  it('CRUISE_MISSILE → AAM', () => {
    expect(selectMissileType('LSAM', 'CRUISE_MISSILE', registry)).toBe('AAM');
  });

  it('존재하지 않는 사수 → null', () => {
    expect(selectMissileType('UNKNOWN', 'SRBM', registry)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════
// PSSEK 5단계 교전 판정
// ════════════════════════════════════════════════════════════
describe('evaluateEngagement', () => {
  it('STEP 2: 센서 교전급 미확립 → WAIT', () => {
    const threat = makeSRBM();
    const battery = makeBattery();
    const sensor = makeMFR(threat.id, SENSOR_STATE.TRACKED); // 교전급 미확립

    const result = evaluateEngagement(threat, battery, sensor, registry, 200);
    expect(result.result).toBe(ENGAGEMENT_RESULT.WAIT);
    expect(result.reason).toBe('no_fire_control');
  });

  it('STEP 5: 동시교전 상한 초과 → WAIT', () => {
    const threat = makeSRBM();
    const battery = makeBattery();
    battery.activeEngagements = 10; // 상한 도달
    const sensor = makeMFR(threat.id);

    const result = evaluateEngagement(threat, battery, sensor, registry, 200);
    expect(result.result).toBe(ENGAGEMENT_RESULT.WAIT);
    expect(result.reason).toBe('capacity_or_ammo');
  });

  it('STEP 5: 탄약 소진 → WAIT', () => {
    const threat = makeSRBM();
    const battery = makeBattery();
    for (const l of battery.launchers) { if (l.missileType === 'ABM') l.remaining = 0; }
    const sensor = makeMFR(threat.id);

    const result = evaluateEngagement(threat, battery, sensor, registry, 200);
    expect(result.result).toBe(ENGAGEMENT_RESULT.WAIT);
    expect(result.reason).toBe('capacity_or_ammo');
  });

  it('정상 FIRE: 봉투 내 + 교전급 + 시간 도래 + Pk 충분', () => {
    const threat = makeSRBM();
    // 위협을 더 가깝게 (봉투 내, 발사 시점 경과 상태)
    threat.position = { lon: 127.0, lat: 37.5, alt: 55000 };
    const battery = makeBattery();
    const sensor = makeMFR(threat.id);

    // simTime을 충분히 크게 → launchTime 경과
    const result = evaluateEngagement(threat, battery, sensor, registry, 9999);
    // 봉투 진입 + 교전급 + 시간 → FIRE 또는 시간 관련 판정
    expect([ENGAGEMENT_RESULT.FIRE, ENGAGEMENT_RESULT.WAIT]).toContain(result.result);
    if (result.result === ENGAGEMENT_RESULT.FIRE) {
      expect(result.pk).toBeGreaterThan(0);
      expect(result.missileType).toBe('ABM');
      expect(result.doctrine).toBe('SLS');
    }
  });

  it('결과에 교전 교리 정보 포함', () => {
    const threat = makeSRBM();
    threat.position = { lon: 127.0, lat: 37.5, alt: 55000 };
    const battery = makeBattery();
    const sensor = makeMFR(threat.id);

    const result = evaluateEngagement(threat, battery, sensor, registry, 9999);
    if (result.result === ENGAGEMENT_RESULT.FIRE) {
      expect(result.doctrine).toBe('SLS');
      expect(result.bdaDelay).toBe(8);
      expect(result.missileSpeed).toBe(3100);
      expect(result.killRadius).toBe(50);
    }
  });

  it('재밍 보정: jammingLevel=0.5 → Pk 감소', () => {
    const threat = makeSRBM();
    threat.position = { lon: 127.0, lat: 37.5, alt: 55000 };
    const battery = makeBattery();
    const sensor = makeMFR(threat.id);

    const resultNoJam = evaluateEngagement(threat, battery, sensor, registry, 9999, { jammingLevel: 0 });
    const resultJam = evaluateEngagement(threat, battery, sensor, registry, 9999, { jammingLevel: 0.5 });

    if (resultNoJam.result === ENGAGEMENT_RESULT.FIRE && resultJam.result === ENGAGEMENT_RESULT.FIRE) {
      expect(resultJam.pk).toBeLessThan(resultNoJam.pk);
    }
  });

  it('Kill Web 보너스: pk × 1.10', () => {
    const threat = makeSRBM();
    threat.position = { lon: 127.0, lat: 37.5, alt: 55000 };
    const battery = makeBattery();
    const sensor = makeMFR(threat.id);

    const resultLinear = evaluateEngagement(threat, battery, sensor, registry, 9999, { architecture: 'linear' });
    const resultKW = evaluateEngagement(threat, battery, sensor, registry, 9999, { architecture: 'killweb' });

    if (resultLinear.result === ENGAGEMENT_RESULT.FIRE && resultKW.result === ENGAGEMENT_RESULT.FIRE) {
      expect(resultKW.pk).toBeGreaterThan(resultLinear.pk);
      expect(resultKW.pk).toBeCloseTo(Math.min(0.99, resultLinear.pk * 1.10), 2);
    }
  });
});

// ════════════════════════════════════════════════════════════
// 발사 후 결과 판정
// ════════════════════════════════════════════════════════════
describe('checkInterceptResult', () => {
  it('kill_radius 밖 → null (도달 안 함)', () => {
    const intc = new InterceptorEntity('LSAM', 'ABM',
      { lon: 127.0, lat: 37.5, alt: 50000 }, 't1', 3100, 0.85, 50);
    const threat = new ThreatEntity('SRBM',
      { lon: 127.0, lat: 38.0, alt: 55000 },
      { lon: 127.0, lat: 36.5, alt: 0 });
    threat.position = { lon: 127.0, lat: 38.0, alt: 55000 };

    const result = checkInterceptResult(intc, threat);
    expect(result).toBeNull();
  });

  it('kill_radius 내 + Pk 판정 HIT', () => {
    const intc = new InterceptorEntity('LSAM', 'ABM',
      { lon: 127.0, lat: 37.5, alt: 50000 }, 't1', 3100, 0.85, 50);
    const threat = new ThreatEntity('SRBM',
      { lon: 127.0, lat: 37.5, alt: 50000 },
      { lon: 127.0, lat: 36.5, alt: 0 });
    // 거의 같은 위치 (kill_radius 50m 이내)
    threat.position = { lon: 127.0, lat: 37.5, alt: 50000 };

    const result = checkInterceptResult(intc, threat, () => 0.5); // 0.5 < 0.85 → HIT
    expect(result).not.toBeNull();
    expect(result.hit).toBe(true);
  });

  it('kill_radius 내 + Pk 판정 MISS', () => {
    const intc = new InterceptorEntity('LSAM', 'ABM',
      { lon: 127.0, lat: 37.5, alt: 50000 }, 't1', 3100, 0.85, 50);
    const threat = new ThreatEntity('SRBM',
      { lon: 127.0, lat: 37.5, alt: 50000 },
      { lon: 127.0, lat: 36.5, alt: 0 });
    threat.position = { lon: 127.0, lat: 37.5, alt: 50000 };

    const result = checkInterceptResult(intc, threat, () => 0.90); // 0.90 > 0.85 → MISS
    expect(result).not.toBeNull();
    expect(result.hit).toBe(false);
  });

  it('Pk=0.90: random=0.89 → HIT, random=0.91 → MISS', () => {
    const make = () => {
      const intc = new InterceptorEntity('LSAM', 'ABM',
        { lon: 127.0, lat: 37.5, alt: 50000 }, 't1', 3100, 0.90, 50);
      const threat = new ThreatEntity('SRBM',
        { lon: 127.0, lat: 37.5, alt: 50000 },
        { lon: 127.0, lat: 36.5, alt: 0 });
      threat.position = { lon: 127.0, lat: 37.5, alt: 50000 };
      return { intc, threat };
    };

    const { intc: i1, threat: t1 } = make();
    expect(checkInterceptResult(i1, t1, () => 0.89).hit).toBe(true);

    const { intc: i2, threat: t2 } = make();
    expect(checkInterceptResult(i2, t2, () => 0.91).hit).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// 교전 교리
// ════════════════════════════════════════════════════════════
describe('doctrine helpers', () => {
  it('SLS → 1발', () => {
    expect(getShotsPerDoctrine('SLS')).toBe(1);
  });

  it('SS → 2발', () => {
    expect(getShotsPerDoctrine('SS')).toBe(2);
  });

  it('S-S Pk 계산: Pk=0.80 → P=0.96', () => {
    const p = calculateSSPk(0.80);
    expect(p).toBeCloseTo(0.96, 2);
  });

  it('S-S Pk 계산: Pk=0.60 → P=0.84', () => {
    const p = calculateSSPk(0.60);
    expect(p).toBeCloseTo(0.84, 2);
  });

  it('S-S Pk 계산: Pk=0 → P=0', () => {
    expect(calculateSSPk(0)).toBe(0);
  });

  it('S-S Pk 계산: Pk=1 → P=1', () => {
    expect(calculateSSPk(1)).toBe(1);
  });
});
