export interface PlatformAdapter {
  readonly platform: 'discord' | 'slack' | 'teams';

  connect(config: PlatformConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  onMessage: (msg: IncomingMessage) => Promise<void>;
  onReaction: (reaction: Reaction) => Promise<void>;

  sendMessage(
    channel: ChannelRef,
    content: MessageContent,
  ): Promise<MessageRef>;
  editMessage(message: MessageRef, content: MessageContent): Promise<void>;
  deleteMessage(message: MessageRef): Promise<void>;

  createThread(channel: ChannelRef, name: string): Promise<ChannelRef>;

  uploadImage(
    channel: ChannelRef,
    image: Buffer,
    filename: string,
  ): Promise<string>;
}

export interface ChannelRef {
  platform: string;
  channelId: string;
  threadId?: string;
}

export interface MessageRef extends ChannelRef {
  messageId: string;
}

export interface IncomingMessage {
  id: string;
  platform: string;
  channel: ChannelRef;
  userId: string;
  username: string;
  content: string;
  attachments?: Attachment[];
  replyToMessageId?: string;
  timestamp: Date;
}

export interface MessageContent {
  text?: string;
  image?: Buffer;
  embed?: EmbedContent;
  buttons?: Button[];
}

export interface EmbedContent {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  imageUrl?: string;
  footer?: string;
}

export interface Button {
  id: string;
  label: string;
  style: 'primary' | 'secondary' | 'danger';
}

export interface Attachment {
  id: string;
  filename: string;
  url: string;
  contentType: string;
  size: number;
}

export interface Reaction {
  platform: string;
  channel: ChannelRef;
  messageId: string;
  userId: string;
  emoji: string;
  added: boolean;
}

export interface PlatformConfig {
  enabled: boolean;
  triggers: TriggerConfig[];
  [key: string]: unknown;
}

export type TriggerConfig =
  | 'dm'
  | 'mention'
  | { prefix: string }
  | { command: string };

export interface DaemonConfig {
  discord?: DiscordConfig;
  slack?: SlackConfig;
  teams?: TeamsConfig;
  agent: AgentConfig;
  progress: ProgressConfig;
}

export interface DiscordConfig extends PlatformConfig {
  token: string;
  applicationId?: string;
  publicKey?: string;
}

export interface SlackConfig extends PlatformConfig {
  appToken: string;
  botToken: string;
}

export interface TeamsConfig extends PlatformConfig {
  appId: string;
  appPassword: string;
}

export interface AgentConfig {
  type: 'cursor';
  defaultRepository?: string;
  timeoutMinutes: number;
  maxConcurrentSessions: number;
}

export interface ProgressConfig {
  updateIntervalMs: number;
  fileMonitorIntervalMs: number;
  theme: 'dark' | 'light';
  maxLogEntries: number;
}
