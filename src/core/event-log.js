/**
 * @module core/event-log
 * 이벤트 로그 시스템 — 킬체인 단계별 타이밍 기록
 * 모든 메트릭 계산의 기반 데이터
 * Cesium 의존성 없음
 */

export class EventLog {
  constructor() {
    /** @type {Array<{threatId:string, eventType:string, simTime:number, data:Object}>} */
    this._entries = [];
  }

  /**
   * 이벤트를 기록한다.
   * @param {{threatId:string, eventType:string, simTime:number, data:Object}} entry
   */
  log(entry) {
    this._entries.push({ ...entry });
  }

  /**
   * 특정 위협의 이벤트를 반환한다.
   * @param {string} threatId
   * @returns {Array<Object>}
   */
  getByThreat(threatId) {
    return this._entries.filter(e => e.threatId === threatId);
  }

  /**
   * 특정 유형의 이벤트를 반환한다.
   * @param {string} eventType
   * @returns {Array<Object>}
   */
  getByType(eventType) {
    return this._entries.filter(e => e.eventType === eventType);
  }

  /**
   * 전체 이벤트를 반환한다.
   * @returns {Array<Object>}
   */
  getAll() {
    return [...this._entries];
  }

  /**
   * 전체 이벤트를 초기화한다.
   */
  clear() {
    this._entries = [];
  }

  /**
   * 탐지→격추 소요시간(S2S)을 계산한다.
   * @param {string} threatId
   * @returns {number|null} S2S (초) 또는 null (미격추)
   */
  computeS2S(threatId) {
    const detected = this._entries.find(
      e => e.threatId === threatId && e.eventType === 'THREAT_DETECTED'
    );
    const hit = this._entries.find(
      e => e.threatId === threatId && e.eventType === 'INTERCEPT_HIT'
    );
    if (!detected || !hit) return null;
    return hit.simTime - detected.simTime;
  }
}
