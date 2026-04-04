/**
 * @module viz/engagement-viz
 * 위협/요격미사일 렌더링 — PointPrimitiveCollection + PolylineCollection
 * 동적 오브젝트 → Primitive API only (CLAUDE.md)
 * 콜백 기�� 속성 업데이트 절대 금지 — 직접 속성 할당만 사용
 */

/* global Cesium */

// ── 링 버퍼 상한 (CLAUDE.md) ──
const THREAT_TRAIL_MAX = 80;
const INTERCEPTOR_TRAIL_MAX = 50;

// ── 렌더링 상태 ──
let _viewer = null;
let _threatPoints = null;
let _interceptorPoints = null;
let _trailCollection = null;

/** 위협별 렌더링 데이터: { point, trail, trailPositions[] } */
const _threatRender = new Map();
/** 요격미사일별 렌더링 데이터 */
const _interceptorRender = new Map();

/**
 * Engagement 시각화를 초기화한다.
 * @param {Cesium.Viewer} viewer
 */
export function initEngagementViz(viewer) {
  _viewer = viewer;

  _threatPoints = new Cesium.PointPrimitiveCollection();
  viewer.scene.primitives.add(_threatPoints);

  _interceptorPoints = new Cesium.PointPrimitiveCollection();
  viewer.scene.primitives.add(_interceptorPoints);

  _trailCollection = new Cesium.PolylineCollection();
  viewer.scene.primitives.add(_trailCollection);
}

/**
 * 위협 엔티티들의 위치를 업데이트하고 궤적을 그린다.
 * @param {Array} threats - ThreatEntity[]
 */
export function updateThreats(threats) {
  if (!_viewer) return;

  for (const threat of threats) {
    const pos = Cesium.Cartesian3.fromDegrees(
      threat.position.lon, threat.position.lat, threat.position.alt
    );

    let render = _threatRender.get(threat.id);

    // 종료 상태: 렌더링 제거
    if (threat.state === 'intercepted' || threat.state === 'leaked') {
      if (render) {
        _threatPoints.remove(render.point);
        if (render.trail) _trailCollection.remove(render.trail);
        _threatRender.delete(threat.id);
      }
      continue;
    }

    // 신규 위협: 포인트 생성
    if (!render) {
      const point = _threatPoints.add({
        position: pos,
        pixelSize: 11,
        color: Cesium.Color.fromCssColorString('#ff4444'),
        scaleByDistance: new Cesium.NearFarScalar(5e3, 1.5, 5e6, 0.3)
      });

      render = { point, trail: null, trailPositions: [] };
      _threatRender.set(threat.id, render);
    }

    // 위치 업데이트 (직접 속성 할당)
    render.point.position = pos;

    // 궤적 링 버퍼 업데이트
    render.trailPositions.push(pos);
    if (render.trailPositions.length > THREAT_TRAIL_MAX) {
      render.trailPositions.shift();
    }

    // 궤적 폴리라인 업데이트
    if (render.trailPositions.length >= 2) {
      if (render.trail) {
        _trailCollection.remove(render.trail);
      }
      render.trail = _trailCollection.add({
        positions: render.trailPositions.slice(),
        width: 2,
        material: Cesium.Material.fromType('PolylineGlow', {
          glowPower: 0.18,
          color: Cesium.Color.fromCssColorString('#ff4444').withAlpha(0.6)
        })
      });
    }
  }
}

/**
 * 요격미사일 엔티티들의 위치를 업데이트하고 궤적을 그린다.
 * @param {Array} interceptors - InterceptorEntity[]
 */
export function updateInterceptors(interceptors) {
  if (!_viewer) return;

  for (const intc of interceptors) {
    const pos = Cesium.Cartesian3.fromDegrees(
      intc.position.lon, intc.position.lat, intc.position.alt
    );

    let render = _interceptorRender.get(intc.id);

    // 종료 상태: 렌더링 제거
    if (intc.state === 'hit' || intc.state === 'miss') {
      if (render) {
        _interceptorPoints.remove(render.point);
        if (render.trail) _trailCollection.remove(render.trail);
        _interceptorRender.delete(intc.id);
      }
      continue;
    }

    // 신규 요격미사일: 포인트 생성
    if (!render) {
      const point = _interceptorPoints.add({
        position: pos,
        pixelSize: 8,
        color: Cesium.Color.fromCssColorString('#00ff88')
      });

      render = { point, trail: null, trailPositions: [] };
      _interceptorRender.set(intc.id, render);
    }

    // 위치 업데이트
    render.point.position = pos;

    // 궤적 링 버퍼
    render.trailPositions.push(pos);
    if (render.trailPositions.length > INTERCEPTOR_TRAIL_MAX) {
      render.trailPositions.shift();
    }

    if (render.trailPositions.length >= 2) {
      if (render.trail) {
        _trailCollection.remove(render.trail);
      }
      render.trail = _trailCollection.add({
        positions: render.trailPositions.slice(),
        width: 1.5,
        material: Cesium.Material.fromType('PolylineGlow', {
          glowPower: 0.35,
          color: Cesium.Color.fromCssColorString('#00ff88').withAlpha(0.95)
        })
      });
    }
  }
}

/**
 * 폭발 이펙트를 발생시킨다.
 * @param {Cesium.Viewer} viewer
 * @param {{lon:number, lat:number, alt:number}} position
 * @param {boolean} isHit - true=요격 성공(orange 7km), false=실패(red 30km)
 */
export function triggerExplosion(viewer, position, isHit) {
  const pos = Cesium.Cartesian3.fromDegrees(position.lon, position.lat, position.alt);
  const sz = isHit ? 7000 : 30000;
  const col = isHit ? '#ff8800' : '#ff2200';

  // 구체 폭발
  const sphere = viewer.entities.add({
    position: pos,
    ellipsoid: {
      radii: new Cesium.Cartesian3(sz, sz, sz),
      material: Cesium.Color.fromCssColorString(col).withAlpha(0.8),
      outline: true,
      outlineColor: Cesium.Color.WHITE.withAlpha(0.6)
    }
  });

  // 지면 원형 (miss 시에만)
  let groundRing = null;
  if (!isHit) {
    groundRing = viewer.entities.add({
      position: pos,
      ellipse: {
        semiMajorAxis: sz * 1.6,
        semiMinorAxis: sz * 1.6,
        material: Cesium.Color.fromCssColorString('#ffcc00').withAlpha(0.55),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#ff4400'),
        height: 0
      }
    });
  }

  // 스크린 플래시
  _doFlash(isHit);

  // 페이드 아웃 + 제거
  let opacity = 0.8;
  const duration = isHit ? 1000 : 2000;
  const interval = 55;
  const step = 0.8 / (duration / interval);

  const fd = setInterval(() => {
    opacity -= step;
    if (opacity <= 0) {
      clearInterval(fd);
      try { viewer.entities.remove(sphere); } catch (_) { /* */ }
      if (groundRing) {
        try { viewer.entities.remove(groundRing); } catch (_) { /* */ }
      }
    }
  }, interval);
}

/**
 * 모든 engagement 렌더링을 초기화한다.
 */
export function clearAll() {
  if (_threatPoints) _threatPoints.removeAll();
  if (_interceptorPoints) _interceptorPoints.removeAll();
  if (_trailCollection) _trailCollection.removeAll();
  _threatRender.clear();
  _interceptorRender.clear();
}

/**
 * 스크린 플래시 효과
 * @private
 */
function _doFlash(isHit) {
  const el = document.getElementById(isHit ? 'flash' : 'flashR');
  if (!el) return;
  el.classList.add('on');
  setTimeout(() => el.classList.remove('on'), 120);
}
