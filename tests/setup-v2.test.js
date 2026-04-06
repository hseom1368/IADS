/**
 * @file Phase 1.0 v2 스캐폴딩 검증 — 업데이트된 스펙 반영 확인
 * 기존 setup.test.js의 검증에 추가하여 새 C2 계층, L-SAM 통합체계,
 * 토폴로지, 킬체인 HUD 등 v2 스펙 항목을 검증한다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'src');

describe('Phase 1.0 v2: 업데이트된 스펙 반영', () => {

  describe('weapon-data.js — C2 계층 구조', () => {
    const content = readFileSync(resolve(SRC, 'config', 'weapon-data.js'), 'utf-8');

    it('ICC (대대급) C2 타입이 정의되어야 한다', () => {
      expect(content).toMatch(/ICC:\s*\{/);
    });

    it('ECS (포대급) C2 타입이 정의되어야 한다', () => {
      expect(content).toMatch(/ECS:\s*\{/);
    });

    it('KAMD_OPS가 ICC를 subordinates로 가져야 한다', () => {
      expect(content).toMatch(/subordinates:\s*\[.*'ICC'.*\]/);
    });
  });

  describe('weapon-data.js — L-SAM ABM+AAM 통합체계', () => {
    const content = readFileSync(resolve(SRC, 'config', 'weapon-data.js'), 'utf-8');

    it('LSAM_ABM (탄도탄) 타입이 존재해야 한다', () => {
      expect(content).toMatch(/LSAM_ABM:\s*\{/);
    });

    it('LSAM_AAM (대공) 타입이 존재해야 한다', () => {
      expect(content).toMatch(/LSAM_AAM:\s*\{/);
    });

    it('LSAM_ABM이 killRadius를 가져야 한다', () => {
      expect(content).toMatch(/killRadius/);
    });

    it('LSAM_ABM의 relations에 ecs, icc가 정의되어야 한다', () => {
      expect(content).toMatch(/ecs:\s*'ECS'/);
      expect(content).toMatch(/icc:\s*'ICC'/);
    });
  });

  describe('weapon-data.js — 토폴로지 관계', () => {
    const content = readFileSync(resolve(SRC, 'config', 'weapon-data.js'), 'utf-8');

    it('TOPOLOGY_RELATIONS가 export 되어야 한다', () => {
      expect(content).toMatch(/export\s+const\s+TOPOLOGY_RELATIONS/);
    });

    it('linear 토폴로지가 정의되어야 한다', () => {
      expect(content).toMatch(/linear:\s*\{/);
    });

    it('killweb 토폴로지가 정의되어야 한다', () => {
      expect(content).toMatch(/killweb:\s*\{/);
    });

    it('linear 킬체인에 link delay가 정의되어야 한다', () => {
      expect(content).toMatch(/delay:\s*16/);
      expect(content).toMatch(/delay:\s*1/);
    });
  });

  describe('physics.js — 신규 함수 스텁', () => {
    const content = readFileSync(resolve(SRC, 'core', 'physics.js'), 'utf-8');

    it('predictInterceptPoint 함수가 export 되어야 한다', () => {
      expect(content).toMatch(/export\s+function\s+predictInterceptPoint/);
    });

    it('calculateLaunchTime 함수가 export 되어야 한다', () => {
      expect(content).toMatch(/export\s+function\s+calculateLaunchTime/);
    });

    it('predictedPk 함수가 export 되어야 한다', () => {
      expect(content).toMatch(/export\s+function\s+predictedPk/);
    });
  });

  describe('entities.js — C2Entity', () => {
    const content = readFileSync(resolve(SRC, 'core', 'entities.js'), 'utf-8');

    it('C2Entity 클래스가 export 되어야 한다', () => {
      expect(content).toMatch(/export\s+class\s+C2Entity/);
    });

    it('C2Entity가 pendingTracks 필드를 가져야 한다', () => {
      expect(content).toMatch(/pendingTracks/);
    });

    it('C2Entity가 engagementPlan 필드를 가져야 한다', () => {
      expect(content).toMatch(/engagementPlan/);
    });

    it('C2Entity가 receiveTrack 메서드를 가져야 한다', () => {
      expect(content).toMatch(/receiveTrack/);
    });
  });

  describe('registry.js — buildTopology', () => {
    const content = readFileSync(resolve(SRC, 'core', 'registry.js'), 'utf-8');

    it('buildTopology 메서드가 정의되어야 한다', () => {
      expect(content).toMatch(/buildTopology/);
    });
  });

  describe('killchain.js — 선형 킬체인 설계', () => {
    const content = readFileSync(resolve(SRC, 'core', 'killchain.js'), 'utf-8');

    it('LinearKillChain 흐름이 문서화되어야 한다', () => {
      expect(content).toMatch(/GREEN_PINE.*KAMD_OPS/);
    });

    it('S2S 예상 시간이 문서화되어야 한다 (61~114초)', () => {
      expect(content).toMatch(/61~114/);
    });

    it('2단계 교전 모델이 문서화되어야 한다', () => {
      expect(content).toMatch(/predictInterceptPoint/);
      expect(content).toMatch(/calculateLaunchTime/);
      expect(content).toMatch(/predictedPk/);
    });
  });

  describe('comms.js — 통신 채널 모델', () => {
    const content = readFileSync(resolve(SRC, 'core', 'comms.js'), 'utf-8');

    it('링크 타입별 지연이 문서화되어야 한다', () => {
      expect(content).toMatch(/long_range.*16/s);
      expect(content).toMatch(/short_range.*1/s);
    });

    it('Kill Web IFCN이 문서화되어야 한다', () => {
      expect(content).toMatch(/ifcn/i);
    });
  });

  describe('viz/network-viz.js — C2 네트워크 시각화', () => {
    const content = readFileSync(resolve(SRC, 'viz', 'network-viz.js'), 'utf-8');

    it('C2 노드 배치가 문서화되어야 한다', () => {
      expect(content).toMatch(/KAMD_OPS/);
      expect(content).toMatch(/ICC/);
      expect(content).toMatch(/ECS/);
    });

    it('데이터링크 시각화가 문서화되어야 한다', () => {
      expect(content).toMatch(/데이터링크|datalink|DataLink/i);
    });
  });

  describe('index.html — 킬체인 진행 HUD', () => {
    const html = readFileSync(resolve(SRC, 'index.html'), 'utf-8');

    it('킬체인 HUD 컨테이너가 존재해야 한다', () => {
      expect(html).toMatch(/id="killchainHud"/);
    });

    it('GREEN_PINE 단계가 표시되어야 한다', () => {
      expect(html).toMatch(/id="kc-gp"/);
    });

    it('KAMD_OPS 단계가 표시되어야 한다', () => {
      expect(html).toMatch(/id="kc-kamd"/);
    });

    it('ICC 단계가 표시되어야 한다', () => {
      expect(html).toMatch(/id="kc-icc"/);
    });

    it('ECS 단계가 표시되어야 한다', () => {
      expect(html).toMatch(/id="kc-ecs"/);
    });

    it('L-SAM 발사 단계가 표시되어야 한다', () => {
      expect(html).toMatch(/id="kc-fire"/);
    });

    it('킬체인 CSS 스타일이 정의되어야 한다', () => {
      expect(html).toMatch(/\.kc-step/);
    });
  });
});
