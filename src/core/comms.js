/**
 * @module core/comms
 * 통신 채널 모델 — 링크 타입별 지연, 재밍 열화
 *
 * Phase 1.3에서 구현 예정
 *
 * === 링크 타입별 지연 ===
 * - long_range (16s): 조기경보→사령부, 사령부→대대, 축간 교차
 * - short_range (1s): ICC→ECS, ECS→발사대, MFR→ECS
 * - ifcn (1s): Kill Web IFCN 전 링크
 *
 * === CommChannel 모델 ===
 * getLinkLatency(linkType, jammingLevel):
 *   - 기본 지연 × (1 + jammingLevel × degradation_factor)
 *   - Kill Web: redundancy_factor = 0.5 (재밍 50% 완화)
 *
 * === 링크 상수 ===
 * LINK_DELAY = { long_range: 16, short_range: 1, ifcn: 1 }
 */
