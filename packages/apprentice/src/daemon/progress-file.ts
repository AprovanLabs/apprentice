import { promises as fs } from 'fs';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import {
  SessionProgressFile,
  SessionStage,
  TaskProgress,
  ProgressLogEntry,
  SessionResult,
} from './session.js';

const APPRENTICE_HOME =
  process.env.APPRENTICE_HOME ||
  path.join(process.env.HOME || '', '.apprentice');
const DAEMON_DIR = path.join(APPRENTICE_HOME, 'memory', 'daemon');

// Ensure daemon directory exists
if (!existsSync(DAEMON_DIR)) {
  mkdirSync(DAEMON_DIR, { recursive: true });
}

export function getProgressFilePath(sessionId: string): string {
  return path.join(DAEMON_DIR, `${sessionId}.json`);
}

export async function writeProgressFile(
  sessionId: string,
  progress: Omit<SessionProgressFile, 'sessionId' | 'updatedAt'>,
): Promise<void> {
  const filePath = getProgressFilePath(sessionId);
  const data: SessionProgressFile = {
    sessionId,
    ...progress,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function readProgressFile(
  sessionId: string,
): Promise<SessionProgressFile | null> {
  const filePath = getProgressFilePath(sessionId);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as SessionProgressFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function deleteProgressFile(sessionId: string): Promise<void> {
  const filePath = getProgressFilePath(sessionId);

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export function createInitialProgress(): Omit<
  SessionProgressFile,
  'sessionId' | 'updatedAt'
> {
  return {
    stage: 'starting',
    tasks: {
      total: 0,
      completed: 0,
      estimatedPercentComplete: 0,
    },
    progressLogs: [
      {
        timestamp: new Date().toISOString(),
        message: 'Agent starting...',
      },
    ],
  };
}

export class ProgressFileWriter {
  private sessionId: string;
  private progress: Omit<SessionProgressFile, 'sessionId' | 'updatedAt'>;
  private maxLogEntries: number;
  private writePromise: Promise<void> | null = null;

  constructor(sessionId: string, maxLogEntries: number = 50) {
    this.sessionId = sessionId;
    this.maxLogEntries = maxLogEntries;
    this.progress = createInitialProgress();
  }

  public async initialize(): Promise<void> {
    await writeProgressFile(this.sessionId, this.progress);
  }

  public async setStage(stage: SessionStage): Promise<void> {
    this.progress.stage = stage;
    await this.write();
  }

  public async updateTasks(tasks: Partial<TaskProgress>): Promise<void> {
    this.progress.tasks = { ...this.progress.tasks, ...tasks };
    await this.write();
  }

  public async addLogEntry(message: string): Promise<void> {
    const entry: ProgressLogEntry = {
      timestamp: new Date().toISOString(),
      message: message.slice(0, 200), // Limit log entry length
    };

    this.progress.progressLogs.push(entry);

    // Keep only the latest entries
    if (this.progress.progressLogs.length > this.maxLogEntries) {
      this.progress.progressLogs = this.progress.progressLogs.slice(
        -this.maxLogEntries,
      );
    }

    await this.write();
  }

  public async setResult(result: SessionResult): Promise<void> {
    this.progress.result = result;
    this.progress.stage = result.success ? 'complete' : 'error';
    await this.write();
  }

  public async setWaiting(question: string): Promise<void> {
    this.progress.stage = 'waiting';
    await this.addLogEntry(`⏳ Waiting for input: ${question}`);
  }

  public getProgress(): Omit<SessionProgressFile, 'sessionId' | 'updatedAt'> {
    return { ...this.progress };
  }

  private async write(): Promise<void> {
    // Ensure writes are sequential to avoid race conditions
    const doWrite = async () => {
      await writeProgressFile(this.sessionId, this.progress);
    };

    if (this.writePromise) {
      this.writePromise = this.writePromise.then(doWrite);
    } else {
      this.writePromise = doWrite();
    }

    await this.writePromise;
  }

  public async cleanup(): Promise<void> {
    // Wait for any pending writes
    if (this.writePromise) {
      await this.writePromise;
    }
    await deleteProgressFile(this.sessionId);
  }
}
