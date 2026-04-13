/**
 * core/comms.js — EADSIM-Lite 통신 채널 모델
 *
 * 링크 지연 + 밴드별 재밍 열화.
 * 메시지를 전송하면 지연 시간 후 도착.
 */
import { LINK_DELAYS } from '../config/weapon-data.js';

export class CommChannel {
  /**
   * @param {'linear'|'killweb'} [architecture='linear']
   */
  constructor(architecture = 'linear') {
    this.architecture = architecture;
    /** @type {Array<{ fromNode: string, toNode: string, payload: object, arrivalTime: number }>} */
    this.pendingMessages = [];
  }

  /**
   * 링크 지연 계산 (재밍 열화 포함)
   * @param {string} linkType - 'longRange' | 'shortRange' | 'internal' | 'ifcn'
   * @param {number} [jammingLevel=0] - 재밍 레벨 (0~1)
   * @param {function} [randomFn=Math.random]
   * @returns {number} 지연 시간 (s), Infinity면 두절
   */
  getLinkLatency(linkType, jammingLevel = 0, randomFn = Math.random) {
    const baseDelay = LINK_DELAYS[linkType];
    if (baseDelay === undefined) return Infinity;

    if (jammingLevel <= 0) return baseDelay;

    let degradation = baseDelay * jammingLevel * (0.5 + randomFn());

    // Kill Web: IFCN 다중경로 → 재밍 열화 50% 감소
    if (this.architecture === 'killweb') {
      degradation *= 0.5;
    }

    // 열화가 기본 지연의 80% 초과 → 두절
    if (degradation > baseDelay * 0.8) return Infinity;

    return baseDelay + degradation;
  }

  /**
   * 메시지 전송 (지연 적용)
   * @param {string} fromNode
   * @param {string} toNode
   * @param {string} linkType
   * @param {object} payload
   * @param {number} simTime - 현재 시뮬레이션 시각
   * @param {number} [jammingLevel=0]
   * @returns {number} 도착 시각 (s), Infinity면 두절
   */
  send(fromNode, toNode, linkType, payload, simTime, jammingLevel = 0) {
    const latency = this.getLinkLatency(linkType, jammingLevel);
    if (latency === Infinity) return Infinity;

    const arrivalTime = simTime + latency;
    this.pendingMessages.push({ fromNode, toNode, payload, arrivalTime });
    return arrivalTime;
  }

  /**
   * 도착한 메시지 수신 (simTime 기준)
   * @param {string} toNode
   * @param {number} simTime
   * @returns {Array<{ fromNode: string, payload: object }>}
   */
  receive(toNode, simTime) {
    const arrived = [];
    this.pendingMessages = this.pendingMessages.filter(msg => {
      if (msg.toNode === toNode && simTime >= msg.arrivalTime) {
        arrived.push({ fromNode: msg.fromNode, payload: msg.payload });
        return false;
      }
      return true;
    });
    return arrived;
  }

  /**
   * 전체 초기화
   */
  clear() {
    this.pendingMessages = [];
  }
}
