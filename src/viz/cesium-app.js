/**
 * viz/cesium-app.js — Cesium Viewer 초기화 + 카메라 프리셋
 *
 * 성능 규칙:
 * - requestRenderMode: true + 수동 requestRender()
 * - scene3DOnly: true
 */

/**
 * Cesium Viewer 생성
 * @param {string} containerId - DOM 컨테이너 ID
 * @param {string} token - Cesium Ion 토큰
 * @returns {Cesium.Viewer}
 */
export function createViewer(containerId, token) {
  Cesium.Ion.defaultAccessToken = token;

  const viewer = new Cesium.Viewer(containerId, {
    terrain: Cesium.Terrain.fromWorldTerrain(),
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: true,
    geocoder: false,
    homeButton: true,
    infoBox: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    navigationHelpButton: false,
    creditContainer: document.createElement('div'),
    requestRenderMode: true,
    scene3DOnly: true,
  });

  viewer.scene.globe.enableLighting = true;

  return viewer;
}

/** 한반도 중부 조감 뷰 */
export function cameraKoreaOverview(viewer) {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(127.0, 37.0, 600000),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-50), roll: 0 },
    duration: 2,
  });
}

/** 포대 근접 뷰 */
export function cameraBatteryView(viewer, lon, lat) {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat - 0.3, 130000),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-30), roll: 0 },
    duration: 1.5,
  });
}

/** 45도 뷰 */
export function camera45View(viewer, lon, lat) {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat - 0.2, 100000),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-35), roll: 0 },
    duration: 1.5,
  });
}
