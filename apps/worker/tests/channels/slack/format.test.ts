import { describe, expect, it } from 'vitest';
import { toSlackMrkdwn } from '@/channels/slack/format';

describe('toSlackMrkdwn', () => {
  it('converts **bold** to *bold*', () => {
    expect(toSlackMrkdwn('This is **bold** text.')).toBe('This is *bold* text.');
  });

  it('converts __bold__ to *bold*', () => {
    expect(toSlackMrkdwn('This is __bold__ text.')).toBe('This is *bold* text.');
  });

  it('handles multiple bold spans on the same line', () => {
    expect(toSlackMrkdwn('**a** and **b** and **c**')).toBe('*a* and *b* and *c*');
  });

  it('converts [text](url) links to <url|text>', () => {
    expect(toSlackMrkdwn('See [docs](https://example.com/x).')).toBe(
      'See <https://example.com/x|docs>.',
    );
  });

  it('converts headings to bold lines', () => {
    const input = '# Title\n\n## Sub\n\nBody text.';
    const expected = '*Title*\n\n*Sub*\n\nBody text.';
    expect(toSlackMrkdwn(input)).toBe(expected);
  });

  it('leaves fenced code blocks untouched', () => {
    const input = 'Prefix **bold**\n```\n**not bold inside fence**\n[link](http://x)\n```\nSuffix.';
    const expected =
      'Prefix *bold*\n```\n**not bold inside fence**\n[link](http://x)\n```\nSuffix.';
    expect(toSlackMrkdwn(input)).toBe(expected);
  });

  it('leaves inline code spans untouched', () => {
    expect(toSlackMrkdwn('Run `**inside code**` not bold.')).toBe(
      'Run `**inside code**` not bold.',
    );
  });

  it('preserves bullet lists and blockquotes', () => {
    const input = '- first\n- **second**\n\n> a quote';
    const expected = '- first\n- *second*\n\n> a quote';
    expect(toSlackMrkdwn(input)).toBe(expected);
  });

  it('leaves single-asterisk italic alone (collides with Slack bold)', () => {
    expect(toSlackMrkdwn('This is *italic* text.')).toBe('This is *italic* text.');
  });

  it('preserves _italic_ underscores', () => {
    expect(toSlackMrkdwn('This is _italic_ text.')).toBe('This is _italic_ text.');
  });

  it('is a no-op when the input has no markdown', () => {
    expect(toSlackMrkdwn('Plain text, nothing to convert.')).toBe(
      'Plain text, nothing to convert.',
    );
  });
});
