import { categoryIcon } from '@/lib/categories';

export function CategoryBadge({ category }: { category: string }) {
  const Icon = categoryIcon(category);
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-bg px-1.5 py-0.5 text-xs text-hint">
      <Icon size={12} />
      {category}
    </span>
  );
}
