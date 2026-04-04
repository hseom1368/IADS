/**
 * @file Phase 1.4 viz 모듈 구조 검증 테스트
 * 브라우저 의존 모듈이므로 파일 존재 + export 패턴만 검증
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIZ = resolve(__dirname, '..', 'src', 'viz');

describe('Phase 1.4: viz 모듈 구조', () => {

  describe('radar-viz.js', () => {
    const content = readFileSync(resolve(VIZ, 'radar-viz.js'), 'utf-8');

    it('createRadarVolume를 export해야 한다', () => {
      expect(content).toMatch(/export\s+function\s+createRadarVolume/);
    });

    it('Cesium Entity polyline 패턴을 사용해야 한다 (정적 오브젝트)', () => {
      expect(content).toMatch(/polyline/i);
      expect(content).toMatch(/ArcType\.NONE/);
    });

    it('구면 좌표 변환 공식이 포함되어야 한다', () => {
      expect(content).toMatch(/111320/); // dLon 변환 상수
      expect(content).toMatch(/110540/); // dLat 변환 상수
    });
  });

  describe('engagement-viz.js', () => {
    const content = readFileSync(resolve(VIZ, 'engagement-viz.js'), 'utf-8');

    it('initEngagementViz를 export해야 한다', () => {
      expect(content).toMatch(/export\s+function\s+initEngagementViz/);
    });

    it('updateThreats를 export해야 한다', () => {
      expect(content).toMatch(/export\s+function\s+updateThreats/);
    });

    it('updateInterceptors를 export해야 한다', () => {
      expect(content).toMatch(/export\s+function\s+updateInterceptors/);
    });

    it('triggerExplosion을 export해야 한다', () => {
      expect(content).toMatch(/export\s+function\s+triggerExplosion/);
    });

    it('PointPrimitiveCollection을 사용해야 한다 (동적 오브젝트)', () => {
      expect(content).toMatch(/PointPrimitiveCollection/);
    });

    it('PolylineCollection을 사용해야 한다 (궤적)', () => {
      expect(content).toMatch(/PolylineCollection/);
    });

    it('CallbackProperty를 사용하지 않아야 한다', () => {
      expect(content).not.toMatch(/CallbackProperty/);
    });

    it('링 버퍼 상한이 정의되어야 한다', () => {
      expect(content).toMatch(/80/);  // 위협 궤적 상한
      expect(content).toMatch(/50/);  // 요격미사일 궤적 상한
    });
  });

  describe('hud.js', () => {
    const content = readFileSync(resolve(VIZ, 'hud.js'), 'utf-8');

    it('initHud를 export해야 한다', () => {
      expect(content).toMatch(/export\s+function\s+initHud/);
    });

    it('updateHud를 export해야 한다', () => {
      expect(content).toMatch(/export\s+function\s+updateHud/);
    });

    it('addLogEntry를 export해야 한다', () => {
      expect(content).toMatch(/export\s+function\s+addLogEntry/);
    });

    it('Cesium 의존성이 없어야 한다 (HTML overlay)', () => {
      expect(content).not.toMatch(/import.*Cesium/i);
    });
  });
});
