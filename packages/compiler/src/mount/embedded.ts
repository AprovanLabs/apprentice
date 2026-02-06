/**
 * Embedded mount mode - mounts widgets directly in the DOM
 *
 * For trusted widgets that need full window access.
 */

import type {
  CompiledWidget,
  LoadedImage,
  MountedWidget,
  MountOptions,
  ServiceProxy,
} from '../types.js';
import {
  generateNamespaceGlobals,
  injectNamespaceGlobals,
  removeNamespaceGlobals,
  extractNamespaces,
} from './bridge.js';

let mountCounter = 0;

/**
 * Generate a unique mount ID
 */
function generateMountId(): string {
  return `pw-mount-${Date.now()}-${++mountCounter}`;
}

/**
 * Mount a widget in embedded mode (direct DOM injection)
 */
export async function mountEmbedded(
  widget: CompiledWidget,
  options: MountOptions,
  image: LoadedImage | null,
  proxy: ServiceProxy,
): Promise<MountedWidget> {
  const { target, inputs = {} } = options;
  const mountId = generateMountId();

  // Create container
  const container = document.createElement('div');
  container.id = mountId;
  container.className = 'patchwork-widget patchwork-embedded';
  target.appendChild(container);

  // Run image setup if available
  if (image?.setup) {
    await image.setup(container);
  }

  // Inject CSS if available
  if (image?.css) {
    const style = document.createElement('style');
    style.id = `${mountId}-style`;
    style.textContent = image.css;
    document.head.appendChild(style);
  }

  // Generate and inject service namespace globals
  const services = widget.manifest.services || [];
  const namespaceNames = extractNamespaces(services);
  const namespaces = generateNamespaceGlobals(services, proxy);
  injectNamespaceGlobals(window, namespaces);

  // Get framework config from image
  const frameworkConfig = image?.config?.framework || {};
  const preloadUrls = frameworkConfig.preload || [];
  const globalMapping = frameworkConfig.globals || {};

  // Pre-load framework modules from image config
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const preloadedModules: any[] = await Promise.all(
    preloadUrls.map(
      (url: string) => import(/* webpackIgnore: true */ /* @vite-ignore */ url),
    ),
  );

  // Set framework globals on window based on image config
  const win = window as unknown as Record<string, unknown>;
  const globalNames = Object.values(globalMapping) as string[];

  // Map preloaded modules to their global names
  // Convention: preload order matches globals order (react -> React, react-dom -> ReactDOM)
  preloadedModules.forEach((mod, index) => {
    if (globalNames[index]) {
      win[globalNames[index]] = mod;
    }
  });

  // Create a blob with the widget code
  const blob = new Blob([widget.code], { type: 'application/javascript' });
  const scriptUrl = URL.createObjectURL(blob);

  // Import the module
  let moduleCleanup: (() => void) | undefined;

  // Get React references from globals for rendering
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const React = win.React as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ReactDOMClient = win.ReactDOM as any;

  try {
    const module = await import(/* webpackIgnore: true */ scriptUrl);

    // Look for default export (component) or render function
    if (typeof module.default === 'function') {
      // React component - need to render it
      const Component = module.default;

      if (React && ReactDOMClient && 'createRoot' in ReactDOMClient) {
        const root = ReactDOMClient.createRoot(container);
        const element = React.createElement(Component, inputs);
        root.render(element);
        moduleCleanup = () => root.unmount();
      } else {
        // Fallback: just call the component as a function
        const result = Component(inputs);
        if (result instanceof HTMLElement) {
          container.appendChild(result);
        } else if (typeof result === 'string') {
          container.innerHTML = result;
        }
      }
    } else if (typeof module.render === 'function') {
      // Custom render function
      const result = await module.render(container, inputs);
      if (typeof result === 'function') {
        moduleCleanup = result;
      }
    } else if (typeof module.mount === 'function') {
      // Custom mount function
      const result = await module.mount(container, inputs);
      if (typeof result === 'function') {
        moduleCleanup = result;
      }
    }
  } finally {
    URL.revokeObjectURL(scriptUrl);
  }

  // Create unmount function
  const unmount = () => {
    // Call module cleanup if available
    if (moduleCleanup) {
      moduleCleanup();
    }

    // Remove namespace globals
    removeNamespaceGlobals(window, namespaceNames);

    // Remove style
    const style = document.getElementById(`${mountId}-style`);
    if (style) {
      style.remove();
    }

    // Remove container
    container.remove();
  };

  return {
    id: mountId,
    widget,
    mode: 'embedded',
    target,
    unmount,
  };
}

/**
 * Hot reload an embedded widget
 */
export async function reloadEmbedded(
  mounted: MountedWidget,
  widget: CompiledWidget,
  image: LoadedImage | null,
  proxy: ServiceProxy,
): Promise<MountedWidget> {
  // Unmount existing
  mounted.unmount();

  // Remount with new widget
  return mountEmbedded(
    widget,
    { target: mounted.target, mode: 'embedded' },
    image,
    proxy,
  );
}
