export function formatNumber(value: number): string { return new Intl.NumberFormat('en-US').format(value); }
export function formatDate(timestamp: number): string { return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(timestamp); }
