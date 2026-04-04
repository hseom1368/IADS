/**
 * @file Phase 1.2 엔티티 시스템 테스트
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  BaseEntity,
  ShooterEntity,
  SensorEntity,
  ThreatEntity,
  InterceptorEntity
} from '../src/core/entities.js';
import { Registry } from '../src/core/registry.js';
import {
  SHOOTER_TYPES,
  SENSOR_TYPES,
  C2_TYPES,
  THREAT_TYPES
} from '../src/config/weapon-data.js';

const registry = new Registry({ SHOOTER_TYPES, SENSOR_TYPES, C2_TYPES, THREAT_TYPES });

// ═══════════════════════════════════════════════════════════
//  BaseEntity
// ═══════════════════════════════════════════════════════════
describe('BaseEntity', () => {
  it('id, typeId, position, operational 속성을 가져야 한다', () => {
    const e = new BaseEntity('e1', 'TEST', { lon: 127.0, lat: 37.5, alt: 100 });
    expect(e.id).toBe('e1');
    expect(e.typeId).toBe('TEST');
    expect(e.position.lon).toBe(127.0);
    expect(e.position.lat).toBe(37.5);
    expect(e.position.alt).toBe(100);
    expect(e.operational).toBe(true);
  });

  it('operational을 false로 설정할 수 있어야 한다', () => {
    const e = new BaseEntity('e2', 'TEST', { lon: 0, lat: 0, alt: 0 });
    e.operational = false;
    expect(e.operational).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
//  ShooterEntity
// ═══════════════════════════════════════════════════════════
describe('ShooterEntity', () => {
  let shooter;

  beforeEach(() => {
    shooter = new ShooterEntity('s1', 'LSAM_ABM', { lon: 127.0, lat: 37.74, alt: 100 }, registry);
  });

  it('BaseEntity를 상속해야 한다', () => {
    expect(shooter).toBeInstanceOf(BaseEntity);
  });

  it('초기 ammo가 capability.ammoCount와 같아야 한다', () => {
    expect(shooter.currentAmmo).toBe(6); // L-SAM_ABM ammoCount
  });

  it('초기 status가 ready여야 한다', () => {
    expect(shooter.status).toBe('ready');
  });

  it('engagedTarget이 초기에 null이어야 한다', () => {
    expect(shooter.engagedTarget).toBeNull();
  });

  it('canEngage()가 교전 가능한 위협에 true를 반환해야 한다', () => {
    expect(shooter.canEngage('SRBM')).toBe(true);
  });

  it('canEngage()가 교전 불가능한 위협에 false를 반환해야 한다', () => {
    expect(shooter.canEngage('CRUISE_MISSILE')).toBe(false);
  });

  it('fire() 후 ammo가 1 감소해야 한다', () => {
    shooter.fire('threat1');
    expect(shooter.currentAmmo).toBe(5);
  });

  it('fire() 후 status가 engaged여야 한다', () => {
    shooter.fire('threat1');
    expect(shooter.status).toBe('engaged');
    expect(shooter.engagedTarget.threatId).toBe('threat1');
  });

  it('ammo가 0이면 canEngage()가 false를 반환해야 한다', () => {
    for (let i = 0; i < 6; i++) shooter.fire(`t${i}`);
    expect(shooter.currentAmmo).toBe(0);
    expect(shooter.status).toBe('out_of_ammo');
    expect(shooter.canEngage('SRBM')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
//  SensorEntity
// ═══════════════════════════════════════════════════════════
describe('SensorEntity', () => {
  let sensor;

  beforeEach(() => {
    sensor = new SensorEntity('r1', 'MSAM_MFR', { lon: 127.0, lat: 37.74, alt: 100 }, registry);
  });

  it('BaseEntity를 상속해야 한다', () => {
    expect(sensor).toBeInstanceOf(BaseEntity);
  });

  it('초기 currentTracking이 빈 배열이어야 한다', () => {
    expect(sensor.currentTracking).toEqual([]);
  });

  it('초기 detectedThreats가 빈 배열이어야 한다', () => {
    expect(sensor.detectedThreats).toEqual([]);
  });

  it('addDetection()으로 탐지 위협을 추가할 수 있어야 한다', () => {
    sensor.addDetection('t1', 'SRBM', 10.0);
    expect(sensor.detectedThreats).toHaveLength(1);
    expect(sensor.detectedThreats[0].threatId).toBe('t1');
    expect(sensor.detectedThreats[0].threatTypeId).toBe('SRBM');
    expect(sensor.detectedThreats[0].firstDetectedTime).toBe(10.0);
  });

  it('clearDetection()으로 탐지를 제거할 수 있어야 한다', () => {
    sensor.addDetection('t1', 'SRBM', 10.0);
    sensor.clearDetection('t1');
    expect(sensor.detectedThreats).toHaveLength(0);
  });

  it('canDetect()가 탐지 가능한 위협 타입에 true를 반환해야 한다', () => {
    expect(sensor.canDetect('SRBM')).toBe(true);
    expect(sensor.canDetect('AIRCRAFT')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
//  ThreatEntity
// ═══════════════════════════════════════════════════════════
describe('ThreatEntity', () => {
  let threat;

  beforeEach(() => {
    threat = new ThreatEntity('t1', 'SRBM', {
      origin: { lon: 125.5, lat: 39.5, alt: 200 },
      target: { lon: 127.0, lat: 37.5, alt: 0 },
      launchTime: 0
    }, registry);
  });

  it('BaseEntity를 상속해야 한다', () => {
    expect(threat).toBeInstanceOf(BaseEntity);
  });

  it('초기 상태가 launched여야 한다', () => {
    expect(threat.state).toBe('launched');
  });

  it('초기 flightProgress가 0이어야 한다', () => {
    expect(threat.flightProgress).toBe(0);
  });

  it('origin과 target이 저장되어야 한다', () => {
    expect(threat.origin.lon).toBe(125.5);
    expect(threat.target.lon).toBe(127.0);
  });

  it('getCurrentPhase()가 progress 기반으로 phase를 반환해야 한다', () => {
    threat.flightProgress = 0.1;
    expect(threat.getCurrentPhase()).toBe(0); // Phase 1 (0-25%)

    threat.flightProgress = 0.5;
    expect(threat.getCurrentPhase()).toBe(1); // Phase 2 (25-70%)

    threat.flightProgress = 0.8;
    expect(threat.getCurrentPhase()).toBe(2); // Phase 3 (70-100%)
  });

  it('getCurrentSpeedMult()가 현재 phase의 보간된 속도 배수를 반환해야 한다', () => {
    // Phase 1 시작 (progress=0): speedMult 0.5
    threat.flightProgress = 0;
    expect(threat.getCurrentSpeedMult()).toBeCloseTo(0.5, 1);

    // Phase 2 중간 (progress=0.5): speedMult 1.0
    threat.flightProgress = 0.5;
    expect(threat.getCurrentSpeedMult()).toBeCloseTo(1.0, 1);

    // Phase 3 끝 (progress=1.0): speedMult 1.5
    threat.flightProgress = 1.0;
    expect(threat.getCurrentSpeedMult()).toBeCloseTo(1.5, 1);
  });

  it('getCurrentAltitude()가 phase 기반 고도를 반환해야 한다 (km)', () => {
    // Phase 1 시작: 0km
    threat.flightProgress = 0;
    expect(threat.getCurrentAltitude()).toBeCloseTo(0, 0);

    // Phase 2: 150km
    threat.flightProgress = 0.5;
    expect(threat.getCurrentAltitude()).toBeCloseTo(150, 0);

    // Phase 3 끝: 0km
    threat.flightProgress = 1.0;
    expect(threat.getCurrentAltitude()).toBeCloseTo(0, 0);
  });

  it('isTerminal()이 phase 3에서 true를 반환해야 한다', () => {
    threat.flightProgress = 0.5;
    expect(threat.isTerminal()).toBe(false);

    threat.flightProgress = 0.8;
    expect(threat.isTerminal()).toBe(true);
  });

  it('isManeuvering()이 terminal phase에서 true를 반환해야 한다', () => {
    threat.flightProgress = 0.3;
    expect(threat.isManeuvering()).toBe(false);

    threat.flightProgress = 0.8;
    expect(threat.isManeuvering()).toBe(true);
  });

  it('velocity가 {x, y, z} 형식이어야 한다', () => {
    expect(threat.velocity).toHaveProperty('x');
    expect(threat.velocity).toHaveProperty('y');
    expect(threat.velocity).toHaveProperty('z');
  });
});

// ═══════════════════════════════════════════════════════════
//  InterceptorEntity
// ═══════════════════════════════════════════════════════════
describe('InterceptorEntity', () => {
  let interceptor;

  beforeEach(() => {
    interceptor = new InterceptorEntity('i1', {
      position: { lon: 127.0, lat: 37.74, alt: 100 },
      speed: 1500,
      boostTime: 2.0,
      navConstant: 4.5,
      targetThreatId: 't1',
      shooterId: 's1'
    });
  });

  it('BaseEntity를 상속해야 한다', () => {
    expect(interceptor).toBeInstanceOf(BaseEntity);
  });

  it('초기 상태가 boost여야 한다', () => {
    expect(interceptor.state).toBe('boost');
  });

  it('속도와 부스트 시간이 설정되어야 한다', () => {
    expect(interceptor.speed).toBe(1500);
    expect(interceptor.boostTimeRemaining).toBe(2.0);
    expect(interceptor.navConstant).toBe(4.5);
  });

  it('targetThreatId와 shooterId가 저장되어야 한다', () => {
    expect(interceptor.targetThreatId).toBe('t1');
    expect(interceptor.shooterId).toBe('s1');
  });

  it('isInBoost()가 부스트 단계에서 true를 반환해야 한다', () => {
    expect(interceptor.isInBoost()).toBe(true);
  });

  it('부스트 시간 소진 후 guidance 상태로 전환해야 한다', () => {
    interceptor.updateBoost(2.0);
    expect(interceptor.boostTimeRemaining).toBe(0);
    expect(interceptor.state).toBe('guidance');
    expect(interceptor.isInBoost()).toBe(false);
  });

  it('velocity가 {x, y, z} 형식이어야 한다', () => {
    expect(interceptor.velocity).toHaveProperty('x');
    expect(interceptor.velocity).toHaveProperty('y');
    expect(interceptor.velocity).toHaveProperty('z');
  });
});
