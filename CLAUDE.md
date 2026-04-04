# CLAUDE.md — KIDA_ADSIM v2.0

## 프로젝트 정의
한국군 통합방공체계 C2 아키텍처 비교 M&S(Modeling & Simulation).
선형 3축 C2(MCRC/KAMD/육군방공) vs Kill Web(IBCS 개념) 정량적 효과 비교.
Cesium 기반 3D 시각화, 단일 HTML+JS 프론트엔드, 백엔드 없음.

## 기술 스택
- **언어**: JavaScript (ES2022+, 모듈), HTML5, CSS3
- **3D 엔진**: CesiumJS 1.111+ (CDN)
- **폰트**: Share Tech Mono, Orbitron (Google Fonts)
- **테스트**: Vitest 또는 Jest (Node.js 환경)
- **빌드**: 없음 (CDN 직접 로드, ES Module import)
- **참조 프로토타입**: `src/prototype/patriot-sim.html`

## 핵심 설계 원칙
1. **SSOT**: 모든 무기체계 파라미터는 `src/config/weapon-data.js` 단일 소스
2. **선언적 타입 레지스트리**: 무기체계의 능력(capability)과 관계(relation)를 weapon-data.js에 선언적으로 정의. 새 체계(예: LAMD) 추가 시 이 파일만 수정. 킬체인·사수 선정 로직은 반드시 `registry.js`를 경유하여 타입 정보를 조회 — 하드코딩 금지
3. **능력(불변) vs 상태(가변) 분리**: "무엇을 할 수 있는가"(weapon-data, Object.freeze)와 "지금 어떤 상태인가"(entity 인스턴스의 currentAmmo, engagedTarget 등)를 엄격 분리
4. **시뮬레이션 ↔ 시각화 분리**: core/ 모듈은 Cesium 의존성 없음. viz/ 가 core의 상태를 구독하여 렌더링
5. **실시간 시뮬레이션**: v0.7의 사후 CZML 변환이 아닌, requestAnimationFrame 기반 실시간 렌더링
6. **물리 기반**: 요격미사일 PNG 유도, 탄도미사일 포물선 궤적, 3D 경사거리
7. **점진적 확장**: Phase별 기능 추가, 각 Phase는 독립 실행 가능 상태 유지

## 코딩 규칙
- 모든 거리 단위: km (내부 계산), m (Cesium 전달 시 ×1000)
- 모든 시간 단위: 초(s)
- 좌표계: WGS84 경위도 (Cesium 네이티브)
- 고도: 해수면 기준 m
- 각도: 도(°) 저장, 계산 시 라디안 변환
- 클래스 네이밍: PascalCase (SensorAgent, ThreatEntity)
- 함수 네이밍: camelCase (computePk, selectShooter)
- 상수: UPPER_SNAKE_CASE (MAX_RANGE, RADAR_FOV)
- JSDoc 주석 필수: 모든 public 메서드에 @param, @returns

## 파일 수정 시 금지사항
- `docs/` 디렉토리의 참조 문서 직접 수정 금지 (읽기 전용 참조)
- `src/prototype/patriot-sim.html` 직접 수정 금지 (패턴 추출만)
- 테스트 파일 삭제 또는 기존 테스트 수정 금지 (새 테스트 추가만 허용)

## Cesium 성능 규칙 (대규모 시나리오 대비)
> 목표: UAS 500대 + 미사일 200발 + 레이더 100개 동시 렌더링에서 30FPS 유지

### 반드시 지킬 것
- 동적 오브젝트(위협/요격미사일/궤적)는 **Primitive API 전용** (PointPrimitiveCollection, PolylineCollection)
- 정적 오브젝트(센서/사수/C2)는 Entity API + EntityCluster 허용
- 레이더 볼륨은 **GeometryInstance 배칭** + ShowGeometryInstanceAttribute 토글
- 위치 업데이트는 **직접 속성 할당** (point.position = newPos)
- 렌더링: `requestRenderMode: true` + 시뮬레이션 중 수동 `requestRender()`
- 궤적 포인트 링 버퍼: 위협 80, 요격미사일 50 상한
- `scene3DOnly: true` 설정

### 절대 금지
- `CallbackProperty(fn, false)` — 200개에서 0 FPS
- `clampToGround` 폴리라인 — 한 자릿수 FPS
- 라벨 상시 표시 — `distanceDisplayCondition` 필수
- 레이더 볼륨 상시 표시 — 호버/클릭 시에만 show

### 참조
- 상세 스타일+최적화 코드 패턴: `docs/visual-style-guide.md` 섹션 3, 5, 10

## 테스트 관련
- TDD 필수: 기능 구현 전 FAILING 테스트 먼저 작성
- 테스트 실행: `npx vitest run`
- 물리 계산 테스트: 허용 오차 1% 이내
- 확률 테스트: 1000회 시행 후 기대값 ±5% 이내

## 커밋 메시지 규칙
```
<type>(<scope>): <한국어 설명>

type: feat|fix|refactor|test|docs|style
scope: core|viz|config|test
예: feat(core): L-SAM 탄도미사일 요격 물리엔진 구현
```

## 주요 참조 문서
- `ARCHITECTURE.md`: 시스템 설계, 모듈 의존 관계, **Strategy 패턴, 교전 판정 로직, 이벤트 로그**
- `ROADMAP.md`: 개발 단계 + 진행 추적 ([ ] → [x])
- `docs/weapon-specs.md`: 센서 7종, 사수 9종, 위협 5종 스펙 + **교전 정책, 통신 채널 모델, 시나리오 7개 정의**
- `docs/ibcs-concept.md`: IBCS 아키텍처, 킬웹 vs 킬체인 차이
- `docs/visual-style-guide.md`: IBCS 영상 기반 3D 스타일 가이드 + **대규모 렌더링 최적화**

## 기존 v0.7.3 핵심 한계 (반드시 개선)
1. 위협 직선이동 → **포물선 탄도궤적** 구현 필요
2. 요격미사일 엔티티 없음(Pk확률만) → **PNG 유도 요격미사일 엔티티** 필요
3. CZML 사후 생성 → **실시간 시뮬레이션** 필요
4. 5초 스텝으로 빠른 위협 교전기회 누락 → **프레임 단위 연속 시뮬레이션**
5. COP engagement_plan이 select_shooter에 미반영 → **통합 의사결정** 필요

## patriot-sim.html에서 재사용할 패턴
- ✅ PNG 비례항법유도 함수 (`pngGuide`)
- ✅ 구면 부채꼴 레이더 와이어프레임 (`buildRadar`, `addSectorLines`)
- ✅ 3D 탐지 범위 체크 (`inDetectSector` — ENU 변환)
- ✅ 폭발 이펙트 (`explode`)
- ✅ Military HUD 레이아웃 + CSS 스타일
- ✅ 카메라 제어 패턴
- ✅ Cesium Ion 토큰: patriot-sim.html의 기존 토큰 그대로 사용

## 개발 환경
- **플랫폼**: Claude 앱 (채팅 형태)에서 Claude Code와 대화식 interaction
- **워크플로우**: 문서/파일을 첨부하고 채팅으로 작업 지시 → 결과물 수령
- **터미널 아님**: CLI 명령어 기반이 아닌 대화 기반. 따라서:
  - 파일 생성/수정 결과를 채팅으로 보여줘야 함
  - 한 번에 너무 많은 파일을 생성하지 말고, 핵심 파일부터 순차 전달
  - 코드 변경 시 전체 파일이 아닌 변경 부분 중심으로 설명
  - 테스트 실행 결과는 요약하여 보고
