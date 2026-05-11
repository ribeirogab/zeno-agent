import { describe, expect, it } from 'vitest';
import { assertContainerRunning } from '../../src/commands/backend-configure.js';

describe('assertContainerRunning', () => {
  it('throws with the canonical message when state != running', () => {
    expect(() => assertContainerRunning('default', 'exited')).toThrowError(
      /profile 'default' container not running\. start it first: zeno start default/,
    );
    expect(() => assertContainerRunning('default', 'created')).toThrow();
    expect(() => assertContainerRunning('default', 'paused')).toThrow();
  });

  it('does not throw when running', () => {
    expect(() => assertContainerRunning('default', 'running')).not.toThrow();
  });
});
