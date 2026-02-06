/**
 * Iframe mount mode - mounts widgets in sandboxed iframes
 *
 * For untrusted widgets that need isolation.
 */

import type {
  CompiledWidget,
  LoadedImage,
  MountedWidget,
  MountOptions,
  ServiceProxy,
} from '../types.js';
import { ParentBridge, generateIframeBridgeScript } from './bridge.js';
import { generateImportMap } from '../transforms/cdn.js';

let mountCounter = 0;

// Shared bridge for all iframes
let sharedBridge: ParentBridge | null = null;

/**
 * Get or create the shared parent bridge
 */
function getParentBridge(proxy: ServiceProxy): ParentBridge {
  if (!sharedBridge) {
    sharedBridge = new ParentBridge(proxy);
  }
  return sharedBridge;
}

/**
 * Generate a unique mount ID
 */
function generateMountId(): string {
  return `pw-iframe-${Date.now()}-${++mountCounter}`;
}

/**
 * Default sandbox attributes for iframes
 */
const DEFAULT_SANDBOX = [
  'allow-scripts',
  'allow-same-origin', // Needed for module imports
];

/**
 * Generate the HTML content for the iframe
 */
function generateIframeContent(
  widget: CompiledWidget,
  image: LoadedImage | null,
  inputs: Record<string, unknown>,
): string {
  const services = widget.manifest.services || [];
  const bridgeScript = generateIframeBridgeScript(services);

  // Generate import map from image dependencies and manifest packages
  const packages = {
    ...(image?.dependencies || {}),
    ...(widget.manifest.packages || {}),
  };
  const importMap = generateImportMap(packages);

  // CSS from image
  const css = image?.css || '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; }
    ${css}
  </style>
  <script type="importmap">
    ${JSON.stringify({ imports: importMap }, null, 2)}
  </script>
</head>
<body>
  <div id="root"></div>

  <!-- Service Bridge -->
  <script>
    ${bridgeScript}
  </script>

  <!-- Widget Inputs -->
  <script>
    window.__PATCHWORK_INPUTS__ = ${JSON.stringify(inputs)};
  </script>

  <!-- Widget Code -->
  <script type="module">
    ${widget.code}
  </script>
</body>
</html>`;
}

/**
 * Mount a widget in iframe mode (sandboxed)
 */
export async function mountIframe(
  widget: CompiledWidget,
  options: MountOptions,
  image: LoadedImage | null,
  proxy: ServiceProxy,
): Promise<MountedWidget> {
  const { target, sandbox = DEFAULT_SANDBOX, inputs = {} } = options;
  const mountId = generateMountId();

  // Create iframe
  const iframe = document.createElement('iframe');
  iframe.id = mountId;
  iframe.className = 'patchwork-widget patchwork-iframe';
  iframe.style.cssText = 'width: 100%; height: 100%; border: none;';
  iframe.sandbox.add(...sandbox);

  // Register with bridge before loading content
  const bridge = getParentBridge(proxy);
  bridge.registerIframe(iframe);

  // Generate and set iframe content
  const content = generateIframeContent(widget, image, inputs);
  iframe.srcdoc = content;

  // Append to target
  target.appendChild(iframe);

  // Wait for iframe to load
  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve();
  });

  // Create unmount function
  const unmount = () => {
    bridge.unregisterIframe(iframe);
    iframe.remove();
  };

  return {
    id: mountId,
    widget,
    mode: 'iframe',
    target,
    iframe,
    unmount,
  };
}

/**
 * Hot reload an iframe widget
 */
export async function reloadIframe(
  mounted: MountedWidget,
  widget: CompiledWidget,
  image: LoadedImage | null,
  proxy: ServiceProxy,
): Promise<MountedWidget> {
  // Unmount existing
  mounted.unmount();

  // Remount with new widget
  return mountIframe(
    widget,
    {
      target: mounted.target,
      mode: 'iframe',
    },
    image,
    proxy,
  );
}

/**
 * Dispose the shared bridge (call on app shutdown)
 */
export function disposeIframeBridge(): void {
  if (sharedBridge) {
    sharedBridge.dispose();
    sharedBridge = null;
  }
}
