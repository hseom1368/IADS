/**
 * tests/threat-tracking-panel.smoke.test.js
 * 브라우저 없이 jsdom으로 ThreatTrackingPanel을 실행해 예외 여부 확인.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { ThreatTrackingPanel } from '../src/viz/threat-tracking-panel.js';
import { ThreatEntity, resetEntityIdCounter } from '../src/core/entities.js';

beforeEach(() => {
  resetEntityIdCounter();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

// stub canvas 2D context (jsdom은 canvas 2D context를 반환하지 않음)
function installCanvasStub() {
  HTMLCanvasElement.prototype.getContext = function () {
    return {
      save() {}, restore() {}, scale() {}, clearRect() {},
      beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
      fillText() {}, fillRect() {}, translate() {},
      set strokeStyle(_) {}, set fillStyle(_) {}, set lineWidth(_) {},
      set font(_) {}, set textAlign(_) {}, set textBaseline(_) {},
    };
  };
}

function makeMockEngine(threats = []) {
  return { threats, simTime: 1.5 };
}

function spawnThreat(id = 't1') {
  const t = new ThreatEntity('SRBM',
    { lon: 127, lat: 39, alt: 0 },
    { lon: 127, lat: 37, alt: 0 });
  // force id for predictable testing
  t.id = id;
  return t;
}

describe('ThreatTrackingPanel smoke', () => {
  beforeEach(() => {
    installCanvasStub();
  });

  it('생성자에서 예외 없음', () => {
    expect(() => new ThreatTrackingPanel()).not.toThrow();
    expect(document.getElementById('threatTrackingPanel')).toBeTruthy();
  });

  it('onThreatSpawned 호출 시 예외 없음 (engineRef=null 상태)', () => {
    const panel = new ThreatTrackingPanel();
    const threat = spawnThreat('t1');
    expect(() => panel.onThreatSpawned(threat, 'BM-001')).not.toThrow();
    expect(panel.entries).toHaveLength(1);
  });

  it('onThreatSpawned 후 updateLive 호출 시 예외 없음 (텔레메트리 없음)', () => {
    const panel = new ThreatTrackingPanel();
    const threat = spawnThreat('t1');
    panel.onThreatSpawned(threat, 'BM-001');
    const engine = makeMockEngine([threat]);
    expect(() => panel.updateLive(engine)).not.toThrow();
  });

  it('onThreatSpawned 후 텔레메트리 있을 때 updateLive 예외 없음', () => {
    const panel = new ThreatTrackingPanel();
    const threat = spawnThreat('t1');
    panel.onThreatSpawned(threat, 'BM-001');
    // 텔레메트리 샘플 몇 개 기록
    threat.currentSpeed = 2000;
    threat.position.alt = 50000;
    threat.recordTelemetry(0.5, 280);
    threat.recordTelemetry(1.0, 275);
    const engine = makeMockEngine([threat]);
    expect(() => panel.updateLive(engine)).not.toThrow();
  });

  it('onThreatTerminated 후 updateLive 예외 없음', () => {
    const panel = new ThreatTrackingPanel();
    const threat = spawnThreat('t1');
    panel.onThreatSpawned(threat, 'BM-001');
    panel.onThreatTerminated('t1', 'hit');
    const engine = makeMockEngine([threat]);
    expect(() => panel.updateLive(engine)).not.toThrow();
  });

  it('다중 위협 연속 처리 예외 없음', () => {
    const panel = new ThreatTrackingPanel();
    const threats = [];
    for (let i = 0; i < 6; i++) {
      const t = spawnThreat(`t${i}`);
      threats.push(t);
      panel.onThreatSpawned(t, `BM-00${i}`);
    }
    const engine = makeMockEngine(threats);
    for (let f = 0; f < 60; f++) {
      engine.simTime = f * 0.016;
      expect(() => panel.updateLive(engine)).not.toThrow();
    }
  });

  it('reset 후 재사용 예외 없음', () => {
    const panel = new ThreatTrackingPanel();
    const threat = spawnThreat('t1');
    panel.onThreatSpawned(threat, 'BM-001');
    panel.reset();
    expect(panel.entries).toHaveLength(0);
    const threat2 = spawnThreat('t2');
    expect(() => panel.onThreatSpawned(threat2, 'BM-002')).not.toThrow();
    expect(() => panel.updateLive(makeMockEngine([threat2]))).not.toThrow();
  });
});
