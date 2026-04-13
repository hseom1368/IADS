/**
 * viz/network-viz.js — C2 노드 아이콘 + 데이터링크 시각화
 *
 * - 정적 노드: Entity API (Point + Label)
 * - 데이터링크: PolylineCollection (점선)
 * - 킬체인 진행 시 활성화 애니메이션
 */

const NODE_COLORS = {
  GREEN_PINE_B: '#44cc44',   // 조기경보 녹색
  LSAM_MFR:    '#00aaff',   // 화력통제 파랑
  KAMD_OPS:    '#00ffcc',   // C2 cyan
  ICC:         '#00ffcc',
  ECS:         '#ffcc00',   // 포대급 노랑
  LSAM:        '#ff8800',   // 사수 주황
};

const LINK_COLORS = {
  longRange:  '#00ddff',  // cyan
  shortRange: '#00ff88',  // green
  internal:   '#ffcc00',  // yellow
};

export class NetworkViz {
  /**
   * @param {Cesium.Viewer} viewer
   */
  constructor(viewer) {
    this.viewer = viewer;
    /** @type {Map<string, Cesium.Entity>} */
    this.nodeEntities = new Map();
    this.linkLines = new Cesium.PolylineCollection();
    this.viewer.scene.primitives.add(this.linkLines);
    /** @type {Map<string, Cesium.Polyline>} */
    this.linkMap = new Map();
    /** @type {Map<string, { entity: Cesium.Entity, activeUntil: number }>} */
    this.activeHighlights = new Map();
  }

  /**
   * C2/센서/사수 노드 배치
   * @param {string} nodeId
   * @param {string} typeId
   * @param {string} label
   * @param {{ lon: number, lat: number, alt: number }} position
   */
  addNode(nodeId, typeId, label, position) {
    const color = NODE_COLORS[typeId] || '#00ffcc';
    const size = typeId.includes('MFR') || typeId.includes('GREEN') ? 12 : 10;

    const entity = this.viewer.entities.add({
      id: `node_${nodeId}`,
      position: Cesium.Cartesian3.fromDegrees(position.lon, position.lat, position.alt),
      point: {
        pixelSize: size,
        color: Cesium.Color.fromCssColorString(color),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: label,
        font: '9px Share Tech Mono',
        fillColor: Cesium.Color.fromCssColorString(color),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(18, 0),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 500000),
      },
    });

    this.nodeEntities.set(nodeId, entity);
  }

  /**
   * 데이터링크 배치
   * @param {string} fromId
   * @param {string} toId
   * @param {{ lon: number, lat: number, alt: number }} fromPos
   * @param {{ lon: number, lat: number, alt: number }} toPos
   * @param {string} linkType - 'longRange' | 'shortRange' | 'internal'
   */
  addLink(fromId, toId, fromPos, toPos, linkType) {
    const color = LINK_COLORS[linkType] || '#00ddff';
    const key = `${fromId}-${toId}`;

    const line = this.linkLines.add({
      positions: Cesium.Cartesian3.fromDegreesArrayHeights([
        fromPos.lon, fromPos.lat, fromPos.alt + 500,
        toPos.lon, toPos.lat, toPos.alt + 500,
      ]),
      width: 1.5,
      material: Cesium.Material.fromType('PolylineDash', {
        color: Cesium.Color.fromCssColorString(color).withAlpha(0.3),
        dashLength: 16,
      }),
    });

    this.linkMap.set(key, line);
  }

  /**
   * 킬체인 진행 시 링크 활성화 (밝게)
   * @param {string} fromId
   * @param {string} toId
   * @param {number} duration - 활성 유지 시간 (s)
   */
  activateLink(fromId, toId, duration = 2) {
    const key = `${fromId}-${toId}`;
    const line = this.linkMap.get(key);
    if (!line) return;

    line.material = Cesium.Material.fromType('PolylineGlow', {
      glowPower: 0.3,
      color: Cesium.Color.CYAN,
    });
    line.width = 3;

    // 타이머로 복원
    setTimeout(() => {
      const linkType = key.includes('KAMD') || key.includes('GREEN') ? 'longRange' : 'shortRange';
      const color = LINK_COLORS[linkType] || '#00ddff';
      line.material = Cesium.Material.fromType('PolylineDash', {
        color: Cesium.Color.fromCssColorString(color).withAlpha(0.3),
        dashLength: 16,
      });
      line.width = 1.5;
      this.viewer.scene.requestRender();
    }, duration * 1000);

    this.viewer.scene.requestRender();
  }

  /**
   * 노드 활성화 (글로우)
   * @param {string} nodeId
   */
  highlightNode(nodeId) {
    const entity = this.nodeEntities.get(nodeId);
    if (!entity) return;
    entity.point.pixelSize = 16;
    entity.point.outlineWidth = 3;
    this.viewer.scene.requestRender();

    setTimeout(() => {
      if (entity.point) {
        entity.point.pixelSize = entity.point.pixelSize > 14 ? 12 : 10;
        entity.point.outlineWidth = 2;
        this.viewer.scene.requestRender();
      }
    }, 2000);
  }

  /**
   * 전체 제거
   */
  destroy() {
    for (const [, entity] of this.nodeEntities) {
      this.viewer.entities.remove(entity);
    }
    this.viewer.scene.primitives.remove(this.linkLines);
    this.nodeEntities.clear();
    this.linkMap.clear();
  }
}
