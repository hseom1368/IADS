/**
 * @module tests/registry
 * Registry 단위 테스트 — weapon-data 기반 조회 엔진 검증
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Registry } from '../src/core/registry.js';
import {
  SHOOTER_TYPES,
  SENSOR_TYPES,
  C2_TYPES,
  THREAT_TYPES,
  TOPOLOGY_RELATIONS
} from '../src/config/weapon-data.js';

let registry;

beforeAll(() => {
  registry = new Registry({ SHOOTER_TYPES, SENSOR_TYPES, C2_TYPES, THREAT_TYPES });
});

// ═══════════════════════════════════════════════════════════
//  getPrioritizedShooters
// ═══════════════════════════════════════════════════════════

describe('getPrioritizedShooters', () => {
  it('SRBM → LSAM_ABM (Pk=0.85)', () => {
    const shooters = registry.getPrioritizedShooters('SRBM');
    expect(shooters.length).toBeGreaterThan(0);
    expect(shooters[0].typeId).toBe('LSAM_ABM');
    expect(shooters[0].pk).toBe(0.85);
  });

  it('AIRCRAFT → LSAM_AAM (Pk=0.90)', () => {
    const shooters = registry.getPrioritizedShooters('AIRCRAFT');
    expect(shooters.length).toBeGreaterThan(0);
    expect(shooters[0].typeId).toBe('LSAM_AAM');
    expect(shooters[0].pk).toBe(0.90);
  });

  it('UNKNOWN → 빈 배열', () => {
    const shooters = registry.getPrioritizedShooters('UNKNOWN');
    expect(shooters).toEqual([]);
  });

  it('CRUISE_MISSILE → LSAM_AAM (Pk=0.80)', () => {
    const shooters = registry.getPrioritizedShooters('CRUISE_MISSILE');
    expect(shooters[0].typeId).toBe('LSAM_AAM');
    expect(shooters[0].pk).toBe(0.80);
  });
});

// ═══════════════════════════════════════════════════════════
//  getDetectableThreats
// ═══════════════════════════════════════════════════════════

describe('getDetectableThreats', () => {
  it('GREEN_PINE → [SRBM] only', () => {
    const threats = registry.getDetectableThreats('GREEN_PINE');
    expect(threats).toEqual(['SRBM']);
  });

  it('MSAM_MFR → 5종 위협', () => {
    const threats = registry.getDetectableThreats('MSAM_MFR');
    expect(threats).toContain('SRBM');
    expect(threats).toContain('CRUISE_MISSILE');
    expect(threats).toContain('AIRCRAFT');
    expect(threats).toContain('MLRS_GUIDED');
    expect(threats).toContain('UAS');
    expect(threats.length).toBe(5);
  });

  it('존재하지 않는 센서 → 빈 배열', () => {
    expect(registry.getDetectableThreats('FAKE_SENSOR')).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════
//  getSensorsForC2 / getShootersForC2
// ═══════════════════════════════════════════════════════════

describe('getSensorsForC2', () => {
  it('KAMD_OPS → GREEN_PINE', () => {
    const sensors = registry.getSensorsForC2('KAMD_OPS');
    expect(sensors).toContain('GREEN_PINE');
  });

  it('ECS → MSAM_MFR', () => {
    const sensors = registry.getSensorsForC2('ECS');
    expect(sensors).toContain('MSAM_MFR');
  });
});

describe('getShootersForC2', () => {
  it('KAMD_OPS → LSAM_ABM, LSAM_AAM', () => {
    const shooters = registry.getShootersForC2('KAMD_OPS');
    expect(shooters).toContain('LSAM_ABM');
    expect(shooters).toContain('LSAM_AAM');
  });
});

// ═══════════════════════════════════════════════════════════
//  getAxisForShooter
// ═══════════════════════════════════════════════════════════

describe('getAxisForShooter', () => {
  it('LSAM_ABM → [KAMD, MCRC] 다축', () => {
    const axis = registry.getAxisForShooter('LSAM_ABM');
    expect(axis).toEqual(['KAMD', 'MCRC']);
  });

  it('존재하지 않는 사수 → null', () => {
    expect(registry.getAxisForShooter('FAKE')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
//  getShooterCapability / getSensorCapability / getThreatType / getC2Type
// ═══════════════════════════════════════════════════════════

describe('capability/type 조회', () => {
  it('getShooterCapability LSAM_ABM → maxRange=150', () => {
    const cap = registry.getShooterCapability('LSAM_ABM');
    expect(cap.maxRange).toBe(150);
    expect(cap.interceptorSpeed).toBe(1500);
  });

  it('getSensorCapability MSAM_MFR → maxRange=300', () => {
    const cap = registry.getSensorCapability('MSAM_MFR');
    expect(cap.maxRange).toBe(300);
    expect(cap.trackingCapacity).toBe(50);
  });

  it('getThreatType SRBM → speed=2040', () => {
    const threat = registry.getThreatType('SRBM');
    expect(threat.speed).toBe(2040);
  });

  it('getC2Type KAMD_OPS → simultaneousCapacity=3', () => {
    const c2 = registry.getC2Type('KAMD_OPS');
    expect(c2.simultaneousCapacity).toBe(3);
  });

  it('존재하지 않는 타입 → null', () => {
    expect(registry.getShooterCapability('FAKE')).toBeNull();
    expect(registry.getSensorCapability('FAKE')).toBeNull();
    expect(registry.getThreatType('FAKE')).toBeNull();
    expect(registry.getC2Type('FAKE')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
//  buildTopology
// ═══════════════════════════════════════════════════════════

describe('buildTopology', () => {
  it('linear → 5 노드, 4 엣지', () => {
    const topo = registry.buildTopology('linear', TOPOLOGY_RELATIONS);
    expect(topo).not.toBeNull();
    expect(topo.nodes.length).toBe(5);
    expect(topo.edges.length).toBe(4);
    expect(topo.edges[0]).toMatchObject({ from: 'GREEN_PINE', to: 'KAMD_OPS', delay: 16 });
  });

  it('killweb → 유효한 토폴로지 반환', () => {
    const topo = registry.buildTopology('killweb', TOPOLOGY_RELATIONS);
    expect(topo).not.toBeNull();
    expect(topo.nodes.length).toBeGreaterThan(0);
    expect(topo.edges.length).toBeGreaterThan(0);
  });

  it('미지 아키텍처 → null', () => {
    const topo = registry.buildTopology('unknown_arch', TOPOLOGY_RELATIONS);
    expect(topo).toBeNull();
  });

  it('topologyData 없이 호출 → null', () => {
    const topo = registry.buildTopology('linear');
    expect(topo).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
//  getPairedShooter / getSystemGroup
// ═══════════════════════════════════════════════════════════

describe('pairedSystem 관계', () => {
  it('getPairedShooter: LSAM_ABM → LSAM_AAM', () => {
    expect(registry.getPairedShooter('LSAM_ABM')).toBe('LSAM_AAM');
  });

  it('getPairedShooter: LSAM_AAM → LSAM_ABM', () => {
    expect(registry.getPairedShooter('LSAM_AAM')).toBe('LSAM_ABM');
  });

  it('getPairedShooter: 존재하지 않는 사수 → null', () => {
    expect(registry.getPairedShooter('FAKE')).toBeNull();
  });

  it('getSystemGroup: LSAM_ABM → LSAM', () => {
    expect(registry.getSystemGroup('LSAM_ABM')).toBe('LSAM');
  });

  it('getSystemGroup: LSAM_AAM → LSAM', () => {
    expect(registry.getSystemGroup('LSAM_AAM')).toBe('LSAM');
  });
});
