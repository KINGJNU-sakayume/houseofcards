# Progress

순서와 규칙은 [ROADMAP](ROADMAP.md)을 따릅니다. 실행할 때마다 첫 번째 미완료 단계 하나만 수행하고, 끝나면 이 파일을 갱신합니다.

## 인계

- **현재 상태 (2026-10-25, C2a 완료)**
  - main은 C1(+로드맵 PR #6)까지입니다. `phase/c2` 브랜치에 C2a가 있습니다: 스키마 4 / phase C2, 가상 정치인 생성기, 이름 denylist와 validator.
  - C2a 해시 (seed42, `tests/fixtures/c2-golden.json`): 창당 전 `488d1a8dce447688`, 창당 후 `3aa202d2139778b1`, idle 종료 `282fa0fcb14ef205`, 관리/반전 `3ce9810f0e14dbee`. 20시드 ×4전략 배치 해시 `83e528027de1598c`. (C1: `8c52aa107c0a262d` / `80540311e6cc2763` / `5cb48dbde11d429d` / `1c3da2a992705758`, 배치 `d64c0602e0255e81`.)
  - 검사: typecheck, lint, unit 88개, `validate:data -- --release`, sim 20시드, build, Playwright 5개 모두 통과.
- **다음 할 일**
  - C2b(영입·약속)를 `phase/c2`에서 시작합니다. 먼저 npm 사전 점검을 합니다.
  - C2b는 상태를 바꾸므로 `tests/fixtures/c2-golden.json`을 지우고 `node --import tsx scripts/generate-c2-golden.ts`로 다시 만들고 바뀐 해시를 여기에 적습니다.
  - 생성기의 `regionWeight` 훅에 C2c의 `candidate_scouting`을 연결합니다.
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
- [ ] C2b 영입·약속
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
