/**
 * @file Phase 1.5 통합 스모크 테스트
 * Node.js 환경에서 core 모듈만으로 전체 시나리오 검증
 * L-SAM 1세트 + SRBM 1발 → 요격 또는 관통까지 실행
 */
import { describe, it, expect, vi } from 'vitest';
import { Registry } from '../src/core/registry.js';
import { SimEngine } from '../src/core/sim-engine.js';
import {
  SHOOTER_TYPES, SENSOR_TYPES, C2_TYPES, THREAT_TYPES
} from '../src/config/weapon-data.js';

function createEngine() {
  const registry = new Registry({ SHOOTER_TYPES, SENSOR_TYPES, C2_TYPES, THREAT_TYPES });
  return new SimEngine(registry);
}

function setupScenario(engine) {
  engine.addSensor('sensor1', 'MSAM_MFR', { lon: 127.0, lat: 37.74, alt: 100 }, 0);
  engine.addShooter('shooter1', 'LSAM_ABM', { lon: 127.0, lat: 37.74, alt: 100 });
}

function fireThreat(engine) {
  engine.addThreat('SRBM_001', 'SRBM',
    { lon: 127.0, lat: 39.0, alt: 200 },
    { lon: 127.0, lat: 37.5, alt: 0 },
    engine.simTime
  );
}

describe('Phase 1.5: 통합 스모크 테스트', () => {

  it('L-SAM 시나리오가 종료까지 실행되어야 한다 (intercepted 또는 leaked)', () => {
    const engine = createEngine();
    setupScenario(engine);
    fireThreat(engine);
    engine.play();

    const endHandler = vi.fn();
    engine.on('simulation-end', endHandler);

    for (let i = 0; i < 10000; i++) {
      if (engine.state === 'COMPLETE') break;
      engine.step(0.05);
    }

    const threat = engine.getAllThreats()[0];
    expect(['intercepted', 'leaked']).toContain(threat.state);
    expect(engine.state).toBe('COMPLETE');
    expect(endHandler).toHaveBeenCalled();
  });

  it('simulation-end 이벤트에 올바른 통계가 포함되어야 한다', () => {
    const engine = createEngine();
    setupScenario(engine);
    fireThreat(engine);
    engine.play();

    let endData = null;
    engine.on('simulation-end', d => { endData = d; });

    for (let i = 0; i < 10000; i++) {
      if (engine.state === 'COMPLETE') break;
      engine.step(0.05);
    }

    expect(endData).not.toBeNull();
    expect(endData.totalThreats).toBe(1);
    expect(endData.destroyed + endData.leaked).toBe(1);
    expect(endData.finalSimTime).toBeGreaterThan(0);
  });

  it('시뮬레이션 중 최소 1개의 탐지 이벤트가 발생해야 한다', () => {
    const engine = createEngine();
    setupScenario(engine);
    fireThreat(engine);
    engine.play();

    const detected = vi.fn();
    engine.on('threat-detected', detected);

    for (let i = 0; i < 10000; i++) {
      if (engine.state === 'COMPLETE') break;
      engine.step(0.05);
    }

    expect(detected).toHaveBeenCalled();
  });

  it('reset() 후 다시 시나리오를 실행할 수 있어야 한다', () => {
    const engine = createEngine();
    setupScenario(engine);
    fireThreat(engine);
    engine.play();

    for (let i = 0; i < 10000; i++) {
      if (engine.state === 'COMPLETE') break;
      engine.step(0.05);
    }
    expect(engine.state).toBe('COMPLETE');

    // 리셋 후 재실행
    engine.reset();
    expect(engine.state).toBe('READY');
    expect(engine.simTime).toBe(0);
    expect(engine.getAllThreats()).toHaveLength(0);

    // 재배치 + 재실행
    setupScenario(engine);
    fireThreat(engine);
    engine.play();

    for (let i = 0; i < 10000; i++) {
      if (engine.state === 'COMPLETE') break;
      engine.step(0.05);
    }

    expect(engine.state).toBe('COMPLETE');
  });

  it('timeScale 변경이 시뮬레이션 속도에 영향을 미쳐야 한다', () => {
    const engine = createEngine();
    engine.play();

    engine.timeScale = 1;
    engine.step(0.05);
    const t1 = engine.simTime;

    engine.timeScale = 4;
    engine.step(0.05);
    const t2 = engine.simTime - t1;

    // 4배속은 1배속보다 약 4배 많은 simTime 증가
    expect(t2).toBeGreaterThan(t1 * 3);
  });
});
