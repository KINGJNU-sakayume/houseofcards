# HOUSE OF CARDS: KOREA

대한민국 제3정당 경영 시뮬레이션. **현재 구현: Phase A — Foundation**.

프리뷰: https://kingjnu-sakayume.github.io/houseofcards/

## 현재 가능한 것

- 2026-10-19부터 2028-04-10까지 월요일 일정 진행 (시작 주 포함 월요일 78회 / 77번 전진)
- 받은 편지 읽기, 주간 기록, 월간 틱 경계 확인
- 시드를 지정한 새 프리뷰, IndexedDB 자동·수동 저장, JSON 내보내기·가져오기
- 세이브 해시 및 명령 기록 재생 검증
- Web Worker 실행과 메인 스레드 폴백
- 8개 메뉴 탐색 및 GitHub Pages 하위 경로 새로고침

**창당·공약·여론·정치인·지역조직·선거 계산은 미구현입니다.** 각 메뉴에 해당 단계를 표시합니다. 실제 정치 데이터, 지지율, 의석 결과를 임시 수치로 표시하지 않습니다. 이 프리뷰는 정치 시뮬레이션 전체 제품이 아닙니다.

## 실행

Node.js 22 이상.

```bash
npm ci
npm run dev
```

http://localhost:5173/houseofcards/ 에서 엽니다.

```bash
npm run typecheck
npm run lint
npm test
npm run validate:data
npm run validate:data -- --release
npm run sim -- --seeds 20
npm run build:release
npx playwright install chromium
npm run test:e2e
```

시스템 Chromium을 쓰려면 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`.
`npm run sim`은 현재 **달력·세이브·재생 검사**이며 AI/선거 밸런스 검사가 아닙니다. 500시드 야간·수동 워크플로도 같은 범위입니다.

## 구조

`src/engine`은 DOM/React 없이 ES2022에서 타입 검사되는 순수 TypeScript입니다. UI는 Zustand의 명령을 통해 상태를 교체하고, Worker는 동일한 엔진 API만 호출합니다. 입력과 결과는 재귀적으로 동결합니다.

`src/data/reality`는 읽기 전용 현실 데이터 계층, `src/data/seeds`는 모델 해석 계층, 저장된 GameState는 플레이 진행 계층입니다. 현재 reality pack은 `FOUNDATION_ONLY`이며 정치적 사실 데이터가 비어 있습니다. 17개 시도를 8개 게임 권역에 연결하는 설계 매핑만 포함합니다.

`src/persistence`는 버전이 있는 JSON 형식과 IndexedDB를 제공합니다. 잘못된 JSON, 지원하지 않는 스키마, 손상된 해시, 재생 불일치는 기존 세이브를 교체하기 전에 거부합니다. 가져온 파일은 최대 2MB입니다. 자동저장은 현재 게임 슬롯, 수동 저장은 별도 체크포인트입니다. 여러 탭에서 동시에 플레이하면 마지막 저장이 우선하므로 한 탭 사용을 권장합니다.

## 배포

GitHub Settings → Pages → Source는 **GitHub Actions**입니다. `main` push 후 타입 검사 → lint → 테스트 → 릴리스 데이터 검증 → 20시드 검사 → 빌드 → 브라우저 검사 → Pages 배포 순서로 실행합니다. 실패하면 배포하지 않습니다. 공개 저장소를 사용합니다.

Vite `base`는 `/houseofcards/`, 라우터는 `HashRouter`입니다. `/houseofcards/#/policy`를 새로고침해도 서버 요청 경로는 `/houseofcards/`입니다. 로드 후 게임 진행에는 네트워크가 필요 없습니다. 서비스 워커/PWA 및 브라우저를 닫은 뒤의 완전 오프라인 재접속은 Phase A 범위에 포함하지 않습니다.

## 문서와 다음 단계

- [원본 Slice Spec](docs/HOUSE_OF_CARDS_KOREA_v1.0_rev2_vertical_slice.md) — 최우선 설계 기준
- [구현 프롬프트](docs/HOUSE_OF_CARDS_KOREA_codex_implementation_prompt_v1.0_rev2.md) — CURRENT PHASE A
- [결정 기록](docs/DECISIONS.md) — 단계 경계, 달력, 해시, 데이터 검증
- [검증 기록](docs/VALIDATION.md)

다음 작업은 Phase B: 실제 데이터의 출처 확인과 모델 시드 분리, 월간 이슈·공약/정부 집행·96 코호트·투표 효용·정당 AI·여론조사·기초 재정입니다. Phase C에서 창당과 인재/조직 관리를, Phase D에서 선거를 구현합니다. 현 버전 세이브는 Phase A 전용이며 후속 단계에서 명시적인 마이그레이션 정책을 정해야 합니다.
