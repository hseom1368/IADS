/**
 * tests/entities.test.js — 엔티티 클래스 테스트
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SENSOR_STATE,
  SensorEntity,
  C2Entity,
  BatteryEntity,
  ThreatEntity,
  InterceptorEntity,
  resetEntityIdCounter,
} from '../src/core/entities.js';

beforeEach(() => { resetEntityIdCounter(); });

const POS = { lon: 127.0, lat: 37.0, alt: 150 };

// ════════════════════════════════════════════════════════════
// SensorEntity — 3단계 센서 상태머신
// ════════════════════════════════════════════════════════════
describe('SensorEntity', () => {
  it('초기 상태: operational, 빈 trackStates', () => {
    const s = new SensorEntity('GREEN_PINE_B', POS);
    expect(s.typeId).toBe('GREEN_PINE_B');
    expect(s.operational).toBe(true);
    expect(s.trackStates.size).toBe(0);
  });

  it('getTrackState: 없으면 UNDETECTED로 초기화', () => {
    const s = new SensorEntity('LSAM_MFR', POS);
    const ts = s.getTrackState('threat_1');
    expect(ts.state).toBe(SENSOR_STATE.UNDETECTED);
    expect(ts.transitionTimer).toBe(0);
    expect(ts.consecutiveMisses).toBe(0);
  });

  it('setTrackState: 상태 전이', () => {
    const s = new SensorEntity('LSAM_MFR', POS);
    s.getTrackState('threat_1'); // 초기화
    s.setTrackState('threat_1', SENSOR_STATE.DETECTED);
    expect(s.getTrackState('threat_1').state).toBe(SENSOR_STATE.DETECTED);
    expect(s.getTrackState('threat_1').consecutiveMisses).toBe(0);
  });

  it('setTrackState: FIRE_CONTROL까지 전이', () => {
    const s = new SensorEntity('LSAM_MFR', POS);
    s.setTrackState('t1', SENSOR_STATE.DETECTED);
    s.setTrackState('t1', SENSOR_STATE.TRACKED);
    s.setTrackState('t1', SENSOR_STATE.FIRE_CONTROL);
    expect(s.getTrackState('t1').state).toBe(SENSOR_STATE.FIRE_CONTROL);
  });

  it('removeTrack: 추적 제거', () => {
    const s = new SensorEntity('LSAM_MFR', POS);
    s.getTrackState('t1');
    s.removeTrack('t1');
    expect(s.trackStates.has('t1')).toBe(false);
  });

  it('다중 위협 독립 추적', () => {
    const s = new SensorEntity('LSAM_MFR', POS);
    s.setTrackState('t1', SENSOR_STATE.DETECTED);
    s.setTrackState('t2', SENSOR_STATE.FIRE_CONTROL);
    expect(s.getTrackState('t1').state).toBe(SENSOR_STATE.DETECTED);
    expect(s.getTrackState('t2').state).toBe(SENSOR_STATE.FIRE_CONTROL);
  });
});

// ════════════════════════════════════════════════════════════
// C2Entity — 지휘통제 노드
// ════════════════════════════════════════════════════════════
describe('C2Entity', () => {
  it('초기 상태: 빈 큐, 기본 숙련도 mid', () => {
    const c2 = new C2Entity('KAMD_OPS', POS);
    expect(c2.typeId).toBe('KAMD_OPS');
    expect(c2.operatorSkill).toBe('mid');
    expect(c2.processingQueue).toHaveLength(0);
  });

  it('사용자 지정 숙련도', () => {
    const c2 = new C2Entity('ECS', POS, 'high');
    expect(c2.operatorSkill).toBe('high');
  });

  it('enqueue: 위협 추가', () => {
    const c2 = new C2Entity('KAMD_OPS', POS);
    c2.enqueue('t1', 10.0);
    expect(c2.processingQueue).toHaveLength(1);
    expect(c2.processingQueue[0].threatId).toBe('t1');
    expect(c2.processingQueue[0].receivedAt).toBe(10.0);
  });

  it('enqueue: 중복 방지', () => {
    const c2 = new C2Entity('KAMD_OPS', POS);
    c2.enqueue('t1', 10.0);
    c2.enqueue('t1', 15.0);
    expect(c2.processingQueue).toHaveLength(1);
  });

  it('getProcessedItems: 처리 시간 경과 후 반환', () => {
    const c2 = new C2Entity('KAMD_OPS', POS);
    c2.enqueue('t1', 10.0);
    // 10초 후 처리 시간이 5초면 → 처리 완료
    const processed = c2.getProcessedItems(15.0, 5.0);
    expect(processed).toHaveLength(1);
    expect(processed[0].threatId).toBe('t1');
  });

  it('getProcessedItems: 처리 시간 미경과 → 빈 배열', () => {
    const c2 = new C2Entity('KAMD_OPS', POS);
    c2.enqueue('t1', 10.0);
    const processed = c2.getProcessedItems(12.0, 5.0);
    expect(processed).toHaveLength(0);
  });

  it('dequeue: 위협 제거', () => {
    const c2 = new C2Entity('KAMD_OPS', POS);
    c2.enqueue('t1', 10.0);
    c2.enqueue('t2', 11.0);
    c2.dequeue('t1');
    expect(c2.processingQueue).toHaveLength(1);
    expect(c2.processingQueue[0].threatId).toBe('t2');
  });
});

// ════════════════════════════════════════════════════════════
// BatteryEntity — 포대
// ════════════════════════════════════════════════════════════
describe('BatteryEntity', () => {
  let bat;
  beforeEach(() => {
    bat = new BatteryEntity('LSAM', POS, 'mfr_1', 'ecs_1', { ABM: 12, AAM: 12 }, 10);
  });

  it('초기 상태', () => {
    expect(bat.shooterTypeId).toBe('LSAM');
    expect(bat.ammo.ABM).toBe(12);
    expect(bat.ammo.AAM).toBe(12);
    expect(bat.activeEngagements).toBe(0);
    expect(bat.maxSimultaneous).toBe(10);
  });

  it('canFire: 탄약 있고 동시교전 상한 이하 → true', () => {
    expect(bat.canFire('ABM')).toBe(true);
  });

  it('fire: 탄약 차감 + 교전 수 증가', () => {
    bat.fire('ABM');
    expect(bat.ammo.ABM).toBe(11);
    expect(bat.activeEngagements).toBe(1);
  });

  it('canFire: 탄약 소진 → false', () => {
    bat.ammo.ABM = 0;
    expect(bat.canFire('ABM')).toBe(false);
  });

  it('canFire: 동시교전 상한 도달 → false', () => {
    bat.activeEngagements = 10;
    expect(bat.canFire('ABM')).toBe(false);
  });

  it('canFire: 비작동 → false', () => {
    bat.operational = false;
    expect(bat.canFire('ABM')).toBe(false);
  });

  it('completeEngagement: 교전 수 감소', () => {
    bat.fire('ABM');
    bat.fire('ABM');
    bat.completeEngagement();
    expect(bat.activeEngagements).toBe(1);
  });

  it('completeEngagement: 0 이하로 내려가지 않음', () => {
    bat.completeEngagement();
    expect(bat.activeEngagements).toBe(0);
  });

  it('BDA 타이머: 등록 → 갱신 → 완료', () => {
    bat.startBDA('int_1', 't1', 8);
    expect(bat.bdaPending.size).toBe(1);

    // 5초 경과 → 미완료
    let completed = bat.updateBDA(5);
    expect(completed).toHaveLength(0);

    // 3초 더 경과 → 완료
    completed = bat.updateBDA(3);
    expect(completed).toHaveLength(1);
    expect(completed[0].interceptorId).toBe('int_1');
    expect(completed[0].threatId).toBe('t1');
    expect(bat.bdaPending.size).toBe(0);
  });

  it('다중 BDA 동시 추적', () => {
    bat.startBDA('int_1', 't1', 5);
    bat.startBDA('int_2', 't2', 8);
    bat.updateBDA(5);
    expect(bat.bdaPending.size).toBe(1); // int_1 완료, int_2 잔여
  });

  it('연속 발사: 12발 모두 발사', () => {
    for (let i = 0; i < 12; i++) {
      expect(bat.fire('ABM')).toBe(true);
      bat.completeEngagement(); // 동시교전 상한 해제
    }
    expect(bat.ammo.ABM).toBe(0);
    expect(bat.fire('ABM')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// ThreatEntity — 위협
// ════════════════════════════════════════════════════════════
describe('ThreatEntity', () => {
  it('초기 상태', () => {
    const start = { lon: 125.5, lat: 39.0, alt: 0 };
    const target = { lon: 127.0, lat: 37.0, alt: 0 };
    const t = new ThreatEntity('SRBM', start, target);
    expect(t.typeId).toBe('SRBM');
    expect(t.state).toBe('flying');
    expect(t.flightPhase).toBe(0);
    expect(t.progress).toBe(0);
    expect(t.maneuvering).toBe(false);
    expect(t.ecmActive).toBe(false);
  });

  it('updateFlight: 진행률 갱신 + phaseRCS 반영', () => {
    const t = new ThreatEntity('SRBM', POS, POS);
    const trajectory = {
      position: { lon: 126.5, lat: 38.0, alt: 150000 },
      speed: 2040,
      phase: 1,
      rcsMultiplier: 1.0,
    };
    t.updateFlight(0.5, trajectory, 0.1); // phaseRCS = 0.1 (phase 1)
    expect(t.progress).toBe(0.5);
    expect(t.flightPhase).toBe(1);
    expect(t.currentRCS).toBe(0.1);
    expect(t.position.lon).toBe(126.5);
  });

  it('RCS 변화: registry에서 조회한 값 그대로 사용', () => {
    const t = new ThreatEntity('SRBM', POS, POS);

    // sim-engine이 registry.getThreatRCS(typeId, phase)로 조회한 값을 전달
    t.updateFlight(0.1, { position: POS, speed: 1020, phase: 0, rcsMultiplier: 3.0 }, 3.0);
    expect(t.currentRCS).toBe(3.0);

    t.updateFlight(0.5, { position: POS, speed: 2040, phase: 1, rcsMultiplier: 1.0 }, 0.1);
    expect(t.currentRCS).toBe(0.1);

    t.updateFlight(0.9, { position: POS, speed: 2550, phase: 2, rcsMultiplier: 0.5 }, 0.05);
    expect(t.currentRCS).toBe(0.05);
  });
});

// ════════════════════════════════════════════════════════════
// InterceptorEntity — 요격미사일
// ════════════════════════════════════════════════════════════
describe('InterceptorEntity', () => {
  it('초기 상태', () => {
    const intc = new InterceptorEntity('LSAM', 'ABM', POS, 't1', 3100, 0.85, 50);
    expect(intc.missileSpeed).toBe(3100);
    expect(intc.pssekPk).toBe(0.85);
    expect(intc.killRadius).toBe(50);
    expect(intc.guidanceType).toBe('PNG');
    expect(intc.state).toBe('boosting');
    expect(intc.fuelRemaining).toBe(60);
  });

  it('tick: 부스터 → 유도 전환', () => {
    const intc = new InterceptorEntity('LSAM', 'ABM', POS, 't1', 3100, 0.85, 50);
    intc.tick(1.0);
    expect(intc.state).toBe('boosting');
    expect(intc.elapsedTime).toBe(1.0);

    intc.tick(1.5); // 총 2.5초
    expect(intc.state).toBe('guiding');
  });

  it('tick: 연료 소진', () => {
    const intc = new InterceptorEntity('LSAM', 'ABM', POS, 't1', 3100, 0.85, 50);
    intc.tick(60);
    expect(intc.isFuelDepleted()).toBe(true);
  });

  it('CLOS 유도 타입', () => {
    const intc = new InterceptorEntity('CHUNMA', 'DEFAULT', POS, 't1', 884, 0.62, 500, 'CLOS');
    expect(intc.guidanceType).toBe('CLOS');
  });
});
