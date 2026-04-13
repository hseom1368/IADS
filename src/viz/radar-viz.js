/**
 * viz/radar-viz.js — 레이더 볼륨 시각화
 *
 * - GREEN_PINE 900km 와이어프레임 (호버 시만 표시)
 * - LSAM_MFR 310km 와이어프레임
 * - 센서 3단계 색상: 미탐지 투명, 탐지 노랑, 추적 주황, 교전급 녹색
 * - patriot-sim.html의 buildRadar/addSectorLines 패턴 활용
 */

const SENSOR_STATE_COLORS = {
  UNDETECTED: { r: 0, g: 0.5, b: 1.0, a: 0.0 },   // 투명
  DETECTED:   { r: 1.0, g: 0.8, b: 0, a: 0.15 },   // 노랑
  TRACKED:    { r: 1.0, g: 0.5, b: 0, a: 0.20 },   // 주황
  FIRE_CONTROL: { r: 0, g: 1.0, b: 0.5, a: 0.25 }, // 녹색
};

const AZ_STEPS = 36;
const EL_STEPS = 18;

export class RadarViz {
  /**
   * @param {Cesium.Viewer} viewer
   */
  constructor(viewer) {
    this.viewer = viewer;
    /** @type {Map<string, { entities: Cesium.Entity[], sensorData: object, visible: boolean }>} */
    this.radarVolumes = new Map();
    /** @type {Map<string, Cesium.Entity>} */
    this.groundFootprints = new Map();
    /** @type {Map<string, { sensorId: string, maxState: string }>} */
    this.sensorStates = new Map();
  }

  /**
   * 센서 레이더 볼륨 생성
   * @param {string} sensorId
   * @param {{ lon: number, lat: number, alt: number }} position
   * @param {number} rangeKm
   * @param {string} color - CSS 색상
   * @param {number} azCenter - 방위각 중심 (도)
   * @param {number} azHalf - 방위각 반각 (도)
   * @param {number} elMax - 최대 고각 (도)
   */
  addRadar(sensorId, position, rangeKm, color, azCenter = 0, azHalf = 180, elMax = 90) {
    const R = rangeKm * 1000;
    const cx = position.lon;
    const cy = position.lat;
    const entities = [];

    // 와이어프레임 라인 (기본 숨김)
    // 경선 방향 (고각 변화)
    for (let ai = 0; ai <= AZ_STEPS; ai += 6) {
      const pts = [];
      for (let ei = 0; ei <= EL_STEPS; ei++) {
        const el = Cesium.Math.toRadians((elMax / EL_STEPS) * ei);
        const az = Cesium.Math.toRadians(azCenter - azHalf + (2 * azHalf / AZ_STEPS) * ai);
        const dLon = (R / 111320) * Math.sin(az) * Math.cos(el);
        const dLat = (R / 110540) * Math.cos(az) * Math.cos(el);
        const alt = R * Math.sin(el);
        pts.push(Cesium.Cartesian3.fromDegrees(cx + dLon, cy + dLat, alt));
      }
      const e = this.viewer.entities.add({
        polyline: {
          positions: pts, width: 0.8,
          material: Cesium.Color.fromCssColorString(color).withAlpha(0.2),
          arcType: Cesium.ArcType.NONE,
        },
        show: false,
      });
      entities.push(e);
    }

    // 위선 방향 (방위각 변화)
    for (let ei = 0; ei <= EL_STEPS; ei += 6) {
      const pts = [];
      for (let ai = 0; ai <= AZ_STEPS; ai++) {
        const el = Cesium.Math.toRadians((elMax / EL_STEPS) * ei);
        const az = Cesium.Math.toRadians(azCenter - azHalf + (2 * azHalf / AZ_STEPS) * ai);
        const dLon = (R / 111320) * Math.sin(az) * Math.cos(el);
        const dLat = (R / 110540) * Math.cos(az) * Math.cos(el);
        const alt = R * Math.sin(el);
        pts.push(Cesium.Cartesian3.fromDegrees(cx + dLon, cy + dLat, alt));
      }
      const e = this.viewer.entities.add({
        polyline: {
          positions: pts, width: 0.8,
          material: Cesium.Color.fromCssColorString(color).withAlpha(0.2),
          arcType: Cesium.ArcType.NONE,
        },
        show: false,
      });
      entities.push(e);
    }

    // 지면 외곽선 (상시 표시)
    const groundPts = [Cesium.Cartesian3.fromDegrees(cx, cy, 10)];
    for (let ai = 0; ai <= AZ_STEPS; ai++) {
      const az = Cesium.Math.toRadians(azCenter - azHalf + (2 * azHalf / AZ_STEPS) * ai);
      const dLon = (R / 111320) * Math.sin(az);
      const dLat = (R / 110540) * Math.cos(az);
      groundPts.push(Cesium.Cartesian3.fromDegrees(cx + dLon, cy + dLat, 10));
    }
    groundPts.push(Cesium.Cartesian3.fromDegrees(cx, cy, 10));

    const footprint = this.viewer.entities.add({
      polyline: {
        positions: groundPts, width: 1.2,
        material: Cesium.Color.fromCssColorString(color).withAlpha(0.35),
        arcType: Cesium.ArcType.NONE,
      },
    });
    this.groundFootprints.set(sensorId, footprint);

    this.radarVolumes.set(sensorId, {
      entities,
      sensorData: { position, rangeKm, color },
      visible: false,
    });

    this.sensorStates.set(sensorId, { sensorId, maxState: 'UNDETECTED' });
  }

  /**
   * 호버 토글: 레이더 볼륨 표시/숨김
   * @param {string} sensorId
   * @param {boolean} show
   */
  toggleVolume(sensorId, show) {
    const vol = this.radarVolumes.get(sensorId);
    if (!vol) return;
    vol.visible = show;
    for (const e of vol.entities) {
      e.show = show;
    }
    this.viewer.scene.requestRender();
  }

  /**
   * 센서 상태 색상 업데이트
   * @param {string} sensorId
   * @param {string} state - 'UNDETECTED' | 'DETECTED' | 'TRACKED' | 'FIRE_CONTROL'
   */
  updateSensorState(sensorId, state) {
    const sc = this.sensorStates.get(sensorId);
    if (sc) sc.maxState = state;

    const footprint = this.groundFootprints.get(sensorId);
    if (!footprint) return;

    const c = SENSOR_STATE_COLORS[state] || SENSOR_STATE_COLORS.UNDETECTED;
    footprint.polyline.material = new Cesium.Color(c.r, c.g, c.b, Math.max(c.a, 0.2));
    this.viewer.scene.requestRender();
  }

  /**
   * 전체 제거
   */
  destroy() {
    for (const [, vol] of this.radarVolumes) {
      for (const e of vol.entities) {
        this.viewer.entities.remove(e);
      }
    }
    for (const [, e] of this.groundFootprints) {
      this.viewer.entities.remove(e);
    }
    this.radarVolumes.clear();
    this.groundFootprints.clear();
  }
}
