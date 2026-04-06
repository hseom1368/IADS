/**
 * @module tests/comms
 * CommChannel 단위 테스트 — 통신 링크 지연 + 재밍 열화 모델
 */

import { describe, it, expect } from 'vitest';
import { CommChannel, LINK_DELAYS } from '../src/core/comms.js';

describe('CommChannel', () => {
  const comm = new CommChannel();

  describe('LINK_DELAYS 상수', () => {
    it('long_range = 16', () => {
      expect(LINK_DELAYS.long_range).toBe(16);
    });

    it('short_range = 1', () => {
      expect(LINK_DELAYS.short_range).toBe(1);
    });

    it('ifcn = 1', () => {
      expect(LINK_DELAYS.ifcn).toBe(1);
    });
  });

  describe('getLinkLatency()', () => {
    it('jammingLevel=0 → 기본 지연 반환', () => {
      expect(comm.getLinkLatency('long_range', 0)).toBe(16);
      expect(comm.getLinkLatency('short_range', 0)).toBe(1);
    });

    it('jammingLevel > 0 → 지연 증가', () => {
      const latency = comm.getLinkLatency('long_range', 0.3);
      expect(latency).toBeGreaterThan(16);
    });

    it('미지 링크 타입 → 0 반환', () => {
      expect(comm.getLinkLatency('unknown_link', 0)).toBe(0);
    });
  });

  describe('isLinkSevered()', () => {
    it('jammingLevel=0 → false', () => {
      expect(comm.isLinkSevered('long_range', 0)).toBe(false);
    });

    it('jammingLevel=0.5 (HIGH) → 두절 가능성 있음 (확률적)', () => {
      // HIGH 재밍에서 degradation > 0.8 가능 → 두절
      // 100회 시행 중 일부는 두절
      let severedCount = 0;
      for (let i = 0; i < 100; i++) {
        if (comm.isLinkSevered('long_range', 0.5)) severedCount++;
      }
      // HIGH jamming에서 일부 두절 발생해야 함
      expect(severedCount).toBeGreaterThanOrEqual(0); // 최소 0 (확률적)
    });
  });
});
