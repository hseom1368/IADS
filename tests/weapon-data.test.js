/**
 * @file Phase 1.2 weapon-data 타입 레지스트리 테스트
 */
import { describe, it, expect } from 'vitest';
import {
  SHOOTER_TYPES,
  SENSOR_TYPES,
  C2_TYPES,
  THREAT_TYPES
} from '../src/config/weapon-data.js';

describe('Phase 1.2: weapon-data.js', () => {

  describe('SHOOTER_TYPES.LSAM_ABM', () => {
    const lsam = SHOOTER_TYPES.LSAM_ABM;

    it('타입이 존재해야 한다', () => {
      expect(lsam).toBeDefined();
    });

    it('name이 정의되어야 한다', () => {
      expect(lsam.name).toBeTruthy();
    });

    it('capability가 올바른 필드를 가져야 한다', () => {
      const c = lsam.capability;
      expect(c.maxRange).toBe(150);
      expect(c.minRange).toBe(20);
      expect(c.maxAlt).toBe(60);
      expect(c.minAlt).toBe(40);
      expect(c.ammoCount).toBe(6);
      expect(c.interceptMethod).toBe('hit-to-kill');
    });

    it('pkTable에 SRBM Pk=0.85가 정의되어야 한다', () => {
      expect(lsam.capability.pkTable.SRBM).toBe(0.85);
    });

    it('요격미사일 파라미터가 정의되어야 한다', () => {
      expect(lsam.capability.interceptorSpeed).toBeGreaterThan(0);
      expect(lsam.capability.boostTime).toBeGreaterThan(0);
      expect(lsam.capability.navConstant).toBeGreaterThan(0);
    });

    it('relations가 올바르게 정의되어야 한다', () => {
      expect(lsam.relations.reportingC2).toBe('KAMD_OPS');
      expect(lsam.relations.engageableThreats).toContain('SRBM');
      expect(lsam.relations.requiredSensors).toContain('MSAM_MFR');
      expect(lsam.relations.c2Axis).toBe('KAMD');
    });
  });

  describe('SENSOR_TYPES', () => {
    it('MSAM_MFR가 존재해야 한다', () => {
      expect(SENSOR_TYPES.MSAM_MFR).toBeDefined();
    });

    it('MSAM_MFR capability가 올바른 필드를 가져야 한다', () => {
      const c = SENSOR_TYPES.MSAM_MFR.capability;
      expect(c.maxRange).toBe(100);
      expect(c.trackingCapacity).toBe(50);
      expect(c.scanRate).toBe(30);
      expect(c.minDetectionAltitude).toBe(30);
      expect(c.fov.azHalf).toBeGreaterThan(0);
      expect(c.fov.elMax).toBeGreaterThan(0);
      expect(c.detectableThreats).toContain('SRBM');
    });

    it('GREEN_PINE가 존재해야 한다', () => {
      expect(SENSOR_TYPES.GREEN_PINE).toBeDefined();
      expect(SENSOR_TYPES.GREEN_PINE.capability.maxRange).toBe(800);
      expect(SENSOR_TYPES.GREEN_PINE.capability.minDetectionAltitude).toBe(10000);
    });

    it('MSAM_MFR relations가 정의되어야 한다', () => {
      expect(SENSOR_TYPES.MSAM_MFR.relations.reportingC2).toBeTruthy();
      expect(SENSOR_TYPES.MSAM_MFR.relations.role).toBeTruthy();
    });
  });

  describe('THREAT_TYPES.SRBM', () => {
    const srbm = THREAT_TYPES.SRBM;

    it('타입이 존재해야 한다', () => {
      expect(srbm).toBeDefined();
    });

    it('속도가 Mach 6 (2040 m/s)여야 한다', () => {
      expect(srbm.speed).toBe(2040);
    });

    it('3단계 비행프로파일이 정의되어야 한다', () => {
      expect(srbm.flightProfile.type).toBe('ballistic');
      expect(srbm.flightProfile.phases).toHaveLength(3);
    });

    it('Phase 1 (Boost): 0-25%, 고도 0→150km', () => {
      const p = srbm.flightProfile.phases[0];
      expect(p.range[0]).toBe(0);
      expect(p.range[1]).toBe(0.25);
      expect(p.altitude[0]).toBe(0);
      expect(p.altitude[1]).toBe(150);
      expect(p.maneuver).toBe(false);
    });

    it('Phase 3 (Terminal): 70-100%, 기동, 속도 ×1.5', () => {
      const p = srbm.flightProfile.phases[2];
      expect(p.range[0]).toBe(0.70);
      expect(p.range[1]).toBe(1.0);
      expect(p.altitude[1]).toBe(0);
      expect(p.maneuver).toBe(true);
      expect(p.speedMult[1]).toBe(1.5);
    });

    it('signature가 정의되어야 한다', () => {
      expect(srbm.signature.rcs).toBe(0.1);
      expect(srbm.signature.radarSignature).toBe('ballistic');
    });
  });

  describe('C2_TYPES.KAMD_OPS', () => {
    it('타입이 존재해야 한다', () => {
      expect(C2_TYPES.KAMD_OPS).toBeDefined();
    });

    it('처리 지연이 정의되어야 한다', () => {
      expect(C2_TYPES.KAMD_OPS.processingDelay.min).toBe(20);
      expect(C2_TYPES.KAMD_OPS.processingDelay.max).toBe(120);
    });

    it('동시교전 용량이 2여야 한다', () => {
      expect(C2_TYPES.KAMD_OPS.simultaneousCapacity).toBe(2);
    });
  });

  describe('불변성 (Object.freeze)', () => {
    it('SHOOTER_TYPES를 수정할 수 없어야 한다', () => {
      const original = SHOOTER_TYPES.LSAM_ABM.capability.maxRange;
      try { SHOOTER_TYPES.LSAM_ABM.capability.maxRange = 999; } catch (e) { /* strict mode */ }
      expect(SHOOTER_TYPES.LSAM_ABM.capability.maxRange).toBe(original);
    });

    it('THREAT_TYPES를 수정할 수 없어야 한다', () => {
      const original = THREAT_TYPES.SRBM.speed;
      try { THREAT_TYPES.SRBM.speed = 999; } catch (e) { /* strict mode */ }
      expect(THREAT_TYPES.SRBM.speed).toBe(original);
    });
  });
});
