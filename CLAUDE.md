# CLAUDE.md — KIDA_ADSIM v2.0

## 프로젝트 정의
한국군 통합방공체계 C2 아키텍처 비교 M&S(Modeling & Simulation).
선형 3축 C2(KAMD/MCRC/국지방공) vs Kill Web(IBCS 개념) 정량적 효과 비교.
Cesium 기반 3D 시각화, 단일 HTML+JS 프론트엔드, 백엔드 없음.
**시뮬레이션 방법론: EADSIM-Lite** (Extended Air Defense Simulation 핵심 개념 경량화 적용).

## 기술 스택
- **언어**: JavaScript (ES2022+, 모듈), HTML5, CSS3
- **3D 엔진**: CesiumJS 1.111+ (CDN)
- **폰트**: Share Tech Mono, Orbitron (Google Fonts)
- **테스트**: Vitest 또는 Jest (Node.js 환경)
- **빌드**: 없음 (CDN 직접 로드, ES Module import)
- **참조 프로토타입**: `src/prototype/patriot-sim.html`

## EADSIM-Lite 핵심 설계 원칙
1. **PSSEK 기반 교전 판정**: 단일 Pk 공식이 아닌, 무기-위협-거리구간-접근각별 확률 참조표
2. **3단계 센서 상태머신**: 탐지→추적→교전급 추적. 교전급 확립 전 교전 불가
3. **센서 기하 필터**: 레이더 수평선(지구 곡률) + 방위각/고각 섹터 + minAltitude 사전 체크 후 SNR 계산
4. **S-L-S/S-S 교전 교리**: Shoot-Look-Shoot(1발→BDA→재발사) / Shoot-Shoot(2발 동시)
5. **운용원 지연**: C2 노드별 숙련도(고/중/저)에 따른 판단 시간 명시적 모델링
6. **포대-발사대(TEL) 2계층**: 포대 단위 동시교전 상한(MFR) + 발사대 단위 탄약 관리
7. **밴드별 재밍 감수성**: L밴드(강건) → S → C → X밴드(취약)
8. **추적 상관 모델**: 오상관/미상관 확률 → 과잉교전/미교전 재현
9. **연속 충돌 감지(CCD)**: segment-to-segment 최근접점으로 고속 물체 kill radius 건너뜀 방지

## 소프트웨어 설계 원칙
1. **SSOT**: 모든 무기체계 파라미터는 `src/config/weapon-data.js` 단일 소스
2. **선언적 레지스트리**: PSSEK 테이블, 포대 구성, 센서 3단계 파라미터를 weapon-data.js에 선언. 킬체인·교전 로직은 registry.js 경유
3. **능력(불변) vs 상태(가변) 분리**: weapon-data(Object.freeze) vs entity 인스턴스(탄약/교전큐/센서상태)
4. **시뮬레이션 ↔ 시각화 분리**: core/ 모듈은 Cesium 무의존. viz/ 가 core 이벤트 구독
5. **실시간 시뮬레이션**: requestAnimationFrame 기반 프레임 단위
6. **물리 비행은 시각화용, PSSEK가 결과 결정**: 요격미사일 PNG/CLOS 비행은 시각적 표현, 교전 결과는 PSSEK 확률 판정
7. **점진적 확장**: Phase별 기능 추가, 각 Phase 독립 실행 가능
8. **typeId 기반 일반화**: sim-engine 내 하드코딩 금지. 무기체계/위협/C2 노드는 typeId + registry 조회로 처리. weapon-data에 타입 추가만으로 새 체계 지원
9. **다중 포대·다중 위협**: 교전 로직은 단일 포대/단일 위협 가정 금지. selectBattery() + selectLauncher()로 최적 자산 배정

## 코딩 규칙
- 모든 거리: km (내부), m (Cesium 전달 시 ×1000)
- 모든 시간: 초(s)
- 좌표계: WGS84 경위도
- 고도: 해수면 기준 m
- 각도: 도(°) 저장, 계산 시 라디안
- 속도: m/s (내부), weapon-data에서 Mach→m/s 변환
- 클래스: PascalCase, 함수: camelCase, 상수: UPPER_SNAKE_CASE
- JSDoc 필수: 모든 public 메서드

## 파일 수정 시 금지사항
- `docs/` 참조 문서 직접 수정 금지
- `src/prototype/patriot-sim.html` 직접 수정 금지 (패턴 추출만)
- 기존 테스트 수정 금지 (새 테스트 추가만)

## Cesium 성능 규칙
> 목표: 700+ 동적 + 200+ 정적 엔티티에서 30FPS

### 반드시 지킬 것
- 동적(위협/요격미사일/궤적): **Primitive API** (PointPrimitiveCollection, PolylineCollection)
- 정적(센서/C2/포대): Entity API + EntityCluster
- 레이더 볼륨: GeometryInstance 배칭 + ShowAttribute 토글
- 센서 3단계 상태별 색상 변경 (미탐지:투명, 탐지:노랑, 추적:주황, 교전급:녹색)
- `requestRenderMode: true` + 수동 `requestRender()`
- 궤적 링 버퍼: 위협 80, 요격미사일 50
- `scene3DOnly: true`

### 절대 금지
- `CallbackProperty(fn, false)`
- `clampToGround` 폴리라인
- 라벨 상시 표시 — `distanceDisplayCondition` 필수
- 레이더 볼륨 상시 표시 — 호버/클릭 시에만

### 참조
- 상세 스타일+최적화: `docs/visual-style-guide.md`

## 테스트 관련
- TDD 필수: FAILING 테스트 먼저 → 구현 → 통과
- `npx vitest run`
- 물리 계산: 오차 1% 이내
- **PSSEK 조회 테스트**: 무기-위협-거리-접근각 조합별 정확한 Pk 반환 확인
- **센서 상태 전이 테스트**: 3단계 전이 시간, 3회 연속 실패 시 추적 상실
- **BDA 타이머 테스트**: S-L-S에서 BDA 지연 후 재발사 판단

## 커밋 메시지 규칙
```
<type>(<scope>): <한국어 설명>
type: feat|fix|refactor|test|docs|style
scope: core|viz|config|test
예: feat(core): PSSEK 테이블 기반 교전 판정 구현
```

## 주요 참조 문서
- `ARCHITECTURE.md`: EADSIM-Lite 모듈 설계, sensor-model, engagement-model, Strategy 패턴
- `ROADMAP.md`: 개발 단계 + 체크리스트
- `docs/weapon-specs.md`: 센서 8종, 사수 8종, 위협 5종 + PSSEK 테이블 + 포대 구성 + 교전 정책
- `docs/ibcs-concept.md`: IBCS 아키텍처, 킬웹 vs 킬체인
- `docs/visual-style-guide.md`: 3D 시각화 스타일

## 기존 v0.7.3 핵심 한계 (EADSIM-Lite로 해결)
1. ~~Pk × range_factor 단일 공식~~ → **PSSEK 테이블** (거리×접근각별 Pk)
2. ~~센서 즉시 탐지~~ → **SNR 4제곱 + 3단계 상태머신** (탐지→추적→교전급)
3. ~~센서 무한거리~~ → **레이더 수평선 + 섹터 + minAltitude** 기하 필터
4. ~~즉시 교전 판정~~ → **S-L-S/S-S 교리 + BDA 지연**
5. ~~운용원 없음~~ → **숙련도별 판단 시간** (15~50s)
6. ~~무제한 동시교전~~ → **MFR 동시유도 상한**
7. ~~포대 집계 탄약~~ → **발사대(TEL) 개별 탄약 관리**
8. ~~단일 재밍 계수~~ → **밴드별 감수성** (L/S/C/X)
9. ~~요격미사일 없음~~ → PNG/CLOS 물리 비행 + **CCD segment-to-segment** 판정
10. ~~6개 메트릭~~ → **EADSIM MOE/MOP 10개**

## C2 지휘통제 구조 (핵심 참조)
- 선형: GREEN_PINE → KAMD_OPS(16s링크+20~60s처리) → ICC(16s+5~15s) → ECS(1s+2~5s) → 포대
- Kill Web: 모든센서 → IAOC(1s+1~3s) → EOC(1s+1~3s) → 사수
- S2S: 선형 **84~137초**, Kill Web **5~9초**
- 상세: weapon-specs.md 섹션 4, ARCHITECTURE.md 섹션 2.7

## patriot-sim.html에서 재사용할 패턴
- ✅ PNG 비례항법유도 (`pngGuide`)
- ✅ 구면 부채꼴 레이더 와이어프레임 (`buildRadar`, `addSectorLines`)
- ✅ 3D 탐지 범위 체크 (`inDetectSector`)
- ✅ 폭발 이펙트 (`explode`)
- ✅ Military HUD 레이아웃 + CSS
- ✅ Cesium Ion 토큰

## 개발 환경
- **플랫폼**: Claude 앱에서 Claude Code와 대화식 interaction
- 파일 생성/수정 → 채팅으로 전달, 핵심 파일부터 순차
- 코드 변경 시 변경 부분 중심 설명
