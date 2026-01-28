import { EventEmitter } from 'events';
import { readProgressFile } from './progress-file.js';
import { SessionProgressFile } from './session.js';
import { ProgressConfig } from './types.js';

export interface ProgressMonitorEvents {
  update: (sessionId: string, progress: SessionProgressFile) => void;
  complete: (sessionId: string, progress: SessionProgressFile) => void;
  error: (sessionId: string, error: Error) => void;
}

export class ProgressFileMonitor extends EventEmitter {
  private config: ProgressConfig;
  private monitoredSessions: Map<
    string,
    {
      interval: NodeJS.Timeout;
      lastUpdate: string | null;
    }
  > = new Map();

  public constructor(config: ProgressConfig) {
    super();
    this.config = config;
  }

  /**
   * Start monitoring a session's progress file
   */
  public startMonitoring(sessionId: string): void {
    if (this.monitoredSessions.has(sessionId)) {
      return;
    }

    console.log(`[ProgressMonitor] Starting to monitor session: ${sessionId}`);

    const interval = setInterval(async () => {
      await this.checkProgress(sessionId);
    }, this.config.fileMonitorIntervalMs);

    this.monitoredSessions.set(sessionId, {
      interval,
      lastUpdate: null,
    });

    // Do an immediate check
    this.checkProgress(sessionId);
  }

  /**
   * Stop monitoring a session
   */
  public stopMonitoring(sessionId: string): void {
    const session = this.monitoredSessions.get(sessionId);
    if (session) {
      clearInterval(session.interval);
      this.monitoredSessions.delete(sessionId);
      console.log(`[ProgressMonitor] Stopped monitoring session: ${sessionId}`);
    }
  }

  /**
   * Stop all monitoring
   */
  public stopAll(): void {
    for (const [sessionId] of this.monitoredSessions) {
      this.stopMonitoring(sessionId);
    }
  }

  private async checkProgress(sessionId: string): Promise<void> {
    const monitorState = this.monitoredSessions.get(sessionId);
    if (!monitorState) return;

    try {
      const progress = await readProgressFile(sessionId);

      if (!progress) {
        // File doesn't exist yet, skip
        return;
      }

      // Only emit if there's been an update
      if (progress.updatedAt !== monitorState.lastUpdate) {
        monitorState.lastUpdate = progress.updatedAt;

        // Check if completed
        if (progress.stage === 'complete' || progress.stage === 'error') {
          this.emit('complete', sessionId, progress);
          this.stopMonitoring(sessionId);
        } else {
          this.emit('update', sessionId, progress);
        }
      }
    } catch (error) {
      console.error(
        `[ProgressMonitor] Error reading progress for ${sessionId}:`,
        error,
      );
      this.emit('error', sessionId, error as Error);
    }
  }

  /**
   * Get the current progress for a session (immediate read)
   */
  public async getCurrentProgress(
    sessionId: string,
  ): Promise<SessionProgressFile | null> {
    return readProgressFile(sessionId);
  }
}
