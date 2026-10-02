// Категории расходов: задаются кнопками быстрого добавления, вручную не выбираются.

import {
  Anchor,
  UtensilsCrossed,
  Fuel,
  ShoppingCart,
  CarTaxiFront,
  Tag,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const EXPENSE_CATEGORIES: {
  label: string;
  icon: LucideIcon;
  color: string;
}[] = [
  { label: 'Марина', icon: Anchor, color: '#3b82f6' },
  { label: 'Ресторан', icon: UtensilsCrossed, color: '#f97316' },
  { label: 'Топливо', icon: Fuel, color: '#ef4444' },
  { label: 'Продукты', icon: ShoppingCart, color: '#22c55e' },
  { label: 'Такси', icon: CarTaxiFront, color: '#eab308' },
];

/** Цвет для расходов без категории / из кассы / импортированных. */
export const OTHER_CATEGORY_COLOR = '#94a3b8';

/** Иконка категории; для неизвестных (например, импорт из Splitwise) — Tag. */
export function categoryIcon(category: string): LucideIcon {
  return EXPENSE_CATEGORIES.find((c) => c.label === category)?.icon ?? Tag;
}

/** Цвет категории; для неизвестных/пустых — нейтральный серый. */
export function categoryColor(category: string | null | undefined): string {
  if (!category) return OTHER_CATEGORY_COLOR;
  return (
    EXPENSE_CATEGORIES.find((c) => c.label === category)?.color ?? OTHER_CATEGORY_COLOR
  );
}
