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

export const EXPENSE_CATEGORIES: { label: string; icon: LucideIcon }[] = [
  { label: 'Марина', icon: Anchor },
  { label: 'Ресторан', icon: UtensilsCrossed },
  { label: 'Топливо', icon: Fuel },
  { label: 'Продукты', icon: ShoppingCart },
  { label: 'Такси', icon: CarTaxiFront },
];

/** Иконка категории; для неизвестных (например, импорт из Splitwise) — Tag. */
export function categoryIcon(category: string): LucideIcon {
  return (
    EXPENSE_CATEGORIES.find((c) => c.label === category)?.icon ?? Tag
  );
}
