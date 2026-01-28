import { randomUUID } from 'crypto';
import { ChannelRef } from './types.js';
import { Session, SessionRequest } from './session.js';

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  public createSession(request: SessionRequest): Session {
    const session: Session = {
      id: randomUUID(),
      userId: request.userId,
      platform: request.platform,
      channel: request.channel,
      task: request.task,
      repository: request.repository,
      branch: request.branch || 'main',
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };

    this.sessions.set(session.id, session);
    return session;
  }

  public getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  public findByChannel(channel: ChannelRef): Session | undefined {
    for (const session of this.sessions.values()) {
      if (
        session.channel.channelId === channel.channelId &&
        session.channel.threadId === channel.threadId
      ) {
        return session;
      }
    }
    return undefined;
  }

  public getUserSessions(userId: string): Session[] {
    return [...this.sessions.values()].filter((s) => s.userId === userId);
  }

  public getAll(): Session[] {
    return [...this.sessions.values()];
  }

  public updateSession(id: string, updates: Partial<Session>): void {
    const session = this.sessions.get(id);
    if (session) {
      Object.assign(session, updates);
      session.lastActivityAt = new Date();
    }
  }

  public async endSession(
    id: string,
    _reason: 'complete' | 'error' | 'cancelled',
  ): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      // Clean up session after delay
      setTimeout(() => this.sessions.delete(id), 5 * 60 * 1000);
    }
  }
}
