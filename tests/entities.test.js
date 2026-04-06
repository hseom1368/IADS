/**
 * @module tests/entities
 * 엔티티 클래스 단위 테스트 — 런타임 인스턴스 동작 검증
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Registry } from '../src/core/registry.js';
import {
  SHOOTER_TYPES,
  SENSOR_TYPES,
  C2_TYPES,
  THREAT_TYPES
} from '../src/config/weapon-data.js';
import {
  BaseEntity,
  ShooterEntity,
  SensorEntity,
  C2Entity,
  ThreatEntity,
  InterceptorEntity
} from '../src/core/entities.js';

let registry;

beforeEach(() => {
  registry = new Registry({ SHOOTER_TYPES, SENSOR_TYPES, C2_TYPES, THREAT_TYPES });
});

const POS_SEOUL = { lon: 127.0, lat: 37.0, alt: 100 };

// ═══════════════════════════════════════════════════════════
//  BaseEntity
// ═══════════════════════════════════════════════════════════

describe('BaseEntity', () => {
  it('생성자: id, typeId, position, operational=true', () => {
    const e = new BaseEntity('e1', 'TEST', POS_SEOUL);
    expect(e.id).toBe('e1');
    expect(e.typeId).toBe('TEST');
    expect(e.position.lon).toBe(127.0);
    expect(e.operational).toBe(true);
  });

  it('position은 원본 참조가 아닌 복사본', () => {
    const pos = { lon: 127.0, lat: 37.0, alt: 100 };
    const e = new BaseEntity('e1', 'TEST', pos);
    pos.lon = 999;
    expect(e.position.lon).toBe(127.0);
  });
});

// ═══════════════════════════════════════════════════════════
//  ShooterEntity
// ═══════════════════════════════════════════════════════════

describe('ShooterEntity', () => {
  it('ammo 초기화: LSAM_ABM → 6발', () => {
    const s = new ShooterEntity('s1', 'LSAM_ABM', POS_SEOUL, registry);
    expect(s.currentAmmo).toBe(6);
    expect(s.status).toBe('ready');
  });

  it('canEngage: SRBM → true (LSAM_ABM)', () => {
    const s = new ShooterEntity('s1', 'LSAM_ABM', POS_SEOUL, registry);
    expect(s.canEngage('SRBM')).toBe(true);
  });

  it('canEngage: AIRCRAFT → false (LSAM_ABM은 SRBM만)', () => {
    const s = new ShooterEntity('s1', 'LSAM_ABM', POS_SEOUL, registry);
    expect(s.canEngage('AIRCRAFT')).toBe(false);
  });

  it('canEngage: AIRCRAFT → true (LSAM_AAM)', () => {
    const s = new ShooterEntity('s1', 'LSAM_AAM', POS_SEOUL, registry);
    expect(s.canEngage('AIRCRAFT')).toBe(true);
  });

  it('fire: ammo 감소, status → engaged', () => {
    const s = new ShooterEntity('s1', 'LSAM_ABM', POS_SEOUL, registry);
    s.fire('threat1');
    expect(s.currentAmmo).toBe(5);
    expect(s.status).toBe('engaged');
    expect(s.engagedTarget.threatId).toBe('threat1');
  });

  it('ammo 소진 → out_of_ammo, canEngage → false', () => {
    const s = new ShooterEntity('s1', 'LSAM_ABM', POS_SEOUL, registry);
    for (let i = 0; i < 6; i++) s.fire(`t${i}`);
    expect(s.currentAmmo).toBe(0);
    expect(s.status).toBe('out_of_ammo');
    expect(s.canEngage('SRBM')).toBe(false);
  });

  // ── Phase 1.2 추가 속성 ──

  it('engagementHistory 초기값 빈 배열', () => {
    const s = new ShooterEntity('s1', 'LSAM_ABM', POS_SEOUL, registry);
    expect(s.engagementHistory).toEqual([]);
  });

  it('pairedShooterId 초기값 null', () => {
    const s = new ShooterEntity('s1', 'LSAM_ABM', POS_SEOUL, registry);
    expect(s.pairedShooterId).toBeNull();
  });

  it('pairedShooterId 설정 가능', () => {
    const s1 = new ShooterEntity('s1', 'LSAM_ABM', POS_SEOUL, registry);
    const s2 = new ShooterEntity('s2', 'LSAM_AAM', POS_SEOUL, registry);
    s1.pairedShooterId = s2.id;
    expect(s1.pairedShooterId).toBe('s2');
  });
});

// ═══════════════════════════════════════════════════════════
//  SensorEntity
// ═══════════════════════════════════════════════════════════

describe('SensorEntity', () => {
  it('canDetect: MSAM_MFR → SRBM=true, UNKNOWN=false', () => {
    const s = new SensorEntity('sen1', 'MSAM_MFR', POS_SEOUL, registry);
    expect(s.canDetect('SRBM')).toBe(true);
    expect(s.canDetect('UNKNOWN')).toBe(false);
  });

  it('canDetect: GREEN_PINE → SRBM=true, AIRCRAFT=false', () => {
    const s = new SensorEntity('sen1', 'GREEN_PINE', POS_SEOUL, registry);
    expect(s.canDetect('SRBM')).toBe(true);
    expect(s.canDetect('AIRCRAFT')).toBe(false);
  });

  it('addDetection → detectedThreats에 추가', () => {
    const s = new SensorEntity('sen1', 'MSAM_MFR', POS_SEOUL, registry);
    s.addDetection('t1', 'SRBM', 10.0);
    expect(s.detectedThreats.length).toBe(1);
    expect(s.detectedThreats[0].threatId).toBe('t1');
    expect(s.detectedThreats[0].firstDetectedTime).toBe(10.0);
  });

  it('addDetection 중복 → 기존 항목 lastUpdated 갱신', () => {
    const s = new SensorEntity('sen1', 'MSAM_MFR', POS_SEOUL, registry);
    s.addDetection('t1', 'SRBM', 10.0);
    s.addDetection('t1', 'SRBM', 15.0);
    expect(s.detectedThreats.length).toBe(1);
    expect(s.detectedThreats[0].lastUpdated).toBe(15.0);
  });

  it('clearDetection → 해당 위협 제거', () => {
    const s = new SensorEntity('sen1', 'MSAM_MFR', POS_SEOUL, registry);
    s.addDetection('t1', 'SRBM', 10.0);
    s.addDetection('t2', 'AIRCRAFT', 12.0);
    s.clearDetection('t1');
    expect(s.detectedThreats.length).toBe(1);
    expect(s.detectedThreats[0].threatId).toBe('t2');
  });
});

// ═══════════════════════════════════════════════════════════
//  C2Entity
// ═══════════════════════════════════════════════════════════

describe('C2Entity', () => {
  it('receiveTrack → pendingTracks에 추가', () => {
    const c = new C2Entity('c1', 'KAMD_OPS', POS_SEOUL, registry);
    c.receiveTrack('t1', 5.0);
    expect(c.pendingTracks.length).toBe(1);
    expect(c.pendingTracks[0].threatId).toBe('t1');
    expect(c.pendingTracks[0].receivedTime).toBe(5.0);
    expect(c.pendingTracks[0].status).toBe('pending');
  });

  it('중복 receiveTrack → 추가 안됨', () => {
    const c = new C2Entity('c1', 'KAMD_OPS', POS_SEOUL, registry);
    c.receiveTrack('t1', 5.0);
    c.receiveTrack('t1', 10.0);
    expect(c.pendingTracks.length).toBe(1);
  });

  it('activeProcessingCount 초기값 0', () => {
    const c = new C2Entity('c1', 'KAMD_OPS', POS_SEOUL, registry);
    expect(c.activeProcessingCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
//  ThreatEntity
// ═══════════════════════════════════════════════════════════

describe('ThreatEntity', () => {
  const config = {
    origin: { lon: 125.0, lat: 39.0, alt: 0 },
    target: { lon: 127.0, lat: 37.0, alt: 0 },
    launchTime: 0
  };

  it('초기 상태 → launched, flightProgress=0', () => {
    const t = new ThreatEntity('t1', 'SRBM', config, registry);
    expect(t.state).toBe('launched');
    expect(t.flightProgress).toBe(0);
  });

  it('getCurrentPhase: progress=0 → phase 0 (boost)', () => {
    const t = new ThreatEntity('t1', 'SRBM', config, registry);
    t.flightProgress = 0.1;
    expect(t.getCurrentPhase()).toBe(0);
  });

  it('getCurrentPhase: progress=0.5 → phase 1 (midcourse)', () => {
    const t = new ThreatEntity('t1', 'SRBM', config, registry);
    t.flightProgress = 0.5;
    expect(t.getCurrentPhase()).toBe(1);
  });

  it('getCurrentPhase: progress=0.85 → phase 2 (terminal)', () => {
    const t = new ThreatEntity('t1', 'SRBM', config, registry);
    t.flightProgress = 0.85;
    expect(t.getCurrentPhase()).toBe(2);
  });

  it('getCurrentSpeedMult: boost phase 시작 → 0.5', () => {
    const t = new ThreatEntity('t1', 'SRBM', config, registry);
    t.flightProgress = 0.0;
    expect(t.getCurrentSpeedMult()).toBeCloseTo(0.5, 1);
  });

  it('getCurrentSpeedMult: terminal phase 끝 → 1.5', () => {
    const t = new ThreatEntity('t1', 'SRBM', config, registry);
    t.flightProgress = 1.0;
    expect(t.getCurrentSpeedMult()).toBeCloseTo(1.5, 1);
  });

  it('isTerminal: progress=0.85 → true', () => {
    const t = new ThreatEntity('t1', 'SRBM', config, registry);
    t.flightProgress = 0.85;
    expect(t.isTerminal()).toBe(true);
  });

  it('isTerminal: progress=0.5 → false', () => {
    const t = new ThreatEntity('t1', 'SRBM', config, registry);
    t.flightProgress = 0.5;
    expect(t.isTerminal()).toBe(false);
  });

  it('isManeuvering: terminal phase → true', () => {
    const t = new ThreatEntity('t1', 'SRBM', config, registry);
    t.flightProgress = 0.85;
    expect(t.isManeuvering()).toBe(true);
  });

  it('isManeuvering: midcourse phase → false', () => {
    const t = new ThreatEntity('t1', 'SRBM', config, registry);
    t.flightProgress = 0.5;
    expect(t.isManeuvering()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
//  InterceptorEntity
// ═══════════════════════════════════════════════════════════

describe('InterceptorEntity', () => {
  const config = {
    position: { lon: 127.0, lat: 37.0, alt: 100 },
    speed: 1500,
    boostTime: 2.0,
    navConstant: 4.5,
    targetThreatId: 't1',
    shooterId: 's1',
    killRadius: 0.05,
    warheadEffectiveness: 0.95,
    interceptMethod: 'hit-to-kill'
  };

  it('초기 상태 → boost', () => {
    const i = new InterceptorEntity('i1', config);
    expect(i.state).toBe('boost');
    expect(i.isInBoost()).toBe(true);
  });

  it('updateBoost → boostTime 소진 후 guidance 전환', () => {
    const i = new InterceptorEntity('i1', config);
    i.updateBoost(1.0);
    expect(i.state).toBe('boost');
    expect(i.boostTimeRemaining).toBe(1.0);
    i.updateBoost(1.5);
    expect(i.state).toBe('guidance');
    expect(i.boostTimeRemaining).toBe(0);
  });

  // ── Phase 1.2 추가 속성 ──

  it('killRadius → weapon-data에서 가져온 값', () => {
    const i = new InterceptorEntity('i1', config);
    expect(i.killRadius).toBe(0.05);
  });

  it('warheadEffectiveness → weapon-data에서 가져온 값', () => {
    const i = new InterceptorEntity('i1', config);
    expect(i.warheadEffectiveness).toBe(0.95);
  });

  it('interceptMethod → hit-to-kill', () => {
    const i = new InterceptorEntity('i1', config);
    expect(i.interceptMethod).toBe('hit-to-kill');
  });

  it('guided 요격 미사일 속성', () => {
    const guidedConfig = {
      ...config,
      speed: 1200,
      navConstant: 4.0,
      killRadius: 0.5,
      warheadEffectiveness: 0.75,
      interceptMethod: 'guided'
    };
    const i = new InterceptorEntity('i2', guidedConfig);
    expect(i.killRadius).toBe(0.5);
    expect(i.warheadEffectiveness).toBe(0.75);
    expect(i.interceptMethod).toBe('guided');
  });
});
