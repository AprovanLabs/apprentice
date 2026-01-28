import { ChannelRef, MessageRef } from './types.js';

export interface Session {
  id: string;
  userId: string;
  platform: string;

  channel: ChannelRef;
  progressMessageRef?: MessageRef;

  task: string;
  repository: string;
  branch: string;

  agentProcessId?: string;

  createdAt: Date;
  lastActivityAt: Date;
}

/**
 * Session progress file stored at $APPRENTICE_HOME/memory/daemon/{session_id}.json
 * Written by the agent runner, monitored by the daemon for Discord updates
 */
export interface SessionProgressFile {
  sessionId: string;
  stage: SessionStage;
  tasks: TaskProgress;
  progressLogs: ProgressLogEntry[];
  result?: SessionResult;
  updatedAt: string; // ISO timestamp
}

export type SessionStage =
  | 'starting'
  | 'analyzing'
  | 'planning'
  | 'implementing'
  | 'testing'
  | 'reviewing'
  | 'complete'
  | 'error'
  | 'waiting';

export interface TaskProgress {
  total: number;
  completed: number;
  current?: string;
  estimatedPercentComplete: number;
}

export interface ProgressLogEntry {
  timestamp: string;
  message: string;
}

export interface SessionResult {
  success: boolean;
  pullRequestUrl?: string;
  summary?: string;
  filesChanged: string[];
  error?: string;
  durationMs?: number;
}

export interface SessionRequest {
  userId: string;
  platform: string;
  channel: ChannelRef;
  task: string;
  repository: string;
  branch?: string;
}
