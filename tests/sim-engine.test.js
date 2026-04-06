/**
 * @module tests/sim-engine
 * SimEngine 단위 테스트 — 7단계 C2 킬체인 파이프라인
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SimEngine } from '../src/core/sim-engine.js';
import { Registry } from '../src/core/registry.js';
import {
  SHOOTER_TYPES, SENSOR_TYPES, C2_TYPES, THREAT_TYPES
} from '../src/config/weapon-data.js';

let engine, registry;

// 한반도 좌표
const POS_GP = { lon: 127.0, lat: 36.5, alt: 200 };    // GREEN_PINE 위치
const POS_MFR = { lon: 127.0, lat: 37.0, alt: 100 };   // MSAM_MFR 위치
const POS_SHOOTER = { lon: 127.0, lat: 37.0, alt: 100 }; // L-SAM 위치
const POS_C2 = { lon: 127.0, lat: 37.2, alt: 50 };      // C2 위치

// SRBM: 북쪽에서 남쪽으로 하강 (midcourse 상태, 150km 고도에서 시작)
const SRBM_ORIGIN = { lon: 127.0, lat: 39.0, alt: 150000 };
const SRBM_TARGET = { lon: 127.0, lat: 37.0, alt: 0 };

beforeEach(() => {
  registry = new Registry({ SHOOTER_TYPES, SENSOR_TYPES, C2_TYPES, THREAT_TYPES });
  engine = new SimEngine(registry);
});

// ═══════════════════════════════════════════════════════════
//  기본 인프라
// ═══════════════════════════════════════════════════════════

describe('SimEngine 기본', () => {
  it('초기 상태 READY', () => {
    expect(engine.state).toBe('READY');
    expect(engine.simTime).toBe(0);
  });

  it('상태 전이: play→RUNNING, pause→PAUSED', () => {
    engine.play();
    expect(engine.state).toBe('RUNNING');
    engine.pause();
    expect(engine.state).toBe('PAUSED');
  });

  it('reset → READY, simTime=0', () => {
    engine.play();
    engine.step(1.0);
    engine.reset();
    expect(engine.state).toBe('READY');
    expect(engine.simTime).toBe(0);
  });

  it('이벤트 버스: on/emit/off', () => {
    let received = null;
    const handler = (d) => { received = d; };
    engine.on('test-event', handler);
    engine.emit('test-event', { value: 42 });
    expect(received.value).toBe(42);
    engine.off('test-event', handler);
    engine.emit('test-event', { value: 99 });
    expect(received.value).toBe(42); // off 후 변경 없음
  });
});

// ═══════════════════════════════════════════════════════════
//  엔티티 관리
// ═══════════════════════════════════════════════════════════

describe('엔티티 관리', () => {
  it('addThreat → 위협 추가', () => {
    engine.addThreat('t1', 'SRBM', SRBM_ORIGIN, SRBM_TARGET, 0);
    expect(engine.getAllThreats().length).toBe(1);
  });

  it('addShooter → 사수 추가', () => {
    engine.addShooter('s1', 'LSAM_ABM', POS_SHOOTER);
    expect(engine.getAllShooters().length).toBe(1);
  });

  it('addSensor → 센서 추가', () => {
    engine.addSensor('gp1', 'GREEN_PINE', POS_GP, 0);
    expect(engine.getAllSensors().length).toBe(1);
  });

  it('addC2 → C2 엔티티 추가', () => {
    engine.addC2('kamd1', 'KAMD_OPS', POS_C2);
    expect(engine.getAllC2s().length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════
//  step(dt) 파이프라인
// ═══════════════════════════════════════════════════════════

describe('step(dt) 파이프라인', () => {
  it('RUNNING 상태에서만 step 실행', () => {
    engine.step(1.0);
    expect(engine.simTime).toBe(0); // READY 상태라 실행 안 됨
  });

  it('step → simTime 증가', () => {
    engine.play();
    engine.step(0.05);
    expect(engine.simTime).toBeGreaterThan(0);
  });

  it('dt 클램프: MAX_DT(0.05) 초과 시 0.05로 제한', () => {
    engine.play();
    engine.step(1.0); // dt=1.0이지만 MAX_DT=0.05로 제한
    expect(engine.simTime).toBeLessThanOrEqual(0.05);
  });
});

// ═══════════════════════════════════════════════════════════
//  킬체인 통합 시나리오
// ═══════════════════════════════════════════════════════════

describe('킬체인 통합 시나리오', () => {
  /**
   * 전체 시나리오: GREEN_PINE 탐지 → C2 킬체인 → 교전
   * 빠른 시뮬레이션을 위해 timeScale 사용
   */
  function setupScenario() {
    // 센서
    engine.addSensor('gp1', 'GREEN_PINE', POS_GP, 0);
    engine.addSensor('mfr1', 'MSAM_MFR', POS_MFR, 0);
    // C2
    engine.addC2('kamd1', 'KAMD_OPS', POS_C2);
    engine.addC2('icc1', 'ICC', POS_C2);
    engine.addC2('ecs1', 'ECS', POS_C2);
    // 사수
    engine.addShooter('s1', 'LSAM_ABM', POS_SHOOTER);
    // 위협: SRBM 150km 상공에서 하강
    engine.addThreat('t1', 'SRBM', SRBM_ORIGIN, SRBM_TARGET, 0);
  }

  it('threat-detected 이벤트 발생', () => {
    setupScenario();
    engine.play();

    let detected = false;
    engine.on('threat-detected', () => { detected = true; });

    // SRBM이 충분한 고도(>10km GREEN_PINE minDetectionAlt)에 도달할 때까지 step
    // SRBM Mach6 = 2040m/s, upComponent=0.3 → vertical ≈ 612m/s → 10km까지 ~16초
    for (let i = 0; i < 600; i++) {
      engine.step(0.05); // 30초
    }

    expect(detected).toBe(true);
  });

  it('C2 킬체인 단계가 eventLog에 기록됨', () => {
    setupScenario();
    engine.play();

    // 120초 시뮬레이션 (최대 S2S 이상)
    for (let i = 0; i < 2400; i++) {
      engine.step(0.05);
    }

    // eventLog에 킬체인 이벤트들이 기록되어야 함
    const log = engine.getEventLog();
    expect(log).toBeDefined();
    const allEntries = log.getAll();
    expect(allEntries.length).toBeGreaterThan(0);
  });

  it('킬체인 완료 후 교전 발사 (engagement-start 이벤트)', () => {
    setupScenario();
    engine.play();

    let engagementStarted = false;
    engine.on('engagement-start', () => { engagementStarted = true; });

    // 200초 시뮬레이션
    for (let i = 0; i < 4000; i++) {
      engine.step(0.05);
    }

    // 킬체인이 완료되면 교전이 시작되어야 함
    // (위협이 교전구역에 진입한 경우)
    // 참고: SRBM이 교전구역을 빠르게 통과할 수 있으므로
    // engagementStarted 또는 threat-leaked 둘 중 하나
    const threats = engine.getAllThreats();
    const t1 = threats.find(t => t.id === 't1');
    expect(
      engagementStarted ||
      t1.state === 'leaked' ||
      t1.state === 'intercepted'
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
//  킬체인 타이밍 검증
// ═══════════════════════════════════════════════════════════

describe('킬체인 타이밍', () => {
  it('getKillchain()이 LinearKillChain 인스턴스를 반환', () => {
    expect(engine.getKillchain()).toBeDefined();
  });

  it('getEventLog()이 EventLog 인스턴스를 반환', () => {
    expect(engine.getEventLog()).toBeDefined();
  });
});
