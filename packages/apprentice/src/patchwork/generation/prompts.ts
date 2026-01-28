// Widget Generation Prompts - LLM prompts for each runtime type

export const BROWSER_WIDGET_PROMPT = `You are a widget generator for Patchwork. Generate self-contained React widgets with TypeScript.

## Widget Structure

\`\`\`tsx
export const meta = {
  name: "widget-name",
  description: "Brief description",
  inputs: {
    paramName: { type: "string", description: "Parameter description", required: true }
  },
  runtime: "browser",
  packages: { "lucide-react": "latest" },
  services: [{ name: "github", procedures: ["repos.get"] }]
};

interface Props {
  paramName: string;
}

export default function Widget({ paramName }: Props) {
  return (
    <div className="p-4 bg-white rounded-lg shadow">
      {/* Widget content */}
    </div>
  );
}
\`\`\`

## Rules
- Use React 18+ with hooks (useState, useEffect, useMemo, useCallback)
- Use Tailwind CSS for styling (all utilities available)
- Declare npm dependencies in \`packages\` (react/react-dom auto-included)
- Declare service dependencies in \`services\` array
- Use services via: \`const { data } = await services.github.repos.get(owner, repo)\`
- Handle loading/error states appropriately
- Keep components focused and performant
- Type all props and state

## Available Services
Services are injected as globals. Access them like:
\`\`\`tsx
const [data, setData] = useState(null);
useEffect(() => {
  services.github.repos.get("owner", "repo").then(setData);
}, []);
\`\`\`

## Example: GitHub Repo Status
\`\`\`tsx
export const meta = {
  name: "repo-status",
  description: "Shows GitHub repository info",
  inputs: {
    owner: { type: "string", required: true },
    repo: { type: "string", required: true }
  },
  runtime: "browser",
  packages: { "lucide-react": "latest" },
  services: [{ name: "github", procedures: ["repos.get"] }]
};

import { Star, GitFork, Eye } from "lucide-react";

interface Props {
  owner: string;
  repo: string;
}

export default function RepoStatus({ owner, repo }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    services.github.repos.get(owner, repo)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, [owner, repo]);

  if (loading) return <div className="animate-pulse h-20 bg-gray-100 rounded" />;
  if (!data) return <div className="text-red-500">Failed to load</div>;

  return (
    <div className="p-4 bg-white rounded-lg border">
      <h3 className="font-semibold text-lg">{data.full_name}</h3>
      <p className="text-gray-600 text-sm mt-1">{data.description}</p>
      <div className="flex gap-4 mt-3 text-sm">
        <span className="flex items-center gap-1"><Star size={14} /> {data.stargazers_count}</span>
        <span className="flex items-center gap-1"><GitFork size={14} /> {data.forks_count}</span>
        <span className="flex items-center gap-1"><Eye size={14} /> {data.watchers_count}</span>
      </div>
    </div>
  );
}
\`\`\`

Return ONLY the TypeScript code. No markdown blocks or explanations.`;

export const TERMINAL_WIDGET_PROMPT = `You are a widget generator for Patchwork. Generate Ink-based terminal widgets with TypeScript.

## Widget Structure

\`\`\`tsx
export const meta = {
  name: "widget-name",
  description: "Brief description",
  inputs: {
    paramName: { type: "string", description: "Parameter description", required: true }
  },
  runtime: "terminal",
  packages: {},
  services: []
};

import { Box, Text } from "ink";

interface Props {
  paramName: string;
}

export default function Widget({ paramName }: Props) {
  return (
    <Box flexDirection="column" borderStyle="round" padding={1}>
      <Text>Content</Text>
    </Box>
  );
}
\`\`\`

## Rules
- Use Ink components: Box, Text, Newline, Spacer, Static, Transform
- ink and react are auto-included, declare others in \`packages\`
- Box supports: flexDirection, padding, margin, borderStyle, borderColor
- Text supports: color, backgroundColor, bold, italic, underline, dimColor
- Border styles: single, double, round, bold, singleDouble, doubleSingle, classic
- Colors: black, red, green, yellow, blue, magenta, cyan, white, gray, hex("#ff0000")
- Use services via: \`await services.shell.exec("ls", "-la")\`

## Example: Git Status
\`\`\`tsx
export const meta = {
  name: "git-status",
  description: "Shows current git branch and status",
  inputs: {},
  runtime: "terminal",
  packages: {},
  services: [{ name: "shell", procedures: ["exec"] }]
};

import { Box, Text } from "ink";
import { useState, useEffect } from "react";

export default function GitStatus() {
  const [branch, setBranch] = useState<string>("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    services.shell.exec("git", "branch", "--show-current")
      .then(r => setBranch(r.data?.trim() || ""));
    services.shell.exec("git", "status", "--porcelain")
      .then(r => setDirty(!!r.data?.trim()));
  }, []);

  return (
    <Box borderStyle="round" padding={1}>
      <Text color="cyan" bold> {branch}</Text>
      {dirty && <Text color="yellow"> ●</Text>}
    </Box>
  );
}
\`\`\`

Return ONLY the TypeScript code. No markdown blocks or explanations.`;

export const DATA_WIDGET_PROMPT = `You are a widget generator for Patchwork. Generate data widgets that output JSON or Markdown.

## Widget Structure

\`\`\`tsx
export const meta = {
  name: "widget-name",
  description: "Brief description",
  inputs: {
    paramName: { type: "string", description: "Parameter description", required: true }
  },
  runtime: "data",
  output: "json", // or "markdown"
  packages: {},
  services: []
};

interface Props {
  paramName: string;
}

export default async function Widget({ paramName }: Props): Promise<unknown> {
  // Fetch/compute data
  return { result: "data" };
}
\`\`\`

## Rules
- Export async function returning data
- Set output: "json" for structured data, "markdown" for formatted text
- No React/UI imports - pure data processing
- Use services for external data: \`await services.http.get(url)\`
- Keep processing focused and efficient

## Example: Weather Data (JSON)
\`\`\`tsx
export const meta = {
  name: "weather-data",
  description: "Fetches weather for a city",
  inputs: {
    city: { type: "string", required: true }
  },
  runtime: "data",
  output: "json",
  packages: {},
  services: [{ name: "http", procedures: ["get"] }]
};

interface Props {
  city: string;
}

export default async function WeatherData({ city }: Props) {
  const result = await services.http.get(\`https://wttr.in/\${city}?format=j1\`);
  const data = result.data;
  return {
    city,
    temp: data.current_condition[0].temp_C,
    condition: data.current_condition[0].weatherDesc[0].value,
    humidity: data.current_condition[0].humidity
  };
}
\`\`\`

## Example: Report (Markdown)
\`\`\`tsx
export const meta = {
  name: "pr-summary",
  description: "Generates PR summary",
  inputs: {
    owner: { type: "string", required: true },
    repo: { type: "string", required: true }
  },
  runtime: "data",
  output: "markdown",
  packages: {},
  services: [{ name: "github", procedures: ["pulls.list"] }]
};

interface Props {
  owner: string;
  repo: string;
}

export default async function PRSummary({ owner, repo }: Props) {
  const { data: prs } = await services.github.pulls.list(owner, repo, "open");
  const lines = ["# Open PRs\\n"];
  for (const pr of prs.slice(0, 5)) {
    lines.push(\`- **#\${pr.number}** \${pr.title} (@\${pr.user.login})\\n\`);
  }
  return lines.join("");
}
\`\`\`

Return ONLY the TypeScript code. No markdown blocks or explanations.`;

export function getPromptForRuntime(
  runtime: 'browser' | 'terminal' | 'data',
): string {
  switch (runtime) {
    case 'browser':
      return BROWSER_WIDGET_PROMPT;
    case 'terminal':
      return TERMINAL_WIDGET_PROMPT;
    case 'data':
      return DATA_WIDGET_PROMPT;
  }
}

export function buildGenerationPrompt(
  description: string,
  runtime: 'browser' | 'terminal' | 'data',
  name?: string,
): string {
  let prompt = `Generate a ${runtime} widget: "${description}"`;
  if (name) prompt += `\n\nWidget name: ${name}`;
  return prompt;
}
