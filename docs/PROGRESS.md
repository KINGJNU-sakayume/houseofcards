# Progress

순서와 규칙은 [ROADMAP](ROADMAP.md)을 따릅니다. 실행할 때마다 첫 번째 미완료 단계 하나만 수행하고, 끝나면 이 파일을 갱신합니다.

## 인계

- **현재 상태 (2026-10-25, C2b 완료)**
  - main에 C2a가 병합되었습니다(PR #7). C2b는 `phase/c2b`에서 PR로 올립니다. 스키마 5 / phase C2, 인물 모형 C2.1.
  - C2b 해시 (seed42): 창당 전 `51c01c4079585c89`, 창당 후 `c9ff84240b2bab93`, idle 종료 `82b14997d0fee03e`, 관리/반전 `feb1bf58dd1fe8a3`. 20시드 ×4전략 배치 `df233e725410f8b1`.
  - 검사: typecheck, lint, unit 96개, `validate:data -- --release`, sim 20시드, build, Playwright 6개 통과.
- **다음 할 일**
  - C2c(지역조직, 노출·전문성 채널, C2 봇 5종, 균형 리포트)를 `phase/c2c`에서 시작합니다. 스키마 6으로 올리고, 먼저 실제 C2b 세이브 fixture를 내보냅니다.
  - 생성기의 `regionWeight` 훅에 `candidate_scouting`을 연결합니다.
  - 골든은 `tests/fixtures/c2-golden.json`을 지우고 `node --import tsx scripts/generate-c2-golden.ts`로 다시 만듭니다.
  - DD1은 npm 없이 병행할 수 있습니다.
- **막힌 점**
  - 2026-10-20~23에는 클라우드 세션에서 `registry.npmjs.org`에 접근할 수 없었습니다. 2026-10-25 세션에서는 접근이 됐습니다.
  - DD2는 사용자 원자료를 기다리고 있습니다.

## 체크리스트

- [x] P0 로드맵·진행 파일·AGENTS 상태
- [ ] DD1 법적 수치 확인
- [ ] DD2 지역구 원자료 정규화 (사용자 파일 필요)
- [ ] DD3 254 Light + Active 30 파생
- [x] C2a 가상 정치인 생성기 + 스키마 4
- [x] C2b 영입·약속
- [ ] C2c 지역조직 → main 병합
- [ ] D1 Ruleset·의석 배분
- [ ] CAL 모형 교정
- [ ] D2 지역구 선거·전략투표
- [ ] D3 공천·비례명부
- [ ] D4 선거 실행·0석 분기 → main 병합
- [ ] E1 Election Night + Season Review
- [ ] E2 다듬기 → main 병합

## 로그

- 2026-10-25: P0. 로드맵을 개정했습니다. 남은 작업을 C2a–c, DD1–3, D1–4, CAL, E1–2로 나눴습니다. 문서만 바꿨고 코드와 골든은 변경하지 않았습니다.
- 2026-10-25: C2a. PR #6을 검토하고 병합했습니다. `phase/c2`에서 C2a를 구현했습니다. 실제 C1 세이브 `tests/fixtures/phase-c1-v3.json`을 내보낸 뒤 스키마 4로 올렸습니다. 모든 게이트가 통과했습니다.
- 2026-10-25: C2a PR #7 병합. C2b 구현(영입·역할·약속·평판, 인재 페이지, 스키마 5).
