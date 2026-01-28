export * from './types';
export {
  environmentRegistry,
  resolveEnvironment,
  getEnvironmentCss,
  getEnvironmentThemeClasses,
  getEnvironmentHeadContent,
  mergeEnvironmentDependencies,
} from './registry';

export {
  shadcnEnvironment,
  shadcnMinimalEnvironment,
  registerShadcnEnvironments,
} from './shadcn';

export {
  primereactEnvironment,
  primereactMinimalEnvironment,
  registerPrimereactEnvironments,
} from './primereact';

export {
  minimalEnvironment,
  bareEnvironment,
  registerMinimalEnvironments,
} from './minimal';

export function registerAllEnvironments(): void {
  // Called automatically when importing; can be called after registry.clear()
}
