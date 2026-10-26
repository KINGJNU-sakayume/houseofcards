import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';
import { grade } from './format';

// Shared presentational components. They render props only and never touch the store.

export function Panel({ title, sub, actions, children, flush, className = '', testId }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; className?: string; testId?: string }) {
  return <section className={`panel ${className}`} data-testid={testId}>
    {(title || actions) && <header className="panel-head"><div>{title && <h2>{title}</h2>}{sub && <p>{sub}</p>}</div>{actions && <div className="row">{actions}</div>}</header>}
    <div className={`panel-body ${flush ? 'flush' : ''}`}>{children}</div>
  </section>;
}

export function PageHeading({ eyebrow, title, sub, aside }: { eyebrow?: string; title: string; sub?: ReactNode; aside?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{sub && <p>{sub}</p>}</div>{aside}</div>;
}

export function Stat({ label, value, note, tone, children, testId }: { label: string; value: ReactNode; note?: ReactNode; tone?: 'gain' | 'loss'; children?: ReactNode; testId?: string }) {
  return <div className={`stat ${tone ?? ''}`} data-testid={testId}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}{children}</div>;
}

export function Pills<T extends string>({ options, value, onChange, label }: { options: { id: T; label: ReactNode; color?: string; title?: string }[]; value: T; onChange: (id: T) => void; label: string }) {
  return <div className="pills" role="group" aria-label={label}>{options.map(o => <button key={o.id} type="button" className="pill" aria-pressed={o.id === value} title={o.title} onClick={() => onChange(o.id)}>{o.color && <span className="dot" style={{ background: o.color }} />}{o.label}</button>)}</div>;
}

export function Tabs<T extends string>({ options, value, onChange, label }: { options: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (id: T) => void; label: string }) {
  return <div className="tabs" role="tablist" aria-label={label}>{options.map(o => <button key={o.id} type="button" role="tab" aria-selected={o.id === value} className={o.id === value ? 'active' : ''} onClick={() => onChange(o.id)}>{o.label}{o.count !== undefined && <span className="count" aria-hidden="true">{o.count}</span>}</button>)}</div>;
}

export function Modal({ title, onClose, children, narrow, closeLabel = '닫기', testId }: { title: ReactNode; onClose: () => void; children: ReactNode; narrow?: boolean; closeLabel?: string; testId?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current!;
    if (!element.open) element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={ref} data-testid={testId} className={`modal ${narrow ? 'narrow' : ''}`} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label={closeLabel} onClick={onClose}><Icon name="close" size={18} /></button></header>
    <div className="modal-body">{children}</div>
  </dialog>;
}

export function AttrValue({ value, label }: { value: number; label?: string }) {
  return <span className={`attr grade-${grade(value)}`} aria-label={label ? `${label} ${value}` : undefined}>{value}</span>;
}

export function Bar({ value, max = 100, color, label }: { value: number; max?: number; color?: string; label?: string }) {
  const width = Math.max(0, Math.min(100, (value / max) * 100));
  return <div className="bar" role={label ? 'img' : undefined} aria-label={label}><span style={{ width: `${width}%`, background: color }} /></div>;
}

export function SimBadge({ children = '가상 시뮬레이션' }: { children?: ReactNode }) {
  return <span className="badge info">{children}</span>;
}
export function ModelBadge() {
  return <span className="outline-badge">게임 모형</span>;
}
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty-state">{children}</p>;
}
