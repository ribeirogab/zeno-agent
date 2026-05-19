import { describe, expect, it, vi } from 'vitest';
import { wrapWithChannelContext } from '@/agent/core';
import type { IncomingMessage } from '@/channels/types';

function makeMessage(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    platform: 'slack',
    userId: 'U1',
    conversationId: 'C1',
    threadId: 'T1',
    text: 'hello',
    correlationId: 'corr-1',
    messageRef: '1710000000.000100',
    raw: {},
    ...overrides,
  };
}

describe('wrapWithChannelContext', () => {
  it('returns plain text for non-slack platforms', () => {
    const message = makeMessage({ platform: 'discord', text: 'hi' });
    expect(wrapWithChannelContext(message)).toBe('hi');
  });

  it('wraps slack messages with context preamble', () => {
    const result = wrapWithChannelContext(makeMessage({ text: 'test' }));
    expect(result).toContain('[slack_context]');
    expect(result).toContain('conversation_id: C1');
    expect(result).toContain('thread_id: T1');
    expect(result).toContain('user_id: U1');
    expect(result).toContain('[/slack_context]');
    expect(result).toContain('test');
  });

  it('does not include attached_files block when no attachments', () => {
    const result = wrapWithChannelContext(makeMessage());
    expect(result).not.toContain('[attached_files]');
  });

  it('includes attached_files block with file paths when attachments are present', () => {
    const message = makeMessage({
      attachments: [
        {
          name: 'screenshot.png',
          mimetype: 'image/png',
          localPath: '/workspace/uploads/corr-1/screenshot.png',
          sizeBytes: 1024,
        },
        {
          name: 'report.pdf',
          mimetype: 'application/pdf',
          localPath: '/workspace/uploads/corr-1/report.pdf',
          sizeBytes: 2048,
        },
      ],
    });

    const result = wrapWithChannelContext(message);

    expect(result).toContain('[attached_files]');
    expect(result).toContain(
      '- /workspace/uploads/corr-1/screenshot.png (image/png, screenshot.png)',
    );
    expect(result).toContain(
      '- /workspace/uploads/corr-1/report.pdf (application/pdf, report.pdf)',
    );
    expect(result).toContain('[/attached_files]');
    expect(result).toContain('Read the attached files before responding.');
  });

  it('includes both attachments block and user text', () => {
    const message = makeMessage({
      text: 'what is this image?',
      attachments: [
        {
          name: 'photo.jpg',
          mimetype: 'image/jpeg',
          localPath: '/workspace/uploads/corr-1/photo.jpg',
          sizeBytes: 5000,
        },
      ],
    });

    const result = wrapWithChannelContext(message);

    // Attachments block appears between context and user text
    const attachedIdx = result.indexOf('[attached_files]');
    const contextEndIdx = result.indexOf('[/slack_context]');
    const textIdx = result.indexOf('what is this image?');

    expect(contextEndIdx).toBeLessThan(attachedIdx);
    expect(attachedIdx).toBeLessThan(textIdx);
  });

  it('does not include attached_files block when attachments array is empty', () => {
    const message = makeMessage({ attachments: [] });
    const result = wrapWithChannelContext(message);
    expect(result).not.toContain('[attached_files]');
  });

  it('emits [attached_files] block for non-slack platform with attachments', () => {
    const message = makeMessage({
      platform: 'discord',
      text: 'review this',
      attachments: [
        {
          name: 'x.pdf',
          mimetype: 'application/pdf',
          localPath: '/workspace/uploads/abc/x.pdf',
          sizeBytes: 1024,
        },
      ],
    });

    const result = wrapWithChannelContext(message);

    expect(result).toContain('[attached_files]');
    expect(result).toContain('- /workspace/uploads/abc/x.pdf (application/pdf, x.pdf)');
    expect(result).toContain('[/attached_files]');
    expect(result).toContain('Read the attached files before responding.');
    expect(result).toContain('review this');
    expect(result).not.toContain('[slack_context]');
    expect(result).not.toContain('[parent_message]');
  });

  it('returns text verbatim for non-slack platform with empty attachments array', () => {
    const message = makeMessage({ platform: 'discord', text: 'hi', attachments: [] });
    expect(wrapWithChannelContext(message)).toBe('hi');
  });

  it('parity: slack output is byte-identical across representative shapes', () => {
    // Freeze time so the `current_time` field is deterministic across shape variants.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T12:00:00.000Z'));
    try {
      const ts = '2026-05-18T12:00:00.000Z';

      // (a) slack + no parent + no attachments
      const a = wrapWithChannelContext(makeMessage({ text: 'hello' }));
      expect(a).toBe(
        `[slack_context]\nconversation_id: C1\nthread_id: T1\nuser_id: U1\ncurrent_time: ${ts}\n[/slack_context]\n\nhello`,
      );

      // (b) slack + parent text + no attachments
      const b = wrapWithChannelContext(
        makeMessage({ text: 'reply', parentText: 'original question' }),
      );
      expect(b).toBe(
        `[slack_context]\nconversation_id: C1\nthread_id: T1\nuser_id: U1\ncurrent_time: ${ts}\n[/slack_context]\n\n[parent_message]\noriginal question\n[/parent_message]\n\nreply`,
      );

      // (c) slack + no parent + one attachment
      const c = wrapWithChannelContext(
        makeMessage({
          text: 'see file',
          attachments: [
            {
              name: 'one.pdf',
              mimetype: 'application/pdf',
              localPath: '/w/u/c1/one.pdf',
              sizeBytes: 10,
            },
          ],
        }),
      );
      expect(c).toBe(
        `[slack_context]\nconversation_id: C1\nthread_id: T1\nuser_id: U1\ncurrent_time: ${ts}\n[/slack_context]\n\n[attached_files]\n- /w/u/c1/one.pdf (application/pdf, one.pdf)\n[/attached_files]\nRead the attached files before responding.\n\nsee file`,
      );

      // (d) slack + parent text + two attachments
      const d = wrapWithChannelContext(
        makeMessage({
          text: 'check these',
          parentText: 'context',
          attachments: [
            {
              name: 'a.png',
              mimetype: 'image/png',
              localPath: '/w/u/c1/a.png',
              sizeBytes: 1,
            },
            {
              name: 'b.pdf',
              mimetype: 'application/pdf',
              localPath: '/w/u/c1/b.pdf',
              sizeBytes: 2,
            },
          ],
        }),
      );
      expect(d).toBe(
        `[slack_context]\nconversation_id: C1\nthread_id: T1\nuser_id: U1\ncurrent_time: ${ts}\n[/slack_context]\n\n[parent_message]\ncontext\n[/parent_message]\n\n[attached_files]\n- /w/u/c1/a.png (image/png, a.png)\n- /w/u/c1/b.pdf (application/pdf, b.pdf)\n[/attached_files]\nRead the attached files before responding.\n\ncheck these`,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('emits [outbox] block without leading blank line when no other blocks present', () => {
    const message = makeMessage({ platform: 'discord', text: 'hi' });
    const result = wrapWithChannelContext(message, { outboxDir: '/workspace/outbox/abc' });
    expect(result).toBe(
      '[outbox]\n/workspace/outbox/abc\nWrite any file you want to send to the user into this directory. The channel adapter will upload them alongside your reply.\n[/outbox]\n\nhi',
    );
  });

  it('emits [outbox] block with leading blank-line separator after other blocks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T12:00:00.000Z'));
    try {
      const result = wrapWithChannelContext(
        makeMessage({
          text: 'check these',
          parentText: 'context',
          attachments: [
            {
              name: 'a.png',
              mimetype: 'image/png',
              localPath: '/w/u/c1/a.png',
              sizeBytes: 1,
            },
          ],
        }),
        { outboxDir: '/workspace/outbox/c1' },
      );
      expect(result).toBe(
        '[slack_context]\nconversation_id: C1\nthread_id: T1\nuser_id: U1\ncurrent_time: 2026-05-19T12:00:00.000Z\n[/slack_context]\n\n[parent_message]\ncontext\n[/parent_message]\n\n[attached_files]\n- /w/u/c1/a.png (image/png, a.png)\n[/attached_files]\nRead the attached files before responding.\n\n[outbox]\n/workspace/outbox/c1\nWrite any file you want to send to the user into this directory. The channel adapter will upload them alongside your reply.\n[/outbox]\n\ncheck these',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('omits [outbox] block when opts.outboxDir is undefined', () => {
    const message = makeMessage({ platform: 'discord', text: 'hi' });
    const result = wrapWithChannelContext(message, {});
    expect(result).toBe('hi');
    expect(result).not.toContain('[outbox]');
  });

  it('omits [outbox] block when opts.outboxDir is empty string', () => {
    const message = makeMessage({ platform: 'discord', text: 'hi' });
    const result = wrapWithChannelContext(message, { outboxDir: '' });
    expect(result).toBe('hi');
    expect(result).not.toContain('[outbox]');
  });

  it('omits [outbox] block when opts argument is missing entirely (slack parity)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T12:00:00.000Z'));
    try {
      const result = wrapWithChannelContext(makeMessage({ text: 'hello' }));
      expect(result).toBe(
        '[slack_context]\nconversation_id: C1\nthread_id: T1\nuser_id: U1\ncurrent_time: 2026-05-19T12:00:00.000Z\n[/slack_context]\n\nhello',
      );
      expect(result).not.toContain('[outbox]');
    } finally {
      vi.useRealTimers();
    }
  });
});
