import type { CatalogCategory } from '../services/commerceService';

export type CommerceCategory = 'all' | CatalogCategory;

const categoryTabs: Array<{ id: CommerceCategory; icon: string; label: string }> = [
  { id: 'all', icon: '✨', label: 'All' },
  { id: 'upgrade', icon: '⬆️', label: 'Upgrades' },
  { id: 'boost', icon: '⚡', label: 'Boosts' },
  { id: 'skin', icon: '🌌', label: 'Skins' },
  { id: 'consumable', icon: '🔋', label: 'Energy' },
];

interface Props {
  value: CommerceCategory;
  onChange: (category: CommerceCategory) => void;
  categories?: CommerceCategory[];
}

export function CommerceCategoryTabs({ value, onChange, categories }: Props) {
  const visibleTabs = categories ? categoryTabs.filter((tab) => categories.includes(tab.id)) : categoryTabs;
  return <div className="category-tabs" role="tablist" aria-label="Item categories">
    {visibleTabs.map((tab) => <button aria-selected={value === tab.id} className={`category-tab${value === tab.id ? ' active' : ''}`} key={tab.id} onClick={() => onChange(tab.id)} role="tab" type="button">
      <span className="category-tab-icon" aria-hidden="true">{tab.icon}</span><span>{tab.label}</span>
    </button>)}
  </div>;
}
