import sharp from 'sharp';
import { SessionProgressFile, SessionStage } from './session.js';
import { ProgressConfig } from './types.js';

interface Theme {
  background: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  progressBg: string;
  accent: string;
  error: string;
  errorBg: string;
}

export class ProgressRenderer {
  private config: ProgressConfig;

  public constructor(config?: ProgressConfig) {
    this.config = config || {
      updateIntervalMs: 2000,
      fileMonitorIntervalMs: 1000,
      theme: 'dark',
      maxLogEntries: 50,
    };
  }

  /**
   * Render progress from SessionProgressFile format
   */
  public async render(
    progress: SessionProgressFile,
    elapsedSeconds: number,
  ): Promise<Buffer> {
    const svg = this.generateSVG(progress, elapsedSeconds);
    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  private generateSVG(
    progress: SessionProgressFile,
    elapsedSeconds: number,
  ): string {
    const theme = this.getTheme();
    const statusIcon = this.getStageIcon(progress.stage);
    const statusColor = this.getStageColor(progress.stage);
    const progressWidth = Math.round(
      (progress.tasks.estimatedPercentComplete / 100) * 280,
    );
    const timeFormatted = this.formatTime(elapsedSeconds);

    // Get latest 5 log entries for display (newest first)
    const recentLogs = progress.progressLogs.slice(-5).reverse();

    // Get files changed from result if available
    const filesChanged = progress.result?.filesChanged || [];

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="400" height="280" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${statusColor};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${this.lighten(
        statusColor,
        20,
      )};stop-opacity:1" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.3"/>
    </filter>
  </defs>
  
  <rect width="400" height="280" rx="12" fill="${
    theme.background
  }" filter="url(#shadow)"/>
  
  <text x="30" y="35" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="600" fill="${
    theme.text
  }">
    ${statusIcon}
  </text>
  
  <text x="60" y="35" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="600" fill="${
    theme.text
  }">
    ${this.getStageLabel(progress.stage)}
  </text>
  
  <text x="380" y="35" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="500" fill="${
    theme.textSecondary
  }" text-anchor="end">
    ${progress.tasks.completed} / ${progress.tasks.total || '?'} tasks
  </text>
  
  <rect x="20" y="55" width="280" height="12" rx="6" fill="${
    theme.progressBg
  }"/>
  
  <rect x="20" y="55" width="${progressWidth}" height="12" rx="6" fill="url(#progressGradient)"/>
  
  <text x="310" y="66" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="500" fill="${
    theme.textSecondary
  }">
    ${progress.tasks.estimatedPercentComplete}%
  </text>
  
  <text x="20" y="95" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="${
    theme.text
  }">
    ${this.truncate(progress.tasks.current || 'Processing...', 45)}
  </text>
  
  ${this.renderProgressLogs(recentLogs, theme)}
  
  ${this.renderFilesChanged(filesChanged, theme)}
  
  <text x="20" y="260" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="${
    theme.textMuted
  }">
    ${timeFormatted}
  </text>
  
  ${
    progress.result?.pullRequestUrl
      ? this.renderPRLink(progress.result.pullRequestUrl, theme)
      : ''
  }
  
  ${
    progress.result?.error ? this.renderError(progress.result.error, theme) : ''
  }
</svg>`;
  }

  private renderProgressLogs(
    logs: { timestamp: string; message: string }[],
    theme: Theme,
  ): string {
    if (logs.length === 0) return '';

    const startY = 120;
    const lineHeight = 16;

    return logs
      .map((log, i) => {
        const y = startY + i * lineHeight;
        const opacity = 1 - i * 0.15; // Fade older entries
        const truncated = this.truncate(log.message, 55);
        return `<text x="20" y="${y}" font-family="monospace" font-size="10" fill="${
          theme.textMuted
        }" opacity="${opacity}">${this.escapeXml(truncated)}</text>`;
      })
      .join('\n  ');
  }

  private renderFilesChanged(files: string[], theme: Theme): string {
    if (files.length === 0) return '';

    const displayFiles = files.slice(0, 3);
    const remaining = files.length - displayFiles.length;

    const y = 225;
    let text = `Files: ${displayFiles.map((f) => this.basename(f)).join(', ')}`;
    if (remaining > 0) {
      text += ` +${remaining} more`;
    }

    return `<text x="20" y="${y}" font-family="monospace" font-size="11" fill="${theme.textMuted}">${text}</text>`;
  }

  private renderPRLink(url: string, theme: Theme): string {
    const match = url.match(/\/pull\/(\d+)/);
    const prNum = match ? `#${match[1]}` : 'PR';

    return `
      <rect x="250" y="245" width="130" height="25" rx="4" fill="${theme.accent}"/>
      <text x="315" y="262" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="500" fill="white" text-anchor="middle">
        View ${prNum}
      </text>
    `;
  }

  private renderError(error: string, theme: Theme): string {
    return `
      <rect x="20" y="210" width="360" height="40" rx="4" fill="${
        theme.errorBg
      }"/>
      <text x="30" y="235" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="${
        theme.error
      }">
        ERROR: ${this.truncate(error, 50)}
      </text>
    `;
  }

  private getTheme(): Theme {
    if (this.config.theme === 'light') {
      return {
        background: '#ffffff',
        text: '#1a1a1a',
        textSecondary: '#4a4a4a',
        textMuted: '#8a8a8a',
        progressBg: '#e5e5e5',
        accent: '#2563eb',
        error: '#dc2626',
        errorBg: '#fef2f2',
      };
    }

    return {
      background: '#1e1e2e',
      text: '#cdd6f4',
      textSecondary: '#a6adc8',
      textMuted: '#6c7086',
      progressBg: '#313244',
      accent: '#89b4fa',
      error: '#f38ba8',
      errorBg: '#31263a',
    };
  }

  private getStageIcon(stage: SessionStage): string {
    switch (stage) {
      case 'starting':
        return '🚀';
      case 'analyzing':
        return '🔍';
      case 'planning':
        return '📋';
      case 'implementing':
        return '🔨';
      case 'testing':
        return '🧪';
      case 'reviewing':
        return '👀';
      case 'complete':
        return '✅';
      case 'error':
        return '❌';
      case 'waiting':
        return '❓';
      default:
        return '🔄';
    }
  }

  private getStageLabel(stage: SessionStage): string {
    switch (stage) {
      case 'starting':
        return 'Starting...';
      case 'analyzing':
        return 'Analyzing';
      case 'planning':
        return 'Planning';
      case 'implementing':
        return 'Implementing';
      case 'testing':
        return 'Testing';
      case 'reviewing':
        return 'Reviewing';
      case 'complete':
        return 'Complete!';
      case 'error':
        return 'Error';
      case 'waiting':
        return 'Input Needed';
      default:
        return 'Working';
    }
  }

  private getStageColor(stage: SessionStage): string {
    switch (stage) {
      case 'starting':
        return '#60a5fa';
      case 'analyzing':
        return '#a78bfa';
      case 'planning':
        return '#f472b6';
      case 'implementing':
        return '#34d399';
      case 'testing':
        return '#fbbf24';
      case 'reviewing':
        return '#38bdf8';
      case 'complete':
        return '#22c55e';
      case 'error':
        return '#ef4444';
      case 'waiting':
        return '#fbbf24';
      default:
        return '#6b7280';
    }
  }

  private lighten(hex: string, percent: number): string {
    const num = parseInt(hex.slice(1), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00ff) + amt);
    const B = Math.min(255, (num & 0x0000ff) + amt);
    return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }

  private truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 3) + '...';
  }

  private basename(path: string): string {
    return path.split('/').pop() || path;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
