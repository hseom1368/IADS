/**
 * @file Phase 1.0 스캐폴딩 검증 테스트
 * 프로젝트 구조, 모듈 존재 여부, 설계 원칙 준수를 확인한다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'src');

describe('Phase 1.0: 프로젝트 스캐폴딩', () => {

  describe('디렉토리 구조', () => {
    const expectedDirs = [
      'src/config',
      'src/core',
      'src/viz',
      'src/prototype',
      'tests'
    ];

    it.each(expectedDirs)('%s 디렉토리가 존재해야 한다', (dir) => {
      expect(existsSync(resolve(ROOT, dir))).toBe(true);
    });
  });

  describe('core 모듈 파일 존재', () => {
    const coreModules = [
      'physics.js',
      'registry.js',
      'entities.js',
      'sim-engine.js',
      'killchain.js',
      'comms.js',
      'event-log.js',
      'metrics.js'
    ];

    it.each(coreModules)('core/%s 파일이 존재해야 한다', (file) => {
      expect(existsSync(resolve(SRC, 'core', file))).toBe(true);
    });
  });

  describe('viz 모듈 파일 존재', () => {
    const vizModules = [
      'cesium-app.js',
      'radar-viz.js',
      'engagement-viz.js',
      'network-viz.js',
      'hud.js',
      'interaction.js'
    ];

    it.each(vizModules)('viz/%s 파일이 존재해야 한다', (file) => {
      expect(existsSync(resolve(SRC, 'viz', file))).toBe(true);
    });
  });

  describe('config 모듈 파일 존재', () => {
    it('config/weapon-data.js 파일이 존재해야 한다', () => {
      expect(existsSync(resolve(SRC, 'config', 'weapon-data.js'))).toBe(true);
    });
  });

  describe('설계 원칙 준수', () => {
    it('core/ 모듈에 Cesium 의존성이 없어야 한다', () => {
      const coreFiles = [
        'physics.js', 'registry.js', 'entities.js', 'sim-engine.js',
        'killchain.js', 'comms.js', 'event-log.js', 'metrics.js'
      ];

      for (const file of coreFiles) {
        const content = readFileSync(resolve(SRC, 'core', file), 'utf-8');
        expect(content).not.toMatch(/import.*Cesium/i);
        expect(content).not.toMatch(/require.*[Cc]esium/);
      }
    });

    it('weapon-data.js가 freeze된 export를 가져야 한다', () => {
      const content = readFileSync(resolve(SRC, 'config', 'weapon-data.js'), 'utf-8');
      expect(content).toMatch(/Object\.freeze/);
      expect(content).toMatch(/export\s+const\s+SHOOTER_TYPES/);
      expect(content).toMatch(/export\s+const\s+SENSOR_TYPES/);
      expect(content).toMatch(/export\s+const\s+THREAT_TYPES/);
    });
  });

  describe('index.html 구성', () => {
    const html = readFileSync(resolve(SRC, 'index.html'), 'utf-8');

    it('Cesium CDN을 로드해야 한다', () => {
      expect(html).toMatch(/cesium\.com\/downloads\/cesiumjs/);
    });

    it('Google Fonts를 로드해야 한다', () => {
      expect(html).toMatch(/fonts\.googleapis\.com.*Share\+Tech\+Mono/);
      expect(html).toMatch(/Orbitron/);
    });

    it('cesium-app.js를 ES Module로 로드해야 한다', () => {
      expect(html).toMatch(/type="module".*cesium-app\.js/);
    });

    it('HUD 컨테이너가 존재해야 한다', () => {
      expect(html).toMatch(/id="hud"/);
      expect(html).toMatch(/id="log"/);
      expect(html).toMatch(/id="controls"/);
    });

    it('플래시 효과 요소가 존재해야 한다', () => {
      expect(html).toMatch(/id="flash"/);
      expect(html).toMatch(/id="flashR"/);
    });
  });

  describe('cesium-app.js 구성', () => {
    const content = readFileSync(resolve(SRC, 'viz', 'cesium-app.js'), 'utf-8');

    it('requestRenderMode를 true로 설정해야 한다', () => {
      expect(content).toMatch(/requestRenderMode:\s*true/);
    });

    it('scene3DOnly를 true로 설정해야 한다', () => {
      expect(content).toMatch(/scene3DOnly:\s*true/);
    });

    it('initViewer, setCameraPreset, getViewer를 export해야 한다', () => {
      expect(content).toMatch(/export\s+function\s+initViewer/);
      expect(content).toMatch(/export\s+function\s+setCameraPreset/);
      expect(content).toMatch(/export\s+function\s+getViewer/);
    });

    it('Cesium Ion 토큰이 설정되어야 한다', () => {
      expect(content).toMatch(/Ion\.defaultAccessToken/);
    });

    it('카메라 프리셋 4종이 정의되어야 한다', () => {
      expect(content).toMatch(/overhead/);
      expect(content).toMatch(/standard/);
      expect(content).toMatch(/horizontal/);
      expect(content).toMatch(/close/);
    });
  });
});
