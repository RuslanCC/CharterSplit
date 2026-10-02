import { describe, expect, it } from 'vitest';
import { buildCoverageResolver } from './coverage';

describe('buildCoverageResolver', () => {
  it('разрешает цепочку до конечного покрывающего', () => {
    const resolve = buildCoverageResolver([
      { id: 'kid', coveredByMemberId: 'mom' },
      { id: 'mom', coveredByMemberId: 'dad' },
      { id: 'dad', coveredByMemberId: null },
    ]);
    expect(resolve('kid')).toBe('dad');
    expect(resolve('dad')).toBe('dad');
  });

  it('безопасно обрывает циклы и ссылки на отсутствующих', () => {
    const resolve = buildCoverageResolver([
      { id: 'a', coveredByMemberId: 'b' },
      { id: 'b', coveredByMemberId: 'a' },
      { id: 'c', coveredByMemberId: 'ghost' },
    ]);
    expect(['a', 'b']).toContain(resolve('a'));
    expect(resolve('c')).toBe('c');
    expect(resolve('unknown')).toBe('unknown');
  });
});
