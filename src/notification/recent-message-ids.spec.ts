import { RecentMessageIds } from './recent-message-ids';

describe('RecentMessageIds', () => {
  it('remembers added ids', () => {
    const ids = new RecentMessageIds(3);

    ids.add('a');

    expect(ids.has('a')).toBe(true);
    expect(ids.has('b')).toBe(false);
  });

  it('forgets the oldest id when over capacity', () => {
    const ids = new RecentMessageIds(2);

    ['a', 'b', 'c'].forEach((id) => ids.add(id));

    expect(ids.has('a')).toBe(false);
    expect(ids.has('b')).toBe(true);
    expect(ids.has('c')).toBe(true);
  });
});
