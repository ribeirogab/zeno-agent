import { describe, expect, it } from 'vitest';
import { wrapWithSlackContext } from '@/agent/core';
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

describe('wrapWithSlackContext', () => {
  it('returns plain text for non-slack platforms', () => {
    const message = makeMessage({ platform: 'discord', text: 'hi' });
    expect(wrapWithSlackContext(message)).toBe('hi');
  });

  it('wraps slack messages with context preamble', () => {
    const result = wrapWithSlackContext(makeMessage({ text: 'test' }));
    expect(result).toContain('[slack_context]');
    expect(result).toContain('conversation_id: C1');
    expect(result).toContain('thread_id: T1');
    expect(result).toContain('user_id: U1');
    expect(result).toContain('[/slack_context]');
    expect(result).toContain('test');
  });

  it('does not include attached_files block when no attachments', () => {
    const result = wrapWithSlackContext(makeMessage());
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

    const result = wrapWithSlackContext(message);

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

    const result = wrapWithSlackContext(message);

    // Attachments block appears between context and user text
    const attachedIdx = result.indexOf('[attached_files]');
    const contextEndIdx = result.indexOf('[/slack_context]');
    const textIdx = result.indexOf('what is this image?');

    expect(contextEndIdx).toBeLessThan(attachedIdx);
    expect(attachedIdx).toBeLessThan(textIdx);
  });

  it('does not include attached_files block when attachments array is empty', () => {
    const message = makeMessage({ attachments: [] });
    const result = wrapWithSlackContext(message);
    expect(result).not.toContain('[attached_files]');
  });
});
