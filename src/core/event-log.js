/**
 * core/event-log.js — EADSIM-Lite 이벤트 로그
 *
 * 시뮬레이션 중 발생하는 모든 이벤트를 시간순 기록.
 * viz/ 모듈이 구독하여 HUD 업데이트.
 */

export const EVENT_TYPE = Object.freeze({
  THREAT_SPAWNED: 'THREAT_SPAWNED',
  SENSOR_DETECTED: 'SENSOR_DETECTED',
  SENSOR_TRACKED: 'SENSOR_TRACKED',
  SENSOR_FIRE_CONTROL: 'SENSOR_FIRE_CONTROL',
  SENSOR_TRACK_LOST: 'SENSOR_TRACK_LOST',
  SENSOR_FC_DEGRADED: 'SENSOR_FC_DEGRADED',
  KILLCHAIN_STARTED: 'KILLCHAIN_STARTED',
  C2_PROCESSING: 'C2_PROCESSING',
  C2_AUTHORIZED: 'C2_AUTHORIZED',
  SHOOTER_ASSIGNED: 'SHOOTER_ASSIGNED',
  ENGAGEMENT_FIRED: 'ENGAGEMENT_FIRED',
  BDA_STARTED: 'BDA_STARTED',
  BDA_COMPLETE: 'BDA_COMPLETE',
  INTERCEPT_HIT: 'INTERCEPT_HIT',
  INTERCEPT_MISS: 'INTERCEPT_MISS',
  THREAT_LEAKED: 'THREAT_LEAKED',
  AMMO_DEPLETED: 'AMMO_DEPLETED',
  SIMULTANEOUS_LIMIT_REACHED: 'SIMULTANEOUS_LIMIT_REACHED',
  SIMULATION_END: 'SIMULATION_END',
});

export class EventLog {
  constructor() {
    /** @type {Array<{ threatId: string|null, eventType: string, simTime: number, data: object }>} */
    this.entries = [];
    /** @type {Array<function>} */
    this._listeners = [];
  }

  /**
   * 이벤트 기록
   * @param {string} eventType - EVENT_TYPE 상수
   * @param {number} simTime - 시뮬레이션 시각 (s)
   * @param {string|null} threatId
   * @param {object} [data={}] - 추가 데이터
   */
  log(eventType, simTime, threatId, data = {}) {
    const entry = { eventType, simTime, threatId, data };
    this.entries.push(entry);
    for (const listener of this._listeners) {
      listener(entry);
    }
  }

  /**
   * 이벤트 리스너 등록
   * @param {function} fn
   */
  onEvent(fn) {
    this._listeners.push(fn);
  }

  /**
   * 리스너 제거
   * @param {function} fn
   */
  offEvent(fn) {
    this._listeners = this._listeners.filter(l => l !== fn);
  }

  /**
   * 특정 위협의 이벤트만 필터
   * @param {string} threatId
   * @returns {Array}
   */
  getByThreat(threatId) {
    return this.entries.filter(e => e.threatId === threatId);
  }

  /**
   * 특정 타입의 이벤트만 필터
   * @param {string} eventType
   * @returns {Array}
   */
  getByType(eventType) {
    return this.entries.filter(e => e.eventType === eventType);
  }

  /**
   * 전체 초기화
   */
  clear() {
    this.entries = [];
  }
}
