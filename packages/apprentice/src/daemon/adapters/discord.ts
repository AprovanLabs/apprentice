import {
  Client,
  GatewayIntentBits,
  TextChannel,
  ThreadChannel,
  Message,
  AttachmentBuilder,
  Events,
  ChannelType,
  Partials,
} from 'discord.js';
import {
  PlatformAdapter,
  PlatformConfig,
  ChannelRef,
  MessageRef,
  MessageContent,
  IncomingMessage,
  Reaction,
  DiscordConfig,
} from '../types.js';

export class DiscordAdapter implements PlatformAdapter {
  public readonly platform = 'discord' as const;

  private client: Client;
  private config: DiscordConfig | null = null;
  private ready: boolean = false;

  public onMessage: (msg: IncomingMessage) => Promise<void> = async () => {};
  public onReaction: (reaction: Reaction) => Promise<void> = async () => {};

  public constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions,
      ],
      partials: [Partials.Channel, Partials.Message, Partials.Reaction],
    });

    this.setupEventHandlers();
  }

  public async connect(config: PlatformConfig): Promise<void> {
    this.config = config as DiscordConfig;

    return new Promise((resolve, reject) => {
      this.client.once(Events.ClientReady, () => {
        this.ready = true;
        console.log(`Discord connected as ${this.client.user?.tag}`);
        resolve();
      });

      this.client.once(Events.Error, reject);

      if (!this.config?.token) {
        reject(new Error('Discord token not configured'));
        return;
      }

      this.client.login(this.config.token).catch(reject);
    });
  }

  public async disconnect(): Promise<void> {
    this.ready = false;
    await this.client.destroy();
  }

  public isConnected(): boolean {
    return this.ready && this.client.isReady();
  }

  private setupEventHandlers(): void {
    this.client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot) return;

      if (!this.shouldHandle(message)) return;

      const incomingMsg: IncomingMessage = {
        id: message.id,
        platform: 'discord',
        channel: this.messageToChannelRef(message),
        userId: message.author.id,
        username: message.author.username,
        content: this.cleanContent(message.content),
        attachments: message.attachments.map((a) => ({
          id: a.id,
          filename: a.name || 'unknown',
          url: a.url,
          contentType: a.contentType || 'application/octet-stream',
          size: a.size,
        })),
        replyToMessageId: message.reference?.messageId || undefined,
        timestamp: message.createdAt,
      };

      try {
        await this.onMessage(incomingMsg);
      } catch (error) {
        console.error('Error handling Discord message:', error);
      }
    });

    this.client.on(Events.MessageReactionAdd, async (reaction, user) => {
      if (user.bot) return;

      try {
        await this.onReaction({
          platform: 'discord',
          channel: {
            platform: 'discord',
            channelId: reaction.message.channelId,
            threadId:
              reaction.message.channel.type === ChannelType.PublicThread
                ? reaction.message.channelId
                : undefined,
          },
          messageId: reaction.message.id,
          userId: user.id,
          emoji: reaction.emoji.name || 'unknown',
          added: true,
        });
      } catch (error) {
        console.error('Error handling Discord reaction:', error);
      }
    });

    this.client.on(Events.MessageReactionRemove, async (reaction, user) => {
      if (user.bot) return;

      try {
        await this.onReaction({
          platform: 'discord',
          channel: {
            platform: 'discord',
            channelId: reaction.message.channelId,
          },
          messageId: reaction.message.id,
          userId: user.id,
          emoji: reaction.emoji.name || 'unknown',
          added: false,
        });
      } catch (error) {
        console.error('Error handling Discord reaction remove:', error);
      }
    });
  }

  private shouldHandle(message: Message): boolean {
    if (!this.config?.triggers) return false;

    for (const trigger of this.config.triggers) {
      if (trigger === 'dm' && message.channel.type === ChannelType.DM) {
        return true;
      }

      if (trigger === 'mention' && message.mentions.has(this.client.user!.id)) {
        return true;
      }

      if (
        typeof trigger === 'object' &&
        'prefix' in trigger &&
        message.content.startsWith(trigger.prefix)
      ) {
        return true;
      }
    }

    if (message.channel.type === ChannelType.PublicThread) {
      return true;
    }

    return false;
  }

  private cleanContent(content: string): string {
    if (this.client.user) {
      content = content.replace(
        new RegExp(`^<@!?${this.client.user.id}>\\s*`),
        '',
      );
    }

    for (const trigger of this.config?.triggers || []) {
      if (typeof trigger === 'object' && 'prefix' in trigger) {
        if (content.startsWith(trigger.prefix)) {
          content = content.slice(trigger.prefix.length).trim();
        }
      }
    }

    return content.trim();
  }

  private messageToChannelRef(message: Message): ChannelRef {
    const isThread = message.channel.type === ChannelType.PublicThread;
    return {
      platform: 'discord',
      channelId: isThread
        ? (message.channel as ThreadChannel).parentId!
        : message.channelId,
      threadId: isThread ? message.channelId : undefined,
    };
  }

  public async sendMessage(
    channel: ChannelRef,
    content: MessageContent,
  ): Promise<MessageRef> {
    const discordChannel = await this.resolveChannel(channel);

    const messageOptions: any = {};

    if (content.text) {
      messageOptions.content = content.text;
    }

    if (content.image) {
      const attachment = new AttachmentBuilder(content.image, {
        name: 'progress.png',
      });
      messageOptions.files = [attachment];
    }

    if (content.embed) {
      messageOptions.embeds = [
        {
          title: content.embed.title,
          description: content.embed.description,
          color: content.embed.color,
          fields: content.embed.fields,
          image: content.embed.imageUrl
            ? { url: content.embed.imageUrl }
            : undefined,
          footer: content.embed.footer
            ? { text: content.embed.footer }
            : undefined,
        },
      ];
    }

    const message = await discordChannel.send(messageOptions);

    return {
      platform: 'discord',
      channelId: channel.channelId,
      threadId: channel.threadId,
      messageId: message.id,
    };
  }

  public async editMessage(
    messageRef: MessageRef,
    content: MessageContent,
  ): Promise<void> {
    console.log(
      `[Discord] Editing message ${messageRef.messageId} in channel ${messageRef.channelId}`,
    );
    const channel = await this.resolveChannel(messageRef);
    console.log(`[Discord] Resolved channel, fetching message...`);
    const message = await channel.messages.fetch(messageRef.messageId);
    console.log(`[Discord] Message fetched successfully`);

    const editOptions: any = {};

    if (content.text !== undefined) {
      editOptions.content = content.text || null;
    }

    if (content.image) {
      console.log(`[Discord] Attaching image (${content.image.length} bytes)`);
      const attachment = new AttachmentBuilder(content.image, {
        name: 'progress.png',
      });
      editOptions.files = [attachment];
      editOptions.attachments = [];
    }

    if (content.embed) {
      editOptions.embeds = [
        {
          title: content.embed.title,
          description: content.embed.description,
          color: content.embed.color,
          fields: content.embed.fields,
          image: content.embed.imageUrl
            ? { url: content.embed.imageUrl }
            : undefined,
          footer: content.embed.footer
            ? { text: content.embed.footer }
            : undefined,
        },
      ];
    }

    console.log(`[Discord] Applying message edit...`);
    await message.edit(editOptions);
    console.log(`[Discord] Message edit complete`);
  }

  public async deleteMessage(messageRef: MessageRef): Promise<void> {
    const channel = await this.resolveChannel(messageRef);
    const message = await channel.messages.fetch(messageRef.messageId);
    await message.delete();
  }

  public async createThread(
    channel: ChannelRef,
    name: string,
  ): Promise<ChannelRef> {
    const textChannel = (await this.client.channels.fetch(
      channel.channelId,
    )) as TextChannel;

    if (!textChannel || textChannel.type !== ChannelType.GuildText) {
      throw new Error('Cannot create thread in non-text channel');
    }

    const truncatedName = name.slice(0, 100);

    const thread = await textChannel.threads.create({
      name: truncatedName,
      autoArchiveDuration: 1440,
      reason: 'Agent session thread',
    });

    return {
      platform: 'discord',
      channelId: channel.channelId,
      threadId: thread.id,
    };
  }

  public async uploadImage(
    channel: ChannelRef,
    image: Buffer,
    filename: string,
  ): Promise<string> {
    const discordChannel = await this.resolveChannel(channel);

    const attachment = new AttachmentBuilder(image, { name: filename });
    const message = await discordChannel.send({ files: [attachment] });

    return message.attachments.first()?.url || '';
  }

  private async resolveChannel(
    ref: ChannelRef,
  ): Promise<TextChannel | ThreadChannel> {
    const channelId = ref.threadId || ref.channelId;
    const channel = await this.client.channels.fetch(channelId);

    if (!channel) {
      throw new Error(`Channel not found: ${channelId}`);
    }

    if (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.PublicThread &&
      channel.type !== ChannelType.DM
    ) {
      throw new Error(`Unsupported channel type: ${channel.type}`);
    }

    return channel as TextChannel | ThreadChannel;
  }
}
