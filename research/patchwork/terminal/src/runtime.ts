import { render, type Instance } from 'ink';
import React from 'react';
import { compileWidget, type CompilerOptions } from './compiler.js';
import type { Services, WidgetContext } from './types.js';

export interface RuntimeOptions extends CompilerOptions {
  services?: Services;
  exitOnError?: boolean;
}

export interface WidgetInstance {
  instance: Instance;
  unmount: () => void;
  waitUntilExit: () => Promise<void>;
  rerender: (element: React.ReactElement) => void;
}

const globalServices: Services = {};

export function registerService(
  name: string,
  methods: Record<string, (...args: unknown[]) => Promise<unknown>>,
): void {
  globalServices[name] = methods;
}

export function getServices(): Services {
  return globalServices;
}

async function evaluateWidget(
  code: string,
  services: Services,
): Promise<React.ComponentType<{ services?: Services }>> {
  const dataUri = `data:text/javascript;base64,${Buffer.from(code).toString(
    'base64',
  )}`;
  const module = await import(dataUri);
  const Component =
    module.default ||
    module.Widget ||
    Object.values(module).find(
      (v): v is React.ComponentType => typeof v === 'function',
    );

  if (!Component) {
    throw new Error('No default export or Widget component found in widget');
  }

  return Component;
}

export async function runWidget(
  source: string,
  options: RuntimeOptions = {},
): Promise<WidgetInstance> {
  const {
    services = globalServices,
    exitOnError = true,
    ...compilerOptions
  } = options;
  const result = await compileWidget(source, compilerOptions);

  if (result.errors?.length) {
    throw new Error(`Compilation failed: ${result.errors.join(', ')}`);
  }

  const Component = await evaluateWidget(result.code, services);
  const element = React.createElement(Component, { services });
  const instance = render(element, { exitOnCtrlC: true });

  return {
    instance,
    unmount: () => instance.unmount(),
    waitUntilExit: () => instance.waitUntilExit(),
    rerender: (el) => instance.rerender(el),
  };
}

export async function runWidgetOnce(
  source: string,
  options: RuntimeOptions = {},
): Promise<void> {
  const widget = await runWidget(source, options);
  await widget.waitUntilExit();
}

export interface MultiInstanceManager {
  instances: Map<string, WidgetInstance>;
  run: (
    id: string,
    source: string,
    options?: RuntimeOptions,
  ) => Promise<WidgetInstance>;
  stop: (id: string) => void;
  stopAll: () => void;
}

export function createMultiInstanceManager(): MultiInstanceManager {
  const instances = new Map<string, WidgetInstance>();

  return {
    instances,
    async run(id: string, source: string, options: RuntimeOptions = {}) {
      if (instances.has(id)) {
        instances.get(id)!.unmount();
      }
      const instance = await runWidget(source, options);
      instances.set(id, instance);
      return instance;
    },
    stop(id: string) {
      const instance = instances.get(id);
      if (instance) {
        instance.unmount();
        instances.delete(id);
      }
    },
    stopAll() {
      for (const [id, instance] of instances) {
        instance.unmount();
        instances.delete(id);
      }
    },
  };
}
