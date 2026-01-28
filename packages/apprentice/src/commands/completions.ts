// Completions command - generate smart completions for shell

import { getDb } from '../db';

/**
 * Get past arguments used with a specific script
 */
export async function getScriptArgs(
  scriptName: string,
  limit = 10,
): Promise<string[][]> {
  const db = getDb();

  // Find commands that ran this script
  const result = await db.execute({
    sql: `SELECT command FROM commands 
          WHERE command LIKE ? OR command LIKE ?
          ORDER BY timestamp DESC
          LIMIT ?`,
    args: [`apr run ${scriptName}%`, `%/${scriptName} %`, limit],
  });

  const argSets: string[][] = [];
  const seen = new Set<string>();

  for (const row of result.rows) {
    const command = row.command as string;
    // Extract args after the script name
    const match = command.match(
      new RegExp(`(?:apr run ${scriptName}|${scriptName})\\s+(.+)$`),
    );
    if (match) {
      const args = match[1]!.trim();
      if (args && !seen.has(args)) {
        seen.add(args);
        argSets.push(args.split(/\s+/));
      }
    }
  }

  return argSets;
}

/**
 * Get script names with their descriptions
 */
export async function getScriptCompletions(): Promise<
  Array<{
    name: string;
    description: string;
  }>
> {
  const db = getDb();

  const result = await db.execute(
    'SELECT name, description FROM scripts ORDER BY name',
  );

  return result.rows.map((row) => ({
    name: row.name as string,
    description: (row.description as string | null) ?? '',
  }));
}

/**
 * Get completions for apr run command arguments
 */
export async function getRunCompletions(
  scriptName: string | null,
  argPrefix: string,
): Promise<string[]> {
  if (!scriptName) {
    // Return script names
    const scripts = await getScriptCompletions();
    return scripts.map((s) => s.name);
  }

  // Return past args for this script
  const pastArgs = await getScriptArgs(scriptName);
  const completions: string[] = [];

  for (const args of pastArgs) {
    const argStr = args.join(' ');
    if (!argPrefix || argStr.startsWith(argPrefix)) {
      completions.push(argStr);
    }
  }

  return completions;
}

/**
 * Main completions command - outputs completions for shell consumption
 */
export async function completionsCommand(options: {
  type: 'scripts' | 'script-args';
  script?: string;
  prefix?: string;
  cwd?: string;
  branch?: string;
}): Promise<void> {
  const { type, script, prefix = '' } = options;

  switch (type) {
    case 'scripts': {
      const scripts = await getScriptCompletions();
      for (const s of scripts) {
        if (!prefix || s.name.startsWith(prefix)) {
          // Zsh _describe format: "name:description" with escaped colons in description
          const desc = s.description.replace(/:/g, '\\:');
          console.log(`${s.name}:${desc}`);
        }
      }
      break;
    }

    case 'script-args': {
      if (!script) {
        console.error('Script name required for script-args');
        process.exit(1);
      }
      const args = await getRunCompletions(script, prefix);
      for (const arg of args) {
        console.log(arg);
      }
      break;
    }
  }
}
