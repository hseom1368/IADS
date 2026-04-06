/**
 * @module core/killchain
 * Strategy 패턴 킬체인 프로세스
 * ArchitectureStrategy (ABC) → LinearKillChain / KillWebKillChain
 *
 * Phase 1.3에서 구현 예정
 *
 * === LinearKillChain 킬체인 흐름 ===
 * 1. GREEN_PINE → KAMD_OPS (16s link)
 * 2. KAMD_OPS 분석+교전명령 (20~60s processing)
 * 3. KAMD_OPS → ICC (16s link)
 * 4. ICC 하달 (5~15s processing)
 * 5. ICC → ECS (1s link)
 * 6. ECS: MFR 활성화+추적(병렬) → 발사시기 결정 → 발사 (2~5s processing, 1s link)
 *
 * 총 S2S: 61~114초
 *
 * === ArchitectureStrategy 인터페이스 ===
 * buildTopology(registry, entities)
 * runKillchain(threat, sensors, c2s)   // Promise 기반
 * selectShooter(threat, candidates)
 * identifyThreatType(threat, sensors)
 * fuseTracks(threat, sensorList)
 * updateCop(entities)
 * getMaxSimultaneous(threat, ammoState)
 *
 * === 2단계 교전 모델 ===
 * 의사결정 단계 (_should_engage):
 *   1. 교전구역 확인: predictInterceptPoint → null이면 SKIP
 *   2. 발사시기 확인: calculateLaunchTime → simTime < launchTime이면 WAIT
 *   3. 예측 Pk 확인: predictedPk ≥ 0.30 → ENGAGE
 *
 * 물리 시뮬레이션 단계 (_execute_engagement):
 *   - InterceptorEntity 생성 + PNG 유도
 *   - 매 프레임 pngGuidance 적용
 *   - distance ≤ kill_radius → warhead_effectiveness 베르누이 시행
 */
