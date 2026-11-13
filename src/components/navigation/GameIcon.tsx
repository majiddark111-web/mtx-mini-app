const paths = {
  friends: 'M3 21v-2a6 6 0 0 1 12 0v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-7a4 4 0 0 1 0 8m1 3a5 5 0 0 1 4 5v1',
  store: 'M5 7h14l2 15H3ZM8 7V5a4 4 0 0 1 8 0v2',
  trophy: 'M7 3h10v7a5 5 0 0 1-10 0Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 3v6m-5 0h10',
  history: 'M3 11a9 9 0 1 1 2 7M3 5v6h6m3-5v6l4 2',
  home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  game: 'M7 7h10c3 0 5 11 3 12-2 1-4-3-5-3H9c-1 0-3 4-5 3-2-1 0-12 3-12ZM7 10v5M4.5 12.5h5M16 11h.01M19 14h.01',
  inventory: 'm12 2 9 5v10l-9 5-9-5V7Zm0 10 9-5M12 12 3 7m9 5v10',
  missions: 'M9 5H5v17h14V5h-4M9 3h6v4H9Zm-1 12 3 3 5-6',
  wallet: 'M20 8V4H4v16h17V8H4m17 4h-6v5h6',
  profile: 'M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0ZM3 22v-3a9 7 0 0 1 18 0v3Z',
  boost: 'm13 2-9 12h7l-1 8 10-13h-7Z',
  earn: 'M3 8h18v5H3Zm2 5v9h14v-9M12 8v14M12 8C2 8 6-2 12 8Zm0 0c10 0 6-10 0 0Z',
  settings: 'M9 3h6l1 4 4 1 2 5-3 3v4l-5 2-3-3H7l-4-4 2-4V7Zm3 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
};
export type GameIconName = keyof typeof paths;
export function GameIcon({ name }: { name: GameIconName }) {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
