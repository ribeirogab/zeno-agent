import { describe, expect, it } from 'vitest';
import { greetingForHour } from '@/lib/greeting';

describe('greetingForHour', () => {
  it('late-night before 5', () => {
    expect(greetingForHour(2, 'X')).toEqual({ verb: 'Hey', name: 'X' });
  });
  it('morning 5–12', () => {
    expect(greetingForHour(9, 'X')).toEqual({ verb: 'Good morning', name: 'X' });
  });
  it('afternoon 12–18', () => {
    expect(greetingForHour(14, 'X')).toEqual({ verb: 'Good afternoon', name: 'X' });
  });
  it('evening 18–22', () => {
    expect(greetingForHour(20, 'X')).toEqual({ verb: 'Good evening', name: 'X' });
  });
  it('late-night 22+', () => {
    expect(greetingForHour(23, 'X')).toEqual({ verb: 'Hey', name: 'X' });
  });
});
