/**
 * @module viz/network-viz
 * C2 네트워크 시각화 — 노드 배치 + 데이터링크 애니메이션
 * Cesium Entity API (정적 C2 노드) + PolylineCollection (데이터링크)
 *
 * 선형 C2 킬체인 경로: GREEN_PINE → KAMD_OPS → ICC → ECS → L-SAM
 * - 노드: Entity API (정적 오브젝트, distanceDisplayCondition)
 * - 데이터링크: Entity PolylineDash (allowPicking: false)
 * - 킬체인 활성화: currentStageIndex 기반 link/node 색상 전환
 */

/* global Cesium */

// ── 색상 정의 (visual-style-guide §2) ──
const COLOR_NODE_SENSOR = '#00ffcc';   // 센서 노드
const COLOR_NODE_C2     = '#00ddff';   // C2 노드
const COLOR_NODE_SHOOTER = '#00ff88';  // 사수 노드
const COLOR_LINK_INACTIVE = '#444466'; // 비활성 데이터링크
const COLOR_LINK_ACTIVE   = '#00ffff'; // 활성 데이터링크 (cyan)
const COLOR_LINK_DONE     = '#44aaff'; // 완료된 링크 (파랑)

// ── 킬체인 스테이지 → 데이터링크 매핑 ──
// KILLCHAIN_STAGES: [GP_TO_KAMD, KAMD_PROCESSING, KAMD_TO_ICC, ICC_PROCESSING, ICC_TO_ECS, ECS_PROCESSING]
// 링크 인덱스:      link 0       node kamd        link 1       node icc        link 2       node ecs
const STAGE_TO_LINK = [0, -1, 1, -1, 2, -1]; // -1 = 노드 처리 (링크 아님)

/** @type {Cesium.Viewer|null} */
let _viewer = null;
/** @type {Map<string, Cesium.Entity>} nodeId → Entity */
const _nodeEntities = new Map();
/** @type {Array<{entity: Cesium.Entity, fromId: string, toId: string}>} */
const _linkEntities = [];

/**
 * 네트워크 시각화를 초기화한다. 노드와 데이터링크를 생성.
 * @param {Cesium.Viewer} viewer
 * @param {Array<{id:string, typeId:string, position:{lon:number,lat:number,alt:number}, role:string}>} nodes
 *   role: 'sensor' | 'c2' | 'shooter'
 * @param {Array<{from:string, to:string}>} links - 데이터링크 연결 정의
 */
export function initNetworkViz(viewer, nodes, links) {
  _viewer = viewer;

  // ── 노드 생성 ──
  for (const node of nodes) {
    const color = node.role === 'sensor' ? COLOR_NODE_SENSOR
      : node.role === 'shooter' ? COLOR_NODE_SHOOTER
      : COLOR_NODE_C2;
    const size = node.role === 'c2' ? 12 : 10;

    const entity = viewer.entities.add({
      id: `net_${node.id}`,
      position: Cesium.Cartesian3.fromDegrees(
        node.position.lon, node.position.lat, node.position.alt
      ),
      point: {
        pixelSize: size,
        color: Cesium.Color.fromCssColorString(color),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: node.typeId,
        font: '9px Share Tech Mono',
        fillColor: Cesium.Color.fromCssColorString(color),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(20, 0),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 300000),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    _nodeEntities.set(node.id, entity);
  }

  // ── 데이터링크 생성 ──
  for (const link of links) {
    const fromNode = nodes.find(n => n.id === link.from);
    const toNode = nodes.find(n => n.id === link.to);
    if (!fromNode || !toNode) continue;

    // 데이터링크는 인터랙션 불필요 — interaction.js에서 'net_' prefix만 처리하므로 'link_' prefix는 자동 무시
    const entity = viewer.entities.add({
      id: `link_${link.from}_${link.to}`,
      polyline: {
        positions: [
          Cesium.Cartesian3.fromDegrees(fromNode.position.lon, fromNode.position.lat, fromNode.position.alt + 500),
          Cesium.Cartesian3.fromDegrees(toNode.position.lon, toNode.position.lat, toNode.position.alt + 500)
        ],
        width: 1.5,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString(COLOR_LINK_INACTIVE).withAlpha(0.3),
          dashLength: 16
        }),
        arcType: Cesium.ArcType.GEODESIC
      }
    });
    _linkEntities.push({ entity, fromId: link.from, toId: link.to });
  }
}

/**
 * 킬체인 상태에 따라 데이터링크를 활성화/비활성화한다.
 * @param {import('../core/killchain.js').LinearKillChain} killchain
 * @param {string} threatId - 추적 중인 위협 ID
 */
export function updateNetworkFromKillchain(killchain, threatId) {
  if (!_viewer) return;

  const state = killchain.getState(threatId);

  if (!state) {
    deactivateAllLinks();
    return;
  }

  const { currentStageIndex, status } = state;

  for (let i = 0; i < _linkEntities.length; i++) {
    const linkData = _linkEntities[i];
    let color, alpha;

    if (status === 'ready_to_engage' || status === 'completed') {
      // 모든 링크 완료 (파랑)
      color = COLOR_LINK_DONE;
      alpha = 0.7;
    } else {
      // 킬체인 진행 중: 어떤 링크가 활성인지 판별
      const linkStageIndices = _getLinkStageIndices(i);
      const maxStageForLink = Math.max(...linkStageIndices);
      const minStageForLink = Math.min(...linkStageIndices);

      if (currentStageIndex > maxStageForLink) {
        // 이 링크의 스테이지는 이미 완료
        color = COLOR_LINK_DONE;
        alpha = 0.7;
      } else if (currentStageIndex >= minStageForLink && currentStageIndex <= maxStageForLink) {
        // 현재 이 링크 구간 진행 중
        color = COLOR_LINK_ACTIVE;
        alpha = 1.0;
      } else {
        // 아직 도달하지 않은 구간
        color = COLOR_LINK_INACTIVE;
        alpha = 0.3;
      }
    }

    linkData.entity.polyline.material = new Cesium.PolylineDashMaterialProperty({
      color: Cesium.Color.fromCssColorString(color).withAlpha(alpha),
      dashLength: 16
    });
  }
}

/**
 * 링크 인덱스에 해당하는 킬체인 스테이지 인덱스들을 반환한다.
 * link 0: GP→KAMD (stage 0,1), link 1: KAMD→ICC (stage 2,3), link 2: ICC→ECS (stage 4,5)
 * @param {number} linkIndex
 * @returns {number[]}
 * @private
 */
function _getLinkStageIndices(linkIndex) {
  return [linkIndex * 2, linkIndex * 2 + 1];
}

/**
 * 모든 데이터링크를 비활성 상태로 복원한다.
 */
export function deactivateAllLinks() {
  for (const linkData of _linkEntities) {
    linkData.entity.polyline.material = new Cesium.PolylineDashMaterialProperty({
      color: Cesium.Color.fromCssColorString(COLOR_LINK_INACTIVE).withAlpha(0.3),
      dashLength: 16
    });
  }
}

/**
 * 네트워크 시각화를 제거한다.
 */
export function destroyNetworkViz() {
  if (!_viewer) return;

  for (const entity of _nodeEntities.values()) {
    try { _viewer.entities.remove(entity); } catch (_) { /* ignore */ }
  }
  _nodeEntities.clear();

  for (const linkData of _linkEntities) {
    try { _viewer.entities.remove(linkData.entity); } catch (_) { /* ignore */ }
  }
  _linkEntities.length = 0;

  _viewer = null;
}
