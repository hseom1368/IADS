/**
 * @module viz/cesium-app
 * Cesium Viewer 초기화 + 카메라 프리셋
 * patriot-sim.html 패턴을 모듈화
 */

/* global Cesium */

// ── Cesium Ion 토큰 ──
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3YTIzMzUyNi1iMzc4LTRhNzAtOTZkMi1kNjBjYWYwMTA0NDAiLCJpZCI6NDEzNTM4LCJpYXQiOjE3NzUyNjQ0MTJ9.qSkagM1v-8HG9ACbqK_ODu52FJ6g9Eb1l0qlvpZvI9Q';

/** @type {Cesium.Viewer|null} */
let viewer = null;

/**
 * 카메라 프리셋 정의
 * @type {Object<string, {lon: number, lat: number, height: number, heading: number, pitch: number}>}
 */
const CAMERA_PRESETS = Object.freeze({
  overhead: {
    lon: 127.0, lat: 37.2, height: 600000,
    heading: 0, pitch: -55
  },
  standard: {
    lon: 127.0, lat: 37.44, height: 130000,
    heading: 0, pitch: -30
  },
  horizontal: {
    lon: 126.65, lat: 37.74, height: 60000,
    heading: 90, pitch: -4
  },
  close: {
    lon: 127.0, lat: 37.69, height: 20000,
    heading: 0, pitch: -38
  }
});

/**
 * Cesium Viewer를 초기화한다.
 * @param {string} containerId - Cesium 컨테이너 DOM ID
 * @returns {Cesium.Viewer} 생성된 Viewer 인스턴스
 */
export function initViewer(containerId = 'cesiumContainer') {
  viewer = new Cesium.Viewer(containerId, {
    // 성능 최적화 (CLAUDE.md 규칙)
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
    scene3DOnly: true,

    // 기본 위젯 비활성화
    timeline: false,
    animation: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    selectionIndicator: false,
    navigationHelpButton: false,
    infoBox: false,
    fullscreenButton: false
  });

  // 기본 카메라를 standard 프리셋으로 설정 (의정부 일대)
  setCameraPreset('standard', 0);

  // 카메라 버튼 이벤트 바인딩
  _bindCameraButtons();

  return viewer;
}

/**
 * 카메라를 지정된 프리셋 위치로 이동한다.
 * @param {string} presetName - 프리셋 이름 (overhead|standard|horizontal|close)
 * @param {number} [duration=1.5] - flyTo 애니메이션 시간(초). 0이면 즉시 이동
 */
export function setCameraPreset(presetName, duration = 1.5) {
  const preset = CAMERA_PRESETS[presetName];
  if (!preset || !viewer) return;

  const destination = Cesium.Cartesian3.fromDegrees(
    preset.lon, preset.lat, preset.height
  );
  const orientation = {
    heading: Cesium.Math.toRadians(preset.heading),
    pitch: Cesium.Math.toRadians(preset.pitch),
    roll: 0
  };

  if (duration === 0) {
    viewer.camera.setView({ destination, orientation });
  } else {
    viewer.camera.flyTo({ destination, orientation, duration });
  }
}

/**
 * 현재 Viewer 인스턴스를 반환한다.
 * @returns {Cesium.Viewer|null}
 */
export function getViewer() {
  return viewer;
}

/**
 * 수동 렌더 요청 (시뮬레이션 루프에서 호출)
 */
export function requestRender() {
  if (viewer) {
    viewer.scene.requestRender();
  }
}

/**
 * 카메라 버튼 DOM 이벤트 바인딩
 * @private
 */
function _bindCameraButtons() {
  const bindings = {
    btnOverhead: 'overhead',
    btnStandard: 'standard',
    btnHorizontal: 'horizontal',
    btnClose: 'close'
  };

  for (const [btnId, preset] of Object.entries(bindings)) {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', () => setCameraPreset(preset));
    }
  }
}

// ── 자동 초기화 ──
initViewer();
