import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';

export function FuturePage() {
  return <section className="future-panel"><div className="future-icon"><Icon name="lock" size={28} /></div><h1>페이지를 찾을 수 없습니다.</h1><p className="muted future-text">주소가 바뀌었거나 없는 화면입니다.</p><Link className="button primary" to="/">홈으로 돌아가기 <Icon name="arrow" size={16} /></Link></section>;
}
