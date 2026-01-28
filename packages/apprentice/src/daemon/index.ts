import { DaemonConfig, PlatformAdapter, IncomingMessage } from './types.js';
import { SessionManager } from './session-manager.js';
import { ProgressRenderer } from './progress-renderer.js';
import { AgentRunner, AgentQuestion } from './agent-runner.js';
import { ProgressFileMonitor } from './progress-monitor.js';
import { deleteProgressFile, readProgressFile } from './progress-file.js';
import { loadConfig } from './config.js';
import { Session, SessionProgressFile } from './session.js';
import { isAIAvailable, fastComplete } from '../ai/index.js';

export class AgentDaemon {
  private adapters: Map<string, PlatformAdapter> = new Map();
  private sessions: SessionManager;
  private renderer: ProgressRenderer;
  private runner: AgentRunner;
  private progressMonitor: ProgressFileMonitor;
  private config!: DaemonConfig;
  private uiUpdateIntervals: Map<string, NodeJS.Timeout> = new Map();

  public constructor() {
    this.sessions = new SessionManager();
    this.renderer = new ProgressRenderer();
    this.runner = new AgentRunner({
      agent: {
        type: 'cursor',
        timeoutMinutes: 30,
        maxConcurrentSessions: 3,
      },
      progress: {
        updateIntervalMs: 1000,
        fileMonitorIntervalMs: 1000,
        theme: 'dark',
        maxLogEntries: 50,
      },
    });
    this.progressMonitor = new ProgressFileMonitor({
      updateIntervalMs: 1000,
      fileMonitorIntervalMs: 1000,
      theme: 'dark',
      maxLogEntries: 50,
    });
  }

  public async start(): Promise<void> {
    this.config = await loadConfig();

    this.renderer = new ProgressRenderer(this.config.progress);
    this.runner = new AgentRunner({
      agent: this.config.agent,
      progress: this.config.progress,
    });
    this.progressMonitor = new ProgressFileMonitor(this.config.progress);

    // Set up progress monitor event handlers
    this.setupProgressMonitor();

    await this.initializeAdapters();

    console.log(
      'Agent daemon started, listening on:',
      [...this.adapters.keys()].join(', '),
    );

    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  private setupProgressMonitor(): void {
    this.progressMonitor.on(
      'update',
      async (sessionId: string, progress: SessionProgressFile) => {
        const session = this.sessions.getSession(sessionId);
        if (!session) return;

        console.log(
          `[Daemon] Progress update for ${sessionId}: ${progress.stage} - ${progress.tasks.estimatedPercentComplete}%`,
        );

        // Handle waiting state (agent needs input)
        if (progress.stage === 'waiting') {
          const adapter = this.adapters.get(session.platform);
          if (adapter) {
            const latestLog =
              progress.progressLogs[progress.progressLogs.length - 1];
            await adapter.sendMessage(session.channel, {
              text: `❓ **Agent needs input:**\n${
                latestLog?.message || 'Please provide input'
              }`,
            });
          }
        }
      },
    );

    this.progressMonitor.on(
      'complete',
      async (sessionId: string, progress: SessionProgressFile) => {
        const session = this.sessions.getSession(sessionId);
        if (!session) return;

        console.log(
          `[Daemon] Session ${sessionId} completed: ${progress.stage}`,
        );

        // Stop UI updates
        this.stopUIUpdates(sessionId);

        // Force final UI update
        const adapter = this.adapters.get(session.platform);
        if (adapter && session.progressMessageRef) {
          await this.updateProgressUI(session, progress, adapter);
        }

        // Send completion message
        if (adapter && progress.result) {
          if (progress.result.success) {
            const message = progress.result.pullRequestUrl
              ? `✅ **Task completed!**\n\n${
                  progress.result.summary || 'Done'
                }\n\n🔗 ${progress.result.pullRequestUrl}`
              : `✅ **Task completed!**\n\n${
                  progress.result.summary || 'Done'
                }`;

            await adapter.sendMessage(session.channel, { text: message });
          } else {
            await adapter.sendMessage(session.channel, {
              text: `❌ **Agent error:**\n${
                progress.result.error || 'Unknown error'
              }`,
            });
          }
        }

        // Clean up
        await this.sessions.endSession(
          sessionId,
          progress.stage === 'complete' ? 'complete' : 'error',
        );

        // Delete progress file after a delay
        setTimeout(() => deleteProgressFile(sessionId), 60000);
      },
    );
  }

  private async initializeAdapters(): Promise<void> {
    if (this.config.discord?.enabled) {
      const { DiscordAdapter } = await import('./adapters/discord.js');
      const discord = new DiscordAdapter();
      await discord.connect(this.config.discord);
      discord.onMessage = (msg) => this.handleMessage(msg);
      this.adapters.set('discord', discord);
    }

    if (this.config.slack?.enabled) {
      console.log('Slack adapter not yet implemented');
    }

    if (this.config.teams?.enabled) {
      console.log('Teams adapter not yet implemented');
    }
  }

  private async handleMessage(msg: IncomingMessage): Promise<void> {
    const session = this.sessions.findByChannel(msg.channel);

    if (session) {
      // Check if agent is waiting for input
      const progress = await readProgressFile(session.id);
      if (progress?.stage === 'waiting') {
        await this.handleUserResponse(session, msg.content);
        return;
      }
    }

    if (this.isAgentRequest(msg)) {
      await this.startSession(msg);
    }
  }

  private isAgentRequest(msg: IncomingMessage): boolean {
    const config = this.config[msg.platform as keyof DaemonConfig];
    if (!config || typeof config !== 'object') return false;

    const platformConfig = config as { triggers?: unknown[] };
    if (!platformConfig.triggers) return false;

    for (const trigger of platformConfig.triggers) {
      if (trigger === 'dm' && !msg.channel.threadId) return true;
      if (trigger === 'mention' && msg.content.includes(`<@`)) return true;
      if (
        trigger &&
        typeof trigger === 'object' &&
        'prefix' in trigger &&
        typeof trigger.prefix === 'string' &&
        msg.content.startsWith(trigger.prefix)
      )
        return true;
    }

    return false;
  }

  private async startSession(msg: IncomingMessage): Promise<void> {
    const adapter = this.adapters.get(msg.platform)!;

    const userSessions = this.sessions.getUserSessions(msg.userId);
    const activeCount = userSessions.length;

    if (activeCount >= this.config.agent.maxConcurrentSessions) {
      await adapter.sendMessage(msg.channel, {
        text: `⚠️ You have ${activeCount} active sessions. Please wait for one to complete.`,
      });
      return;
    }

    console.log('[Daemon] Generating thread name...');
    const threadName = await this.generateThreadName(msg.content);
    console.log(`[Daemon] Thread name: "${threadName}"`);
    console.log('[Daemon] Creating thread...');
    const thread = await adapter.createThread(msg.channel, threadName);
    console.log(`[Daemon] Thread created: ${thread.threadId}`);

    const repository =
      this.inferRepository(msg) ||
      this.config.agent.defaultRepository ||
      'unknown/repo';

    // Clean the task content (remove Discord mentions)
    const cleanedTask = msg.content
      .replace(/<@!?\d+>/g, '')
      .replace(/<@&\d+>/g, '')
      .replace(/<#\d+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    console.log('[Daemon] Creating session...');
    const session = this.sessions.createSession({
      userId: msg.userId,
      platform: msg.platform,
      channel: thread,
      task: cleanedTask,
      repository,
    });
    console.log(`[Daemon] Session created: ${session.id}`);

    // Render initial progress image (use a placeholder until the file is created)
    console.log('[Daemon] Rendering initial progress image...');
    const initialProgress: SessionProgressFile = {
      sessionId: session.id,
      stage: 'starting',
      tasks: { total: 0, completed: 0, estimatedPercentComplete: 0 },
      progressLogs: [
        { timestamp: new Date().toISOString(), message: 'Starting...' },
      ],
      updatedAt: new Date().toISOString(),
    };
    const initialImage = await this.renderer.render(initialProgress, 0);
    console.log(`[Daemon] Initial image size: ${initialImage.length} bytes`);
    console.log('[Daemon] Sending initial progress message...');
    const progressMsg = await adapter.sendMessage(thread, {
      image: initialImage,
    });
    session.progressMessageRef = progressMsg;
    this.sessions.updateSession(session.id, {
      progressMessageRef: progressMsg,
    });
    console.log(`[Daemon] Progress message sent: ${progressMsg.messageId}`);

    console.log('[Daemon] Spawning agent process...');
    const agent = this.runner.spawn({
      sessionId: session.id,
      task: session.task,
      repository: session.repository,
      branch: session.branch,
    });
    console.log(`[Daemon] Agent spawned with session ID: ${agent.id}`);

    // Start monitoring the progress file (uses session ID)
    console.log('[Daemon] Starting progress file monitor...');
    this.progressMonitor.startMonitoring(session.id);

    // Start UI update loop
    console.log('[Daemon] Starting UI update loop...');
    this.startUIUpdates(session, adapter);

    // Listen for agent events (questions need immediate handling)
    agent.on('question', async (q: AgentQuestion) => {
      console.log(`[Daemon] Agent asked question: ${q.question}`);
      await adapter.sendMessage(thread, {
        text: `❓ **Agent needs input:**\n${q.question}${
          q.options ? `\n\nOptions: ${q.options.join(', ')}` : ''
        }`,
      });
    });

    agent.on('complete', async () => {
      console.log(`[Daemon] Agent completed`);
      // Progress monitor will handle the rest via file monitoring
    });

    agent.on('error', async (error: Error) => {
      console.error(`[Daemon] Agent error: ${error.message}`);
      // Progress monitor will handle the rest via file monitoring
    });
  }

  private startUIUpdates(session: Session, adapter: PlatformAdapter): void {
    const interval = setInterval(async () => {
      const currentSession = this.sessions.getSession(session.id);
      if (!currentSession?.progressMessageRef) {
        this.stopUIUpdates(session.id);
        return;
      }

      try {
        const progress = await readProgressFile(session.id);
        if (!progress) return;

        await this.updateProgressUI(currentSession, progress, adapter);
      } catch (error) {
        console.error('[Daemon] Failed to update progress UI:', error);
      }
    }, this.config.progress.updateIntervalMs);

    this.uiUpdateIntervals.set(session.id, interval);
  }

  private async updateProgressUI(
    session: Session,
    progress: SessionProgressFile,
    adapter: PlatformAdapter,
  ): Promise<void> {
    if (!session.progressMessageRef) return;

    const elapsedSeconds = Math.floor(
      (Date.now() - session.createdAt.getTime()) / 1000,
    );

    try {
      console.log(
        `[Daemon] Updating progress UI (${progress.tasks.estimatedPercentComplete}% complete, ${progress.tasks.completed}/${progress.tasks.total} tasks)`,
      );
      const image = await this.renderer.render(progress, elapsedSeconds);
      console.log(`[Daemon] Rendered image size: ${image.length} bytes`);
      await adapter.editMessage(session.progressMessageRef, { image });
      console.log(`[Daemon] Progress image updated successfully`);
    } catch (error) {
      console.error('[Daemon] Failed to update progress:', error);
    }
  }

  private stopUIUpdates(sessionId: string): void {
    const interval = this.uiUpdateIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.uiUpdateIntervals.delete(sessionId);
    }
  }

  private async handleUserResponse(
    session: Session,
    response: string,
  ): Promise<void> {
    console.log(
      `[Daemon] User response in session ${session.id}: ${response.slice(
        0,
        50,
      )}...`,
    );
    const agent = this.runner.getProcess(session.agentProcessId!);
    if (!agent) {
      console.error(
        `[Daemon] No agent process found for session ${session.id}`,
      );
      return;
    }

    console.log(`[Daemon] Sending input to agent ${session.agentProcessId}`);
    await agent.sendInput(response);
  }

  private inferRepository(msg: IncomingMessage): string | undefined {
    const repoMatch = msg.content.match(
      /(?:github\.com\/)?([a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)/,
    );
    return repoMatch ? repoMatch[1] : undefined;
  }

  private async generateThreadName(content: string): Promise<string> {
    const cleaned = content
      .replace(/<@!?\d+>/g, '')
      .replace(/<@&\d+>/g, '')
      .replace(/<#\d+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    console.log(
      `[Daemon] Cleaned content for thread name: "${cleaned.slice(0, 100)}"`,
    );

    if (!isAIAvailable()) {
      console.log('[Daemon] AI not available, using fallback thread name');
      return `Agent: ${cleaned.slice(0, 50)}`;
    }

    try {
      console.log('[Daemon] Requesting AI-generated thread name...');
      const result = await fastComplete(
        `Task: "${cleaned}"\n\nGenerate a SHORT thread title (max 40 chars). Use title case. Be specific. Examples:\n- "Fix Login Bug"\n- "Add Dark Mode"\n- "Update Dependencies"\n\nTitle:`,
        "You create concise thread titles for coding tasks. Use 2-5 words maximum. No sentences. Title case. Be specific about what's being done.",
      );

      console.log(`[Daemon] AI response: "${result.text}"`);
      const generated = result.text
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/^Title:\s*/i, '')
        .slice(0, 40);
      console.log(`[Daemon] Generated thread name: "${generated}"`);
      return generated || `Agent: ${cleaned.slice(0, 35)}`;
    } catch (error) {
      console.error(`[Daemon] Failed to generate thread name:`, error);
      return `Agent: ${cleaned.slice(0, 35)}`;
    }
  }

  public async shutdown(): Promise<void> {
    console.log('Shutting down agent daemon...');

    // Stop progress monitoring
    this.progressMonitor.stopAll();

    // Stop all UI updates
    for (const [, interval] of this.uiUpdateIntervals) {
      clearInterval(interval);
    }
    this.uiUpdateIntervals.clear();

    // End all sessions
    for (const session of this.sessions.getAll()) {
      await this.sessions.endSession(session.id, 'cancelled');
      await deleteProgressFile(session.id);
    }

    await this.runner.cancelAll();

    for (const [name, adapter] of this.adapters) {
      console.log(`Disconnecting ${name}...`);
      await adapter.disconnect();
    }

    process.exit(0);
  }
}
