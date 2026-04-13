/**
 * viz/engagement-viz.js — 위협/요격미사일 궤적 + 폭발 시각화
 *
 * 동적 오브젝트: Primitive API
 * - 위협: PointPrimitiveCollection (빨강 11px)
 * - 요격미사일: PointPrimitiveCollection (녹색 8px)
 * - 궤적: PolylineCollection (링 버퍼: 위협 80, 요격 50)
 * - 폭발: Entity (임시, 페이드 후 제거)
 */

const THREAT_COLORS = {
  SRBM: Cesium.Color.fromCssColorString('#ff4444'),
  CRUISE_MISSILE: Cesium.Color.fromCssColorString('#ff8800'),
  AIRCRAFT: Cesium.Color.fromCssColorString('#ffcc00'),
  UAS: Cesium.Color.fromCssColorString('#ffcc00'),
};

const INTERCEPTOR_COLOR = Cesium.Color.fromCssColorString('#00ff88');

const TRAIL_LIMIT_THREAT = 80;
const TRAIL_LIMIT_INTERCEPTOR = 50;
const TRAIL_MIN_DISTANCE = 500; // m between trail points

export class EngagementViz {
  /**
   * @param {Cesium.Viewer} viewer
   */
  constructor(viewer) {
    this.viewer = viewer;

    // Primitive collections
    this.threatPoints = new Cesium.PointPrimitiveCollection();
    this.interceptorPoints = new Cesium.PointPrimitiveCollection();
    this.trailLines = new Cesium.PolylineCollection();

    viewer.scene.primitives.add(this.threatPoints);
    viewer.scene.primitives.add(this.interceptorPoints);
    viewer.scene.primitives.add(this.trailLines);

    // Label collection
    this.labels = new Cesium.LabelCollection();
    viewer.scene.primitives.add(this.labels);

    /** @type {Map<string, { point: object, trail: object, positions: Cesium.Cartesian3[], label: object }>} */
    this.threatViz = new Map();

    /** @type {Map<string, { point: object, trail: object, positions: Cesium.Cartesian3[] }>} */
    this.interceptorViz = new Map();
  }

  /**
   * 위협 시각화 추가
   * @param {string} threatId
   * @param {string} typeId
   * @param {string} name
   * @param {{ lon: number, lat: number, alt: number }} position
   */
  addThreat(threatId, typeId, name, position) {
    const pos = Cesium.Cartesian3.fromDegrees(position.lon, position.lat, position.alt);
    const color = THREAT_COLORS[typeId] || THREAT_COLORS.SRBM;

    const point = this.threatPoints.add({
      position: pos,
      pixelSize: 11,
      color: color,
      scaleByDistance: new Cesium.NearFarScalar(5e3, 1.5, 5e6, 0.3),
      translucencyByDistance: new Cesium.NearFarScalar(5e3, 1.0, 8e6, 0.1),
    });

    const trail = this.trailLines.add({
      positions: [pos, pos],
      width: 2,
      material: Cesium.Material.fromType('PolylineGlow', {
        glowPower: 0.18,
        color: color.withAlpha(0.8),
      }),
    });

    // 라벨: 이름 + 고도 + Mach (updateThreat에서 실시간 갱신)
    const label = this.labels.add({
      position: pos,
      text: name,
      font: '9px Share Tech Mono',
      fillColor: color,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(12, -4),
      horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2e6),
      scale: 1.0,
    });

    this.threatViz.set(threatId, { point, trail, positions: [pos], label, name, color });
  }

  /**
   * 위협 위치 + 상시 라벨 갱신
   * @param {string} threatId
   * @param {{ lon: number, lat: number, alt: number }} position
   * @param {{ speed?: number, altKm?: number }} [meta] - 없으면 라벨 텍스트는 기존 값 유지
   */
  updateThreat(threatId, position, meta) {
    const viz = this.threatViz.get(threatId);
    if (!viz) return;

    const pos = Cesium.Cartesian3.fromDegrees(position.lon, position.lat, position.alt);
    viz.point.position = pos;
    viz.label.position = pos;

    // 라벨 텍스트: 이름 + 고도(km) + Mach (3줄)
    if (meta) {
      const altKm = meta.altKm ?? (position.alt / 1000);
      const mach = meta.speed !== undefined ? meta.speed / 340 : 0;
      viz.label.text = `${viz.name}\n${altKm.toFixed(0)} km\nM ${mach.toFixed(1)}`;
    }

    // 궤적 링 버퍼 (최소 거리 필터)
    const lastPos = viz.positions[viz.positions.length - 1];
    const dist = Cesium.Cartesian3.distance(lastPos, pos);
    if (dist >= TRAIL_MIN_DISTANCE) {
      viz.positions.push(pos);
      if (viz.positions.length > TRAIL_LIMIT_THREAT) {
        viz.positions.shift();
      }
      viz.trail.positions = viz.positions;
    }
  }

  /**
   * 요격미사일 시각화 추가
   * @param {string} interceptorId
   * @param {{ lon: number, lat: number, alt: number }} position
   */
  addInterceptor(interceptorId, position) {
    const pos = Cesium.Cartesian3.fromDegrees(position.lon, position.lat, position.alt);

    const point = this.interceptorPoints.add({
      position: pos,
      pixelSize: 8,
      color: INTERCEPTOR_COLOR,
      scaleByDistance: new Cesium.NearFarScalar(5e3, 1.2, 5e6, 0.3),
    });

    const trail = this.trailLines.add({
      positions: [pos, pos],
      width: 2,
      material: Cesium.Material.fromType('PolylineGlow', {
        glowPower: 0.35,
        color: INTERCEPTOR_COLOR.withAlpha(0.95),
      }),
    });

    this.interceptorViz.set(interceptorId, { point, trail, positions: [pos] });
  }

  /**
   * 요격미사일 위치 갱신
   * @param {string} interceptorId
   * @param {{ lon: number, lat: number, alt: number }} position
   */
  updateInterceptor(interceptorId, position) {
    const viz = this.interceptorViz.get(interceptorId);
    if (!viz) return;

    const pos = Cesium.Cartesian3.fromDegrees(position.lon, position.lat, position.alt);
    viz.point.position = pos;

    const lastPos = viz.positions[viz.positions.length - 1];
    const dist = Cesium.Cartesian3.distance(lastPos, pos);
    if (dist >= TRAIL_MIN_DISTANCE) {
      viz.positions.push(pos);
      if (viz.positions.length > TRAIL_LIMIT_INTERCEPTOR) {
        viz.positions.shift();
      }
      viz.trail.positions = viz.positions;
    }
  }

  /**
   * 폭발 이펙트
   * @param {{ lon: number, lat: number, alt: number }} position
   * @param {boolean} [isHit=true]
   */
  explode(position, isHit = true) {
    const pos = Cesium.Cartesian3.fromDegrees(position.lon, position.lat, position.alt);
    const size = isHit ? 5000 : 20000;
    const color = isHit
      ? Cesium.Color.fromCssColorString('#ff8800').withAlpha(0.8)
      : Cesium.Color.fromCssColorString('#ff2200').withAlpha(0.8);

    const explosion = this.viewer.entities.add({
      position: pos,
      ellipsoid: {
        radii: new Cesium.Cartesian3(size, size, size),
        material: color,
        outline: true,
        outlineColor: Cesium.Color.WHITE.withAlpha(0.6),
      },
    });

    // 페이드 후 제거
    let opacity = 0.8;
    const fadeInterval = setInterval(() => {
      opacity -= 0.06;
      if (opacity <= 0) {
        clearInterval(fadeInterval);
        this.viewer.entities.remove(explosion);
        this.viewer.scene.requestRender();
      }
    }, 60);

    this.viewer.scene.requestRender();
  }

  /**
   * 위협 제거 (궤적 3초 후 페이드)
   * @param {string} threatId
   */
  removeThreat(threatId) {
    const viz = this.threatViz.get(threatId);
    if (!viz) return;

    this.threatPoints.remove(viz.point);
    this.labels.remove(viz.label);

    // 궤적 3초 후 제거
    setTimeout(() => {
      this.trailLines.remove(viz.trail);
      this.viewer.scene.requestRender();
    }, 3000);

    this.threatViz.delete(threatId);
  }

  /**
   * 요격미사일 제거
   * @param {string} interceptorId
   */
  removeInterceptor(interceptorId) {
    const viz = this.interceptorViz.get(interceptorId);
    if (!viz) return;

    this.interceptorPoints.remove(viz.point);

    setTimeout(() => {
      this.trailLines.remove(viz.trail);
      this.viewer.scene.requestRender();
    }, 3000);

    this.interceptorViz.delete(interceptorId);
  }

  /**
   * 전체 제거
   */
  destroy() {
    this.viewer.scene.primitives.remove(this.threatPoints);
    this.viewer.scene.primitives.remove(this.interceptorPoints);
    this.viewer.scene.primitives.remove(this.trailLines);
    this.viewer.scene.primitives.remove(this.labels);
    this.threatViz.clear();
    this.interceptorViz.clear();
  }
}
