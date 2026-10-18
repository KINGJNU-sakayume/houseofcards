# HOUSE OF CARDS: KOREA

대한민국 제3정당 경영 시뮬레이션. **현재 구현: Phase B1 — Simulation Foundations**. 첨부 B1/B2 작업의 B1까지만 구현했습니다.

공개 사이트: https://kingjnu-sakayume.github.io/houseofcards/ — B1은 미검증 데이터 때문에 릴리스가 차단되며, 기존 Phase A 사이트가 자동으로 교체되지 않습니다.

현재 가능한 기능:

- 2026-10-19 → 2028-04-10 월요일 진행: 시작 포함 78개 월요일, 77번 전진
- 매월 마지막 월요일에 여섯 사회 이슈 갱신, 받은 편지에서 **게임 모델 지수** 보고 확인
- 6개 정책 영역의 32개 레버 메타데이터, 초안/공표 분리, 최근 반전의 일관성 기억
- 정부 집행 계층: 초기 현행값 2, 집행 이력과 달력 월 단위 효과 시차
- 권역 8 × 연령 4 × 생활조건 3의 **96개 코호트**, 조건부 가중치의 정확한 고정소수점 정규화
- 명령 기반 불변 상태, named RNG, Worker/메인 스레드, 해시/재생 검증
- IndexedDB 자동·수동 저장, 스키마 2 JSON 내보내기/가져오기

정책 명령과 정부 집행 전이는 엔진 API에 있습니다. 정책 편집 화면은 B2입니다. 플레이어 플랫폼은 미공표 개발 객체이며 창당 기능이 아닙니다. 공표 비용은 Phase C까지 유예하며 가짜 자원 수치를 넣지 않습니다. **지지율·Potential/Current·여론조사·정당 AI·정부 AI는 아직 없습니다.** 창당, 인재 영입, 지역조직, 공천, 지역구/비례 선거, Election Night, Season Review도 미구현입니다.

## 실행 및 검사

Node.js 22 이상:

```bash
npm ci
npm run dev
# http://localhost:5173/houseofcards/
npm run typecheck
npm run lint
npm test
npm run validate:data
npm run sim -- --seeds 20
npm run build
npx playwright install chromium
npm run test:e2e
```

시스템 Chromium은 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`로 지정합니다.

`npm run sim`은 B1 이슈·코호트·세이브·명령 재생 검사입니다. AI/투표/선거 밸런스 검사가 아닙니다. nightly/manual 500시드도 같은 범위입니다.

## 데이터와 저장의 경계

**REAL-WORLD SNAPSHOT: 2026-10-18까지 / SAVE SIMULATION: 2026-10-19부터.**

- Reality (`src/data/reality/b1.json`): 정당명, 출처가 있는 공식 강령 주제, 집권당, 법제 확인 상태, 인구/교정자료 확인 상태. 정치인·지도부 인명은 적재하지 않습니다. `SIMULATION_FOUNDATIONS`는 전체 Reality Pack 또는 Data Tier 1 완성을 뜻하지 않습니다.
- Seeds (`src/data/seeds/b1.json`, `src/data/policy/levers.json`): 이슈 초기 지수/모형 계수, 프로필 조건부 질량, 생활조건별 선호, 공식 주제→공약 prior 해석, 정당 attachment 초기 보정. 실제 정당의 레버 수치는 **공식 입장이 아닌 GAME MODEL 추정**입니다.
- Save: 날짜별 이슈, 공약·집행 이력, 코호트, RNG 위치, 명령·이벤트 기록. Reality는 변경하지 않습니다.

권역×연령의 32개 주변분포는 **실제 인구수가 아닌 합성 상대질량**이며 모두 `UNVERIFIED_ASSUMPTION`입니다. 국정평가와 교정 타깃은 검증된 숫자를 얻지 못해 `null`로 남겼습니다. 일부 선거법·날짜 확인도 미완료입니다. 상세 출처와 미해결 목록은 [결정 기록](docs/DECISIONS.md)을 보세요.

Phase A 스키마 1은 한국어 안내와 함께 거부하며 누락된 정치 상태를 만들지 않습니다. 기존 Phase A JSON 파일은 보관하세요. B1 JSON은 최대 2MB, 명령 기록은 최대 1,000개입니다. 여러 탭 동시 편집은 기존과 같이 마지막 쓰기가 우선합니다.

## CI와 배포

`check`: 설치 → 타입 검사 → lint → unit → 개발 데이터 검사 → B1 20시드 → 개발 빌드 → Playwright.

`release`: `check` 성공 후 `npm run build:release`. **현재 미검증 항목 때문에 이 작업은 의도대로 실패합니다.** 오류를 무시하거나 배포를 허용하지 않습니다. `deploy`는 두 작업이 모두 통과한 main에서만 실행합니다. 기존 Pages 설정과 `/houseofcards/` base, HashRouter는 유지합니다.

로드 후 게임은 외부 API 없이 진행됩니다. 서비스 워커/PWA와 완전한 오프라인 재접속은 구현하지 않았습니다.

## 문서와 다음 작업

- [Slice Spec](docs/HOUSE_OF_CARDS_KOREA_v1.0_rev2_vertical_slice.md): 최우선 설계
- [원본 Phase A 프롬프트](docs/HOUSE_OF_CARDS_KOREA_codex_implementation_prompt_v1.0_rev2.md): 역사적 원문 보존
- [B1/B2 작업 지시](docs/HOUSE_OF_CARDS_KOREA_phase_b_rev2.md): **CURRENT STEP B1**
- [결정 기록](docs/DECISIONS.md), [검증 기록](docs/VALIDATION.md)

다음은 별도 B2 작업입니다. B1 병합과 검사를 확인한 뒤 유권자 판단·Potential/Current·AI·정부 AI·여론조사·정책/Korea/Data Hub 화면을 구현합니다. 검증된 인구/교정 원표 확보와 릴리스 차단 항목 해결이 남아 있습니다.
