import { Link, useLocation } from 'react-router-dom';
import { NAVIGATION } from '../data/content/navigation';
import { Icon } from '../components/Icon';
import { useGameStore } from '../state/store';

export function FuturePage() {
  const location = useLocation();
  const politicians = useGameStore(store => store.game.politicians);
  const item = NAVIGATION.find(nav => nav.path === location.pathname);
  if (!item) return <section className="future-panel"><h1>페이지를 찾을 수 없습니다.</h1><Link className="button" to="/">홈으로 돌아가기</Link></section>;
  return <>
    <div className="page-heading"><div><p className="eyebrow">{item.english}</p><h1>{item.label}</h1><p className="muted">{item.description}</p></div></div>
    <section className="future-panel"><div className="future-icon"><Icon name={item.icon} size={32} /></div><span className="outline-badge">PHASE {item.phase}</span><h2>다음 단계에서 열립니다.</h2><p>이 기능은 현재 단계에서 구현되지 않았습니다.<br />현재는 창당·자원·재정·연구·내부조사와 세이브를 확인할 수 있습니다.</p>{item.path === '/politicians' && <p data-testid="pool-summary">이 세이브에 생성된 가상 인재 후보 {politicians.length}명 (영입 대기 {politicians.filter(p => p.status === 'prospect').length}명). 상세 표·영입·약속은 C2b에서 열립니다.<br /><small className="muted">가상 인물입니다. 실존 인물과 무관하며 이름이 우연히 같을 수 있습니다.</small></p>}<Link className="button primary" to="/">이번 주 일정으로 <Icon name="arrow" size={16} /></Link></section>
    <div className="foundation-note"><Icon name="lock" /><p>가상 인재 생성은 C2a에 구현되었습니다. 영입·약속은 C2b, 지역조직은 C2c, 공천·선거 결과는 Phase D에서 구현합니다. 아직 가짜 후보나 의석 수를 표시하지 않습니다.</p></div>
  </>;
}
