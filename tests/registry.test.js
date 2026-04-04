/**
 * @file Phase 1.2 Registry 쿼리 엔진 테스트
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Registry } from '../src/core/registry.js';
import {
  SHOOTER_TYPES,
  SENSOR_TYPES,
  C2_TYPES,
  THREAT_TYPES
} from '../src/config/weapon-data.js';

describe('Phase 1.2: Registry', () => {
  let registry;

  beforeEach(() => {
    registry = new Registry({ SHOOTER_TYPES, SENSOR_TYPES, C2_TYPES, THREAT_TYPES });
  });

  describe('생성자', () => {
    it('weapon-data를 로드하여 인스턴스를 생성해야 한다', () => {
      expect(registry).toBeDefined();
    });
  });

  describe('getPrioritizedShooters', () => {
    it('SRBM에 대해 Pk>0인 사수를 반환해야 한다', () => {
      const shooters = registry.getPrioritizedShooters('SRBM');
      expect(shooters.length).toBeGreaterThan(0);
    });

    it('L-SAM_ABM이 SRBM 사수 목록에 포함되어야 한다', () => {
      const shooters = registry.getPrioritizedShooters('SRBM');
      const lsam = shooters.find(s => s.typeId === 'LSAM_ABM');
      expect(lsam).toBeDefined();
      expect(lsam.pk).toBe(0.85);
    });

    it('Pk 내림차순으로 정렬되어야 한다', () => {
      const shooters = registry.getPrioritizedShooters('SRBM');
      for (let i = 1; i < shooters.length; i++) {
        expect(shooters[i].pk).toBeLessThanOrEqual(shooters[i - 1].pk);
      }
    });

    it('존재하지 않는 위협 타입은 빈 배열을 반환해야 한다', () => {
      const shooters = registry.getPrioritizedShooters('NONEXISTENT');
      expect(shooters).toEqual([]);
    });
  });

  describe('getDetectableThreats', () => {
    it('MSAM_MFR가 SRBM을 탐지할 수 있어야 한다', () => {
      const threats = registry.getDetectableThreats('MSAM_MFR');
      expect(threats).toContain('SRBM');
    });

    it('MSAM_MFR가 5종 위협을 모두 탐지할 수 있어야 한다', () => {
      const threats = registry.getDetectableThreats('MSAM_MFR');
      expect(threats.length).toBe(5);
    });

    it('GREEN_PINE는 SRBM만 탐지할 수 있어야 한다', () => {
      const threats = registry.getDetectableThreats('GREEN_PINE');
      expect(threats).toEqual(['SRBM']);
    });

    it('존재하지 않는 센서는 빈 배열을 반환해야 한다', () => {
      const threats = registry.getDetectableThreats('NONEXISTENT');
      expect(threats).toEqual([]);
    });
  });

  describe('getAxisForShooter', () => {
    it('LSAM_ABM은 KAMD 축이어야 한다', () => {
      expect(registry.getAxisForShooter('LSAM_ABM')).toBe('KAMD');
    });

    it('존재하지 않는 사수는 null을 반환해야 한다', () => {
      expect(registry.getAxisForShooter('NONEXISTENT')).toBeNull();
    });
  });

  describe('getShooterCapability', () => {
    it('LSAM_ABM의 capability를 반환해야 한다', () => {
      const cap = registry.getShooterCapability('LSAM_ABM');
      expect(cap.maxRange).toBe(150);
      expect(cap.ammoCount).toBe(6);
    });

    it('존재하지 않는 사수는 null을 반환해야 한다', () => {
      expect(registry.getShooterCapability('NONEXISTENT')).toBeNull();
    });
  });

  describe('getSensorCapability', () => {
    it('MSAM_MFR의 capability를 반환해야 한다', () => {
      const cap = registry.getSensorCapability('MSAM_MFR');
      expect(cap.maxRange).toBe(100);
      expect(cap.trackingCapacity).toBe(50);
    });
  });

  describe('getThreatType', () => {
    it('SRBM 타입 정보를 반환해야 한다', () => {
      const t = registry.getThreatType('SRBM');
      expect(t.speed).toBe(2040);
      expect(t.flightProfile.type).toBe('ballistic');
    });

    it('존재하지 않는 위협은 null을 반환해야 한다', () => {
      expect(registry.getThreatType('NONEXISTENT')).toBeNull();
    });
  });

  describe('getSensorsForC2', () => {
    it('KAMD_OPS에 GREEN_PINE가 연결되어야 한다', () => {
      const sensors = registry.getSensorsForC2('KAMD_OPS');
      expect(sensors).toContain('GREEN_PINE');
    });
  });

  describe('getShootersForC2', () => {
    it('KAMD_OPS에 LSAM_ABM이 연결되어야 한다', () => {
      const shooters = registry.getShootersForC2('KAMD_OPS');
      expect(shooters).toContain('LSAM_ABM');
    });
  });
});
