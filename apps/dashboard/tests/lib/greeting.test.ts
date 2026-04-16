import { describe, expect, it } from 'vitest';
import { greetingForHour } from '@/lib/greeting';

describe('greetingForHour', () => {
  it('madrugada before 5', () => {
    expect(greetingForHour(2, 'X')).toEqual({ verb: 'Boa madrugada', name: 'X' });
  });
  it('manhã 5–12', () => {
    expect(greetingForHour(9, 'X')).toEqual({ verb: 'Bom dia', name: 'X' });
  });
  it('tarde 12–18', () => {
    expect(greetingForHour(14, 'X')).toEqual({ verb: 'Boa tarde', name: 'X' });
  });
  it('noite 18–22', () => {
    expect(greetingForHour(20, 'X')).toEqual({ verb: 'Boa noite', name: 'X' });
  });
  it('madrugada 22+', () => {
    expect(greetingForHour(23, 'X')).toEqual({ verb: 'Boa madrugada', name: 'X' });
  });
});
