import { describe, expect, it } from 'vitest';
import { greetingForHour } from '@/lib/greeting';

describe('greetingForHour', () => {
  it('madrugada before 5', () => {
    expect(greetingForHour(2, 'X')).toBe('Boa madrugada, X.');
  });
  it('manhã 5–12', () => {
    expect(greetingForHour(9, 'X')).toBe('Bom dia, X.');
  });
  it('tarde 12–18', () => {
    expect(greetingForHour(14, 'X')).toBe('Boa tarde, X.');
  });
  it('noite 18–22', () => {
    expect(greetingForHour(20, 'X')).toBe('Boa noite, X.');
  });
  it('madrugada 22+', () => {
    expect(greetingForHour(23, 'X')).toBe('Boa madrugada, X.');
  });
});
