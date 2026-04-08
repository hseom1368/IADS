/**
 * tests/smoke-phase1.test.js — Phase 1 E2E 스모크 테스트
 *
 * SRBM 1발 → GREEN_PINE 탐지(SNR) → 선형 킬체인(84~137s)
 * → L-SAM ABM(Mach 9) 발사 → PNG 유도 → PSSEK 판정 → BDA
 *
 * 전체 시뮬레이션을 headless로 돌려 핵심 이벤트 순서 검증.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SimEngine, SIM_STATE } from '../src/core/sim-engine.js';
import { Registry } from '../src/core/registry.js';
import { EVENT_TYPE } from '../src/core/event-log.js';
import {
  SensorEntity, C2Entity, BatteryEntity, ThreatEntity,
  resetEntityIdCounter,
} from '../src/core/entities.js';

let registry;
beforeEach(() => {
  registry = new Registry();
  resetEntityIdCounter();
});

/**
 * Phase 1 표준 배치 생성
 */
function createPhase1Engine(skill = 'high') {
  const engine = new SimEngine(registry, { operatorSkill: skill });

  // GREEN_PINE_B (충남, 조기경보)
  const gp = new SensorEntity('GREEN_PINE_B', { lon: 127.0, lat: 36.0, alt: 200 });
  engine.addSensor(gp);

  // LSAM_MFR (포대 북동 ~1km, 화력통제)
  const mfr = new SensorEntity('LSAM_MFR', { lon: 127.04, lat: 37.12, alt: 180 });
  engine.addSensor(mfr);

  // C2 체인: KAMD_OPS → ICC → ECS
  engine.addC2(new C2Entity('KAMD_OPS', { lon: 127.0, lat: 36.8, alt: 100 }, skill));
  engine.addC2(new C2Entity('ICC', { lon: 127.05, lat: 37.05, alt: 100 }, skill));
  engine.addC2(new C2Entity('ECS', { lon: 127.03, lat: 37.08, alt: 100 }, skill));

  // L-SAM 포대 (전방)
  const bat = new BatteryEntity('LSAM',
    { lon: 127.03, lat: 37.1, alt: 150 },
    mfr.id, 'ecs_1',
    { ABM: 12, AAM: 12 }, 10
  );
  engine.addBattery(bat);

  return engine;
}

// ════════════════════════════════════════════════════════════
// E2E 시나리오: SRBM 1발 전체 킬체인
// ════════════════════════════════════════════════════════════
describe('Phase 1 E2E: SRBM → GREEN_PINE → Killchain → L-SAM → BDA', () => {

  it('고숙련 킬체인: 전체 이벤트 순서 검증', () => {
    const engine = createPhase1Engine('high');
    engine.start();

    // SRBM 발사: 북방(39.5N) → 수도권(37.0N)
    const threat = new ThreatEntity('SRBM',
      { lon: 127.0, lat: 39.5, alt: 0 },
      { lon: 127.03, lat: 37.0, alt: 0 }
    );
    engine.addThreat(threat);

    // 시뮬레이션 600초 (1초 단위 step)
    for (let i = 0; i < 600; i++) {
      if (engine.state !== SIM_STATE.RUNNING) break;
      engine.step(1);
    }

    // ── 이벤트 순서 검증 ──────────────────────────────────

    // 1. THREAT_SPAWNED 가 먼저 발생
    const spawned = engine.eventLog.getByType(EVENT_TYPE.THREAT_SPAWNED);
    expect(spawned.length).toBe(1);
    expect(spawned[0].simTime).toBe(0);

    // 2. GREEN_PINE이 SRBM 탐지 (SENSOR_DETECTED)
    const detected = engine.eventLog.getByType(EVENT_TYPE.SENSOR_DETECTED);
    expect(detected.length).toBeGreaterThan(0);
    const gpDetection = detected.find(e => e.data.sensorType === 'GREEN_PINE_B');
    expect(gpDetection).toBeDefined();

    // 3. 킬체인 시작 (KILLCHAIN_STARTED)
    const kcStarted = engine.eventLog.getByType(EVENT_TYPE.KILLCHAIN_STARTED);
    expect(kcStarted.length).toBe(1);
    expect(kcStarted[0].simTime).toBeGreaterThan(0);

    // 4. C2 처리 이벤트 (KAMD → ICC → ECS)
    const c2Processing = engine.eventLog.getByType(EVENT_TYPE.C2_PROCESSING);
    expect(c2Processing.length).toBeGreaterThanOrEqual(3);

    const c2Names = c2Processing.map(e => e.data.c2);
    expect(c2Names).toContain('KAMD_OPS');
    expect(c2Names).toContain('ICC');
    expect(c2Names).toContain('ECS');

    // 순서 검증: KAMD → ICC → ECS
    const kamdTime = c2Processing.find(e => e.data.c2 === 'KAMD_OPS').simTime;
    const iccTime = c2Processing.find(e => e.data.c2 === 'ICC').simTime;
    const ecsTime = c2Processing.find(e => e.data.c2 === 'ECS').simTime;
    expect(kamdTime).toBeLessThan(iccTime);
    expect(iccTime).toBeLessThan(ecsTime);

    // 5. C2 승인 (C2_AUTHORIZED)
    const authorized = engine.eventLog.getByType(EVENT_TYPE.C2_AUTHORIZED);
    expect(authorized.length).toBeGreaterThanOrEqual(3);

    // 6. 사수 배정 (SHOOTER_ASSIGNED)
    const assigned = engine.eventLog.getByType(EVENT_TYPE.SHOOTER_ASSIGNED);
    expect(assigned.length).toBe(1);
    expect(assigned[0].data.shooter).toBe('LSAM');

    // 7. 시뮬레이션 종료 (intercepted 또는 leaked)
    expect(engine.state).toBe(SIM_STATE.COMPLETE);
    expect(threat.state === 'intercepted' || threat.state === 'leaked').toBe(true);
  });

  it('S2S 시간 범위 검증: 고숙련 < 140s', () => {
    const engine = createPhase1Engine('high');
    engine.start();

    const threat = new ThreatEntity('SRBM',
      { lon: 127.0, lat: 39.5, alt: 0 },
      { lon: 127.03, lat: 37.0, alt: 0 }
    );
    engine.addThreat(threat);

    for (let i = 0; i < 600; i++) {
      if (engine.state !== SIM_STATE.RUNNING) break;
      engine.step(1);
    }

    const kcStart = engine.eventLog.getByType(EVENT_TYPE.KILLCHAIN_STARTED)[0];
    const assigned = engine.eventLog.getByType(EVENT_TYPE.SHOOTER_ASSIGNED)[0];

    if (kcStart && assigned) {
      const s2s = assigned.simTime - kcStart.simTime;
      // 고숙련: 링크 16+16+1=33, 처리 22.5+4.5+2.5=29.5, 총 ~62.5s
      expect(s2s).toBeGreaterThan(30);
      expect(s2s).toBeLessThan(140);
    }
  });

  it('저숙련: S2S > 고숙련 S2S', () => {
    // 고숙련 실행
    const engineH = createPhase1Engine('high');
    engineH.start();
    const th = new ThreatEntity('SRBM', { lon: 127, lat: 39.5, alt: 0 }, { lon: 127, lat: 37, alt: 0 });
    engineH.addThreat(th);
    for (let i = 0; i < 600; i++) { if (engineH.state !== SIM_STATE.RUNNING) break; engineH.step(1); }

    // 저숙련 실행
    resetEntityIdCounter();
    const engineL = createPhase1Engine('low');
    engineL.start();
    const th2 = new ThreatEntity('SRBM', { lon: 127, lat: 39.5, alt: 0 }, { lon: 127, lat: 37, alt: 0 });
    engineL.addThreat(th2);
    for (let i = 0; i < 600; i++) { if (engineL.state !== SIM_STATE.RUNNING) break; engineL.step(1); }

    const s2sH = (() => {
      const kc = engineH.eventLog.getByType(EVENT_TYPE.KILLCHAIN_STARTED)[0];
      const sa = engineH.eventLog.getByType(EVENT_TYPE.SHOOTER_ASSIGNED)[0];
      return kc && sa ? sa.simTime - kc.simTime : 0;
    })();

    const s2sL = (() => {
      const kc = engineL.eventLog.getByType(EVENT_TYPE.KILLCHAIN_STARTED)[0];
      const sa = engineL.eventLog.getByType(EVENT_TYPE.SHOOTER_ASSIGNED)[0];
      return kc && sa ? sa.simTime - kc.simTime : 0;
    })();

    if (s2sH > 0 && s2sL > 0) {
      expect(s2sL).toBeGreaterThan(s2sH);
    }
  });

  it('탄약 차감 확인: 발사 후 ABM 감소', () => {
    const engine = createPhase1Engine('high');
    engine.start();

    const threat = new ThreatEntity('SRBM',
      { lon: 127.0, lat: 39.5, alt: 0 },
      { lon: 127.03, lat: 37.0, alt: 0 }
    );
    engine.addThreat(threat);

    for (let i = 0; i < 600; i++) {
      if (engine.state !== SIM_STATE.RUNNING) break;
      engine.step(1);
    }

    const fired = engine.eventLog.getByType(EVENT_TYPE.ENGAGEMENT_FIRED);
    if (fired.length > 0) {
      const bat = engine.batteries[0];
      expect(bat.getAmmo('ABM')).toBeLessThan(12);
      // ABM탄 발사, AAM은 미사용
      expect(bat.getAmmo('AAM')).toBe(12);
    }
  });

  it('PSSEK Pk값이 교전 이벤트에 기록됨', () => {
    const engine = createPhase1Engine('high');
    engine.start();

    const threat = new ThreatEntity('SRBM',
      { lon: 127.0, lat: 39.5, alt: 0 },
      { lon: 127.03, lat: 37.0, alt: 0 }
    );
    engine.addThreat(threat);

    for (let i = 0; i < 600; i++) {
      if (engine.state !== SIM_STATE.RUNNING) break;
      engine.step(1);
    }

    const fired = engine.eventLog.getByType(EVENT_TYPE.ENGAGEMENT_FIRED);
    if (fired.length > 0) {
      expect(fired[0].data.pk).toBeGreaterThan(0);
      expect(fired[0].data.pk).toBeLessThanOrEqual(0.99);
      expect(fired[0].data.missileType).toBe('ABM');
      expect(fired[0].data.doctrine).toBe('SLS');
    }
  });

  it('BDA 완료 이벤트 발생 (HIT 또는 MISS)', () => {
    const engine = createPhase1Engine('high');
    engine.start();

    const threat = new ThreatEntity('SRBM',
      { lon: 127.0, lat: 39.5, alt: 0 },
      { lon: 127.03, lat: 37.0, alt: 0 }
    );
    engine.addThreat(threat);

    for (let i = 0; i < 600; i++) {
      if (engine.state !== SIM_STATE.RUNNING) break;
      engine.step(1);
    }

    const fired = engine.eventLog.getByType(EVENT_TYPE.ENGAGEMENT_FIRED);
    if (fired.length > 0) {
      // 교전이 발생하면 HIT 또는 MISS 또는 LEAKED
      const hits = engine.eventLog.getByType(EVENT_TYPE.INTERCEPT_HIT);
      const misses = engine.eventLog.getByType(EVENT_TYPE.INTERCEPT_MISS);
      const leaked = engine.eventLog.getByType(EVENT_TYPE.THREAT_LEAKED);

      expect(hits.length + misses.length + leaked.length).toBeGreaterThan(0);
    }
  });

  it('센서 3단계 전이: GREEN_PINE DETECTED→TRACKED, LSAM_MFR FIRE_CONTROL', () => {
    const engine = createPhase1Engine('high');
    engine.start();

    const threat = new ThreatEntity('SRBM',
      { lon: 127.0, lat: 39.5, alt: 0 },
      { lon: 127.03, lat: 37.0, alt: 0 }
    );
    engine.addThreat(threat);

    for (let i = 0; i < 600; i++) {
      if (engine.state !== SIM_STATE.RUNNING) break;
      engine.step(1);
    }

    // GREEN_PINE: 최소 DETECTED
    const gpEvents = engine.eventLog.entries.filter(e =>
      e.data.sensorType === 'GREEN_PINE_B' && e.threatId === threat.id
    );
    expect(gpEvents.length).toBeGreaterThan(0);

    // 킬체인 완료 시 LSAM_MFR도 FIRE_CONTROL 달성 가능
    const mfrFC = engine.eventLog.getByType(EVENT_TYPE.SENSOR_FIRE_CONTROL);
    const mfrFCEvent = mfrFC.find(e => e.data.sensorType === 'LSAM_MFR');
    // 교전이 발생했다면 FIRE_CONTROL이 확립되어야 함
    const fired = engine.eventLog.getByType(EVENT_TYPE.ENGAGEMENT_FIRED);
    if (fired.length > 0) {
      expect(mfrFCEvent).toBeDefined();
    }
  });

  it('시뮬레이션 COMPLETE 후 모든 위협 resolved', () => {
    const engine = createPhase1Engine('high');
    engine.start();

    const threat = new ThreatEntity('SRBM',
      { lon: 127.0, lat: 39.5, alt: 0 },
      { lon: 127.03, lat: 37.0, alt: 0 }
    );
    engine.addThreat(threat);

    for (let i = 0; i < 600; i++) {
      if (engine.state !== SIM_STATE.RUNNING) break;
      engine.step(1);
    }

    expect(engine.state).toBe(SIM_STATE.COMPLETE);

    const endEvent = engine.eventLog.getByType(EVENT_TYPE.SIMULATION_END);
    expect(endEvent.length).toBe(1);
    expect(endEvent[0].data.totalThreats).toBe(1);
    expect(endEvent[0].data.intercepted + endEvent[0].data.leaked).toBe(1);
  });

  it('요격미사일 생성 확인: interceptors 배열에 추가', () => {
    const engine = createPhase1Engine('high');
    engine.start();

    const threat = new ThreatEntity('SRBM',
      { lon: 127.0, lat: 39.5, alt: 0 },
      { lon: 127.03, lat: 37.0, alt: 0 }
    );
    engine.addThreat(threat);

    for (let i = 0; i < 600; i++) {
      if (engine.state !== SIM_STATE.RUNNING) break;
      engine.step(1);
    }

    const fired = engine.eventLog.getByType(EVENT_TYPE.ENGAGEMENT_FIRED);
    if (fired.length > 0) {
      // 발사된 요격미사일이 있어야 함
      expect(engine.interceptors.length).toBeGreaterThan(0);
      const intc = engine.interceptors[0];
      expect(intc.missileSpeed).toBe(3100); // Mach 9
      expect(intc.guidanceType).toBe('PNG');
    }
  });

  it('timeScale 반영: 배속 시 더 빨리 종료', () => {
    const engine1x = createPhase1Engine('high');
    engine1x.start();
    engine1x.addThreat(new ThreatEntity('SRBM', { lon: 127, lat: 39.5, alt: 0 }, { lon: 127, lat: 37, alt: 0 }));
    let steps1x = 0;
    for (let i = 0; i < 600; i++) {
      if (engine1x.state !== SIM_STATE.RUNNING) break;
      engine1x.step(1);
      steps1x++;
    }

    resetEntityIdCounter();

    const engine4x = createPhase1Engine('high');
    engine4x.timeScale = 4;
    engine4x.start();
    engine4x.addThreat(new ThreatEntity('SRBM', { lon: 127, lat: 39.5, alt: 0 }, { lon: 127, lat: 37, alt: 0 }));
    let steps4x = 0;
    for (let i = 0; i < 600; i++) {
      if (engine4x.state !== SIM_STATE.RUNNING) break;
      engine4x.step(1);
      steps4x++;
    }

    // 4배속은 약 1/4 step으로 동일 시뮬 시간 도달
    expect(steps4x).toBeLessThan(steps1x);
  });
});
