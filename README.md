# HOUSE OF CARDS: KOREA

대한민국 제3정당 경영 시뮬레이션. **현재 구현: Phase B2 — 전국 정치 시뮬레이션**. B1은 PR #1에서 병합한 뒤 검증했습니다.

공개 사이트: https://kingjnu-sakayume.github.io/houseofcards/ — 미검증 데이터 때문에 B2 릴리스는 차단되며, 기존 공개 사이트가 자동으로 교체되지 않습니다.

현재 가능한 기능:

- 2026-10-19 → 2028-04-10 월요일 진행: 시작 포함 78개 월요일, 77번 전진
- 월간 사회 이슈 6개, 96개 코호트, 32개 정책 레버, 공약과 정부 집행의 분리
- 개발 프리뷰 정당의 정책 초안 편집·공표와 월간 인지도·신뢰·정체성 변화
- 정책 적합도·정체성·신뢰·기존 충성·정부평가·생존가능성에 따른 분석적 consideration-set 지지 계산, 부동층 포함
- 현재 지지와 잠재 지지, 장벽별 독립 반사실 분석. **잠재 지지는 모든 정당의 인지도를 100%, 생존가능성을 동일한 중립값으로 바꿉니다.** 신뢰·충성·정체성·정부평가는 유지합니다.
- 가상 조사기관 3곳의 전국·연령·권역 조사, 표본·설계효과·지속적인 기관 편향을 반영한 범위와 이력
- 제한된 정당 AI 공약 변경, 분기별 정부 AI 집행과 정책별 효과 시차
- 홈 월간 보고, 대한민국 이슈 화면, 정책 편집 화면, 데이터 허브
- 명령 기반 불변 상태, named RNG, Worker/메인 스레드, 해시/재생 검증
- IndexedDB 자동·수동 저장, 스키마 2/B2 JSON 내보내기·가져오기

모든 지지·조사는 **가상 시뮬레이션이며 현실 예측이 아닙니다.** 공표는 직접 득표를 더하지 않고, 정부 집행과도 다릅니다. 플레이어는 야당의 개발 프리뷰 객체이며 창당 기능이 아닙니다. 공표 비용은 Phase C까지 유예하며 가짜 자원 수치는 넣지 않습니다. 창당·인재 영입·지역조직·공천·지역구/비례 투표·의석 배분·Election Night·Season Review는 아직 구현하지 않았습니다.

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

`npm run sim`은 balanced / idle / housing-focused 전략을 각각 77번 진행합니다. 전국 지지의 범위·급변·합계, AI 변경 한도·다양성, 주거 공표 반응, 세이브/명령 재생을 검사합니다. **지역구·선거 밸런스 검사가 아닙니다.** nightly/manual은 같은 범위를 500시드로 실행합니다.

## 데이터와 저장의 경계

**REAL-WORLD SNAPSHOT: 2026-10-18까지 / SAVE SIMULATION: 2026-10-19부터.**

- Reality (`src/data/reality/b1.json`): 정당명, 공식 강령 주제, 집권당, 법제·인구·교정자료의 확인 상태. 정치인·지도부 인명은 적재하지 않습니다. `SIMULATION_FOUNDATIONS`는 전체 Reality Pack 또는 Data Tier 1 완성을 뜻하지 않습니다.
- Seeds (`src/data/seeds`, `src/data/policy/levers.json`): 이슈·선호·공약 prior·모형 계수·가상 조사기관·개발 프리뷰 정당. 실제 정당의 수치와 AI 선택은 **공식 입장이 아닌 GAME MODEL 추정**입니다.
- Save: 날짜별 이슈·공약·집행 이력·코호트·인식·AI·조사·RNG 위치·명령/이벤트. Reality는 변경하지 않습니다.

32개 인구 주변분포는 실제 인구수가 아닌 합성 상대질량입니다. 실제 국정평가와 17개 교정 타깃은 검증되지 않아 `null`을 유지합니다. 모형의 별도 국정평가 중립 출발값 0은 `UNVERIFIED_ASSUMPTION`으로 명시하며 현실 측정값으로 취급하지 않습니다. 법제·일정 확인도 미완료여서 **총 56개 미검증 레코드가 릴리스를 차단**합니다. 실제 데이터 교정 완료를 주장하지 않습니다.

Phase A 스키마 1과 B1 프리뷰는 한국어 안내와 함께 거부합니다. 기존 JSON을 보관하세요. 같은 스키마 2라도 B1에 없는 정치 상태를 임의로 생성해 이식하지 않습니다. B2 JSON은 최대 2MB, 명령 기록은 최대 1,000개입니다. 여러 탭 동시 편집은 마지막 쓰기가 우선합니다.

## CI와 배포

`check`: 설치 → 타입 검사 → lint → unit → 개발 데이터 검사 → 20시드 × 3전략 → 개발 빌드 → Playwright.

`release`: `check` 성공 후 `npm run build:release`. **현재 미검증 항목 때문에 의도대로 실패합니다.** 오류를 무시하거나 배포를 허용하지 않습니다. `deploy`는 두 작업이 모두 통과한 main에서만 실행합니다. `/houseofcards/` base와 HashRouter를 유지합니다.

로드 후 게임은 외부 API 없이 진행됩니다. 서비스 워커/PWA와 완전한 오프라인 재접속은 구현하지 않았습니다.

## 문서와 다음 작업

- [Slice Spec](docs/HOUSE_OF_CARDS_KOREA_v1.0_rev2_vertical_slice.md): 최우선 설계
- [원본 Phase A 프롬프트](docs/HOUSE_OF_CARDS_KOREA_codex_implementation_prompt_v1.0_rev2.md): 역사적 원문 보존
- [B1/B2 작업 지시](docs/HOUSE_OF_CARDS_KOREA_phase_b_rev2.md): **CURRENT STEP B2**
- [결정 기록](docs/DECISIONS.md), [검증 기록](docs/VALIDATION.md)

후속 Phase C는 별도 작업입니다. 검증된 인구/교정 원표 확보와 릴리스 차단 항목 해결도 남아 있습니다.
