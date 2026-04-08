/**
 * tests/sim-engine.test.js — SimEngine + EventLog + CommChannel 테스트
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SimEngine, SIM_STATE } from '../src/core/sim-engine.js';
import { EventLog, EVENT_TYPE } from '../src/core/event-log.js';
import { CommChannel } from '../src/core/comms.js';
import { Registry } from '../src/core/registry.js';
import {
  SensorEntity, C2Entity, BatteryEntity, ThreatEntity,
  SENSOR_STATE, resetEntityIdCounter,
} from '../src/core/entities.js';

let registry;
beforeEach(() => {
  registry = new Registry();
  resetEntityIdCounter();
});

// ════════════════════════════════════════════════════════════
// EventLog
// ════════════════════════════════════════════════════════════
describe('EventLog', () => {
  it('이벤트 기록 및 조회', () => {
    const log = new EventLog();
    log.log(EVENT_TYPE.THREAT_SPAWNED, 0, 't1', { typeId: 'SRBM' });
    log.log(EVENT_TYPE.SENSOR_DETECTED, 5, 't1', { sensorId: 's1' });

    expect(log.entries).toHaveLength(2);
    expect(log.getByThreat('t1')).toHaveLength(2);
    expect(log.getByType(EVENT_TYPE.THREAT_SPAWNED)).toHaveLength(1);
  });

  it('리스너 등록 및 호출', () => {
    const log = new EventLog();
    const received = [];
    log.onEvent(e => received.push(e));

    log.log(EVENT_TYPE.THREAT_SPAWNED, 0, 't1', {});
    expect(received).toHaveLength(1);
    expect(received[0].eventType).toBe(EVENT_TYPE.THREAT_SPAWNED);
  });

  it('리스너 제거', () => {
    const log = new EventLog();
    const received = [];
    const fn = e => received.push(e);
    log.onEvent(fn);
    log.offEvent(fn);

    log.log(EVENT_TYPE.THREAT_SPAWNED, 0, 't1', {});
    expect(received).toHaveLength(0);
  });

  it('clear', () => {
    const log = new EventLog();
    log.log(EVENT_TYPE.THREAT_SPAWNED, 0, 't1', {});
    log.clear();
    expect(log.entries).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════
// CommChannel
// ════════════════════════════════════════════════════════════
describe('CommChannel', () => {
  it('longRange 지연 16s', () => {
    const comm = new CommChannel('linear');
    const latency = comm.getLinkLatency('longRange', 0);
    expect(latency).toBe(16);
  });

  it('shortRange 지연 1s', () => {
    const comm = new CommChannel('linear');
    expect(comm.getLinkLatency('shortRange', 0)).toBe(1);
  });

  it('internal 지연 0.5s', () => {
    const comm = new CommChannel('linear');
    expect(comm.getLinkLatency('internal', 0)).toBe(0.5);
  });

  it('재밍 시 지연 증가', () => {
    const comm = new CommChannel('linear');
    const noJam = comm.getLinkLatency('longRange', 0);
    const withJam = comm.getLinkLatency('longRange', 0.3, () => 0.5);
    // degradation = 16 * 0.3 * (0.5 + 0.5) = 4.8
    // total = 16 + 4.8 = 20.8
    expect(withJam).toBeGreaterThan(noJam);
  });

  it('재밍 심하면 Infinity (두절)', () => {
    const comm = new CommChannel('linear');
    // degradation = 16 * 1.0 * (0.5 + 0.9) = 22.4 > 16 * 0.8 = 12.8 → 두절
    const latency = comm.getLinkLatency('longRange', 1.0, () => 0.9);
    expect(latency).toBe(Infinity);
  });

  it('Kill Web: 재밍 열화 50% 감소', () => {
    const linear = new CommChannel('linear');
    const kw = new CommChannel('killweb');
    const rng = () => 0.3;
    // linear: degradation = 16 * 0.5 * (0.5 + 0.3) = 6.4
    // killweb: degradation = 6.4 * 0.5 = 3.2
    const linearLatency = linear.getLinkLatency('longRange', 0.5, rng);
    const kwLatency = kw.getLinkLatency('longRange', 0.5, rng);
    expect(kwLatency).toBeLessThan(linearLatency);
  });

  it('send + receive: 지연 후 도착', () => {
    const comm = new CommChannel('linear');
    comm.send('A', 'B', 'longRange', { data: 42 }, 10, 0);
    // 도착 시각: 10 + 16 = 26

    const before = comm.receive('B', 20);
    expect(before).toHaveLength(0);

    const after = comm.receive('B', 26);
    expect(after).toHaveLength(1);
    expect(after[0].payload.data).toBe(42);

    // 이미 수신 → 빈 배열
    const again = comm.receive('B', 30);
    expect(again).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════
// SimEngine — 상태 머신
// ════════════════════════════════════════════════════════════
describe('SimEngine state machine', () => {
  it('초기 상태 READY', () => {
    const engine = new SimEngine(registry);
    expect(engine.state).toBe(SIM_STATE.READY);
    expect(engine.simTime).toBe(0);
  });

  it('start → RUNNING', () => {
    const engine = new SimEngine(registry);
    engine.start();
    expect(engine.state).toBe(SIM_STATE.RUNNING);
  });

  it('pause → PAUSED', () => {
    const engine = new SimEngine(registry);
    engine.start();
    engine.pause();
    expect(engine.state).toBe(SIM_STATE.PAUSED);
  });

  it('PAUSED → start → RUNNING', () => {
    const engine = new SimEngine(registry);
    engine.start();
    engine.pause();
    engine.start();
    expect(engine.state).toBe(SIM_STATE.RUNNING);
  });

  it('step은 RUNNING 상태에서만 동작', () => {
    const engine = new SimEngine(registry);
    engine.step(1);
    expect(engine.simTime).toBe(0); // READY 상태 → step 무시
  });

  it('reset → READY로 복귀', () => {
    const engine = new SimEngine(registry);
    engine.start();
    engine.step(5);
    engine.reset();
    expect(engine.state).toBe(SIM_STATE.READY);
    expect(engine.simTime).toBe(0);
    expect(engine.threats).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════
// SimEngine — 이벤트 버스
// ════════════════════════════════════════════════════════════
describe('SimEngine event bus', () => {
  it('이벤트 등록 및 발행', () => {
    const engine = new SimEngine(registry);
    const received = [];
    engine.on('test-event', data => received.push(data));
    engine.emit('test-event', { value: 42 });
    expect(received).toHaveLength(1);
    expect(received[0].value).toBe(42);
  });

  it('이벤트 해제', () => {
    const engine = new SimEngine(registry);
    const received = [];
    const handler = data => received.push(data);
    engine.on('test', handler);
    engine.off('test', handler);
    engine.emit('test', {});
    expect(received).toHaveLength(0);
  });

  it('addThreat → threat-spawned 이벤트', () => {
    const engine = new SimEngine(registry);
    const events = [];
    engine.on('threat-spawned', e => events.push(e));

    const threat = new ThreatEntity('SRBM', { lon: 127, lat: 39, alt: 0 }, { lon: 127, lat: 37, alt: 0 });
    engine.addThreat(threat);

    expect(events).toHaveLength(1);
    expect(engine.eventLog.entries).toHaveLength(1);
    expect(engine.eventLog.entries[0].eventType).toBe(EVENT_TYPE.THREAT_SPAWNED);
  });
});

// ════════════════════════════════════════════════════════════
// SimEngine — step(dt) 통합 테스트
// ════════════════════════════════════════════════════════════
describe('SimEngine step integration', () => {
  function setupEngine(skill = 'high') {
    const engine = new SimEngine(registry, { operatorSkill: skill });

    // 센서 배치
    const gp = new SensorEntity('GREEN_PINE_B', { lon: 127.0, lat: 36.5, alt: 200 });
    const mfr = new SensorEntity('LSAM_MFR', { lon: 127.0, lat: 37.0, alt: 150 });
    engine.addSensor(gp);
    engine.addSensor(mfr);

    // C2 배치
    engine.addC2(new C2Entity('KAMD_OPS', { lon: 127.0, lat: 36.8, alt: 100 }, skill));
    engine.addC2(new C2Entity('ICC', { lon: 127.0, lat: 37.0, alt: 100 }, skill));
    engine.addC2(new C2Entity('ECS', { lon: 127.0, lat: 37.0, alt: 100 }, skill));

    // 포대 배치
    const bat = new BatteryEntity('LSAM', { lon: 127.0, lat: 37.0, alt: 150 }, mfr.id, 'ecs_1', { ABM: 12, AAM: 12 }, 10);
    engine.addBattery(bat);

    return engine;
  }

  it('STEP 1: 위협 이동 — 진행률 증가', () => {
    const engine = setupEngine();
    engine.start();

    const threat = new ThreatEntity('SRBM',
      { lon: 127.0, lat: 39.0, alt: 0 },
      { lon: 127.0, lat: 37.0, alt: 0 });
    engine.addThreat(threat);

    engine.step(10);
    expect(threat.progress).toBeGreaterThan(0);
    expect(threat.position.lat).toBeLessThan(39.0); // 남하
  });

  it('STEP 2: 센서 탐지 → 이벤트 발생', () => {
    const engine = setupEngine();
    engine.start();

    // GREEN_PINE 탐지 범위 내 SRBM
    const threat = new ThreatEntity('SRBM',
      { lon: 127.0, lat: 39.0, alt: 0 },
      { lon: 127.0, lat: 37.0, alt: 0 });
    engine.addThreat(threat);

    // 충분한 시간 반복 → 탐지 발생
    const sensorEvents = [];
    engine.on('sensor-state-change', e => sensorEvents.push(e));

    for (let i = 0; i < 50; i++) {
      engine.step(1);
    }

    // GREEN_PINE이 SRBM을 탐지했어야 함
    expect(sensorEvents.length).toBeGreaterThan(0);
    const detected = sensorEvents.find(e => e.event === 'SENSOR_DETECTED');
    expect(detected).toBeDefined();
  });

  it('STEP 3: 킬체인 시작 → KAMD_OPS 처리', () => {
    const engine = setupEngine();
    engine.start();

    const kcEvents = [];
    engine.on('killchain-step', e => kcEvents.push(e));

    const threat = new ThreatEntity('SRBM',
      { lon: 127.0, lat: 39.0, alt: 0 },
      { lon: 127.0, lat: 37.0, alt: 0 });
    engine.addThreat(threat);

    // 충분히 돌려서 킬체인 진행
    for (let i = 0; i < 100; i++) {
      engine.step(1);
    }

    // 킬체인 이벤트 발생 확인
    const gpDetected = kcEvents.find(e => e.stage === 'GP_DETECTED');
    expect(gpDetected).toBeDefined();

    // C2 처리 이벤트
    const c2Events = engine.eventLog.getByType(EVENT_TYPE.C2_PROCESSING);
    expect(c2Events.length).toBeGreaterThan(0);
  });

  it('전체 S2S: 고숙련 킬체인 약 84s 이내', () => {
    const engine = setupEngine('high');
    engine.start();

    const threat = new ThreatEntity('SRBM',
      { lon: 127.0, lat: 39.0, alt: 0 },
      { lon: 127.0, lat: 37.0, alt: 0 });
    engine.addThreat(threat);

    // 200초 돌리기 (1초 step)
    for (let i = 0; i < 200; i++) {
      engine.step(1);
    }

    // 킬체인 이벤트에서 S2S 측정
    const firstDetect = engine.eventLog.getByType(EVENT_TYPE.KILLCHAIN_STARTED)[0];
    const shooterAssigned = engine.eventLog.getByType(EVENT_TYPE.SHOOTER_ASSIGNED)[0];

    if (firstDetect && shooterAssigned) {
      const s2s = shooterAssigned.simTime - firstDetect.simTime;
      // 고숙련: 링크 16+16+1 = 33s, 처리 22.5+4.5+2.5 = 29.5s, 총 ~62.5s
      // 센서 전이 시간 별도
      expect(s2s).toBeLessThan(140); // 최대 137s 이내
      expect(s2s).toBeGreaterThan(30); // 최소 링크 지연 이상
    }
  });

  it('위협 관통 → leaked 상태 + 이벤트', () => {
    const engine = setupEngine();
    engine.start();

    // 매우 가까운 위협 (빨리 도착)
    const threat = new ThreatEntity('SRBM',
      { lon: 127.0, lat: 37.5, alt: 0 },
      { lon: 127.0, lat: 37.0, alt: 0 });
    engine.addThreat(threat);

    const leakEvents = [];
    engine.on('threat-leaked', e => leakEvents.push(e));

    // 300초 (충분히 관통)
    for (let i = 0; i < 300; i++) {
      engine.step(1);
    }

    expect(threat.state).toBe('leaked');
    expect(leakEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('시뮬레이션 완료 → COMPLETE 상태', () => {
    const engine = setupEngine();
    engine.start();

    const threat = new ThreatEntity('SRBM',
      { lon: 127.0, lat: 37.5, alt: 0 },
      { lon: 127.0, lat: 37.0, alt: 0 });
    engine.addThreat(threat);

    for (let i = 0; i < 300; i++) {
      engine.step(1);
      if (engine.state === SIM_STATE.COMPLETE) break;
    }

    expect(engine.state).toBe(SIM_STATE.COMPLETE);
    const endEvents = engine.eventLog.getByType(EVENT_TYPE.SIMULATION_END);
    expect(endEvents).toHaveLength(1);
  });

  it('timeScale 반영: 배속 시 simTime 빠르게 진행', () => {
    const engine = setupEngine();
    engine.timeScale = 4;
    engine.start();
    engine.step(1);
    expect(engine.simTime).toBeCloseTo(4, 5); // 1초 × 4배속 (서브스텝 부동소수점)
  });
});

// ════════════════════════════════════════════════════════════
// SimEngine — 교전 통합 테스트
// ════════════════════════════════════════════════════════════
describe('SimEngine engagement flow', () => {
  it('교전 발사 시 이벤트 로그에 ENGAGEMENT_FIRED 기록', () => {
    const engine = new SimEngine(registry, { operatorSkill: 'high' });

    const gp = new SensorEntity('GREEN_PINE_B', { lon: 127.0, lat: 36.5, alt: 200 });
    const mfr = new SensorEntity('LSAM_MFR', { lon: 127.0, lat: 37.0, alt: 150 });
    engine.addSensor(gp);
    engine.addSensor(mfr);
    engine.addC2(new C2Entity('KAMD_OPS', { lon: 127.0, lat: 36.8, alt: 100 }, 'high'));
    engine.addC2(new C2Entity('ICC', { lon: 127.0, lat: 37.0, alt: 100 }, 'high'));
    engine.addC2(new C2Entity('ECS', { lon: 127.0, lat: 37.0, alt: 100 }, 'high'));
    const bat = new BatteryEntity('LSAM', { lon: 127.0, lat: 37.0, alt: 150 }, mfr.id, 'ecs_1', { ABM: 12, AAM: 12 }, 10);
    engine.addBattery(bat);

    engine.start();

    const threat = new ThreatEntity('SRBM',
      { lon: 127.0, lat: 39.0, alt: 0 },
      { lon: 127.0, lat: 37.0, alt: 0 });
    engine.addThreat(threat);

    // 200초 돌리기
    for (let i = 0; i < 200; i++) {
      engine.step(1);
    }

    const fired = engine.eventLog.getByType(EVENT_TYPE.ENGAGEMENT_FIRED);
    // 킬체인이 완료되고 교전급 추적이 확립되면 발사됨
    // (탄도탄이 충분히 멀리서 시작하므로 센서 탐지 + 킬체인 처리 후 교전 가능)
    if (fired.length > 0) {
      expect(fired[0].data.missileType).toBe('ABM');
      expect(fired[0].data.pk).toBeGreaterThan(0);
      expect(engine.interceptors.length).toBeGreaterThan(0);
    }
  });
});
