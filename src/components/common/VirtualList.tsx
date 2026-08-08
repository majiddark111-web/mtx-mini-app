import { useMemo, useState, type ReactNode, type UIEvent } from 'react';

interface VirtualListProps<T> { items: readonly T[]; itemHeight: number; height: number; keyFor: (item: T) => string; renderItem: (item: T) => ReactNode; className?: string; }

export function VirtualList<T>({ items, itemHeight, height, keyFor, renderItem, className = '' }: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0); const overscan = 4;
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan); const end = Math.min(items.length, Math.ceil((scrollTop + height) / itemHeight) + overscan);
  const visible = useMemo(() => items.slice(start, end), [end, items, start]);
  const scroll = (event: UIEvent<HTMLDivElement>) => setScrollTop(event.currentTarget.scrollTop);
  return <div className={`virtual-list ${className}`} style={{ height }} onScroll={scroll}><div className="virtual-list-space" style={{ height: items.length * itemHeight }}>{visible.map((item, index) => <div className="virtual-list-row" key={keyFor(item)} style={{ height: itemHeight, transform: `translateY(${(start + index) * itemHeight}px)` }}>{renderItem(item)}</div>)}</div></div>;
}
