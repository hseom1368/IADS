/**
 * @module core/comms
 * 통신 채널 모델 — 링크 타입별 지연, 재밍 열화
 * weapon-specs 섹션 8 기반
 * Cesium 의존성 없음
 */

/**
 * 링크 타입별 기본 지연 (초)
 * @type {Object<string, number>}
 */
export const LINK_DELAYS = Object.freeze({
  long_range: 16,   // 조기경보→사령부, 사령부→대대, 축간
  short_range: 1,   // ICC→ECS, ECS→발사대, MFR→ECS
  ifcn: 1           // Kill Web IFCN 전 링크
});

export class CommChannel {
  /**
   * 재밍 포함 링크 지연을 반환한다.
   * weapon-specs 8.3: effective_delay = base_delay × (1 + jammingLevel × degradation)
   * @param {string} linkType - 'long_range' | 'short_range' | 'ifcn'
   * @param {number} [jammingLevel=0] - 재밍 수준 (0~1)
   * @returns {number} 유효 지연 (초), 두절 시 Infinity
   */
  getLinkLatency(linkType, jammingLevel = 0) {
    const baseDelay = LINK_DELAYS[linkType];
    if (baseDelay === undefined) return 0;

    if (jammingLevel <= 0) return baseDelay;

    // weapon-specs 8.3: link_degradation = base × (0.5 + random(0~1.0))
    // 스펙 공식 effective_delay = base_delay × degradation은 jamming=0일 때 delay=0이 되므로
    // 물리적 의미에 맞게 baseDelay × (1 + degradation) 해석: 재밍이 기본 지연을 증폭
    const degradation = jammingLevel * (0.5 + Math.random());
    if (degradation > 0.8) return Infinity; // 링크 두절

    return baseDelay * (1 + degradation);
  }

  /**
   * 링크 두절 여부를 판단한다.
   * @param {string} linkType
   * @param {number} [jammingLevel=0]
   * @returns {boolean}
   */
  isLinkSevered(linkType, jammingLevel = 0) {
    return this.getLinkLatency(linkType, jammingLevel) === Infinity;
  }
}
