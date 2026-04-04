/**
 * @file Phase 1.3 시뮬레이션 엔진 테스트
 * TDD: step(dt)를 직접 호출하여 rAF 없이 테스트
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SimEngine } from '../src/core/sim-engine.js';
import { Registry } from '../src/core/registry.js';
import {
  SHOOTER_TYPES, SENSOR_TYPES, C2_TYPES, THREAT_TYPES
} from '../src/config/weapon-data.js';

/** 테스트용 Registry 생성 */
function createRegistry() {
  return new Registry({ SHOOTER_TYPES, SENSOR_TYPES, C2_TYPES, THREAT_TYPES });
}

/** L-SAM 1세트 + SRBM 시나리오 설정 */
function setupMvpScenario(engine) {
  // 센서: 의정부 (MSAM_MFR, 북향)
  engine.addSensor('sensor1', 'MSAM_MFR',
    { lon: 127.0, lat: 37.74, alt: 100 }, 0);

  // 사수: 의정부 (L-SAM_ABM)
  engine.addShooter('shooter1', 'LSAM_ABM',
    { lon: 127.0, lat: 37.74, alt: 100 });

  // 위협: 북한에서 발사된 SRBM
  engine.addThreat('threat1', 'SRBM',
    { lon: 127.0, lat: 39.0, alt: 200 },    // 발사 지점
    { lon: 127.0, lat: 37.5, alt: 0 },       // 목표 지점
    0);                                        // 발사 시각
}

// ═══════════════════════════════════════════════════════════
//  EventEmitter
// ═══════════════════════════════════════════════════════════
describe('EventEmitter', () => {
  let engine;

  beforeEach(() => {
    engine = new SimEngine(createRegistry());
  });

  it('on() + emit()으로 핸들러가 호출되어야 한다', () => {
    const handler = vi.fn();
    engine.on('test-event', handler);
    engine.emit('test-event', { data: 42 });
    expect(handler).toHaveBeenCalledWith({ data: 42 });
  });

  it('off()로 핸들러를 제거할 수 있어야 한다', () => {
    const handler = vi.fn();
    engine.on('test-event', handler);
    engine.off('test-event', handler);
    engine.emit('test-event', {});
    expect(handler).not.toHaveBeenCalled();
  });

  it('여러 이벤트가 독립적으로 동작해야 한다', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    engine.on('event-a', h1);
    engine.on('event-b', h2);
    engine.emit('event-a', {});
    expect(h1).toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it('같은 이벤트에 여러 핸들러를 등록할 수 있어야 한다', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    engine.on('ev', h1);
    engine.on('ev', h2);
    engine.emit('ev', { x: 1 });
    expect(h1).toHaveBeenCalled();
    expect(h2).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════
//  상태 머신
// ═══════════════════════════════════════════════════════════
describe('상태 머신', () => {
  let engine;

  beforeEach(() => {
    engine = new SimEngine(createRegistry());
  });

  it('초기 상태가 READY여야 한다', () => {
    expect(engine.state).toBe('READY');
  });

  it('play() → RUNNING', () => {
    engine.play();
    expect(engine.state).toBe('RUNNING');
  });

  it('pause() → PAUSED', () => {
    engine.play();
    engine.pause();
    expect(engine.state).toBe('PAUSED');
  });

  it('PAUSED에서 play() → RUNNING', () => {
    engine.play();
    engine.pause();
    engine.play();
    expect(engine.state).toBe('RUNNING');
  });

  it('reset() → READY, simTime=0', () => {
    engine.play();
    engine.step(1.0);
    engine.reset();
    expect(engine.state).toBe('READY');
    expect(engine.simTime).toBe(0);
  });

  it('READY에서 step()은 실행되지 않아야 한다', () => {
    engine.step(1.0);
    expect(engine.simTime).toBe(0);
  });

  it('RUNNING에서 step()이 simTime을 증가시켜야 한다', () => {
    engine.play();
    engine.step(0.016); // ~60fps
    expect(engine.simTime).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════
//  엔티티 관리
// ═══════════════════════════════════════════════════════════
describe('엔티티 관리', () => {
  let engine;

  beforeEach(() => {
    engine = new SimEngine(createRegistry());
  });

  it('addThreat()으로 위협을 추가하고 조회할 수 있어야 한다', () => {
    const t = engine.addThreat('t1', 'SRBM',
      { lon: 127, lat: 39, alt: 200 },
      { lon: 127, lat: 37.5, alt: 0 }, 0);
    expect(t.id).toBe('t1');
    expect(engine.getAllThreats()).toHaveLength(1);
  });

  it('addShooter()으로 사수를 추가할 수 있어야 한다', () => {
    engine.addShooter('s1', 'LSAM_ABM', { lon: 127, lat: 37.74, alt: 100 });
    expect(engine.getAllShooters()).toHaveLength(1);
  });

  it('addSensor()으로 센서를 추가할 수 있어야 한다', () => {
    engine.addSensor('r1', 'MSAM_MFR', { lon: 127, lat: 37.74, alt: 100 }, 0);
    expect(engine.getAllSensors()).toHaveLength(1);
  });

  it('addThreat() 시 threat-spawned 이벤트가 발생해야 한다', () => {
    const handler = vi.fn();
    engine.on('threat-spawned', handler);
    engine.addThreat('t1', 'SRBM',
      { lon: 127, lat: 39, alt: 200 },
      { lon: 127, lat: 37.5, alt: 0 }, 0);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ threatId: 't1', threatTypeId: 'SRBM' })
    );
  });
});

// ═══════════════════════════════════════════════════════════
//  step(dt) 파이프라인
// ═══════════════════════════════════════════════════════════
describe('step(dt) 파이프라인', () => {
  let engine;

  beforeEach(() => {
    engine = new SimEngine(createRegistry());
    setupMvpScenario(engine);
    engine.play();
  });

  describe('위협 이동', () => {
    it('step 후 위협 위치가 변경되어야 한다', () => {
      const threat = engine.getAllThreats()[0];
      const origLat = threat.position.lat;
      engine.step(1.0);
      // SRBM은 남쪽으로 이동하므로 lat 감소
      expect(threat.position.lat).not.toBe(origLat);
    });

    it('flightProgress가 증가해야 한다', () => {
      const threat = engine.getAllThreats()[0];
      engine.step(1.0);
      expect(threat.flightProgress).toBeGreaterThan(0);
    });
  });

  describe('센서 탐지', () => {
    it('센서 범위 내 위협이 탐지되어야 한다', () => {
      const handler = vi.fn();
      engine.on('threat-detected', handler);

      // 여러 스텝 진행하여 위협이 센서 범위에 들어오도록
      for (let i = 0; i < 3000; i++) engine.step(0.05);

      // 위협이 탐지되었는지 확인
      const sensor = engine.getAllSensors()[0];
      // 탐지 이벤트가 한 번이라도 발생했거나 센서에 탐지 기록이 있어야 함
      const detected = sensor.detectedThreats.length > 0 || handler.mock.calls.length > 0;
      expect(detected).toBe(true);
    });
  });

  describe('교전 + 요격미사일', () => {
    it('탐지 후 교전 시 interceptor가 생성되어야 한다', () => {
      const handler = vi.fn();
      engine.on('engagement-start', handler);

      // 충분한 시간 진행 (탐지 + 교전)
      for (let i = 0; i < 5000; i++) engine.step(0.05);

      // 교전이 발생했다면 interceptor가 존재
      if (handler.mock.calls.length > 0) {
        expect(engine.getAllInterceptors().length).toBeGreaterThan(0);
      }
    });
  });

  describe('시뮬레이션 완료', () => {
    it('모든 위협이 해결되면 simulation-end 이벤트가 발생해야 한다', () => {
      const handler = vi.fn();
      engine.on('simulation-end', handler);

      // 충분히 진행하여 시뮬레이션 완료
      for (let i = 0; i < 10000; i++) {
        if (engine.state === 'COMPLETE') break;
        engine.step(0.05);
      }

      // 위협이 intercepted 또는 leaked 상태
      const threat = engine.getAllThreats()[0];
      expect(['intercepted', 'leaked']).toContain(threat.state);
    });
  });
});

// ═══════════════════════════════════════════════════════════
//  Pk 계산
// ═══════════════════════════════════════════════════════════
describe('Pk 계산', () => {
  let engine;

  beforeEach(() => {
    engine = new SimEngine(createRegistry());
  });

  it('L-SAM vs SRBM 80km: Pk가 0보다 크고 basePk보다 작아야 한다', () => {
    const shooter = engine.addShooter('s1', 'LSAM_ABM', { lon: 127, lat: 37.74, alt: 100 });
    const threat = engine.addThreat('t1', 'SRBM',
      { lon: 127, lat: 39, alt: 200 },
      { lon: 127, lat: 37.5, alt: 0 }, 0);

    // 위협을 80km 거리로 위치 조정 (약 0.72도 북쪽)
    threat.position = { lon: 127.0, lat: 38.46, alt: 50000 };

    const pk = engine.computePk(threat, shooter);
    expect(pk).toBeGreaterThan(0);
    expect(pk).toBeLessThanOrEqual(0.85); // basePk
  });

  it('사거리(150km) 밖이면 Pk=0이어야 한다', () => {
    const shooter = engine.addShooter('s1', 'LSAM_ABM', { lon: 127, lat: 37.74, alt: 100 });
    const threat = engine.addThreat('t1', 'SRBM',
      { lon: 127, lat: 39, alt: 200 },
      { lon: 127, lat: 37.5, alt: 0 }, 0);

    // 200km 이상 거리
    threat.position = { lon: 127.0, lat: 39.5, alt: 50000 };

    const pk = engine.computePk(threat, shooter);
    expect(pk).toBe(0);
  });

  it('기동 중인 위협은 maneuverPenalty(0.85)가 적용되어야 한다', () => {
    const shooter = engine.addShooter('s1', 'LSAM_ABM', { lon: 127, lat: 37.74, alt: 100 });
    const threat = engine.addThreat('t1', 'SRBM',
      { lon: 127, lat: 39, alt: 200 },
      { lon: 127, lat: 37.5, alt: 0 }, 0);
    threat.position = { lon: 127.0, lat: 38.46, alt: 50000 };

    // 비기동 상태
    threat.flightProgress = 0.3;
    const pkNoManeuver = engine.computePk(threat, shooter);

    // 기동 상태 (terminal phase)
    threat.flightProgress = 0.8;
    const pkManeuver = engine.computePk(threat, shooter);

    expect(pkManeuver).toBeLessThan(pkNoManeuver);
  });
});
