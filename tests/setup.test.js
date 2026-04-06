/**
 * @file Phase 1.0 스캐폴딩 검증 테스트 (새 스펙 기준)
 * 업데이트된 MD 문서(ARCHITECTURE, weapon-specs, ROADMAP)를 기준으로
 * 프로젝트 구조, 타입 정의, 설계 원칙을 검증한다.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'src');

// ═══════════════════════════════════════════════════════════
//  1. 디렉토리 구조
// ═══════════════════════════════════════════════════════════

describe('Phase 1.0: 디렉토리 구조', () => {
  const expectedDirs = [
    'src/config',
    'src/core',
    'src/viz',
    'src/prototype',
    'tests',
    'docs'
  ];

  it.each(expectedDirs)('%s 디렉토리가 존재해야 한다', (dir) => {
    expect(existsSync(resolve(ROOT, dir))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
//  2. 파일 존재 확인
// ═══════════════════════════════════════════════════════════

describe('Phase 1.0: 모듈 파일 존재', () => {
  describe('core 모듈 (8개)', () => {
    const coreModules = [
      'physics.js', 'registry.js', 'entities.js', 'sim-engine.js',
      'killchain.js', 'comms.js', 'event-log.js', 'metrics.js'
    ];

    it.each(coreModules)('core/%s 파일이 존재해야 한다', (file) => {
      expect(existsSync(resolve(SRC, 'core', file))).toBe(true);
    });
  });

  describe('viz 모듈 (6개)', () => {
    const vizModules = [
      'cesium-app.js', 'radar-viz.js', 'engagement-viz.js',
      'network-viz.js', 'hud.js', 'interaction.js'
    ];

    it.each(vizModules)('viz/%s 파일이 존재해야 한다', (file) => {
      expect(existsSync(resolve(SRC, 'viz', file))).toBe(true);
    });
  });

  it('config/weapon-data.js가 존재해야 한다', () => {
    expect(existsSync(resolve(SRC, 'config', 'weapon-data.js'))).toBe(true);
  });

  it('package.json이 존재해야 한다', () => {
    expect(existsSync(resolve(ROOT, 'package.json'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
//  3. weapon-data.js 타입 정의 검증
// ═══════════════════════════════════════════════════════════

describe('Phase 1.0: weapon-data.js', () => {

  // 런타임 import로 실제 freeze된 값 검증
  let SHOOTER_TYPES, SENSOR_TYPES, C2_TYPES, THREAT_TYPES, TOPOLOGY_RELATIONS;

  beforeAll(async () => {
    const mod = await import('../src/config/weapon-data.js');
    SHOOTER_TYPES = mod.SHOOTER_TYPES;
    SENSOR_TYPES = mod.SENSOR_TYPES;
    C2_TYPES = mod.C2_TYPES;
    THREAT_TYPES = mod.THREAT_TYPES;
    TOPOLOGY_RELATIONS = mod.TOPOLOGY_RELATIONS;
  });

  // ── LSAM_ABM (탄도탄 요격) ──

  describe('LSAM_ABM (탄도탄 요격)', () => {
    it('타입이 존재해야 한다', () => {
      expect(SHOOTER_TYPES.LSAM_ABM).toBeDefined();
    });

    it('capability 값이 weapon-specs와 일치해야 한다', () => {
      const c = SHOOTER_TYPES.LSAM_ABM.capability;
      expect(c.maxRange).toBe(150);         // km
      expect(c.minRange).toBe(20);          // km
      expect(c.maxAlt).toBe(100);           // km
      expect(c.minAlt).toBe(60);            // km
      expect(c.ammoCount).toBe(6);
      expect(c.interceptMethod).toBe('hit-to-kill');
    });

    it('Pk가 SRBM=0.85여야 한다', () => {
      expect(SHOOTER_TYPES.LSAM_ABM.capability.pkTable.SRBM).toBe(0.85);
    });

    it('요격미사일 파라미터가 정의되어야 한다', () => {
      const c = SHOOTER_TYPES.LSAM_ABM.capability;
      expect(c.interceptorSpeed).toBe(1500);   // m/s
      expect(c.boostTime).toBe(2.0);           // s
      expect(c.navConstant).toBe(4.5);         // N
    });

    it('hit-to-kill: killRadius 0.05km (50m), warheadEffectiveness 0.95', () => {
      const c = SHOOTER_TYPES.LSAM_ABM.capability;
      expect(c.killRadius).toBe(0.05);
      expect(c.warheadEffectiveness).toBe(0.95);
    });

    it('relations에 C2 계층이 올바르게 정의되어야 한다', () => {
      const r = SHOOTER_TYPES.LSAM_ABM.relations;
      expect(r.ecs).toBe('ECS');
      expect(r.icc).toBe('ICC');
      expect(r.reportingC2).toBe('KAMD_OPS');
      expect(r.commandC2).toEqual(['KAMD_OPS', 'MCRC']);
    });

    it('c2Axis가 다축 배열이어야 한다 (KAMD+MCRC)', () => {
      expect(SHOOTER_TYPES.LSAM_ABM.relations.c2Axis).toEqual(['KAMD', 'MCRC']);
    });

    it('priority가 ABM_FIRST여야 한다', () => {
      expect(SHOOTER_TYPES.LSAM_ABM.relations.priority).toBe('ABM_FIRST');
    });

    it('engageableThreats에 SRBM이 포함되어야 한다', () => {
      expect(SHOOTER_TYPES.LSAM_ABM.relations.engageableThreats).toContain('SRBM');
    });

    it('requiredSensors에 GREEN_PINE과 MSAM_MFR이 포함되어야 한다', () => {
      expect(SHOOTER_TYPES.LSAM_ABM.relations.requiredSensors).toContain('GREEN_PINE');
      expect(SHOOTER_TYPES.LSAM_ABM.relations.requiredSensors).toContain('MSAM_MFR');
    });
  });

  // ── LSAM_AAM (대공 방어) ──

  describe('LSAM_AAM (대공 방어)', () => {
    it('타입이 존재해야 한다', () => {
      expect(SHOOTER_TYPES.LSAM_AAM).toBeDefined();
    });

    it('capability 값이 weapon-specs와 일치해야 한다', () => {
      const c = SHOOTER_TYPES.LSAM_AAM.capability;
      expect(c.maxRange).toBe(200);         // km
      expect(c.minRange).toBe(10);          // km
      expect(c.maxAlt).toBe(25);            // km
      expect(c.minAlt).toBe(0.05);          // km (50m)
      expect(c.ammoCount).toBe(8);
      expect(c.interceptMethod).toBe('guided');
    });

    it('Pk가 AIRCRAFT=0.90, CRUISE_MISSILE=0.80, UAS=0.60이어야 한다', () => {
      const pk = SHOOTER_TYPES.LSAM_AAM.capability.pkTable;
      expect(pk.AIRCRAFT).toBe(0.90);
      expect(pk.CRUISE_MISSILE).toBe(0.80);
      expect(pk.UAS).toBe(0.60);
    });

    it('guided: killRadius 0.5km (500m), warheadEffectiveness 0.75', () => {
      const c = SHOOTER_TYPES.LSAM_AAM.capability;
      expect(c.killRadius).toBe(0.5);
      expect(c.warheadEffectiveness).toBe(0.75);
    });

    it('priority가 AAM_SECOND여야 한다', () => {
      expect(SHOOTER_TYPES.LSAM_AAM.relations.priority).toBe('AAM_SECOND');
    });
  });

  // ── 센서 ──

  describe('GREEN_PINE (조기경보)', () => {
    it('탐지거리 800km, 추적용량 150이어야 한다', () => {
      const c = SENSOR_TYPES.GREEN_PINE.capability;
      expect(c.maxRange).toBe(800);
      expect(c.trackingCapacity).toBe(150);
    });

    it('최소탐지고도 10000m (10km)여야 한다', () => {
      expect(SENSOR_TYPES.GREEN_PINE.capability.minDetectionAltitude).toBe(10000);
    });

    it('SRBM만 탐지 가능해야 한다', () => {
      expect(SENSOR_TYPES.GREEN_PINE.capability.detectableThreats).toEqual(['SRBM']);
    });

    it('KAMD_OPS에 보고해야 한다', () => {
      expect(SENSOR_TYPES.GREEN_PINE.relations.reportingC2).toBe('KAMD_OPS');
    });
  });

  describe('MSAM_MFR (다기능레이더)', () => {
    it('탐지거리 300km(탄도탄), 추적용량 50이어야 한다', () => {
      const c = SENSOR_TYPES.MSAM_MFR.capability;
      expect(c.maxRange).toBe(300);
      expect(c.trackingCapacity).toBe(50);
    });

    it('전 위협 유형을 탐지 가능해야 한다', () => {
      const dt = SENSOR_TYPES.MSAM_MFR.capability.detectableThreats;
      expect(dt).toContain('SRBM');
      expect(dt).toContain('CRUISE_MISSILE');
      expect(dt).toContain('AIRCRAFT');
    });

    it('ECS(포대)에 보고해야 한다', () => {
      expect(SENSOR_TYPES.MSAM_MFR.relations.reportingC2).toBe('ECS');
    });
  });

  // ── C2 계층 (KAMD_OPS → ICC → ECS) ──

  describe('C2 계층 구조', () => {
    it('KAMD_OPS: 사령부급, 처리지연 20~60s, 동시처리 3건', () => {
      const k = C2_TYPES.KAMD_OPS;
      expect(k).toBeDefined();
      expect(k.processingDelay).toEqual({ min: 20, max: 60 });
      expect(k.simultaneousCapacity).toBe(3);
      expect(k.level).toBe('command');
    });

    it('ICC: 대대급, 처리지연 5~15s, 동시처리 5건', () => {
      const i = C2_TYPES.ICC;
      expect(i).toBeDefined();
      expect(i.processingDelay).toEqual({ min: 5, max: 15 });
      expect(i.simultaneousCapacity).toBe(5);
      expect(i.level).toBe('battalion');
      expect(i.superior).toBe('KAMD_OPS');
    });

    it('ECS: 포대급, 처리지연 2~5s, 동시처리 8건', () => {
      const e = C2_TYPES.ECS;
      expect(e).toBeDefined();
      expect(e.processingDelay).toEqual({ min: 2, max: 5 });
      expect(e.simultaneousCapacity).toBe(8);
      expect(e.level).toBe('battery');
      expect(e.superior).toBe('ICC');
    });

    it('KAMD_OPS → ICC → ECS 종속 관계가 올바라야 한다', () => {
      expect(C2_TYPES.KAMD_OPS.subordinates).toContain('ICC');
      expect(C2_TYPES.ICC.subordinates).toContain('ECS');
      expect(C2_TYPES.ECS.subordinates).toEqual([]);
    });
  });

  // ── SRBM 위협 ──

  describe('SRBM (단거리 탄도미사일)', () => {
    it('속도 Mach 6 (2040 m/s)여야 한다', () => {
      expect(THREAT_TYPES.SRBM.speed).toBe(2040);
    });

    it('3단계 비행프로파일이어야 한다', () => {
      expect(THREAT_TYPES.SRBM.flightProfile.type).toBe('ballistic');
      expect(THREAT_TYPES.SRBM.flightProfile.phases).toHaveLength(3);
    });

    it('Phase 1 (부스트): 0~25%, 고도 0→150km, 비기동', () => {
      const p = THREAT_TYPES.SRBM.flightProfile.phases[0];
      expect(p.range).toEqual([0, 0.25]);
      expect(p.altitude).toEqual([0, 150]);
      expect(p.speedMult).toEqual([0.5, 1.0]);
      expect(p.maneuver).toBe(false);
    });

    it('Phase 2 (중간): 25~70%, 고도 150km 유지, 비기동', () => {
      const p = THREAT_TYPES.SRBM.flightProfile.phases[1];
      expect(p.range).toEqual([0.25, 0.70]);
      expect(p.altitude).toEqual([150, 150]);
      expect(p.maneuver).toBe(false);
    });

    it('Phase 3 (종말): 70~100%, 고도 150→0km, 기동, 속도×1.5', () => {
      const p = THREAT_TYPES.SRBM.flightProfile.phases[2];
      expect(p.range).toEqual([0.70, 1.0]);
      expect(p.altitude).toEqual([150, 0]);
      expect(p.speedMult).toEqual([1.0, 1.5]);
      expect(p.maneuver).toBe(true);
    });

    it('RCS 0.1m², 탄도 시그니처여야 한다', () => {
      expect(THREAT_TYPES.SRBM.signature.rcs).toBe(0.1);
      expect(THREAT_TYPES.SRBM.signature.radarSignature).toBe('ballistic');
    });
  });

  // ── 토폴로지 ──

  describe('TOPOLOGY_RELATIONS', () => {
    it('TOPOLOGY_RELATIONS가 export 되어야 한다', () => {
      expect(TOPOLOGY_RELATIONS).toBeDefined();
    });

    it('linear 토폴로지: 4단계 킬체인, S2S 61~114초', () => {
      const lin = TOPOLOGY_RELATIONS.linear;
      expect(lin).toBeDefined();
      expect(lin.killchain).toHaveLength(4);
      expect(lin.s2sEstimate).toEqual({ min: 61, max: 114 });
    });

    it('linear 킬체인 지연: 장거리 16s, 단거리 1s', () => {
      const kc = TOPOLOGY_RELATIONS.linear.killchain;
      expect(kc[0]).toMatchObject({ from: 'GREEN_PINE', to: 'KAMD_OPS', delay: 16 });
      expect(kc[1]).toMatchObject({ from: 'KAMD_OPS', to: 'ICC', delay: 16 });
      expect(kc[2]).toMatchObject({ from: 'ICC', to: 'ECS', delay: 1 });
      expect(kc[3]).toMatchObject({ from: 'ECS', to: 'LSAM_ABM', delay: 1 });
    });

    it('killweb 토폴로지: S2S 5~9초', () => {
      const kw = TOPOLOGY_RELATIONS.killweb;
      expect(kw).toBeDefined();
      expect(kw.s2sEstimate).toEqual({ min: 5, max: 9 });
    });
  });

  // ── 불변성 ──

  describe('불변성 (Object.freeze)', () => {
    it('SHOOTER_TYPES를 수정할 수 없어야 한다', () => {
      const orig = SHOOTER_TYPES.LSAM_ABM.capability.maxRange;
      try { SHOOTER_TYPES.LSAM_ABM.capability.maxRange = 999; } catch (e) { /* strict */ }
      expect(SHOOTER_TYPES.LSAM_ABM.capability.maxRange).toBe(orig);
    });

    it('C2_TYPES를 수정할 수 없어야 한다', () => {
      const orig = C2_TYPES.KAMD_OPS.simultaneousCapacity;
      try { C2_TYPES.KAMD_OPS.simultaneousCapacity = 99; } catch (e) { /* strict */ }
      expect(C2_TYPES.KAMD_OPS.simultaneousCapacity).toBe(orig);
    });

    it('THREAT_TYPES를 수정할 수 없어야 한다', () => {
      const orig = THREAT_TYPES.SRBM.speed;
      try { THREAT_TYPES.SRBM.speed = 999; } catch (e) { /* strict */ }
      expect(THREAT_TYPES.SRBM.speed).toBe(orig);
    });

    it('TOPOLOGY_RELATIONS를 수정할 수 없어야 한다', () => {
      const orig = TOPOLOGY_RELATIONS.linear.s2sEstimate.min;
      try { TOPOLOGY_RELATIONS.linear.s2sEstimate.min = 0; } catch (e) { /* strict */ }
      expect(TOPOLOGY_RELATIONS.linear.s2sEstimate.min).toBe(orig);
    });
  });
});

// ═══════════════════════════════════════════════════════════
//  4. core 모듈 구조 검증
// ═══════════════════════════════════════════════════════════

describe('Phase 1.0: core 모듈 구조', () => {

  describe('설계 원칙: core/ 모듈에 Cesium 의존성 없음', () => {
    const coreFiles = [
      'physics.js', 'registry.js', 'entities.js', 'sim-engine.js',
      'killchain.js', 'comms.js', 'event-log.js', 'metrics.js'
    ];

    it.each(coreFiles)('core/%s에 Cesium import가 없어야 한다', (file) => {
      const content = readFileSync(resolve(SRC, 'core', file), 'utf-8');
      expect(content).not.toMatch(/import.*Cesium/i);
      expect(content).not.toMatch(/require.*[Cc]esium/);
    });
  });

  describe('physics.js — 7개 함수 export', () => {
    const content = readFileSync(resolve(SRC, 'core', 'physics.js'), 'utf-8');

    it.each([
      'slantRange', 'ballisticTrajectory', 'pngGuidance', 'isInSector',
      'predictInterceptPoint', 'calculateLaunchTime', 'predictedPk'
    ])('%s 함수가 export 되어야 한다', (fn) => {
      expect(content).toMatch(new RegExp(`export\\s+function\\s+${fn}`));
    });
  });

  describe('entities.js — 엔티티 클래스 export', () => {
    const content = readFileSync(resolve(SRC, 'core', 'entities.js'), 'utf-8');

    it.each([
      'BaseEntity', 'SensorEntity', 'C2Entity',
      'ShooterEntity', 'ThreatEntity', 'InterceptorEntity'
    ])('%s 클래스가 export 되어야 한다', (cls) => {
      expect(content).toMatch(new RegExp(`export\\s+class\\s+${cls}`));
    });

    it('C2Entity가 receiveTrack 메서드를 가져야 한다', () => {
      expect(content).toMatch(/receiveTrack\s*\(/);
    });

    it('C2Entity가 pendingTracks, engagementPlan, activeProcessingCount를 가져야 한다', () => {
      expect(content).toMatch(/this\.pendingTracks/);
      expect(content).toMatch(/this\.engagementPlan/);
      expect(content).toMatch(/this\.activeProcessingCount/);
    });
  });

  describe('registry.js — Registry 클래스', () => {
    const content = readFileSync(resolve(SRC, 'core', 'registry.js'), 'utf-8');

    it('Registry 클래스가 export 되어야 한다', () => {
      expect(content).toMatch(/export\s+class\s+Registry/);
    });

    it.each([
      'getPrioritizedShooters', 'getDetectableThreats', 'getSensorsForC2',
      'getShootersForC2', 'getAxisForShooter', 'getShooterCapability',
      'getSensorCapability', 'getThreatType', 'getC2Type', 'buildTopology'
    ])('%s 메서드가 정의되어야 한다', (method) => {
      expect(content).toMatch(new RegExp(method));
    });
  });

  describe('killchain.js — 선형 킬체인 설계 문서화', () => {
    const content = readFileSync(resolve(SRC, 'core', 'killchain.js'), 'utf-8');

    it('GREEN_PINE → KAMD_OPS 킬체인 흐름이 문서화되어야 한다', () => {
      expect(content).toMatch(/GREEN_PINE.*KAMD_OPS/);
    });

    it('S2S 예상 61~114초가 문서화되어야 한다', () => {
      expect(content).toMatch(/61~114/);
    });

    it('2단계 교전 모델 (predictInterceptPoint + calculateLaunchTime + predictedPk)', () => {
      expect(content).toMatch(/predictInterceptPoint/);
      expect(content).toMatch(/calculateLaunchTime/);
      expect(content).toMatch(/predictedPk/);
    });
  });

  describe('comms.js — 통신 채널 모델 문서화', () => {
    const content = readFileSync(resolve(SRC, 'core', 'comms.js'), 'utf-8');

    it('장거리 링크 16s가 문서화되어야 한다', () => {
      expect(content).toMatch(/long_range.*16|16.*long_range/s);
    });

    it('단거리 링크 1s가 문서화되어야 한다', () => {
      expect(content).toMatch(/short_range.*1|1.*short_range/s);
    });

    it('Kill Web IFCN이 문서화되어야 한다', () => {
      expect(content).toMatch(/ifcn/i);
    });
  });
});

// ═══════════════════════════════════════════════════════════
//  5. viz 모듈 구조 검증
// ═══════════════════════════════════════════════════════════

describe('Phase 1.0: viz 모듈 구조', () => {

  describe('cesium-app.js', () => {
    const content = readFileSync(resolve(SRC, 'viz', 'cesium-app.js'), 'utf-8');

    it('requestRenderMode: true 설정', () => {
      expect(content).toMatch(/requestRenderMode:\s*true/);
    });

    it('scene3DOnly: true 설정', () => {
      expect(content).toMatch(/scene3DOnly:\s*true/);
    });

    it('Cesium Ion 토큰 설정', () => {
      expect(content).toMatch(/Ion\.defaultAccessToken/);
    });

    it.each(['initViewer', 'setCameraPreset', 'getViewer', 'requestRender'])(
      '%s가 export 되어야 한다', (fn) => {
        expect(content).toMatch(new RegExp(`export\\s+function\\s+${fn}`));
      }
    );

    it('카메라 프리셋 4종 (overhead, standard, horizontal, close)', () => {
      expect(content).toMatch(/overhead/);
      expect(content).toMatch(/standard/);
      expect(content).toMatch(/horizontal/);
      expect(content).toMatch(/close/);
    });
  });

  describe('network-viz.js — C2 네트워크 시각화', () => {
    const content = readFileSync(resolve(SRC, 'viz', 'network-viz.js'), 'utf-8');

    it('KAMD_OPS, ICC, ECS C2 노드가 문서화되어야 한다', () => {
      expect(content).toMatch(/KAMD_OPS/);
      expect(content).toMatch(/ICC/);
      expect(content).toMatch(/ECS/);
    });

    it('데이터링크 시각화가 문서화되어야 한다', () => {
      expect(content).toMatch(/데이터링크|[Dd]atalink/);
    });
  });
});

// ═══════════════════════════════════════════════════════════
//  6. index.html 구성 검증
// ═══════════════════════════════════════════════════════════

describe('Phase 1.0: index.html 구성', () => {
  const html = readFileSync(resolve(SRC, 'index.html'), 'utf-8');

  it('Cesium CDN을 로드해야 한다', () => {
    expect(html).toMatch(/cesium\.com\/downloads\/cesiumjs/);
  });

  it('Google Fonts (Share Tech Mono + Orbitron)를 로드해야 한다', () => {
    expect(html).toMatch(/fonts\.googleapis\.com.*Share\+Tech\+Mono/);
    expect(html).toMatch(/Orbitron/);
  });

  it('main.js를 ES Module로 로드해야 한다', () => {
    expect(html).toMatch(/type="module".*main\.js/);
  });

  it('기본 HUD 컨테이너가 존재해야 한다', () => {
    expect(html).toMatch(/id="hud"/);
    expect(html).toMatch(/id="log"/);
    expect(html).toMatch(/id="controls"/);
  });

  it('플래시 효과 요소가 존재해야 한다', () => {
    expect(html).toMatch(/id="flash"/);
    expect(html).toMatch(/id="flashR"/);
  });

  describe('킬체인 진행 HUD', () => {
    it('킬체인 HUD 컨테이너가 존재해야 한다', () => {
      expect(html).toMatch(/id="killchainHud"/);
    });

    it.each([
      ['GREEN_PINE', 'kc-gp'],
      ['KAMD_OPS', 'kc-kamd'],
      ['ICC', 'kc-icc'],
      ['ECS', 'kc-ecs'],
      ['L-SAM', 'kc-fire']
    ])('%s 단계 (id=%s)가 표시되어야 한다', (name, id) => {
      expect(html).toMatch(new RegExp(`id="${id}"`));
    });

    it('킬체인 CSS 스타일이 정의되어야 한다', () => {
      expect(html).toMatch(/\.kc-step/);
    });
  });
});
