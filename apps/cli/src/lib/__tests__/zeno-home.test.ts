import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveZenoHome } from '../zeno-home.js';

describe('resolveZenoHome', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.ZENO_HOME;
    delete process.env.ZENO_HOME;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ZENO_HOME;
    } else {
      process.env.ZENO_HOME = originalEnv;
    }
  });

  it('returns process.env.ZENO_HOME when set', () => {
    process.env.ZENO_HOME = '/tmp/custom-zeno';
    expect(resolveZenoHome()).toBe('/tmp/custom-zeno');
  });

  it('falls back to ~/zeno-agent when env unset', () => {
    const home = resolveZenoHome();
    expect(home).toMatch(/zeno-agent$/);
    expect(home.startsWith(process.env.HOME ?? '')).toBe(true);
  });
});
