/**
 * @module core/killchain
 * Strategy 패턴 킬체인 프로세스 — LinearKillChain 구현
 * ARCHITECTURE.md 2.6 기반
 * Cesium 의존성 없음
 *
 * 선형 C2 킬체인 흐름 (weapon-specs 섹션 4, 7, 8):
 * 1. GREEN_PINE → KAMD_OPS (16s link)
 * 2. KAMD_OPS 분석+교전명령 (20~60s processing)
 * 3. KAMD_OPS → ICC (16s link)
 * 4. ICC 하달 (5~15s processing)
 * 5. ICC → ECS (1s link)
 * 6. ECS: MFR 활성화+추적(병렬) → 발사시기 결정 (2~5s processing)
 * 총 S2S: 61~114초
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

/**
 * 킬체인 스테이지 정의
 * type='link'는 CommChannel 지연, type='processing'은 C2 처리 지연
 * @type {Array<{id:string, type:string, linkType?:string, c2TypeId?:string}>}
 */
export const KILLCHAIN_STAGES = Object.freeze([
  { id: 'GP_TO_KAMD',      type: 'link',       linkType: 'long_range' },
  { id: 'KAMD_PROCESSING',  type: 'processing', c2TypeId: 'KAMD_OPS' },
  { id: 'KAMD_TO_ICC',      type: 'link',       linkType: 'long_range' },
  { id: 'ICC_PROCESSING',   type: 'processing', c2TypeId: 'ICC' },
  { id: 'ICC_TO_ECS',       type: 'link',       linkType: 'short_range' },
  { id: 'ECS_PROCESSING',   type: 'processing', c2TypeId: 'ECS' }
]);

/**
 * 균등 분포 난수 (min~max)
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomUniform(min, max) {
  return min + Math.random() * (max - min);
}

export class LinearKillChain {
  /**
   * @param {import('./registry.js').Registry} registry
   * @param {import('./comms.js').CommChannel} commChannel
   * @param {import('./event-log.js').EventLog} eventLog
   */
  constructor(registry, commChannel, eventLog) {
    this._registry = registry;
    this._comm = commChannel;
    this._eventLog = eventLog;
    /** @type {Map<string, Object>} threatId → killchain state */
    this._states = new Map();
  }

  /**
   * 새 킬체인을 시작한다 (위협 탐지 시 호출).
   * @param {string} threatId
   * @param {string} sensorId
   * @param {number} simTime
   */
  startKillchain(threatId, sensorId, simTime) {
    if (this._states.has(threatId)) return; // 중복 방지

    const firstStageDuration = this._computeStageDuration(KILLCHAIN_STAGES[0], 0);

    this._states.set(threatId, {
      threatId,
      sensorId,
      currentStageIndex: 0,
      stageStartTime: simTime,
      stageDuration: firstStageDuration,
      status: 'in_progress' // in_progress | ready_to_engage | completed | cancelled
    });

    this._eventLog.log({
      threatId,
      eventType: 'KILLCHAIN_STARTED',
      simTime,
      data: { sensorId }
    });
  }

  /**
   * 매 step 호출: 모든 킬체인의 타이머를 진행하고 stage를 전이한다.
   * @param {number} simTime
   */
  update(simTime) {
    for (const state of this._states.values()) {
      if (state.status !== 'in_progress') continue;

      this._advanceStages(state, simTime);
    }
  }

  /**
   * 특정 위협의 킬체인 상태를 반환한다.
   * @param {string} threatId
   * @returns {Object|null}
   */
  getState(threatId) {
    return this._states.get(threatId) || null;
  }

  /**
   * 교전 준비 완료된 위협 목록을 반환한다.
   * @returns {Array<Object>}
   */
  getReadyToEngage() {
    const ready = [];
    for (const state of this._states.values()) {
      if (state.status === 'ready_to_engage') {
        ready.push(state);
      }
    }
    return ready;
  }

  /**
   * 킬체인을 완료 처리한다 (교전 실행 후).
   * @param {string} threatId
   */
  completeKillchain(threatId) {
    const state = this._states.get(threatId);
    if (state) state.status = 'completed';
  }

  /**
   * 킬체인을 취소한다 (위협 소멸 등).
   * @param {string} threatId
   */
  cancelKillchain(threatId) {
    const state = this._states.get(threatId);
    if (state) state.status = 'cancelled';
  }

  /**
   * 킬체인 상태를 초기화한다.
   */
  reset() {
    this._states.clear();
  }

  // ── Private ──

  /**
   * 단일 킬체인의 stage를 진행한다.
   * @param {Object} state
   * @param {number} simTime
   * @private
   */
  _advanceStages(state, simTime) {
    while (state.status === 'in_progress') {
      const elapsed = simTime - state.stageStartTime;
      if (elapsed < state.stageDuration) break; // 아직 현재 stage 진행 중

      const completedStage = KILLCHAIN_STAGES[state.currentStageIndex];
      const nextIndex = state.currentStageIndex + 1;

      // C2 처리 단계 완료 시 이벤트 로그
      if (completedStage.type === 'processing') {
        this._eventLog.log({
          threatId: state.threatId,
          eventType: 'C2_AUTHORIZED',
          simTime: state.stageStartTime + state.stageDuration,
          data: { c2Id: completedStage.c2TypeId }
        });
      }

      // 모든 stage 완료 → ready_to_engage
      if (nextIndex >= KILLCHAIN_STAGES.length) {
        state.status = 'ready_to_engage';
        state.completedTime = state.stageStartTime + state.stageDuration;
        break;
      }

      // 다음 stage로 전이
      state.currentStageIndex = nextIndex;
      state.stageStartTime = state.stageStartTime + state.stageDuration;
      state.stageDuration = this._computeStageDuration(KILLCHAIN_STAGES[nextIndex], 0);
    }
  }

  /**
   * stage 유형에 따른 지속 시간을 계산한다.
   * @param {Object} stage
   * @param {number} jammingLevel
   * @returns {number} 초
   * @private
   */
  _computeStageDuration(stage, jammingLevel) {
    if (stage.type === 'link') {
      return this._comm.getLinkLatency(stage.linkType, jammingLevel);
    }

    // processing: C2 타입의 processingDelay에서 랜덤 선택
    const c2Type = this._registry.getC2Type(stage.c2TypeId);
    if (c2Type && c2Type.processingDelay) {
      return randomUniform(c2Type.processingDelay.min, c2Type.processingDelay.max);
    }

    return 0;
  }
}
