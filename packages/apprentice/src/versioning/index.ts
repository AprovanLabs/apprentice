export * from './types';
export * from './registry';
export * from './sync';
export * from './eviction';
export { createGitProvider } from './providers/git';

import { createGitProvider } from './providers/git';
import { registerProvider } from './registry';

registerProvider('git', createGitProvider);
