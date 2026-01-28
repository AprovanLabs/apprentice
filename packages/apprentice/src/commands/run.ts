import chalk from 'chalk';
import { getAsset, findAssets } from '../assets';
import { executeAsset } from '../assets/executor';
import { insertEvent } from '../events';
import type { AssetId } from '../types';

/**
 * Find asset by ID or fuzzy key match
 */
async function findAssetToRun(idOrKey: string): Promise<AssetId | null> {
  // Try exact ID match first
  const exactAsset = await getAsset(idOrKey as AssetId);
  if (exactAsset) {
    return exactAsset.id;
  }

  // Try finding assets that match the key pattern
  const assets = await findAssets({ limit: 5 });
  const matches = assets.filter(
    (a) => a.key.includes(idOrKey) || a.id.includes(idOrKey),
  );

  if (matches.length === 0) {
    return null;
  }

  if (matches.length === 1) {
    return matches[0]!.id;
  }

  // Multiple matches - show them and ask user to be more specific
  console.log(chalk.yellow(`\nMultiple assets match '${idOrKey}':`));
  console.log();
  for (const asset of matches) {
    console.log(`  ${chalk.cyan(asset.id)} - ${chalk.dim(asset.key)}`);
  }
  console.log();
  console.log(chalk.dim('Please specify the exact asset ID'));
  return null;
}

/**
 * Execute an asset (script) with arguments
 */
export async function runCommand(
  idOrKey: string,
  args: string[],
): Promise<void> {
  const assetId = await findAssetToRun(idOrKey);

  if (!assetId) {
    console.error(chalk.red(`Asset not found: ${idOrKey}`));
    console.log();
    console.log(chalk.dim('Try:'));
    console.log(chalk.dim('  apr search --scope assets <query>'));
    process.exit(1);
  }

  const asset = await getAsset(assetId);
  if (!asset) {
    console.error(chalk.red(`Asset not found: ${assetId}`));
    process.exit(1);
  }

  // Check if executable
  const executableExtensions = ['.sh', '.bash', '.zsh', '.py', '.js', '.ts'];
  if (!executableExtensions.includes(asset.extension)) {
    console.error(
      chalk.red(`Asset '${assetId}' is not executable (${asset.extension})`),
    );
    console.log();
    console.log(chalk.dim('Executable extensions:'));
    console.log(chalk.dim(`  ${executableExtensions.join(', ')}`));
    process.exit(1);
  }

  console.log(chalk.dim(`Running: ${asset.id}`));
  console.log(chalk.dim(`Key: ${asset.key}`));
  if (args.length > 0) {
    console.log(chalk.dim(`Args: ${args.join(' ')}`));
  }
  console.log();

  const startTime = Date.now();

  try {
    const result = await executeAsset(assetId, {
      args,
      timeout: 300000, // 5 minutes
    });

    // Stream output
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    // Log execution event
    const duration = Date.now() - startTime;
    await insertEvent({
      message: `${asset.key} ${args.join(' ')}`.trim(),
      metadata: {
        shell: {
          exit_code: result.exitCode,
          duration_ms: duration,
        },
        asset: {
          id: assetId,
        },
      },
    });

    // Print summary
    console.log();
    const statusSymbol =
      result.exitCode === 0 ? chalk.green('✓') : chalk.red('✗');
    const statusText =
      result.exitCode === 0
        ? chalk.green('Success')
        : chalk.red(`Failed (exit code ${result.exitCode})`);
    console.log(
      `${statusSymbol} ${statusText} ${chalk.dim(
        `(${(duration / 1000).toFixed(1)}s)`,
      )}`,
    );

    process.exit(result.exitCode);
  } catch (err) {
    console.error(chalk.red(`\nExecution failed: ${err}`));
    process.exit(1);
  }
}
