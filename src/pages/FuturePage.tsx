import { Link, useLocation } from 'react-router-dom';
import { NAVIGATION } from '../data/content/navigation';
import { Icon } from '../components/Icon';

export function FuturePage() {
  const location = useLocation();
  const item = NAVIGATION.find(nav => nav.path === location.pathname);
  if (!item) return <section className="future-panel"><h1>페이지를 찾을 수 없습니다.</h1><Link className="button" to="/">홈으로 돌아가기</Link></section>;
  return <>
    <div className="page-heading"><div><p className="eyebrow">{item.english}</p><h1>{item.label}</h1><p className="muted">{item.description}</p></div></div>
    <section className="future-panel"><div className="future-icon"><Icon name={item.icon} size={32} /></div><span className="outline-badge">PHASE {item.phase}</span><h2>다음 단계에서 열립니다.</h2><p>이 기능은 현재 단계에서 구현되지 않았습니다.<br />B1에서는 주간 일정·월간 이슈 보고와 세이브를 확인할 수 있습니다.</p><Link className="button primary" to="/">이번 주 일정으로 <Icon name="arrow" size={16} /></Link></section>
    <div className="foundation-note"><Icon name="lock" /><p>공약 편집 화면·지지율·여론조사·AI 전략은 B2에 구현됩니다. 현실 기준과 세이브의 게임 모델 지수는 구분합니다.</p></div>
  </>;
}
