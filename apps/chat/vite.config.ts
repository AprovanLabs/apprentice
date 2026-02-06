import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { createMCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import { streamText, convertToModelMessages, UIMessage, stepCountIs } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const COPILOT_PROXY_URL = 'http://127.0.0.1:6433/v1';

// Local package overrides for development
// Maps package names to their local paths
const LOCAL_PACKAGES: Record<string, string> = {
  '@aprovan/patchwork-shadcn': path.resolve(
    __dirname,
    '../../packages/images/shadcn',
  ),
};

const PATCHWORK_PROMPT = `
You are a friendly assistant! When responding to the user, you _must_ respond with JSX files!

Look at 'patchwork.compilers' to see what specific runtime components and libraries are supported. (e.g. '['@aprovan/patchwork-shadcn' supports React, Tailwind, & ShadCN components). If there are no compilers, respond as you normally would. If compilers are available, ALWAYS respond with a component following [Component Generation](#component-generation).

## Component Generation

Respond as simple text, encoding a single JSX file that would correctly compile, assuming the provided dependencies are bundled from the runtime.

### Requirements
- DO think heavily about correctness of code and syntax
- DO keep things simple and self-contained

### Visual Design Guidelines
Create professional, polished interfaces that present information **spatially** rather than as vertical lists:
- Use **cards, grids, and flexbox layouts** to organize related data into visual groups
- Leverage **icons** (from lucide-react) alongside text to communicate meaning at a glance
- Apply **visual hierarchy** through typography scale, weight, and color contrast
- Use **whitespace strategically** to create breathing room and separation
- Prefer **horizontal arrangements** where data fits naturally (e.g., stats in a row, badges inline)
- Group related metrics into **compact visual clusters** rather than separate line items
- Use **subtle backgrounds, borders, and shadows** to define sections without heavy dividers

### Anti-patterns to Avoid
- ❌ Bulleted or numbered lists of key-value pairs
- ❌ Vertical stacks where horizontal layouts would fit
- ❌ Plain text labels without visual treatment
- ❌ Uniform styling that doesn't distinguish primary from secondary information
`;

// What's the weather in Paris, France like?

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'api',
      async configureServer(server) {
        const apprenticeMcpClient = await createMCPClient({
          transport: new Experimental_StdioMCPTransport({
            command: 'node',
            args: [
              '/Users/jsampson/Documents/JacobSampson/apprentice/packages/apprentice/dist/mcp-server.js',
            ],
          }),
        });
        const weatherMcpClient = await createMCPClient({
          transport: new Experimental_StdioMCPTransport({
            command: 'npx',
            args: ['-y', '@dangahagan/weather-mcp@latest'],
          }),
        });

        // Serve local packages at /_local-packages/<package-name>/...
        server.middlewares.use('/_local-packages', (req, res, next) => {
          const url = req.url || '';

          // Parse the package name from URL (handles scoped packages like @scope/name)
          const match = url.match(/^\/@([^/]+)\/([^/@]+)(.*)$/);
          if (!match) {
            return next();
          }

          const [, scope, name, restPath] = match;
          const packageName = `@${scope}/${name}`;
          const localPath = LOCAL_PACKAGES[packageName];

          if (!localPath) {
            res.writeHead(404);
            res.end(`Package ${packageName} not found in local overrides`);
            return;
          }

          // Determine what file to serve
          const rest = restPath || '';
          let filePath: string;

          if (rest === '/package.json') {
            // Explicitly requesting package.json
            filePath = path.join(localPath, 'package.json');
          } else if (rest === '' || rest === '/') {
            // Module import - serve the main entry point from dist
            const pkgJson = JSON.parse(
              fs.readFileSync(path.join(localPath, 'package.json'), 'utf-8'),
            );
            const mainEntry = pkgJson.main || 'dist/index.js';
            filePath = path.join(localPath, mainEntry);
          } else {
            // Specific file requested
            filePath = path.join(
              localPath,
              rest.startsWith('/') ? rest.slice(1) : rest,
            );
          }

          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const ext = path.extname(filePath);
            const contentType =
              ext === '.json'
                ? 'application/json'
                : ext === '.js'
                ? 'application/javascript'
                : ext === '.ts'
                ? 'application/typescript'
                : 'text/plain';
            res.setHeader('Content-Type', contentType);
            res.writeHead(200);
            res.end(content);
          } catch (err) {
            res.writeHead(404);
            res.end(`File not found: ${filePath}`);
          }
        });

        server.middlewares.use('/api/chat', async (req, res) => {
          if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
          }

          if (req.method !== 'POST') {
            res.writeHead(405);
            res.end();
            return;
          }

          let body = '';
          req.on('data', (chunk) => (body += chunk));
          req.on('end', async () => {
            const {
              messages,
              metadata,
            }: {
              messages: UIMessage[];
              metadata?: { patchwork: { compilers: string[] } };
            } = JSON.parse(body);

            // Ensure all messages have parts array
            const normalizedMessages = messages.map((msg) => ({
              ...msg,
              parts: msg.parts ?? [{ type: 'text' as const, text: '' }],
            }));

            const provider = createOpenAICompatible({
              name: 'copilot-proxy',
              baseURL: COPILOT_PROXY_URL,
            });

            const result = streamText({
              model: provider('gpt-4o') as any,
              system: `---
patchwork:
  compilers: ${
    (metadata?.patchwork?.compilers ?? []).join(',') ?? '[]'
  }              
---

${PATCHWORK_PROMPT}`,
              messages: await convertToModelMessages(normalizedMessages),
              stopWhen: stepCountIs(5),
              tools: {
                ...(await weatherMcpClient.tools()),
                ...(await apprenticeMcpClient.tools()),
              },
            });
            const response = result.toUIMessageStreamResponse();
            response.headers.forEach((value: string, key: string) =>
              res.setHeader(key, value),
            );

            if (!response.body) {
              res.end();
              return;
            }

            const reader = response.body.getReader();
            const pump = async () => {
              const { done, value } = await reader.read();
              if (done) {
                res.end();
                return;
              }
              res.write(value);
              await pump();
            };
            await pump();
          });
        });
      },
    },
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
