/**
 * A message source Zeno can listen to and reply on.
 * Implementations: SlackChannel (MVP), DiscordChannel (future), etc.
 */
export interface Channel {
  readonly name: string;
  start(onMessage: MessageHandler): Promise<void>;
  send(target: MessageTarget, text: string): Promise<void>;
  react(target: MessageTarget, emoji: string): Promise<void>;
  unreact(target: MessageTarget, emoji: string): Promise<void>;
  stop(): Promise<void>;
}

export type MessageHandler = (msg: IncomingMessage) => Promise<void>;

export interface IncomingMessage {
  /** Platform identifier: 'slack', 'discord', etc. */
  platform: string;
  /** Platform-native user id */
  userId: string;
  /** Platform-native channel/DM id */
  conversationId: string;
  /** Thread id if inside a thread; null for top-level or DM */
  threadId: string | null;
  /** Message text, with any bot-mention prefix already stripped */
  text: string;
  /** Generated at ingress; used to correlate logs across layers */
  correlationId: string;
  /** Opaque reference to the original event, so adapters can reply to it */
  messageRef: string;
  /** Platform-specific raw event payload, for debugging only */
  raw: unknown;
}

export interface MessageTarget {
  platform: string;
  conversationId: string;
  threadId: string | null;
  messageRef?: string;
}
