import { useGameStore } from '../state/store';
import { SimulationNotice, partyName, percent } from '../components/Simulation';
import { allocateList } from '../engine/election/allocation';
import { NONE_ID } from '../types/politics';

const krw = (n: number) => `${(n / 10000).toLocaleString()}만원`;
const pct = (q: number) => `${q / 10000}%`;
export function Election() {
  const { game } = useGameStore();
  const r = game.electionRuleset, law = r.currentLaw;
  const poll = game.politics.polls[game.politics.polls.length - 1]!;
  // Illustration only: the latest fictional poll's point estimates as list votes, list seats only.
  const votes = Object.fromEntries(Object.entries(poll.national.results).filter(([id]) => id !== NONE_ID).map(([id, result]) => [id, result.point]));
  const example = allocateList(r, votes, {}, Object.keys(votes).sort());
  return <>
    <div className="page-heading"><div><p className="eyebrow">ELECTION / D1</p><h1>이 세이브의 선거제도</h1><p className="muted">{r.label} · 예정 선거일 {r.electionDate} (SCHEDULED)</p></div></div>
    <SimulationNotice>실제 2028년 선거제도와 선거구는 아직 확정되지 않았습니다. 이 규칙은 게임용 가정입니다. 지역구 선거·공천·캠페인·선거 결과는 다음 단계(D2–D4)에서 구현합니다.</SimulationNotice>
    <div className="sim-grid">
      <section className="sim-card" data-testid="ruleset-card"><h2>의석 배분 규칙 <span className="outline-badge">GAME ASSUMPTION</span></h2>
        <ul><li>지역구 {r.districtSeats}석 · 비례 {r.listSeats}석 (현행 정수를 가정으로 사용)</li>
          <li>비례 배분: {r.listMethod === 'parallel' ? '병립형 — 지역구와 따로, 정당득표로 Hare 몫 + 최대잔여' : `준연동형 — 연동 상한 ${r.semiCompensatory!.cap}석, 나머지 병립`}</li>
          <li>법정 문턱: {r.legalThreshold ? `정당득표 ${pct(r.legalThreshold.voteShare)} 이상 또는 지역구 ${r.legalThreshold.orDistrictSeats}석 이상 (입법 시나리오)` : '없음'}{r.listMethod === 'parallel' && !r.legalThreshold ? ` · 사실상 문턱은 약 1/${r.listSeats} ≈ ${(100 / r.listSeats).toFixed(1)}% 전후(잔여 배분에 따라 다름)` : ''}</li>
          <li>0석 정당 등록취소: {r.partyRevocation ? '가상 입법 시나리오로 적용' : '없음 — 정당법 §44①3은 2014-01-28 위헌 결정 이후 대체 조항이 없습니다'}</li></ul>
        <p className="muted small">{r.description}</p></section>
      <section className="sim-card" data-testid="law-card"><h2>현행법 값 <span className="outline-badge">REAL FACT</span></h2>
        <ul><li>지역구 단순 다수, 동수는 연장자 (§188①)</li><li>지역구·비례 중복입후보 불가 (§52③)</li>
          <li>비례명부 여성 {pct(law.listFemaleShareAtLeast)} 이상, 홀수 순위 여성 (§47③)</li>
          <li>기탁금: 지역구 {krw(law.deposit.perDistrictCandidateKrw)}, 비례 1인당 {krw(law.deposit.perListCandidateKrw)} (§56①)</li>
          <li>기탁금 반환·선거비용 보전: 지역구 득표 {pct(law.deposit.refundFullAbove)} 이상 전액, {pct(law.deposit.refundHalfAbove)} 이상 반액; 비례는 당선인이 있으면 전액 (§57①, §122의2①)</li>
          <li>공식 선거운동 {law.officialCampaignDays}일 (§33, §59)</li></ul>
        <p className="muted small">{law.statute} 조문을 {law.verifiedAt}에 대조했습니다. 연령·장애 감액 등 세부는 생략했습니다.</p></section>
    </div>
    <section className="sim-card" data-testid="allocation-example"><h2>비례 배분 계산 예시</h2>
      <p className="muted">가장 최근 가상 조사({poll.date}, {poll.houseName})의 정당별 중앙값을 정당득표로 가정해 이 규칙으로 비례 {r.listSeats}석만 계산한 예시입니다. 선거 결과나 예측이 아니며, 지역구 의석은 포함하지 않습니다{r.listMethod === 'semi_compensatory' ? '(준연동형은 지역구 0석을 가정)' : ''}.</p>
      <div className="table-scroll"><table className="sim-table"><thead><tr><th>정당</th><th>가정 득표</th><th>배분 대상</th><th>비례 의석</th></tr></thead><tbody>{Object.keys(votes).sort((a, b) => votes[b]! - votes[a]!).map(id => <tr key={id}><th>{partyName(id)}</th><td>{percent(votes[id]!)}%</td><td>{example.eligible.includes(id) ? '예' : '아니오'}</td><td>{example.list[id] ?? 0}</td></tr>)}</tbody></table></div></section>
  </>;
}
