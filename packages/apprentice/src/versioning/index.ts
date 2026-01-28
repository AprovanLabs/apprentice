export * from './types';
export * from './registry';
export * from './sync';
export * from './eviction';
export { createGitProvider } from './providers/git';

import { registerProvider } from './registry';
import { createGitProvider } from './providers/git';

registerProvider('git', createGitProvider);
