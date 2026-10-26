// Hand-written SVG charts (no chart library). Values are plain numbers; display only.

export interface Series { id: string; label: string; color: string; values: (number | null)[]; band?: [number, number][] }

const W = 600, PAD = { l: 44, r: 12, t: 10, b: 24 };

export function LineChart({ series, labels, height = 220, format = (v: number) => String(v), ariaLabel, zero = false }: { series: Series[]; labels: string[]; height?: number; format?: (v: number) => string; ariaLabel: string; zero?: boolean }) {
  const all = series.flatMap(s => [...s.values.filter((v): v is number => v !== null), ...(s.band?.flat() ?? [])]);
  if (!labels.length || !all.length) return <p className="empty-state">아직 기록이 없습니다.</p>;
  let lo = Math.min(...all), hi = Math.max(...all);
  if (zero) lo = Math.min(0, lo);
  if (hi === lo) { hi += 1; lo -= zero ? 0 : 1; }
  const pad = (hi - lo) * .08; hi += pad; if (!zero) lo -= pad;
  const iw = W - PAD.l - PAD.r, ih = height - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (labels.length === 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const y = (v: number) => PAD.t + ih - ((v - lo) / (hi - lo)) * ih;
  const ticks = [0, 1, 2, 3].map(i => lo + ((hi - lo) * i) / 3);
  const step = Math.max(1, Math.ceil(labels.length / 6));
  return <figure className="chart-figure">
    <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={ariaLabel}>
      {ticks.map((t, i) => <g key={i}><line className="grid-line" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} /><text x={PAD.l - 6} y={y(t) + 4} textAnchor="end">{format(t)}</text></g>)}
      {labels.map((l, i) => i % step === 0 || i === labels.length - 1 ? <text key={i} x={x(i)} y={height - 6} textAnchor="middle">{l}</text> : null)}
      {series.map(s => <g key={s.id}>
        {s.band && <path d={`${s.band.map(([a], i) => `${i ? 'L' : 'M'}${x(i)},${y(a)}`).join('')}${[...s.band].reverse().map(([, b], j) => `L${x(s.band!.length - 1 - j)},${y(b)}`).join('')}Z`} style={{ fill: s.color }} opacity={.15} />}
        <path d={s.values.map((v, i) => v === null ? '' : `${i && s.values[i - 1] !== null ? 'L' : 'M'}${x(i)},${y(v)}`).join('')} fill="none" style={{ stroke: s.color }} strokeWidth={2} strokeLinejoin="round" />
        {s.values.map((v, i) => v === null || i !== s.values.length - 1 ? null : <circle key={i} cx={x(i)} cy={y(v)} r={3.5} style={{ fill: s.color }} />)}
      </g>)}
    </svg>
    {series.length > 1 && <figcaption className="chart-legend">{series.map(s => <span key={s.id}><i className="dot" aria-hidden="true" style={{ background: s.color }} />{s.label}</span>)}</figcaption>}
  </figure>;
}

export function Sparkline({ values, color = 'var(--accent)', height = 34, ariaLabel }: { values: number[]; color?: string; height?: number; ariaLabel: string }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values) === lo ? lo + 1 : Math.max(...values);
  const w = 160, x = (i: number) => (i / (values.length - 1)) * w, y = (v: number) => height - 3 - ((v - lo) / (hi - lo)) * (height - 6);
  return <svg className="chart sparkline" viewBox={`0 0 ${w} ${height}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none" style={{ height }}>
    <path d={values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('')} fill="none" style={{ stroke: color }} strokeWidth={2} vectorEffect="non-scaling-stroke" />
  </svg>;
}

// Horizontal signed bars: positive = gain (green), negative = loss (red).
export function BarList({ items, format = (v: number) => String(v), ariaLabel }: { items: { label: string; value: number; color?: string }[]; format?: (v: number) => string; ariaLabel: string }) {
  const max = Math.max(1, ...items.map(i => Math.abs(i.value)));
  return <ul className="bar-list" aria-label={ariaLabel}>{items.map(item => <li key={item.label}>
    <span>{item.label}</span>
    <div className="bar"><span style={{ width: `${(Math.abs(item.value) / max) * 100}%`, background: item.color ?? (item.value >= 0 ? 'var(--gain)' : 'var(--loss)') }} /></div>
    <strong className={`num ${item.color ? '' : item.value >= 0 ? 'gain' : 'loss'}`}>{format(item.value)}</strong>
  </li>)}</ul>;
}

export function Radar({ axes, values, max = 100, color = 'var(--accent)', size = 240, ariaLabel }: { axes: string[]; values: number[]; max?: number; color?: string; size?: number; ariaLabel: string }) {
  const c = size / 2, r = size / 2 - 34, n = axes.length;
  const pt = (i: number, v: number) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; return [c + Math.cos(a) * r * (v / max), c + Math.sin(a) * r * (v / max)] as const; };
  return <svg className="chart radar" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel} style={{ maxWidth: size }}>
    {[.25, .5, .75, 1].map(k => <polygon key={k} points={axes.map((_, i) => pt(i, max * k).join(',')).join(' ')} fill="none" className="grid-line" />)}
    {axes.map((a, i) => { const [x, y] = pt(i, max * 1.2); return <text key={a} x={x} y={y + 4} textAnchor="middle">{a}</text>; })}
    <polygon points={values.map((v, i) => pt(i, Math.max(0, Math.min(max, v))).join(',')).join(' ')} style={{ fill: color, stroke: color }} fillOpacity={.22} strokeWidth={2} />
  </svg>;
}

// Parliament half-circle: seats coloured by party, largest first.
export function Hemicycle({ parties, ariaLabel }: { parties: { id: string; label: string; color: string; seats: number }[]; ariaLabel: string }) {
  const total = parties.reduce((s, p) => s + p.seats, 0);
  if (!total) return null;
  const rows = Math.max(6, Math.round(Math.sqrt(total / 2.6)));
  const seatsPerRow: number[] = []; let remaining = total;
  const radii = Array.from({ length: rows }, (_, i) => 0.42 + (0.58 * i) / (rows - 1));
  const sum = radii.reduce((a, b) => a + b, 0);
  radii.forEach((rr, i) => { const n = i === rows - 1 ? remaining : Math.round((total * rr) / sum); seatsPerRow.push(n); remaining -= n; });
  const points: { a: number; r: number }[] = [];
  seatsPerRow.forEach((n, i) => { for (let k = 0; k < n; k++) points.push({ a: Math.PI - (Math.PI * (k + .5)) / n, r: radii[i]! }); });
  points.sort((p, q) => q.a - p.a || p.r - q.r);
  const colors = parties.flatMap(p => Array<string>(p.seats).fill(p.color));
  const W2 = 400, H2 = 215, cx = 200, cy = 205, R = 190;
  return <figure className="chart-figure hemicycle">
    <svg className="chart" viewBox={`0 0 ${W2} ${H2}`} role="img" aria-label={ariaLabel}>
      {points.map((p, i) => <circle key={i} cx={cx + Math.cos(p.a) * R * p.r} cy={cy - Math.sin(p.a) * R * p.r} r={Math.max(2.4, 190 / (rows * 6.2))} style={{ fill: colors[i] }} />)}
      <text className="chart-total" x={cx} y={cy - 8} textAnchor="middle">{total}석</text>
    </svg>
    <figcaption className="chart-legend">{parties.filter(p => p.seats).map(p => <span key={p.id}><i className="dot" aria-hidden="true" style={{ background: p.color }} />{p.label} {p.seats}</span>)}</figcaption>
  </figure>;
}

// Semi-circular gauge (0–100).
export function Gauge({ value, label, color = 'var(--accent)' }: { value: number; label: string; color?: string }) {
  const v = Math.max(0, Math.min(100, value)), a = Math.PI * (1 - v / 100);
  const x = 50 + Math.cos(a) * 40, y = 50 - Math.sin(a) * 40;
  return <svg viewBox="0 0 100 58" role="img" aria-label={`${label} ${Math.round(v)}`} className="chart gauge">
    <path d="M10,50 A40,40 0 0 1 90,50" fill="none" stroke="var(--surface-3)" strokeWidth={9} />
    {v > 0 && <path d={`M10,50 A40,40 0 0 1 ${x},${y}`} fill="none" style={{ stroke: color }} strokeWidth={9} />}
    <text className="gauge-value" x={50} y={48} textAnchor="middle">{Math.round(v)}</text>
  </svg>;
}
