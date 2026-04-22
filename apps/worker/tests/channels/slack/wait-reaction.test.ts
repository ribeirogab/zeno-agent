import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type EventListener = (args: { event: unknown }) => Promise<void> | void;

interface MockClient {
  conversations: {
    open: ReturnType<typeof vi.fn>;
  };
  chat: {
    postMessage: ReturnType<typeof vi.fn>;
  };
  reactions: {
    add: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  auth: {
    test: ReturnType<typeof vi.fn>;
  };
}

interface MockApp {
  client: MockClient;
  event: ReturnType<typeof vi.fn>;
  message: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  __listeners: Map<string, EventListener[]>;
}

const mockAppRef: { current: MockApp | null } = { current: null };

vi.mock('@slack/bolt', () => {
  class App {
    public readonly client: MockClient;
    public readonly event: ReturnType<typeof vi.fn>;
    public readonly message: ReturnType<typeof vi.fn>;
    public readonly start: ReturnType<typeof vi.fn>;
    public readonly stop: ReturnType<typeof vi.fn>;
    public readonly __listeners = new Map<string, EventListener[]>();

    constructor() {
      this.client = {
        conversations: { open: vi.fn() },
        chat: { postMessage: vi.fn() },
        reactions: { add: vi.fn(), remove: vi.fn() },
        auth: { test: vi.fn() },
      };
      this.event = vi.fn((name: string, listener: EventListener) => {
        const list = this.__listeners.get(name) ?? [];
        list.push(listener);
        this.__listeners.set(name, list);
      });
      this.message = vi.fn();
      this.start = vi.fn();
      this.stop = vi.fn();
      mockAppRef.current = this as unknown as MockApp;
    }
  }
  return { App, LogLevel: { WARN: 'warn' } };
});

import { SlackChannel } from '@/channels/slack/adapter';
import type { MessageTarget } from '@/channels/types';

function emit(eventName: string, payload: unknown): void {
  const listeners = mockAppRef.current?.__listeners.get(eventName) ?? [];
  for (const listener of listeners) {
    void listener({ event: payload });
  }
}

const target: MessageTarget = {
  platform: 'slack',
  conversationId: 'C123',
  threadId: null,
  messageRef: '1700000000.000100',
};

let channel: SlackChannel;

beforeEach(() => {
  mockAppRef.current = null;
  channel = new SlackChannel({ appToken: 'xapp-test', botToken: 'xoxb-test' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SlackChannel.waitForReaction', () => {
  it('resolves with the matching emoji + userId when a matching reaction arrives', async () => {
    const promise = channel.waitForReaction(target, ['+1', '-1'], 60_000, 'U_OWNER');

    emit('reaction_added', {
      item: { ts: '1700000000.000100', channel: 'C123' },
      reaction: '+1',
      user: 'U_OWNER',
    });

    await expect(promise).resolves.toEqual({ emoji: '+1', userId: 'U_OWNER' });
  });

  it('returns null after timeoutMs when no reaction arrives', async () => {
    vi.useFakeTimers();
    const promise = channel.waitForReaction(target, ['+1'], 5_000);

    vi.advanceTimersByTime(5_000);

    await expect(promise).resolves.toBeNull();
  });

  it('ignores reactions on a different message (item.ts mismatch)', async () => {
    vi.useFakeTimers();
    const promise = channel.waitForReaction(target, ['+1'], 5_000);

    emit('reaction_added', {
      item: { ts: '9999999999.999999', channel: 'C123' },
      reaction: '+1',
      user: 'U_OWNER',
    });

    vi.advanceTimersByTime(5_000);

    await expect(promise).resolves.toBeNull();
  });

  it('ignores reactions from non-expected user when expectedUserId is set', async () => {
    vi.useFakeTimers();
    const promise = channel.waitForReaction(target, ['+1'], 5_000, 'U_OWNER');

    emit('reaction_added', {
      item: { ts: '1700000000.000100', channel: 'C123' },
      reaction: '+1',
      user: 'U_INTRUDER',
    });

    vi.advanceTimersByTime(5_000);

    await expect(promise).resolves.toBeNull();
  });
});

describe('SlackChannel.openDm', () => {
  it('calls conversations.open and returns the channel id', async () => {
    const app = mockAppRef.current;
    if (!app) throw new Error('mock app not initialized');
    app.client.conversations.open.mockResolvedValueOnce({ channel: { id: 'D999' } });

    const id = await channel.openDm('U_OWNER');

    expect(id).toBe('D999');
    expect(app.client.conversations.open).toHaveBeenCalledWith({
      token: 'xoxb-test',
      users: 'U_OWNER',
    });
  });

  it('throws when no channel id is returned', async () => {
    const app = mockAppRef.current;
    if (!app) throw new Error('mock app not initialized');
    app.client.conversations.open.mockResolvedValueOnce({ channel: {} });

    await expect(channel.openDm('U_OWNER')).rejects.toThrow(
      'conversations.open returned no channel id',
    );
  });
});
