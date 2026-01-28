import { loadUserConfig } from '../config.js';
import { DaemonConfig } from './types.js';

const DEFAULT_CONFIG: DaemonConfig = {
  agent: {
    type: 'cursor',
    timeoutMinutes: 30,
    maxConcurrentSessions: 3,
  },
  progress: {
    updateIntervalMs: 7000,
    fileMonitorIntervalMs: 1000,
    theme: 'dark',
    maxLogEntries: 50,
  },
};

export async function loadConfig(): Promise<DaemonConfig> {
  const userConfig = loadUserConfig();

  const config: DaemonConfig = {
    agent: {
      ...DEFAULT_CONFIG.agent,
      ...userConfig.daemon?.agent,
    },
    progress: {
      ...DEFAULT_CONFIG.progress,
      ...userConfig.daemon?.progress,
    },
  };

  // Discord: check config first, then environment variables
  const discordToken =
    userConfig.daemon?.discord?.token || process.env.DISCORD_BOT_TOKEN;
  if (discordToken) {
    config.discord = {
      enabled: userConfig.daemon?.discord?.enabled !== false,
      token: discordToken,
      triggers: userConfig.daemon?.discord?.triggers || ['dm', 'mention'],
      applicationId:
        userConfig.daemon?.discord?.applicationId ||
        process.env.DISCORD_APPLICATION_ID,
      publicKey:
        userConfig.daemon?.discord?.publicKey || process.env.DISCORD_PUBLIC_KEY,
    };
  }

  // Slack: check config first, then environment variables
  const slackAppToken =
    userConfig.daemon?.slack?.appToken || process.env.SLACK_APP_TOKEN;
  const slackBotToken =
    userConfig.daemon?.slack?.botToken || process.env.SLACK_BOT_TOKEN;
  if (slackAppToken && slackBotToken) {
    config.slack = {
      enabled: userConfig.daemon?.slack?.enabled !== false,
      appToken: slackAppToken,
      botToken: slackBotToken,
      triggers: userConfig.daemon?.slack?.triggers || ['dm', 'mention'],
    };
  }

  // Teams: check config first, then environment variables
  const teamsAppId =
    userConfig.daemon?.teams?.appId || process.env.TEAMS_APP_ID;
  const teamsAppPassword =
    userConfig.daemon?.teams?.appPassword || process.env.TEAMS_APP_PASSWORD;
  if (teamsAppId && teamsAppPassword) {
    config.teams = {
      enabled: userConfig.daemon?.teams?.enabled !== false,
      appId: teamsAppId,
      appPassword: teamsAppPassword,
      triggers: userConfig.daemon?.teams?.triggers || ['dm', 'mention'],
    };
  }

  return config;
}
