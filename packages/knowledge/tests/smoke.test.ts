import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/index.js';

describe('@zeno/knowledge package', () => {
  it('is importable', () => {
    expect(PACKAGE_NAME).toBe('@zeno/knowledge');
  });
});
