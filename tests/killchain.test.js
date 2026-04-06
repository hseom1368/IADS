/**
 * @module tests/killchain
 * LinearKillChain 단위 테스트 — 선형 C2 킬체인 상태 머신
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LinearKillChain, KILLCHAIN_STAGES } from '../src/core/killchain.js';
import { CommChannel } from '../src/core/comms.js';
import { EventLog } from '../src/core/event-log.js';
import { Registry } from '../src/core/registry.js';
import {
  SHOOTER_TYPES, SENSOR_TYPES, C2_TYPES, THREAT_TYPES
} from '../src/config/weapon-data.js';

let killchain, eventLog, commChannel, registry;

beforeEach(() => {
  registry = new Registry({ SHOOTER_TYPES, SENSOR_TYPES, C2_TYPES, THREAT_TYPES });
  commChannel = new CommChannel();
  eventLog = new EventLog();
  killchain = new LinearKillChain(registry, commChannel, eventLog);
});

describe('KILLCHAIN_STAGES', () => {
  it('6단계 정의 (링크3 + 처리3)', () => {
    expect(KILLCHAIN_STAGES.length).toBe(6);
  });

  it('첫 단계: GP_TO_KAMD (long_range 링크)', () => {
    expect(KILLCHAIN_STAGES[0].id).toBe('GP_TO_KAMD');
    expect(KILLCHAIN_STAGES[0].linkType).toBe('long_range');
  });
});

describe('startKillchain()', () => {
  it('킬체인 시작 → 상태 생성', () => {
    killchain.startKillchain('t1', 'gp1', 10.0);
    const state = killchain.getState('t1');
    expect(state).not.toBeNull();
    expect(state.threatId).toBe('t1');
    expect(state.status).toBe('in_progress');
    expect(state.currentStageIndex).toBe(0);
  });

  it('중복 시작 방지', () => {
    killchain.startKillchain('t1', 'gp1', 10.0);
    killchain.startKillchain('t1', 'gp1', 15.0);
    // 첫 번째 시작 시간 유지
    expect(killchain.getState('t1').stageStartTime).toBe(10.0);
  });

  it('EventLog에 KILLCHAIN_STARTED 기록', () => {
    killchain.startKillchain('t1', 'gp1', 10.0);
    const entries = eventLog.getByType('KILLCHAIN_STARTED');
    expect(entries.length).toBe(1);
    expect(entries[0].threatId).toBe('t1');
  });
});

describe('update() — 타이머 진행', () => {
  it('stage 0 (GP→KAMD 16s): 15초 후 → 아직 stage 0', () => {
    killchain.startKillchain('t1', 'gp1', 0);
    killchain.update(15.0);
    expect(killchain.getState('t1').currentStageIndex).toBe(0);
  });

  it('stage 0→1: 16초 후 → stage 1 (KAMD_PROCESSING)', () => {
    killchain.startKillchain('t1', 'gp1', 0);
    killchain.update(17.0); // 16s 링크 경과
    expect(killchain.getState('t1').currentStageIndex).toBeGreaterThanOrEqual(1);
  });

  it('전체 킬체인: 충분한 시간 후 → ready_to_engage', () => {
    killchain.startKillchain('t1', 'gp1', 0);
    // 최대 S2S: 16 + 60 + 16 + 15 + 1 + 5 = 113초
    killchain.update(120.0);
    const state = killchain.getState('t1');
    expect(state.status).toBe('ready_to_engage');
  });

  it('최소 S2S ≥ 34초 (링크 지연만)', () => {
    killchain.startKillchain('t1', 'gp1', 0);
    // 34초 = 16 + 16 + 1 + 1(최소 처리시간 미포함)
    // 실제 최소: 16 + 20 + 16 + 5 + 1 + 2 = 60초
    killchain.update(50.0);
    // 50초에는 아직 완료 안됨
    expect(killchain.getState('t1').status).toBe('in_progress');
  });
});

describe('getReadyToEngage()', () => {
  it('킬체인 완료 전 → 빈 배열', () => {
    killchain.startKillchain('t1', 'gp1', 0);
    killchain.update(10.0);
    expect(killchain.getReadyToEngage()).toEqual([]);
  });

  it('킬체인 완료 후 → threatId 포함', () => {
    killchain.startKillchain('t1', 'gp1', 0);
    killchain.update(120.0);
    const ready = killchain.getReadyToEngage();
    expect(ready.length).toBe(1);
    expect(ready[0].threatId).toBe('t1');
  });
});

describe('completeKillchain() / cancelKillchain()', () => {
  it('completeKillchain → status=completed', () => {
    killchain.startKillchain('t1', 'gp1', 0);
    killchain.update(120.0);
    killchain.completeKillchain('t1');
    expect(killchain.getState('t1').status).toBe('completed');
    expect(killchain.getReadyToEngage()).toEqual([]);
  });

  it('cancelKillchain → status=cancelled', () => {
    killchain.startKillchain('t1', 'gp1', 0);
    killchain.cancelKillchain('t1');
    expect(killchain.getState('t1').status).toBe('cancelled');
  });
});

describe('다중 위협 독립 킬체인', () => {
  it('두 위협의 킬체인이 독립적으로 진행', () => {
    killchain.startKillchain('t1', 'gp1', 0);
    killchain.startKillchain('t2', 'gp1', 5.0);
    killchain.update(120.0);
    // t1은 simTime=0에서 시작, t2는 5초 후 시작
    // 둘 다 120초에는 완료
    expect(killchain.getState('t1').status).toBe('ready_to_engage');
    expect(killchain.getState('t2').status).toBe('ready_to_engage');
  });
});
