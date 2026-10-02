// Семейные связи: разрешение цепочки «кого покрывает» до конечного покрывающего.

export interface CoverageMember {
  id: string;
  coveredByMemberId: string | null;
}

/**
 * Возвращает функцию `resolve(id)` → id конечного покрывающего участника.
 * Цепочки (A→B→C) разрешаются до конца; циклы и ссылки на отсутствующих
 * участников обрываются безопасно (возвращается последний валидный id).
 */
export function buildCoverageResolver(members: CoverageMember[]): (id: string) => string {
  const parent = new Map(members.map((m) => [m.id, m.coveredByMemberId]));
  return (id: string): string => {
    let cursor = id;
    const seen = new Set<string>();
    while (true) {
      const next = parent.get(cursor);
      if (!next || seen.has(next) || !parent.has(next)) return cursor;
      seen.add(cursor);
      cursor = next;
    }
  };
}
