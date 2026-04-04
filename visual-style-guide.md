# 3D 시각적 스타일 가이드 — IBCS 영상 기반

> 'Joint Multi Domain Integration Achieved with IBCS' (Northrop Grumman, 47초) 영상을
> 프레임 단위로 분석하여 추출한 시각적 디자인 스펙입니다.

---

## 1. 전체 분위기

- **배경**: 어두운 배경 (Cesium의 dark terrain + 야간 모드)
- **톤**: 군사적·전문적·미래지향적
- **조명**: globe.enableLighting = true, 야간 또는 황혼
- **색온도**: 차가운 톤 (cyan/teal 지배)

---

## 2. 색상 팔레트

### 아군 (Blue Force)
```css
--friendly-primary: #00ffcc;     /* cyan/teal — 주력 색상 */
--friendly-glow: rgba(0,255,204,0.3);  /* 글로우 효과 */
--friendly-wireframe: #00ccaa;   /* 와이어프레임 라인 */
--friendly-label: #00ff88;       /* HUD 텍스트 (patriot-sim.html 호환) */
```

### 위협 (Red Force)
```css
--threat-primary: #ff4444;       /* 빨강 — 위협 마커 */
--threat-trail: rgba(255,68,68,0.6);  /* 궤적 꼬리 */
--threat-glow: rgba(255,0,0,0.2);     /* 경고 글로우 */
```

### 데이터링크
```css
--datalink-color: #00ddff;       /* cyan 점선 */
--datalink-active: #00ffff;      /* 활성 전송 시 밝은 cyan */
--datalink-degraded: #ffcc00;    /* 열화된 링크 (노랑) */
```

### 레이더 범위
```css
--radar-detection: rgba(0,136,255,0.08);   /* 탐지범위 (파랑 8%) */
--radar-engagement: rgba(0,255,136,0.12);  /* 교전범위 (초록 12%) */
--radar-wireframe: rgba(0,200,255,0.25);   /* 와이어프레임 */
```

### 센서 유형별 레이더 콘 색상 (IBCS 영상에서 추출)
```css
--sensor-ew-radar: #44cc44;      /* 녹색 — 조기경보 (EWR, GREEN_PINE) */
--sensor-fc-radar: #00aaff;      /* 파랑 — 화력통제 (PAT, MFR) */
--sensor-shorad: #88cc44;        /* 올리브 — 근거리 (SHORAD) */
```

---

## 3. 렌더링 API 선택 규칙 (성능 핵심)

> **원칙**: 정적 자산은 Entity API + 클러스터링, 동적 자산은 Primitive API 전용.
> UAS 500대 + 순항미사일 100발 + 레이더 100개 시나리오에서 60FPS를 유지하기 위한 전략.

### API 선택 매트릭스

| 오브젝트 유형 | 수량 규모 | API | 근거 |
|---|---|---|---|
| 센서/C2/사수 노드 (정적) | ~200개 | Entity + EntityCluster | 위치 변경 없음, 클러스터링으로 밀집 처리 |
| 위협 (탄도/순항/UAS) | ~700개 동시 | **PointPrimitiveCollection** | 매 프레임 위치 갱신, Entity는 15개부터 성능 저하 |
| 요격미사일 | ~200개 동시 | **PointPrimitiveCollection** | 고속 위치 갱신 + 짧은 수명 |
| 궤적 꼬리 (trail) | ~900개 동시 | **PolylineCollection** | CallbackProperty 절대 사용 금지 |
| 레이더 볼륨 | ~100개 | **Primitive + GeometryInstance** | 1회 생성, ShowAttribute로 호버 토글 |
| 데이터링크 | ~500개 | **PolylineCollection** | 정적 라인, 드로콜 최소화 |
| 라벨 | ~200개 | **LabelCollection** | distanceDisplayCondition으로 근거리만 표시 |
| 폭발 이펙트 | ~50개 동시 | Entity (임시) | 수명 짧고 수량 적음, 페이드 후 즉시 제거 |

### 절대 금지사항
- `CallbackProperty(fn, false)` — 200개에서 0 FPS. 직접 속성 할당 + suspendEvents 패턴 사용
- `clampToGround` 폴리라인 — 미사일 궤적은 반드시 `ArcType.NONE`
- 라벨 상시 표시 — 10,000개 Label은 심각한 성능 저하. distanceDisplayCondition 필수

---

## 4. 엔티티별 시각적 스타일

### 센서/사수 노드 (아군) — Entity API
- **형태**: Point + Label (EntityCluster 적용)
- **크기**: 10~14px
- **색상**: cyan (#00ffcc)
- **라벨**: Share Tech Mono 9px, pixelOffset: [20, 0]
- **LOD**: `distanceDisplayCondition`으로 라벨은 50km 이내에서만 표시
- **클러스터링**: pixelRange 40, minimumClusterSize 3
- `disableDepthTestDistance: Number.POSITIVE_INFINITY` (항상 보임)

```javascript
// 클러스터링 설정
dataSource.clustering.enabled = true;
dataSource.clustering.pixelRange = 40;
dataSource.clustering.minimumClusterSize = 3;
```

### 위협 (적) — PointPrimitiveCollection
- **크기**: 11px
- **색상**: SRBM 빨강(#ff4444), CM 주황(#ff8800), 극초음속 보라(#cc44ff), UAS 노랑(#ffcc00)
- **LOD**: `scaleByDistance` — 근거리 1.5배, 원거리 0으로 축소

```javascript
// 위협 포인트 — Primitive API
const threatPoints = new Cesium.PointPrimitiveCollection();
viewer.scene.primitives.add(threatPoints);

const point = threatPoints.add({
    position: pos,
    pixelSize: 11,
    color: Cesium.Color.RED,
    scaleByDistance: new Cesium.NearFarScalar(5e3, 1.5, 5e6, 0.3),
    translucencyByDistance: new Cesium.NearFarScalar(5e3, 1.0, 8e6, 0.1),
});
// 위치 업데이트: point.position = newPos; (매 프레임)
```

### 요격미사일 — PointPrimitiveCollection
- **크기**: 8px
- **색상**: 초록 (#00ff88)
- **수명**: 발사~충돌 후 즉시 제거 (`collection.remove(point)`)

### 궤적 꼬리 — PolylineCollection
- **궤적 포인트 수 제한**: 위협 80포인트, 요격미사일 50포인트 (링 버퍼)
- **거리 기반 데시메이션**: 이전 점과 500m 미만이면 스킵
- **오래된 궤적 자동 제거**: 충돌/누출 후 3초 페이드 → 제거
- **ArcType.NONE 필수** (clampToGround 절대 금지)

```javascript
// 궤적 — Primitive PolylineCollection
const trails = new Cesium.PolylineCollection();
viewer.scene.primitives.add(trails);

// 업데이트 시 suspendEvents 패턴이 아닌 직접 positions 교체
const polyline = trails.add({
    positions: positionBuffer, // Float64Array 링 버퍼
    width: 2,
    material: Cesium.Material.fromType('PolylineGlow', {
        glowPower: 0.18, color: Cesium.Color.RED.withAlpha(0.8)
    }),
});
```

### 데이터링크 — PolylineCollection
- **형태**: PolylineDash (점선)
- **색상**: 센서→C2 cyan, C2→C2 주황, C2→사수 초록
- **두께**: 1.5~2px, dashLength: 16
- **LOD**: `distanceDisplayCondition(0, 300000)` — 300km 이내에서만 표시
- `allowPicking: false` (인터랙션 불필요)

---

## 5. 레이더 볼륨 (대규모 최적화)

> **핵심 변경**: 레이더 범위는 기본적으로 숨김. 마우스 호버 시에만 해당 센서의 볼륨 표시.
> 100개 이상의 레이더를 GeometryInstance 배칭으로 단일 드로콜 처리.

### 기본 상태: 지면 부채꼴 외곽선만 표시
- 센서 위치에서 탐지 범위의 **지면 외곽 원호**만 불투명 라인으로 상시 표시
- 3D 구면 부채꼴 와이어프레임은 **숨김 상태** (show: false)
- 조감 뷰에서 수십 개의 레이더 범위가 중첩되어도 화면이 깨끗하게 유지

### 마우스 호버 시: 해당 센서 볼륨만 표시
```javascript
// 100개 레이더 볼륨을 GeometryInstance로 사전 생성 (1회)
const radarGeometry = new Cesium.EllipsoidOutlineGeometry({
    radii: new Cesium.Cartesian3(100000, 100000, 100000),
    stackPartitions: 8, slicePartitions: 12
});

const instances = sensors.map((s, i) => new Cesium.GeometryInstance({
    geometry: radarGeometry,
    modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(s.position),
    id: 'radar_' + s.id,
    attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(
            Cesium.Color.CYAN.withAlpha(0.25)),
        show: new Cesium.ShowGeometryInstanceAttribute(false) // 기본 숨김
    }
}));

const radarPrimitive = viewer.scene.primitives.add(new Cesium.Primitive({
    geometryInstances: instances,
    appearance: new Cesium.PerInstanceColorAppearance({
        flat: true, translucent: true }),
    allowPicking: true, // 호버 감지용
    asynchronous: true  // 웹 워커에서 지오메트리 계산
}));

// 마우스 호버 핸들러 (4px 이동 스로틀링)
let lastHoveredId = null;
let lastPickPos = new Cesium.Cartesian2();

handler.setInputAction(function(movement) {
    const dx = movement.endPosition.x - lastPickPos.x;
    const dy = movement.endPosition.y - lastPickPos.y;
    if (Math.sqrt(dx*dx + dy*dy) < 4) return;
    lastPickPos = Cesium.Cartesian2.clone(movement.endPosition);

    // 이전 호버 숨기기
    if (lastHoveredId) {
        const attrs = radarPrimitive.getGeometryInstanceAttributes(lastHoveredId);
        attrs.show = Cesium.ShowGeometryInstanceAttribute.toValue(false);
    }

    const picked = viewer.scene.pick(movement.endPosition);
    if (Cesium.defined(picked) && picked.id?.startsWith?.('radar_')) {
        const attrs = radarPrimitive.getGeometryInstanceAttributes(picked.id);
        attrs.show = Cesium.ShowGeometryInstanceAttribute.toValue(true);
        lastHoveredId = picked.id;
    } else {
        lastHoveredId = null;
    }
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
```

### 클릭 시: 볼륨 고정 표시 + 상세 정보 패널
- 센서 클릭 → 볼륨 고정 표시 (다시 클릭 시 해제)
- HUD에 센서 상세 정보 표시 (탐지거리, 추적용량, 상태)

### 와이어프레임 스타일 (patriot-sim.html 패턴 유지)
- 경선 방향(고각 변화) + 위선 방향(방위각 변화) 라인 메쉬
- 탐지범위: 파랑 (#0088ff), opacity 0.25
- 교전범위: 초록 (#00ff88), opacity 0.45
- **AZ_STEPS: 24, EL_STEPS: 12** (대규모 시나리오용 단순화, patriot-sim의 48/24에서 축소)
- `PerInstanceColorAppearance({ flat: true })` — 조명 계산 비활성화
- `allowPicking: false` (장식용 와이어프레임은 pick 제외)

### 정면 빔 라인
- 포대→레이더 정면 방향 점선
- 흰색 30% 투명도, PolylineDash
- `distanceDisplayCondition(0, 200000)` — 200km 이내에서만 표시

---

## 6. 이펙트

### 폭발 — Entity (임시 생성/즉시 제거)
- **성공 요격**: 주황 Ellipsoid (7000m 반경), 0.8 opacity → 0으로 페이드, **1초 후 entity 제거**
- **실패 (지면 타격)**: 빨강 Ellipsoid (30000m 반경) + 노랑 지면 Ellipse, **2초 후 제거**
- **동시 최대 50개**: 오래된 이펙트 강제 제거 (큐 관리)
- **화면 플래시**: 전체화면 CSS overlay, 120ms 지속
  - 성공: rgba(255,200,0,0.06)
  - 실패: rgba(255,0,0,0.1)

### 발사 효과
- 사수 위치에서 수직 상승하는 초록 점 (부스터 2초)
- 부스터 종료 후 PNG 유도로 위협 추적

---

## 7. HUD (Head-Up Display)

### 좌측 패널 (포대 상태)
```css
배경: rgba(0,4,2,0.91)
테두리: 1px solid rgba(0,255,136,0.28)
제목폰트: Orbitron 7px, letter-spacing: 3px
본문폰트: Share Tech Mono 9px
색상: 초록(#00ff88), 빨강(#ff4444), 노랑(#ffcc00), 파랑(#44aaff)
```

### 우측 패널 (제어)
- 레이더 방위각/고각/FOV 슬라이더
- Pk 조절 슬라이더
- 카메라 프리셋 버튼 그리드

### 하단 버튼
```css
배경: rgba(0,4,2,0.93)
테두리: 1px solid rgba(0,255,136,0.38)
폰트: Share Tech Mono 9px, letter-spacing: 1px
hover: box-shadow 0 0 8px rgba(0,255,136,0.2)
```

---

## 8. 카메라 프리셋

| 이름 | 고도 | 피치 | 용도 |
|------|------|------|------|
| 전체 조감 | 600km | -55° | 전장 전체 조망 |
| 45도 뷰 | 130km | -30° | 기본 전투 뷰 |
| 수평 뷰 | 60km | -4° | 교전 클로즈업 |
| 포대 근접 | 20km | -38° | 포대 상세 |

---

## 9. IBCS 영상 서사 구조 (카메라 시퀀스 참조)

1. **전체 네트워크 조감** (5초): 모든 노드와 데이터링크 연결 조망
2. **"From Sensor"** (10초): 센서 클로즈업, 탐지 시각화
3. **"To Decider"** (15초): IBCS C2 노드, 다중 데이터링크 수렴
4. **다중 센서 커버리지** (20초): 레이더 콘 교차 영역 표시
5. **"IBCS fuses tracks"** (24초): 컴포지트 트래킹 시각화
6. **"Optimal Effector"** (30초): 최적 사수 선정 하이라이트
7. **요격** (34초): 요격미사일 발사 + 교전
8. **완성** (40초): 전체 네트워크 완성 — "IBCS — Mature"

---

## 10. 대규모 시나리오 성능 최적화 종합

> 목표 시나리오: UAS 500대 + 순항미사일 100발 + 방사포 100발 + 탄도미사일 10발
> 방공체계: 천궁-II 100대+, 레이더 100개+, C2 노드 수십 개

### 10.1 렌더링 모드 관리

```javascript
// Viewer 초기화 시 requestRenderMode 활성화
const viewer = new Cesium.Viewer('cesiumContainer', {
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity, // 유휴 시 렌더링 정지
    scene3DOnly: true,                 // 2D/콜럼버스 뷰 비활성화
});

// 시뮬레이션 실행 중에는 매 프레임 렌더 요청
function simLoop() {
    engine.step(dt);
    updatePrimitivePositions();  // 직접 속성 할당
    viewer.scene.requestRender();
    requestAnimationFrame(simLoop);
}

// 시뮬레이션 일시정지 시 자동으로 렌더링 정지 (requestRenderMode 효과)
```

### 10.2 LOD (Level of Detail) 전략

| 카메라 고도 | 정적 자산 (센서/사수) | 동적 자산 (위협/요격미사일) | 레이더 볼륨 |
|---|---|---|---|
| 600km+ (전체 조감) | 클러스터 아이콘만 | 축소된 점 (scaleByDistance 0.3) | 숨김 |
| 100~600km | 개별 아이콘 + 유형 라벨 | 기본 크기 점 | 지면 외곽선만 |
| 30~100km | 아이콘 + 이름 라벨 | 점 + 짧은 궤적(30pt) | 호버 시 와이어프레임 |
| <30km (근접) | 아이콘 + 상세 라벨 + 상태 | 점 + 전체 궤적(80pt) | 호버 시 전체 볼륨 |

```javascript
// 위협 포인트에 LOD 적용
point.scaleByDistance = new Cesium.NearFarScalar(
    5e3,   1.5,   // 5km 이내: 1.5배
    5e6,   0.3    // 5000km: 0.3배
);
point.translucencyByDistance = new Cesium.NearFarScalar(
    5e3,   1.0,   // 5km 이내: 불투명
    8e6,   0.1    // 8000km: 거의 투명
);
```

### 10.3 궤적 메모리 관리

```
위협 수명주기:
  생성 → 비행중 → 탐지 → 교전중 → 격추/누출 → 페이드(3초) → 완전 제거

궤적 관리:
  - 링 버퍼: 위협당 최대 80포인트, 요격미사일 50포인트
  - 거리 데시메이션: 직전 점과 500m 미만 → 스킵
  - 격추 후: 3초간 궤적 유지 → PolylineCollection에서 remove
  - 전체 궤적 수 상한: 1000개 (초과 시 가장 오래된 것부터 제거)
```

### 10.4 Web Worker 분리

```
메인 스레드:          Worker 스레드:
  Cesium 렌더링         물리 계산 (탄도궤적, PNG유도)
  HUD 업데이트          탐지확률 계산
  마우스 인터랙션        킬체인 타이머
  Primitive 위치 갱신    메트릭 집계
       ↑                    ↓
       └── Float64Array (Transferable) ──┘
```

- 시뮬레이션 엔진 전체를 Worker에서 실행
- 매 프레임 결과(위치 배열)를 Transferable Object로 제로카피 전송
- 메인 스레드는 수신된 배열로 Primitive 위치만 갱신

### 10.5 성능 예산 (목표 FPS: 30+ 유지)

| 항목 | 예산 | 비고 |
|---|---|---|
| PointPrimitive 갱신 | ~1ms | 700개 × 위치 할당 |
| PolylineCollection 갱신 | ~3ms | 궤적 포인트 추가 |
| Cesium 렌더링 | ~20ms | 33FPS 기준 |
| Worker 계산 | 제한 없음 | 별도 스레드 |
| 마우스 pick | ~2ms | 스로틀링 적용 |
| **총 프레임 타임** | **<33ms** | 30FPS 유지 |

### 10.6 BlendOption 최적화

```javascript
// 불투명 포인트 컬렉션: 2배 성능 향상
threatPoints.blendOption = Cesium.BlendOption.OPAQUE;

// 반투명이 필요한 컬렉션은 별도 분리
const transparentTrails = new Cesium.PolylineCollection();
// 반투명은 별도 렌더 패스 → 불투명과 분리해야 드로콜 최적화
```
