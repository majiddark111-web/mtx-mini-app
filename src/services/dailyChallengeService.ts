export function toggleComboSelection(current: string[], itemId: string, slotCount: number): string[] {
  if (current.includes(itemId)) return current.filter((id) => id !== itemId);
  if (current.length >= slotCount) return current;
  return [...current, itemId];
}
