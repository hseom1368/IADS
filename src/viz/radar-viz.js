/**
 * @module viz/radar-viz
 * 레이더 볼륨 렌더링 — 구면 부채꼴 와이어프레임
 * 정적 오브젝트 → Entity API 허용 (CLAUDE.md)
 * patriot-sim.html buildRadar/addSectorLines 패턴 모듈화
 */

/* global Cesium */

const DEG2RAD = Math.PI / 180;

// visual-style-guide.md 축소 스펙
const AZ_STEPS = 24;
const EL_STEPS = 12;

/**
 * 구면 부채꼴 레이더 와이어프레임을 생성한다.
 * @param {Cesium.Viewer} viewer
 * @param {{lon:number, lat:number, alt:number}} sensorPos - 센서 위치
 * @param {Object} config - { azCenter, azHalf, elMax, detectionRange, engagementRange }
 * @returns {{ entities: Cesium.Entity[], destroy: Function }}
 */
export function createRadarVolume(viewer, sensorPos, config) {
  const {
    azCenter = 0,
    azHalf = 60,
    elMax = 90,
    detectionRange = 100000,   // m
    engagementRange = null
  } = config;

  const entities = [];
  const cx = sensorPos.lon;
  const cy = sensorPos.lat;

  // 탐지 범위 (파란색)
  _addSectorLines(viewer, entities, cx, cy, detectionRange,
    azCenter, azHalf, elMax, '#0088ff', 0.25);

  // 교전 범위 (초록색, 있을 경우)
  if (engagementRange) {
    _addSectorLines(viewer, entities, cx, cy, engagementRange,
      azCenter, azHalf, elMax, '#00ff88', 0.45);
  }

  // 정면 빔 라인 (점선)
  const aRad = azCenter * DEG2RAD;
  const bLon = (detectionRange / 111320) * Math.sin(aRad);
  const bLat = (detectionRange / 110540) * Math.cos(aRad);
  const beamLine = viewer.entities.add({
    polyline: {
      positions: [
        Cesium.Cartesian3.fromDegrees(cx, cy, 500),
        Cesium.Cartesian3.fromDegrees(cx + bLon, cy + bLat, 500)
      ],
      width: 1.5,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.WHITE.withAlpha(0.3),
        dashLength: 16
      }),
      arcType: Cesium.ArcType.GEODESIC
    }
  });
  entities.push(beamLine);

  return {
    entities,
    destroy() {
      for (const e of entities) {
        try { viewer.entities.remove(e); } catch (_) { /* ignore */ }
      }
      entities.length = 0;
    }
  };
}

/**
 * 구면 부채꼴 와이어프레임 라인을 추가한다.
 * @private
 */
function _addSectorLines(viewer, entities, cx, cy, R, azCenter, azHalf, elMax, color, opacity) {
  const cssColor = Cesium.Color.fromCssColorString(color);

  // ── 경선 (고각 변화) ──
  for (let ai = 0; ai <= AZ_STEPS; ai += 4) {
    const pts = [];
    for (let ei = 0; ei <= EL_STEPS; ei++) {
      const el = (elMax / EL_STEPS) * ei * DEG2RAD;
      const az = (azCenter - azHalf + (2 * azHalf / AZ_STEPS) * ai) * DEG2RAD;
      const dLon = (R / 111320) * Math.sin(az) * Math.cos(el);
      const dLat = (R / 110540) * Math.cos(az) * Math.cos(el);
      const alt = R * Math.sin(el);
      pts.push(Cesium.Cartesian3.fromDegrees(cx + dLon, cy + dLat, alt));
    }
    const e = viewer.entities.add({
      polyline: {
        positions: pts,
        width: 0.8,
        material: cssColor.withAlpha(opacity),
        arcType: Cesium.ArcType.NONE
      }
    });
    entities.push(e);
  }

  // ── 위선 (방위각 변화) ──
  for (let ei = 0; ei <= EL_STEPS; ei += 6) {
    const pts = [];
    for (let ai = 0; ai <= AZ_STEPS; ai++) {
      const el = (elMax / EL_STEPS) * ei * DEG2RAD;
      const az = (azCenter - azHalf + (2 * azHalf / AZ_STEPS) * ai) * DEG2RAD;
      const dLon = (R / 111320) * Math.sin(az) * Math.cos(el);
      const dLat = (R / 110540) * Math.cos(az) * Math.cos(el);
      const alt = R * Math.sin(el);
      pts.push(Cesium.Cartesian3.fromDegrees(cx + dLon, cy + dLat, alt));
    }
    const e = viewer.entities.add({
      polyline: {
        positions: pts,
        width: 0.8,
        material: cssColor.withAlpha(opacity),
        arcType: Cesium.ArcType.NONE
      }
    });
    entities.push(e);
  }

  // ── 지면 부채꼴 외곽 ──
  const groundPts = [Cesium.Cartesian3.fromDegrees(cx, cy, 10)];
  for (let ai = 0; ai <= AZ_STEPS; ai++) {
    const az = (azCenter - azHalf + (2 * azHalf / AZ_STEPS) * ai) * DEG2RAD;
    const dLon = (R / 111320) * Math.sin(az);
    const dLat = (R / 110540) * Math.cos(az);
    groundPts.push(Cesium.Cartesian3.fromDegrees(cx + dLon, cy + dLat, 10));
  }
  groundPts.push(Cesium.Cartesian3.fromDegrees(cx, cy, 10));
  const eg = viewer.entities.add({
    polyline: {
      positions: groundPts,
      width: 1.2,
      material: cssColor.withAlpha(opacity * 1.5),
      arcType: Cesium.ArcType.NONE
    }
  });
  entities.push(eg);

  // ── 좌우 경계선 ──
  for (const side of [-1, 1]) {
    const bPts = [Cesium.Cartesian3.fromDegrees(cx, cy, 10)];
    for (let ei = 0; ei <= EL_STEPS; ei++) {
      const el = (elMax / EL_STEPS) * ei * DEG2RAD;
      const az = (azCenter + side * azHalf) * DEG2RAD;
      const dLon = (R / 111320) * Math.sin(az) * Math.cos(el);
      const dLat = (R / 110540) * Math.cos(az) * Math.cos(el);
      const alt = R * Math.sin(el);
      bPts.push(Cesium.Cartesian3.fromDegrees(cx + dLon, cy + dLat, alt));
    }
    const eb = viewer.entities.add({
      polyline: {
        positions: bPts,
        width: 1.2,
        material: cssColor.withAlpha(opacity * 1.8),
        arcType: Cesium.ArcType.NONE
      }
    });
    entities.push(eb);
  }
}
