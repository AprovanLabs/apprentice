/**
 * Core compiler - compiles JSX/TSX to ESM
 */

import * as esbuild from 'esbuild-wasm';
import type {
  Compiler,
  CompilerOptions,
  CompileOptions,
  CompiledWidget,
  LoadedImage,
  Manifest,
  MountedWidget,
  MountOptions,
  ServiceProxy,
} from './types.js';
import { getImageRegistry } from './images/registry.js';
import { setCdnBaseUrl } from './images/loader.js';
import { cdnTransformPlugin } from './transforms/cdn.js';
import { createHttpServiceProxy } from './mount/bridge.js';
import { mountEmbedded, reloadEmbedded } from './mount/embedded.js';
import { mountIframe, reloadIframe } from './mount/iframe.js';

// Track esbuild initialization
let esbuildInitialized = false;
let esbuildInitPromise: Promise<void> | null = null;

/**
 * Initialize esbuild-wasm (must be called before using esbuild)
 */
async function initEsbuild(): Promise<void> {
  if (esbuildInitialized) return;
  if (esbuildInitPromise) return esbuildInitPromise;

  esbuildInitPromise = (async () => {
    try {
      await esbuild.initialize({
        wasmURL: 'https://unpkg.com/esbuild-wasm/esbuild.wasm',
      });
      esbuildInitialized = true;
    } catch (error) {
      // If already initialized, that's fine
      if (error instanceof Error && error.message.includes('initialized')) {
        esbuildInitialized = true;
      } else {
        throw error;
      }
    }
  })();

  return esbuildInitPromise;
}

/**
 * Generate a content hash for caching
 */
function hashContent(content: string): string {
  // Use Web Crypto API for browser compatibility
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  // Simple hash for cache key (not cryptographic)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + (data[i] ?? 0)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Create a compiler instance
 */
export async function createCompiler(
  options: CompilerOptions,
): Promise<Compiler> {
  // Initialize esbuild-wasm
  await initEsbuild();

  const { image: imageSpec, proxyUrl, cdnBaseUrl } = options;

  // Set CDN base URL if provided (for local development)
  if (cdnBaseUrl) {
    setCdnBaseUrl(cdnBaseUrl);
  }

  const registry = getImageRegistry();

  // Pre-load the image
  await registry.preload(imageSpec);
  const image = registry.get(imageSpec) || null;

  // Create service proxy
  const proxy: ServiceProxy = createHttpServiceProxy(proxyUrl);

  return new PatchworkCompiler(image, proxy, registry);
}

/**
 * Patchwork compiler implementation
 */
class PatchworkCompiler implements Compiler {
  private image: LoadedImage | null;
  private proxy: ServiceProxy;
  private registry: ReturnType<typeof getImageRegistry>;

  constructor(
    image: LoadedImage | null,
    proxy: ServiceProxy,
    registry: ReturnType<typeof getImageRegistry>,
  ) {
    this.image = image;
    this.proxy = proxy;
    this.registry = registry;
  }

  /**
   * Pre-load an image package
   */
  async preloadImage(spec: string): Promise<void> {
    await this.registry.preload(spec);
  }

  /**
   * Check if an image is loaded
   */
  isImageLoaded(spec: string): boolean {
    return this.registry.has(spec);
  }

  /**
   * Get the loaded image
   */
  getImage(): LoadedImage | null {
    return this.image;
  }

  /**
   * Compile widget source to ESM
   */
  async compile(
    source: string,
    manifest: Manifest,
    options: CompileOptions = {},
  ): Promise<CompiledWidget> {
    const { typescript = false } = options;

    // Determine loader based on options (JavaScript-first)
    const loader = typescript ? 'tsx' : 'jsx';

    // Get config from image (with proper typing)
    const esbuildConfig = this.image?.config.esbuild || {};
    const frameworkConfig = this.image?.config.framework || {};

    const target = esbuildConfig.target || 'es2020';
    const format = esbuildConfig.format || 'esm';

    // Collect all packages (image deps + manifest packages)
    const packages: Record<string, string> = {
      ...(this.image?.dependencies || {}),
      ...(manifest.packages || {}),
    };

    const globals = frameworkConfig.globals || {};

    // Get dependency version overrides from image config (e.g., { react: '18' })
    const deps = frameworkConfig.deps || {};

    // Get import path aliases from image config (e.g., { '@/components/ui/*': '@packagedcn/react' })
    const aliases = this.image?.config.aliases || {};

    // Build with esbuild using image-provided configuration
    const result = await esbuild.build({
      stdin: {
        contents: source,
        loader,
        sourcefile: `widget.${typescript ? 'tsx' : 'jsx'}`,
      },
      bundle: true,
      format,
      target,
      platform: manifest.platform === 'cli' ? 'node' : 'browser',
      // Use image-provided JSX settings, falling back to classic transform
      jsx: esbuildConfig.jsx || 'transform',
      jsxFactory: esbuildConfig.jsxFactory || 'React.createElement',
      jsxFragment: esbuildConfig.jsxFragment || 'React.Fragment',
      write: false,
      sourcemap: 'inline',
      plugins: [
        cdnTransformPlugin({
          packages,
          globals,
          deps,
          aliases,
        }),
      ],
    });

    const code = result.outputFiles?.[0]?.text || '';
    const hash = hashContent(code);

    return {
      code,
      hash,
      manifest,
    };
  }

  /**
   * Mount a compiled widget to the DOM
   */
  async mount(
    widget: CompiledWidget,
    options: MountOptions,
  ): Promise<MountedWidget> {
    if (options.mode === 'iframe') {
      return mountIframe(widget, options, this.image, this.proxy);
    }
    return mountEmbedded(widget, options, this.image, this.proxy);
  }

  /**
   * Unmount a mounted widget
   */
  unmount(mounted: MountedWidget): void {
    mounted.unmount();
  }

  /**
   * Hot reload a mounted widget
   */
  async reload(
    mounted: MountedWidget,
    source: string,
    manifest: Manifest,
  ): Promise<void> {
    // Compile new version
    const widget = await this.compile(source, manifest);

    // Reload based on mode
    if (mounted.mode === 'iframe') {
      await reloadIframe(mounted, widget, this.image, this.proxy);
    } else {
      await reloadEmbedded(mounted, widget, this.image, this.proxy);
    }
  }
}
