/**
 * core/telemetry.js — 위협 텔레메트리 시계열 조회 API
 *
 * ThreatEntity.telemetry 링 버퍼를 소비하여 그래프 라이브러리 중립적인
 * `{ t: number[], y: number[] }` 형태의 시리즈로 변환.
 *
 * 목적:
 * - 시간-고도, 시간-거리, 시간-속도 그래프 재생산
 * - Chart.js / Plotly / D3 등 어떤 차트 라이브러리와도 호환
 * - CSV/JSON 내보내기 준비
 *
 * Cesium 무의존 (core 모듈).
 */

/**
 * 단일 필드에 대한 시계열 추출 (범용)
 *
 * @param {import('./entities.js').ThreatEntity} threat
 * @param {string} field - telemetry 샘플의 필드명 (예: 'altKm', 'speed', 'mach', 'rangeToTargetKm')
 * @returns {{ t: number[], y: number[] }} 차트 라이브러리 중립 시리즈
 */
export function toTimeSeries(threat, field) {
  if (!threat || !Array.isArray(threat.telemetry)) {
    return { t: [], y: [] };
  }
  const t = new Array(threat.telemetry.length);
  const y = new Array(threat.telemetry.length);
  for (let i = 0; i < threat.telemetry.length; i++) {
    const sample = threat.telemetry[i];
    t[i] = sample.t;
    y[i] = sample[field];
  }
  return { t, y };
}

/**
 * 시간-고도 시리즈 (단위: km)
 * @param {import('./entities.js').ThreatEntity} threat
 * @returns {{ t: number[], y: number[] }}
 */
export function timeAltitudeSeries(threat) {
  return toTimeSeries(threat, 'altKm');
}

/**
 * 시간-거리 시리즈 (표적까지 잔여 거리, km)
 * @param {import('./entities.js').ThreatEntity} threat
 * @returns {{ t: number[], y: number[] }}
 */
export function timeRangeSeries(threat) {
  return toTimeSeries(threat, 'rangeToTargetKm');
}

/**
 * 시간-속도 시리즈 (Mach)
 * @param {import('./entities.js').ThreatEntity} threat
 * @returns {{ t: number[], y: number[] }}
 */
export function timeSpeedSeries(threat) {
  return toTimeSeries(threat, 'mach');
}

/**
 * 위협 1기의 전체 텔레메트리를 dict 구조로 내보내기 (CSV/JSON용 준비)
 *
 * @param {import('./entities.js').ThreatEntity} threat
 * @returns {{ id: string, typeId: string, samples: Array<object> }}
 */
export function exportThreatTelemetry(threat) {
  return {
    id: threat.id,
    typeId: threat.typeId,
    startPos: { ...threat.startPos },
    targetPos: { ...threat.targetPos },
    samples: threat.telemetry.map(s => ({ ...s })),
  };
}

/**
 * 여러 위협의 텔레메트리 배열 내보내기
 *
 * @param {Array<import('./entities.js').ThreatEntity>} threats
 * @returns {Array<object>}
 */
export function exportAllTelemetry(threats) {
  return threats.map(exportThreatTelemetry);
}

/**
 * 최근 샘플(가장 최신 값) 조회 — HUD 실시간 표시용
 *
 * @param {import('./entities.js').ThreatEntity} threat
 * @returns {object|null} 가장 최근 샘플 또는 null
 */
export function getLatestSample(threat) {
  if (!threat || !Array.isArray(threat.telemetry) || threat.telemetry.length === 0) {
    return null;
  }
  return threat.telemetry[threat.telemetry.length - 1];
}
