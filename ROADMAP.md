# ROADMAP.md — KIDA_ADSIM v2.0 점진적 개발 로드맵

## 개발 철학
- 각 Phase 완료 시 **독립 실행 가능한 데모** 상태 유지
- 한 세션에 하나의 체크박스만 구현
- [ ] → [-] (진행중) → [x] (완료) 로 추적

---

## Phase 1: L-SAM 1세트 + 탄도미사일 1발 (MVP)
> 목표: 화면에서 탄도미사일이 날아오고, L-SAM이 요격하는 장면을 3D로 보여주기

### 1.0 프로젝트 스캐폴딩
- [x] 디렉토리 구조 생성 (ARCHITECTURE.md 기준)
- [x] package.json 생성 (vitest 의존성)
- [x] index.html 기본 Cesium Viewer 초기화
- [x] patriot-sim.html에서 Cesium 초기화 패턴, CSS, HUD 레이아웃 추출

### 1.1 물리 엔진 기초
- [x] `core/physics.js`: slantRange(pos1, pos2) 구현 + 테스트
- [x] `core/physics.js`: ballisticTrajectory — 중력 포물선 궤적 구현 + 테스트
- [x] `core/physics.js`: pngGuidance — patriot-sim.html의 pngGuide 함수 모듈화 + 테스트
- [x] `core/physics.js`: isInSector — 구면 부채꼴 탐지 판정 (ENU 변환) + 테스트

### 1.2 타입 레지스트리 + 엔티티 시스템
- [x] `config/weapon-data.js`: L-SAM_ABM + MSAM_MFR + SRBM 타입 정의 (capability + relations)
- [x] `core/registry.js`: Registry 클래스 — weapon-data 로딩, getPrioritizedShooters(), getDetectableThreats()
- [x] `core/entities.js`: BaseEntity 클래스 (id, typeId, position, operational)
- [x] `core/entities.js`: ShooterEntity (typeId로 Registry 참조, currentAmmo/status는 런타임 상태)
- [x] `core/entities.js`: SensorEntity (typeId로 Registry 참조, currentTracking은 런타임 상태)
- [x] `core/entities.js`: ThreatEntity (SRBM: Mach6, 3단계 비행프로파일)
- [x] `core/entities.js`: InterceptorEntity (PNG 유도, 부스터+유도 단계)

### 1.3 시뮬레이션 엔진
- [x] `core/sim-engine.js`: SimEngine 클래스 — requestAnimationFrame 루프
- [x] step(dt) 구현: 위협이동 → 센서탐지 → 교전판정 → 요격미사일유도 → 충돌판정
- [x] 이벤트 버스: EventEmitter 패턴 (on/emit/off)
- [x] 시뮬레이션 상태 머신: READY → RUNNING → PAUSED → COMPLETE

### 1.4 3D 시각화 (L-SAM 1세트)
- [x] `viz/cesium-app.js`: Viewer 초기화, 의정부 지역 카메라
- [x] `viz/radar-viz.js`: L-SAM MFR 구면 부채꼴 와이어프레임 (patriot-sim.html 패턴)
- [x] `viz/engagement-viz.js`: 위협 궤적 렌더링 (빨간 점 + 꼬리)
- [x] `viz/engagement-viz.js`: 요격미사일 궤적 렌더링 (초록 점 + 꼬리)
- [x] `viz/engagement-viz.js`: 폭발 이펙트 (Ellipsoid 팽창+소멸)
- [x] `viz/hud.js`: 기본 HUD (포대 상태, 교전 로그)

### 1.5 통합 + 데모
- [ ] index.html에서 L-SAM 1세트 배치 + 탄도미사일 1발 발사 → 요격 시나리오 실행
- [ ] 버튼: "위협 발사", "초기화", 재생속도 조절
- [ ] Phase 1 스모크 테스트 통과 확인

---

## Phase 2: 킬체인 로직 + 다중 위협
> 목표: 선형 C2 킬체인의 시간 지연을 시각적으로 보여주기

### 2.1 킬체인 프로세스
- [ ] `core/killchain.js`: KillChainProcess 상태 머신
- [ ] LinearKillChain: 6단계 시간 지연 (Promise 체인)
- [ ] 킬체인 진행 상태 이벤트 발행 (각 단계 시작/완료)

### 2.2 다중 위협
- [ ] 위협 생성기: 파상 공격 (시간차 다중 위협)
- [ ] 위협 유형 다양화: SRBM + 순항미사일 추가
- [ ] 사수 선정 로직: Pk 기반 우선순위

### 2.3 시각화 확장
- [ ] 킬체인 진행 표시 (HUD에 단계별 타임라인)
- [ ] 다중 위협 동시 표시
- [ ] 데이터링크 시각화 (센서→C2→사수 연결선)

---

## Phase 3: Kill Web vs Linear 비교
> 목표: 동일 시나리오에서 두 아키텍처 병렬 실행, 차이 시각화

### 3.1 Kill Web 킬체인
- [ ] KillWebKillChain: 5단계 단축 킬체인
- [ ] 컴포지트 트래킹: 다중 센서 융합 (√N 오차 감소)
- [ ] 위협 식별: 다중센서 시 100% 정확, 단일센서 시 10% 오인식

### 3.2 비교 모드
- [ ] 화면 좌우 분할 (Linear / Kill Web)
- [ ] 동일 난수 시드 보장
- [ ] 실시간 메트릭 비교 패널 (S2S, 누출률, 교전성공률)

### 3.3 C2 토폴로지 시각화
- [ ] Linear: 계층적 트리 (MCRC→대대→포대)
- [ ] Kill Web: IAOC 중심 메시 네트워크 (IBCS 영상 스타일)
- [ ] 데이터 흐름 애니메이션 (cyan 점선)

---

## Phase 4: 한반도 전장 확장
> 목표: 5개 방어구역, 10종 무기체계, 다양한 시나리오

### 4.1 무기체계 확장
- [ ] PAC-3, 천궁-II, THAAD, 비호, KF-16, 천궁-I, 천마 추가
- [ ] 센서: EWR(500km), GREEN_PINE(800km), FPS117, TPS880K 추가
- [ ] C2: MCRC, 대대TOC, EOC, KAMD작전센터, 육군방공 추가

### 4.2 한반도 배치
- [ ] 5개 방어구역 (전방/수도권/중부/남부)
- [ ] 3축 C2 통제 매핑 (MCRC→대항공기, KAMD→탄도탄, 육군→근거리)
- [ ] 위협 발사원점: DMZ, 평양, 북한내륙

### 4.3 시나리오 시스템
- [ ] 포화공격, 복합위협, EW 3단계, 순차교전(Poisson), 노드파괴
- [ ] 시나리오 선택 UI
- [ ] 시나리오별 결과 비교 대시보드

---

## Phase 5: 고급 기능
> 목표: 연구 수준의 시뮬레이션 정밀도

### 5.1 물리 모델 고도화
- [ ] 극초음속 미사일 S자 회피기동
- [ ] 지형 기반 레이더 수평선 (min_detection_altitude)
- [ ] 재밍 효과: 링크별 열화, 탐지확률 감소
- [ ] 적응형 교전 정책 (탄약 소진 시 교전 기준 변경)

### 5.2 통신 모델
- [ ] 링크별 지연 파라미터 (sensor→c2, c2→c2, c2→shooter)
- [ ] Kill Web 중복경로 회복탄력성 (redundancy_factor)
- [ ] 노드 파괴 시 토폴로지 재구성

### 5.3 메트릭 확장
- [ ] 18개 성능지표 전체 구현
- [ ] 다중 실행 통계 (100회 반복, 평균/표준편차)
- [ ] 결과 CSV 내보내기

---

## Phase 6: 시각화 완성
> 목표: IBCS 홍보 영상 수준의 시각적 품질

### 6.1 IBCS 영상 스타일 적용
- [ ] 어두운 배경 + cyan/teal 아군 와이어프레임
- [ ] 빨강 위협 마커 + 궤적
- [ ] 데이터링크 애니메이션 (cyan 점선, 흐르는 입자)
- [ ] 컴포지트 트래킹 시각화 (다색 스트라이프 → 단일 트랙)

### 6.2 카메라 시퀀스
- [ ] 시나리오별 자동 카메라 이동 (조감 → 클로즈업 → 추적)
- [ ] IBCS 영상의 "From Sensor → To Decider → To Effector" 서사 구조

### 6.3 UI 완성
- [ ] 시나리오 선택 패널
- [ ] 아키텍처 비교 토글
- [ ] 실시간 메트릭 대시보드
- [ ] 결과 요약 리포트
