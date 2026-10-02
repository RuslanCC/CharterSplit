import { createElement } from 'react';
import { categoryIcon } from '@/lib/categories';

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-bg px-1.5 py-0.5 text-xs text-hint">
      {createElement(categoryIcon(category), { size: 12 })}
      {category}
    </span>
  );
}
