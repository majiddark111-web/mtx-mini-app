const itemIcons: Record<string, string> = {
  'upgrade:tap': '👆',
  'upgrade:energy': '🔋',
  'upgrade:profit': '📈',
  'skin:aurora': '🌌',
  'boost:recharge': '⚡',
  'consumable:energy': '🔋',
};

export function commerceItemIcon(itemId: string): string { return itemIcons[itemId] ?? '📦'; }
