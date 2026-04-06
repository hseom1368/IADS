/**
 * @module tests/event-log
 * EventLog 단위 테스트 — 킬체인 이벤트 기록 및 조회
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventLog } from '../src/core/event-log.js';

let log;

beforeEach(() => {
  log = new EventLog();
});

describe('EventLog', () => {
  it('log() → 이벤트 기록', () => {
    log.log({ threatId: 't1', eventType: 'THREAT_DETECTED', simTime: 10.0, data: { sensorId: 'gp1' } });
    expect(log.getAll().length).toBe(1);
  });

  it('getByThreat() → 특정 위협 이벤트만 반환', () => {
    log.log({ threatId: 't1', eventType: 'THREAT_DETECTED', simTime: 10.0, data: {} });
    log.log({ threatId: 't2', eventType: 'THREAT_DETECTED', simTime: 12.0, data: {} });
    log.log({ threatId: 't1', eventType: 'INTERCEPT_HIT', simTime: 80.0, data: {} });
    const entries = log.getByThreat('t1');
    expect(entries.length).toBe(2);
    expect(entries.every(e => e.threatId === 't1')).toBe(true);
  });

  it('getByType() → 이벤트 유형별 조회', () => {
    log.log({ threatId: 't1', eventType: 'THREAT_DETECTED', simTime: 10.0, data: {} });
    log.log({ threatId: 't1', eventType: 'INTERCEPT_HIT', simTime: 80.0, data: {} });
    log.log({ threatId: 't2', eventType: 'THREAT_DETECTED', simTime: 15.0, data: {} });
    const detected = log.getByType('THREAT_DETECTED');
    expect(detected.length).toBe(2);
  });

  it('computeS2S() → 탐지→격추 시간 계산', () => {
    log.log({ threatId: 't1', eventType: 'THREAT_DETECTED', simTime: 10.0, data: {} });
    log.log({ threatId: 't1', eventType: 'INTERCEPT_HIT', simTime: 80.0, data: {} });
    expect(log.computeS2S('t1')).toBeCloseTo(70.0);
  });

  it('computeS2S() → 미격추 시 null', () => {
    log.log({ threatId: 't1', eventType: 'THREAT_DETECTED', simTime: 10.0, data: {} });
    expect(log.computeS2S('t1')).toBeNull();
  });

  it('clear() → 전체 초기화', () => {
    log.log({ threatId: 't1', eventType: 'THREAT_DETECTED', simTime: 10.0, data: {} });
    log.clear();
    expect(log.getAll().length).toBe(0);
  });

  it('getAll() → 시간 순서대로 반환', () => {
    log.log({ threatId: 't2', eventType: 'THREAT_DETECTED', simTime: 15.0, data: {} });
    log.log({ threatId: 't1', eventType: 'THREAT_DETECTED', simTime: 10.0, data: {} });
    const all = log.getAll();
    expect(all[0].simTime).toBe(15.0); // 삽입 순서 유지
    expect(all.length).toBe(2);
  });
});
