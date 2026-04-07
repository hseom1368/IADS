# ROADMAP.md — KIDA_ADSIM v2.0 점진적 개발 로드맵

## 개발 철학
- 각 Phase 완료 시 **독립 실행 가능한 데모** 유지
- 한 세션에 하나의 체크박스만 구현
- [ ] → [-] (진행중) → [x] (완료)
- **EADSIM-Lite 방법론**: PSSEK, 3단계 센서, S-L-S/S-S, BDA, 운용원 지연

---

## Phase 1: 선형 C2 탄도탄 대응 MVP (GREEN_PINE → KAMD → ICC → ECS → L-SAM)
> 목표: GREEN_PINE 탐지 → KAMD→ICC→ECS 선형 킬체인 → L-SAM ABM탄 요격. 전 과정 3D 시각화.
> S2S 84~137초의 선형 킬체인 지연을 시각적으로 확인.

### 1.0 프로젝트 스캐폴딩
- [ ] 디렉토리 구조 생성 (ARCHITECTURE.md 기준)
- [ ] package.json (vitest)
- [ ] index.html 기본 Cesium Viewer
- [ ] patriot-sim.html에서 Cesium 초기화, CSS, HUD 패턴 추출

### 1.1 물리 엔진 기초
- [ ] `core/physics.js`: slantRange(pos1, pos2) + 테스트
- [ ] `core/physics.js`: ballisticTrajectory — 중력 포물선 (SRBM 3단계 프로파일) + 테스트
- [ ] `core/physics.js`: pngGuidance — patriot-sim.html pngGuide 모듈화 + 테스트
- [ ] `core/physics.js`: isInSector — 구면 부채꼴 탐지 판정 + 테스트
- [ ] `core/physics.js`: predictInterceptPoint — 위협 궤적 예측 → PIP 산출 + 테스트
- [ ] `core/physics.js`: calculateLaunchTime — 미사일 속도 기반 t_flyout 역산 + 테스트

### 1.2 타입 레지스트리 + 엔티티
- [ ] `config/weapon-data.js`: Phase 1 최소 구성
  - 센서: GREEN_PINE_B (L밴드 900km 조기경보), LSAM_MFR (S밴드 310km 화력통제)
  - C2: KAMD_OPS, ICC, ECS (운용원 숙련도 파라미터 포함)
  - 사수: L-SAM (ABM탄 PSSEK 테이블 + 교전 봉투 + 포대 구성 + 미사일 속도 Mach 9)
  - 위협: SRBM (3단계 비행프로파일, RCS 변화)
  - 토폴로지: GREEN_PINE_B → KAMD_OPS → ICC → ECS → L-SAM
  - 링크 지연: 장거리 16s, 단거리 1s
- [ ] `core/registry.js`: Registry 클래스
  - lookupPSSEK(), isInEnvelope(), getPrioritizedShooters()
  - getSensorRanges(), getJammingSusceptibility()
  - buildTopology('linear')
- [ ] `core/entities.js`:
  - SensorEntity (trackStates Map — 3단계 상태머신)
  - C2Entity (processingQueue, operatorSkill)
  - BatteryEntity (ammo, activeEngagements, maxSimultaneous, bdaPending)
  - ThreatEntity (flightPhase, currentRCS, maneuvering)
  - InterceptorEntity (missileSpeed, guidanceType, pssekPk, killRadius)

### 1.3 센서 모델 + 교전 모델
- [ ] `core/sensor-model.js`: SNR 기반 탐지확률
  - SNR_ratio = (R_ref/d)⁴ × (RCS/RCS_ref)
  - P_detect = min(0.99, SNR^0.5 × 0.95)
  - 밴드별 재밍 보정 (jammingSusceptibility)
- [ ] `core/sensor-model.js`: 3단계 센서 상태머신
  - UNDETECTED → DETECTED → TRACKED → FIRE_CONTROL
  - 전이 시간, 3회 연속 미탐지 → 추적 상실
- [ ] `core/engagement-model.js`: PSSEK 5단계 교전 판정
  - STEP 1: 교전 봉투 판정
  - STEP 2: 센서 교전급 추적 확인
  - STEP 3: 발사 시점 (missileSpeed 기반 t_flyout)
  - STEP 4: PSSEK 조회 + 보정 (재밍, 접근각)
  - STEP 5: S-L-S 교리 + BDA 타이머
- [ ] `core/engagement-model.js`: 발사 후 판정
  - PNG 비행 → kill_radius 도달 → Math.random() < Pk → HIT/MISS
  - BDA 완료 → MISS 시 재발사 판단

### 1.4 시뮬레이션 엔진 + 선형 킬체인
- [ ] `core/sim-engine.js`: SimEngine requestAnimationFrame 루프
- [ ] step(dt) 7단계:
  1. 위협 이동 (ballisticTrajectory, RCS 단계별 변화)
  2. 센서 3단계 갱신 (GREEN_PINE SNR 탐지 + LSAM_MFR 교전급 확립)
  3. 선형 킬체인: GREEN_PINE→KAMD(16s+처리)→ICC(16s+처리)→ECS(1s+처리)
  4. PSSEK 5단계 교전 판정
  5. 요격미사일 PNG 유도 비행
  6. BDA 판정
  7. 이벤트 로그 기록
- [ ] 이벤트 버스: EventEmitter (sensor-state-change, killchain-step, engagement-fired, bda-result)
- [ ] 상태 머신: READY → RUNNING → PAUSED → COMPLETE
- [ ] `core/comms.js`: CommChannel — 링크 지연 16s/1s 적용
- [ ] `core/event-log.js`: 이벤트 로그 (센서/킬체인/교전/BDA 이벤트)

### 1.5 3D 시각화 (선형 C2 탄도탄 대응)
- [ ] `viz/cesium-app.js`: Viewer 초기화, 한반도 중부 카메라
- [ ] `viz/radar-viz.js`: GREEN_PINE 볼륨(900km, 호버 표시) + LSAM_MFR 볼륨(310km)
  - 센서 3단계 색상: 미탐지 투명, 탐지 노랑, 추적 주황, 교전급 녹색
- [ ] `viz/network-viz.js`: C2 노드 아이콘 + 데이터링크 (킬체인 진행 시 활성화 애니메이션)
- [ ] `viz/engagement-viz.js`: SRBM 포물선 궤적 + 요격미사일 궤적 + 폭발
  - BDA 대기 표시: 발사 후 BDA 지연 동안 '판정 대기' 상태
- [ ] `viz/hud.js`:
  - 킬체인 진행 상태 (GREEN_PINE 탐지→KAMD 분석→ICC 명령→ECS 발사→BDA)
  - 포대 상태 (L-SAM 탄약 잔여, 동시교전 현황)
  - 교전 결과 로그 (PSSEK Pk값 표시)

### 1.6 통합 + 데모
- [ ] index.html 전체 배치:
  - GREEN_PINE_B (후방, 조기경보)
  - KAMD_OPS (오산)
  - ICC (전방 대대)
  - ECS + LSAM_MFR + L-SAM 포대 (전방)
  - SRBM 발사원점 (북방)
- [ ] 시나리오: SRBM 1발 → GREEN_PINE 탐지(SNR 기반) → 선형 킬체인(84~137s) → L-SAM ABM탄(Mach 9) 선제 발사 → PNG 유도 → PSSEK 판정(접근각별 Pk) → BDA
- [ ] 버튼: "위협 발사", "초기화", 재생속도
- [ ] Phase 1 스모크 테스트

---

## Phase 2: 다중 위협 + PSSEK 다양성 + S-L-S/S-S 교리
> 목표: 복수 위협, 다양한 PSSEK 조합, BDA 재발사, 동시교전 상한 검증

### 2.1 위협 다양화
- [ ] CRUISE_MISSILE (해면밀착 30m, RCS 0.01, ±5G 기동, 채프)
- [ ] AIRCRAFT (고도 8~12km, RCS 5.0, 채프+플레어)
- [ ] 위협 생성기: 파상 공격 (시간차 다중 위협)

### 2.2 무기체계 확장
- [ ] PAC-3 MSE 추가 (PSSEK 테이블, S-S 교리, AN/MPQ-65)
- [ ] 천궁-II 추가 (PSSEK 테이블, MSAM_MFR, 동시교전 10)
- [ ] 포대 동시교전 상한 구현 (MFR 유도 발수 제한)

### 2.3 교전 교리 구현
- [ ] S-L-S 완전 구현: 1발→BDA 타이머→결과→MISS 시 재발사 판단
- [ ] S-S 구현: SRBM에 PAC-3 2발 동시, P=1-(1-Pk)²
- [ ] 다층 핸드오프: 동일 유형 재교전 방지, 다른 유형 허용

### 2.4 시각화 확장
- [ ] 킬체인 진행 타임라인 (HUD)
- [ ] 다중 위협 동시 표시
- [ ] S-S 교리 시 2발 동시 궤적

---

## Phase 3: Kill Web vs Linear 비교
> 목표: 동일 시나리오 병렬 실행, EADSIM MOE/MOP 비교

### 3.1 Kill Web 킬체인
- [ ] KillWebKillChain: IAOC 컴포지트 트래킹 + 자동 사수 선정
- [ ] 위협 식별: 2개+ 센서 100% 정확 / 단일 10% 오인식
- [ ] 추적 상관: 자동 시공간 상관, 오상관 1%, 미상관 2%, Pk +10%
- [ ] 적응형 교전 정책: 탄약 30%/10% 기준

### 3.2 비교 모드
- [ ] 화면 좌우 분할 (Linear / Kill Web)
- [ ] 동일 난수 시드
- [ ] EADSIM MOE/MOP 실시간 비교 (PRA, 누출률, S2S, 탄약 효율, 중복교전율)

### 3.3 C2 토폴로지 시각화
- [ ] Linear: 계층적 (KAMD_OPS/MCRC → ICC → ECS → 사수)
- [ ] Kill Web: IAOC 중심 메시 네트워크
- [ ] 킬체인 흐름 애니메이션

### 3.4 성능 측정
- [ ] `core/metrics.js`: EADSIM MOE/MOP 10개 전체 구현
- [ ] 몬테카를로 30회 반복 (동일 시나리오, 다른 시드)
- [ ] PRA, 누출률, S2S 분포, 탄약 효율, TLS 산출

---

## Phase 4: 한반도 전장 확장
> 목표: 전체 무기체계, 5개 방어구역, 7개 시나리오

### 4.1 무기체계 확장
- [ ] THAAD (AN/TPY-2 + Mach 8.2 hit-to-kill)
- [ ] 천궁-I (PSSEK, 동시교전 6, 대항공기 전용)
- [ ] 비호 (신궁 IIR/UV, S-S 교리, 독자 국지방공)
- [ ] 천마 (CLOS 유도 — PNG와 다름, Mach 2.6, 노후화 반영)
- [ ] KF-16 (AIM-120, 공대공)
- [ ] GREEN_PINE_C + FPS117 + TPS880K 센서 추가
- [ ] MCRC, ARMY_LOCAL_AD C2 노드 추가

### 4.2 한반도 배치
- [ ] 5개 방어구역 (전방/수도권북/수도권남/중부/남부)
- [ ] GREEN_PINE 4기 네트워크 (충남/충북/부산/보성)
- [ ] L-SAM 7포대, 천궁 25+포대, PAC-3, THAAD 1포대

### 4.3 시나리오
- [ ] 7개 시나리오 전체 구현 (포화, 복합, EW, 순차, 노드파괴, TOT, MLRS포화)
- [ ] 시나리오 선택 UI + 결과 비교 대시보드

---

## Phase 5: 고급 기능
> 목표: 연구 수준 정밀도

### 5.1 물리 고도화
- [ ] 극초음속 S자 회피기동
- [ ] 지형 기반 레이더 수평선 (LOS 차폐)
- [ ] 밴드별 재밍 상세 모델
- [ ] 대응수단 상세 (채프/플레어 타이밍)

### 5.2 통신 모델
- [ ] 링크별 지연 상세 파라미터
- [ ] Kill Web IFCN 중복경로 회복탄력성
- [ ] 노드 파괴 시 토폴로지 재구성

### 5.3 메트릭 확장
- [ ] 다중 실행 통계 (100회 MC, 평균/표준편차/신뢰구간)
- [ ] 결과 CSV 내보내기
- [ ] 파레토 프론티어 분석

---

## Phase 6: 시각화 완성
> 목표: IBCS 홍보 영상 수준

### 6.1 IBCS 영상 스타일
- [ ] 어두운 배경 + cyan/teal 와이어프레임
- [ ] 데이터링크 애니메이션 (cyan 점선, 흐르는 입자)
- [ ] 컴포지트 트래킹 시각화

### 6.2 카메라 시퀀스
- [ ] 시나리오별 자동 카메라 (조감→클로즈업→추적)

### 6.3 UI 완성
- [ ] 시나리오 선택, 아키텍처 비교 토글
- [ ] 실시간 MOE/MOP 대시보드
- [ ] 결과 요약 리포트
