/**
 * GitHub Copilot Proxy
 *
 * SDK for using GitHub Copilot as an OpenAI-compatible API backend.
 *
 * @example
 * ```typescript
 * import { CopilotClient, connect } from '@aprovan/copilot-proxy';
 *
 * // First time: authenticate
 * const { userCode, verificationUrl, waitForAuth } = await connect();
 * console.log(`Go to ${verificationUrl} and enter: ${userCode}`);
 * await waitForAuth();
 *
 * // Use the client
 * const client = new CopilotClient();
 * const response = await client.createChatCompletion({
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */

// Client
export {
  CopilotClient,
  createFetch,
  getOpenAICompatibleTransport,
  COPILOT_API_BASE,
} from './client.js';

// Authentication
export {
  connect,
  disconnect,
  isConfigured,
  getStatus,
  getOAuthToken,
  getSessionToken,
  readToken,
  writeToken,
  deleteToken,
  clearSessionCache,
  COPILOT_HEADERS,
} from './auth.js';

// Types
export type {
  StoredToken,
  SessionToken,
  ConnectionStatus,
  DeviceFlowResult,
  CopilotModel,
  OpenAICompatibleTransport,
  CopilotClientOptions,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ChatCompletionChoice,
  ModelInfo,
  ModelsResponse,
} from './types.js';
