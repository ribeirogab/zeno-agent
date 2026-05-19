/**
 * A message source Zeno can listen to and reply on.
 * Implementations: SlackChannel (MVP), DiscordChannel (future), etc.
 */
export interface Channel {
  readonly name: string;
  start(onMessage: MessageHandler): Promise<void>;
  send(target: MessageTarget, message: OutgoingMessage): Promise<{ messageRef: string }>;
  react(target: MessageTarget, emoji: string): Promise<void>;
  unreact(target: MessageTarget, emoji: string): Promise<void>;
  waitForReaction(
    target: MessageTarget,
    emojis: string[],
    timeoutMs: number,
    expectedUserId?: string,
  ): Promise<ReactionEvent | null>;
  /** Open (or fetch) the IM conversation with `userId`; returns the conversation id. */
  openDm(userId: string): Promise<string>;
  stop(): Promise<void>;
}

export interface ReactionEvent {
  emoji: string;
  userId: string;
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
  /** Text of the parent message when this is a thread reply */
  parentText?: string;
  /** Platform-specific raw event payload, for debugging only */
  raw: unknown;
  /** Files attached to the message, downloaded to local disk */
  attachments?: Attachment[];
}

export interface Attachment {
  /** Original file name */
  name: string;
  /** MIME type (e.g. image/png, application/pdf) */
  mimetype: string;
  /** Absolute path to the downloaded file on local disk */
  localPath: string;
  /** File size in bytes */
  sizeBytes: number;
}

export interface MessageTarget {
  platform: string;
  conversationId: string;
  threadId: string | null;
  messageRef?: string;
}

export interface OutgoingAttachment {
  /** Display name shown in the channel (typically the filename). */
  name: string;
  /** MIME type (inferred from extension when written by the agent's Write tool). */
  mimetype: string;
  /** Absolute path to the file on local disk (under `<workspaceDir>/outbox/<correlationId>/`). */
  localPath: string;
  /** File size in bytes. */
  sizeBytes: number;
}

export interface OutgoingMessage {
  /** Reply text, posted as the message body or as `initial_comment` alongside files. */
  text: string;
  /**
   * Optional file attachments. Omit the key entirely when there are no
   * attachments — adapters branch on `message.attachments?.length` to route
   * between text-only and file-bearing API calls.
   */
  attachments?: OutgoingAttachment[];
}
