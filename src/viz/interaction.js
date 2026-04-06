/**
 * @module viz/interaction
 * 마우스/키보드 인터랙션 — ScreenSpaceEventHandler, 호버 피킹
 * 레이더 볼륨: 기본 숨김, 센서 노드 호버 시 해당 볼륨만 표시
 * visual-style-guide §5: 4px 이동 스로틀링
 */

/* global Cesium */

/** @type {Cesium.ScreenSpaceEventHandler|null} */
let _handler = null;
/** @type {Map<string, {entities: Cesium.Entity[], groundEntity: Cesium.Entity|null}>} sensorId → 볼륨 데이터 */
let _radarVolumes = null;
/** @type {string|null} */
let _lastHoveredSensor = null;
/** @type {Cesium.Cartesian2} */
const _lastPickPos = new Cesium.Cartesian2();

/**
 * 인터랙션을 초기화한다. 레이더 볼륨을 기본 숨김 처리하고 호버 핸들러를 등록한다.
 * @param {Cesium.Viewer} viewer
 * @param {Map<string, {entities: Cesium.Entity[], destroy: Function}>} radarVolumeMap - sensorId → createRadarVolume 반환값
 */
export function initInteraction(viewer, radarVolumeMap) {
  _radarVolumes = new Map();

  // 초기 상태: 3D 와이어프레임 숨김, 지면 외곽선만 표시
  for (const [sensorId, volume] of radarVolumeMap) {
    const entities = volume.entities;

    // 지면 외곽선: entities 배열에서 groundPts로 만든 polyline
    // radar-viz.js 구조상: 경선(여러개), 위선(여러개), 지면외곽(1개), 좌우경계(2개), 빔라인(1개)
    // 지면 외곽선을 제외한 나머지를 숨김
    // 지면 외곽선은 groundPts로 생성 — 원점에서 시작하고 원점으로 돌아오는 닫힌 폴리라인
    for (const entity of entities) {
      entity.show = false;
    }

    _radarVolumes.set(sensorId, { entities });
  }

  // ── 호버 핸들러 등록 ──
  _handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  _handler.setInputAction((movement) => {
    // 4px 스로틀링
    const dx = movement.endPosition.x - _lastPickPos.x;
    const dy = movement.endPosition.y - _lastPickPos.y;
    if (Math.sqrt(dx * dx + dy * dy) < 4) return;
    Cesium.Cartesian2.clone(movement.endPosition, _lastPickPos);

    // 이전 호버 해제
    if (_lastHoveredSensor) {
      _hideVolume(_lastHoveredSensor);
      _lastHoveredSensor = null;
    }

    // 새 호버 감지
    const picked = viewer.scene.pick(movement.endPosition);
    if (Cesium.defined(picked) && picked.id && typeof picked.id.id === 'string') {
      const entityId = picked.id.id;
      // net_gp1 → gp1, net_mfr1 → mfr1
      if (entityId.startsWith('net_')) {
        const sensorId = entityId.substring(4);
        if (_radarVolumes.has(sensorId)) {
          _showVolume(sensorId);
          _lastHoveredSensor = sensorId;
        }
      }
    }

    viewer.scene.requestRender();
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}

/**
 * 지정된 센서의 레이더 볼륨을 표시한다.
 * @param {string} sensorId
 * @private
 */
function _showVolume(sensorId) {
  const vol = _radarVolumes.get(sensorId);
  if (!vol) return;
  for (const entity of vol.entities) {
    entity.show = true;
  }
}

/**
 * 지정된 센서의 레이더 볼륨을 숨긴다.
 * @param {string} sensorId
 * @private
 */
function _hideVolume(sensorId) {
  const vol = _radarVolumes.get(sensorId);
  if (!vol) return;
  for (const entity of vol.entities) {
    entity.show = false;
  }
}

/**
 * 인터랙션을 해제한다.
 */
export function destroyInteraction() {
  if (_handler) {
    _handler.destroy();
    _handler = null;
  }
  _radarVolumes = null;
  _lastHoveredSensor = null;
}
