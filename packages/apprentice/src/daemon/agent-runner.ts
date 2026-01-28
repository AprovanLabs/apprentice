import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { AgentConfig, ProgressConfig } from './types.js';
import { ProgressFileWriter, getProgressFilePath } from './progress-file.js';

const execAsync = promisify(exec);

export interface AgentProcess extends EventEmitter {
  readonly id: string;
  readonly pid: number | undefined;
  readonly status: AgentStatus;
  readonly progressFilePath: string;

  sendInput(input: string): Promise<void>;
  cancel(): Promise<void>;
}

export type AgentStatus =
  | 'starting'
  | 'running'
  | 'waiting'
  | 'complete'
  | 'error'
  | 'cancelled';

export interface AgentOptions {
  sessionId: string;
  task: string;
  repository: string;
  branch?: string;
  workingDirectory?: string;
  timeout?: number;
  useWorktree?: boolean;
}

export interface AgentRunnerConfig {
  agent: AgentConfig;
  progress: ProgressConfig;
}

export interface AgentQuestion {
  question: string;
  options?: string[];
  timeout?: number;
}

export interface AgentResult {
  pullRequestUrl: string;
  summary: string;
  filesChanged: string[];
  durationMs?: number;
  branch?: string;
}

export class AgentRunner {
  private config: AgentRunnerConfig;
  private processes: Map<string, AgentProcessImpl> = new Map();

  public constructor(config: AgentRunnerConfig) {
    this.config = config;
  }

  public spawn(options: AgentOptions): AgentProcess {
    const process = new AgentProcessImpl(options, this.config);
    this.processes.set(process.id, process);

    process.on('complete', () => this.processes.delete(process.id));
    process.on('error', () => this.processes.delete(process.id));
    process.on('cancelled', () => this.processes.delete(process.id));

    // Start asynchronously but catch any errors
    process.start().catch((err) => {
      console.error(`[AgentRunner] Failed to start process:`, err);
    });
    return process;
  }

  public getProcess(id: string): AgentProcess | undefined {
    return this.processes.get(id);
  }

  public async cancelAll(): Promise<void> {
    const cancellations = [...this.processes.values()].map((p) => p.cancel());
    await Promise.all(cancellations);
  }
}

class AgentProcessImpl extends EventEmitter implements AgentProcess {
  public readonly id: string;
  private _status: AgentStatus = 'starting';
  private process: ChildProcess | null = null;
  private options: AgentOptions;
  private config: AgentRunnerConfig;
  private outputBuffer: string = '';
  private timeoutTimer: NodeJS.Timeout | null = null;
  private worktreePath: string | null = null;
  private worktreeBranch: string | null = null;
  private progressWriter: ProgressFileWriter;
  private startTime: number = Date.now();
  private filesChanged: Set<string> = new Set();

  public constructor(options: AgentOptions, config: AgentRunnerConfig) {
    super();
    this.id = options.sessionId;
    this.options = options;
    this.config = config;
    this.progressWriter = new ProgressFileWriter(
      this.id,
      config.progress.maxLogEntries,
    );
  }

  public get pid(): number | undefined {
    return this.process?.pid;
  }

  public get status(): AgentStatus {
    return this._status;
  }

  public get progressFilePath(): string {
    return getProgressFilePath(this.id);
  }

  public async start(): Promise<void> {
    this._status = 'starting';
    this.startTime = Date.now();

    // Initialize progress file
    await this.progressWriter.initialize();
    await this.progressWriter.addLogEntry(
      `Starting agent for task: ${this.options.task.slice(0, 100)}`,
    );

    const timeoutMs =
      (this.options.timeout || this.config.agent.timeoutMinutes) * 60 * 1000;
    this.timeoutTimer = setTimeout(() => {
      this.handleTimeout();
    }, timeoutMs);

    try {
      const useWorktree = false; // Temporarily disabled
      // this.options.useWorktree !== false && !this.options.workingDirectory;
      if (useWorktree) {
        await this.createWorktree();
      }

      this.process = this.spawnAgent();

      console.log(
        `[AgentRunner] Process spawned with PID: ${this.process.pid}`,
      );
      await this.progressWriter.addLogEntry(
        `Process spawned (PID: ${this.process.pid})`,
      );

      // Debug lifecycle events
      this.process.on('spawn', () => {
        console.log(`[AgentRunner] Process spawn event fired`);
      });
      this.process.on('disconnect', () => {
        console.log(`[AgentRunner] Process disconnected`);
      });
      this.process.on('exit', (code, signal) => {
        console.log(
          `[AgentRunner] Process exit: code=${code}, signal=${signal}`,
        );
      });

      this.process.stdout?.on('data', (data) => {
        const text = data.toString();
        console.log(`[Agent] stdout: ${text.trim()}`);
        this.handleOutput(text);
      });
      this.process.stdout?.on('end', () => {
        console.log(`[AgentRunner] stdout stream ended`);
      });
      this.process.stderr?.on('data', (data) => {
        const text = data.toString();
        console.log(`[Agent] stderr: ${text.trim()}`);
        this.handleOutput(text);
      });

      this.process.on('close', (code) => {
        console.log(`[AgentRunner] Process closed with code: ${code}`);
        this.handleClose(code);
      });
      this.process.on('error', (err) => {
        console.error(`[AgentRunner] Process error:`, err);
        this.handleError(err);
      });

      this._status = 'running';
      await this.progressWriter.setStage('analyzing');
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  private spawnAgent(): ChildProcess {
    switch (this.config.agent.type) {
      case 'cursor':
        return this.spawnCursorAgent();
      default:
        throw new Error(`Unknown agent type: ${this.config.agent.type}`);
    }
  }

  private spawnCursorAgent(): ChildProcess {
    const workspace = this.worktreePath || this.options.workingDirectory;

    // Write system prompt to file for the agent to read
    const progressFilePath = this.progressFilePath;
    const promptFilePath = join(
      dirname(progressFilePath),
      `${this.id}-prompt.md`,
    );
    const promptContent = this.buildProgressInstructions(progressFilePath);
    writeFileSync(promptFilePath, promptContent);
    console.log(`[AgentRunner] Wrote prompt file: ${promptFilePath}`);

    // Reference the prompt file at the start, then the task
    const fullTask = `First, read ${promptFilePath} for important instructions.\n\n${this.options.task}`;

    // Build command string for shell execution
    // Escape single quotes in the task by replacing ' with '\''
    const escapedTask = fullTask.replace(/'/g, "'\\''");
    const workspaceArg = workspace ? `--workspace '${workspace}'` : '';
    const command = `cursor agent -p --approve-mcps --output-format stream-json ${workspaceArg} '${escapedTask}'`;

    console.log(`[AgentRunner] Spawning command: ${command.slice(0, 200)}...`);
    console.log(`[AgentRunner] Working directory: ${workspace}`);
    console.log(`[AgentRunner] Progress file: ${progressFilePath}`);

    // Use stdio: "inherit" so output goes directly to terminal for debugging
    // Progress updates come from the file monitor, not stdout parsing
    const child = spawn('/bin/bash', ['-c', command], {
      stdio: 'inherit',
      cwd: workspace || undefined,
      env: {
        ...process.env,
        APPRENTICE_PROGRESS_FILE: progressFilePath,
      },
    });

    return child;
  }

  private buildProgressInstructions(progressFilePath: string): string {
    return `IMPORTANT: You MUST keep the progress file updated throughout your work.

Progress file location: ${progressFilePath}

After EVERY significant action (reading files, making changes, running commands), update the progress file by writing JSON with this structure:

{
  "sessionId": "${this.id}",
  "stage": "<current_stage>",
  "tasks": {
    "total": <estimated_total_tasks>,
    "completed": <completed_tasks>,
    "current": "<what_you_are_doing_now>",
    "estimatedPercentComplete": <0-100>
  },
  "progressLogs": [
    {"timestamp": "<ISO_timestamp>", "message": "<brief_status_update>"}
  ],
  "updatedAt": "<ISO_timestamp>"
}

Stages (use these values for "stage"):
- "analyzing" - Reading and understanding code
- "planning" - Deciding what changes to make  
- "implementing" - Making code changes
- "testing" - Running tests
- "reviewing" - Final review of changes
- "complete" - Task finished successfully
- "error" - Task failed

Rules:
1. Update the file FREQUENTLY (after each tool call)
2. Keep progressLogs array to last 20 entries max (remove oldest)
3. Always include a brief, informative "current" task description
4. Estimate total tasks early and update as you learn more
5. Set stage to "complete" or "error" when finished`;
  }

  private async createWorktree(): Promise<void> {
    const taskSlug = this.options.task
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);

    this.worktreeBranch = `agent/${taskSlug}-${this.id.slice(0, 8)}`;
    this.worktreePath = `/tmp/agent-worktree-${this.id}`;

    await execAsync(
      `git worktree add -b "${this.worktreeBranch}" "${this.worktreePath}"`,
      { cwd: this.options.workingDirectory || process.cwd() },
    );
  }

  private async removeWorktree(): Promise<void> {
    if (!this.worktreePath) return;

    try {
      await execAsync(`git worktree remove "${this.worktreePath}" --force`, {
        cwd: this.options.workingDirectory || process.cwd(),
      });
    } catch (error) {
      console.error(`Failed to remove worktree: ${error}`);
    }
  }

  private handleOutput(data: string): void {
    this.outputBuffer += data;

    const lines = this.outputBuffer.split('\n');
    this.outputBuffer = lines.pop() || '';

    for (const line of lines) {
      this.parseLine(line.trim());
    }
  }

  private parseLine(line: string): void {
    if (!line) return;

    // Parse JSON events from stream-json output
    if (line.startsWith('{')) {
      try {
        const event = JSON.parse(line);
        // Log full event for debugging
        console.log(`[Agent] JSON event:`, JSON.stringify(event, null, 2));
        this.handleEvent(event);
        return;
      } catch {
        // Not JSON, ignore
      }
    }

    // Check for questions that need user input
    this.checkForQuestion(line);
  }

  private handleEvent(event: any): void {
    console.log(
      `[Agent] Event type: ${event.type}, subtype: ${event.subtype || 'none'}`,
    );

    // Only handle result events - the spawned agent handles progress updates
    if (event.type === 'result') {
      if (event.subtype === 'success' && !event.is_error) {
        this._status = 'complete';
        this.cleanup();
        this.emit('complete', {
          pullRequestUrl: '',
          summary: event.result,
          filesChanged: [],
          durationMs: event.duration_ms || Date.now() - this.startTime,
          branch: this.worktreeBranch || undefined,
        } as AgentResult);
      } else {
        this._status = 'error';
        this.cleanup();
        this.emit('error', new Error(event.result || 'Agent failed'));
      }
    }
  }

  private checkForQuestion(line: string): void {
    const questionPatterns = [
      /\?\s*$/,
      /please (?:choose|select|specify)/i,
      /which (?:one|option)/i,
      /should I/i,
    ];

    for (const pattern of questionPatterns) {
      if (pattern.test(line)) {
        this._status = 'waiting';
        this.emit('question', {
          question: line,
        } as AgentQuestion);
        break;
      }
    }

    if (
      line.match(/pull request (?:created|opened)/i) ||
      line.match(/PR #\d+/i)
    ) {
      const prMatch = line.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
      if (prMatch) {
        this._status = 'complete';
        const durationMs = Date.now() - this.startTime;

        this.progressWriter.setResult({
          success: true,
          pullRequestUrl: prMatch[0],
          summary: 'Pull request created',
          filesChanged: [...this.filesChanged],
          durationMs,
        });

        this.cleanup();
        this.emit('complete', {
          pullRequestUrl: prMatch[0],
          summary: 'Task completed',
          filesChanged: [...this.filesChanged],
          durationMs,
        } as AgentResult);
      }
    }
  }

  public async sendInput(input: string): Promise<void> {
    if (!this.process?.stdin?.writable) {
      throw new Error('Agent process not accepting input');
    }

    this.process.stdin.write(input + '\n');
    this._status = 'running';
    await this.progressWriter.setStage('implementing');
    await this.progressWriter.addLogEntry(`📥 User input received`);
  }

  public async cancel(): Promise<void> {
    this._status = 'cancelled';

    await this.progressWriter.setResult({
      success: false,
      error: 'Cancelled by user',
      filesChanged: [...this.filesChanged],
      durationMs: Date.now() - this.startTime,
    });

    this.cleanup();

    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');

      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    }

    this.emit('cancelled');
  }

  private async handleClose(code: number | null): Promise<void> {
    if (this._status === 'cancelled') return;

    const durationMs = Date.now() - this.startTime;

    if (code === 0 && this._status !== 'complete') {
      this._status = 'complete';

      await this.progressWriter.setResult({
        success: true,
        summary: 'Agent completed (no PR created)',
        filesChanged: [...this.filesChanged],
        durationMs,
      });

      this.emit('complete', {
        pullRequestUrl: '',
        summary: 'Agent completed (no PR created)',
        filesChanged: [...this.filesChanged],
        durationMs,
      } as AgentResult);
    } else if (code !== 0) {
      this._status = 'error';

      await this.progressWriter.setResult({
        success: false,
        error: `Agent exited with code ${code}`,
        filesChanged: [...this.filesChanged],
        durationMs,
      });

      this.emit('error', new Error(`Agent exited with code ${code}`));
    }

    this.cleanup();
  }

  private async handleError(error: Error): Promise<void> {
    this._status = 'error';

    await this.progressWriter.setResult({
      success: false,
      error: error.message,
      filesChanged: [...this.filesChanged],
      durationMs: Date.now() - this.startTime,
    });

    this.cleanup();
    this.emit('error', error);
  }

  private async handleTimeout(): Promise<void> {
    this._status = 'error';

    await this.progressWriter.setResult({
      success: false,
      error: 'Agent timed out',
      filesChanged: [...this.filesChanged],
      durationMs: Date.now() - this.startTime,
    });

    this.cleanup();

    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
    }

    this.emit('error', new Error('Agent timed out'));
  }

  private async cleanup(): Promise<void> {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }

    if (this.worktreePath) {
      await this.removeWorktree();
    }

    // Note: We don't delete the progress file here - it's kept for history
    // The daemon will clean it up after the session ends
  }
}
