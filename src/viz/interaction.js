/**
 * @module viz/interaction
 * 마우스/키보드 인터랙션 — ScreenSpaceEventHandler, 호버 피킹
 * 레이더 볼륨: 기본 숨김(지면 외곽선만 표시), 센서 노드 호버 시 전체 볼륨 표시
 * visual-style-guide §5: 4px 이동 스로틀링
 */

/* global Cesium */

/** @type {Cesium.ScreenSpaceEventHandler|null} */
let _handler = null;
/** @type {Map<string, {entities: Cesium.Entity[], groundEntity: Cesium.Entity|null}>} */
let _radarVolumes = null;
/** @type {string|null} */
let _lastHoveredSensor = null;
/** @type {Cesium.Cartesian2} */
const _lastPickPos = new Cesium.Cartesian2();

/**
 * 인터랙션을 초기화한다. 레이더 볼륨을 기본 숨김 처리하고 호버 핸들러를 등록한다.
 * @param {Cesium.Viewer} viewer
 * @param {Map<string, {entities: Cesium.Entity[], groundEntity: Cesium.Entity|null, destroy: Function}>} radarVolumeMap
 */
export function initInteraction(viewer, radarVolumeMap) {
  _radarVolumes = new Map();

  // 초기 상태: 3D 와이어프레임 숨김, 지면 외곽선만 표시
  for (const [sensorId, volume] of radarVolumeMap) {
    const { entities, groundEntity } = volume;

    for (const entity of entities) {
      entity.show = (entity === groundEntity);
    }

    _radarVolumes.set(sensorId, { entities, groundEntity });
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
 * 지정된 센서의 레이더 볼륨 전체를 표시한다.
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
 * 지정된 센서의 레이더 볼륨을 숨긴다 (지면 외곽선은 유지).
 * @param {string} sensorId
 * @private
 */
function _hideVolume(sensorId) {
  const vol = _radarVolumes.get(sensorId);
  if (!vol) return;
  for (const entity of vol.entities) {
    entity.show = (entity === vol.groundEntity);
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
