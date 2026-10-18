const paths: Record<string, string> = {
  home: 'M3 10 12 3l9 7M5 9v11h5v-6h4v6h5V9',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z',
  policy: 'M6 3h9l4 4v14H6ZM14 3v5h5M9 12h7M9 16h7',
  flag: 'M5 21V4m0 1c4-5 10 5 14 0v10c-4 5-10-5-14 0',
  people: 'M15 20v-2a5 5 0 0 0-10 0v2M14 5a4 4 0 1 1 0 8m5 3a4 4 0 0 1 3 4M13 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16m6-14v16',
  ballot: 'm9 3 8 3-3 8-8-3ZM4 13l-2 5v3h20v-3l-3-5M2 18h20',
  chart: 'M4 3v18h17M8 16v-5m5 5V7m5 9V4',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  save: 'M4 3h13l4 4v14H4ZM8 3v6h9V3M8 21v-7h9v7',
  check: 'm5 12 4 4L20 5',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 6v6l4 2',
  inbox: 'M4 5h16l2 10v5H2v-5ZM2 15h6l2 3h4l2-3h6',
  lock: 'M6 10h12v11H6ZM8 10V6a4 4 0 0 1 8 0v4',
  close: 'm6 6 12 12M6 18 18 6',
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.policy} /></svg>;
}
