import type { Environment } from './types';
import { environmentRegistry } from './registry';

const MINIMAL_CSS = `
/* Minimal reset */
*, *::before, *::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

img, picture, video, canvas, svg {
  display: block;
  max-width: 100%;
}

input, button, textarea, select {
  font: inherit;
}

p, h1, h2, h3, h4, h5, h6 {
  overflow-wrap: break-word;
}
`;

export const minimalEnvironment: Environment = {
  id: 'minimal@latest',
  name: 'Minimal React',
  description: 'Minimal React environment with no styling framework',
  version: '1.0.0',

  dependencies: {
    react: '^18.0.0',
    'react-dom': '^18.0.0',
  },

  baseCss: {
    content: MINIMAL_CSS,
    description: 'Minimal CSS reset',
  },

  themes: [
    {
      name: 'default',
      htmlClass: '',
      bodyClass: '',
    },
  ],

  defaultTheme: 'default',
};

export const bareEnvironment: Environment = {
  id: 'bare@latest',
  name: 'Bare React',
  description: 'Bare React environment with absolutely no styles',
  version: '1.0.0',

  dependencies: {
    react: '^18.0.0',
    'react-dom': '^18.0.0',
  },

  themes: [
    {
      name: 'default',
      htmlClass: '',
      bodyClass: '',
    },
  ],

  defaultTheme: 'default',
};

export function registerMinimalEnvironments(): void {
  environmentRegistry.register(minimalEnvironment);
  environmentRegistry.register(bareEnvironment);
}

registerMinimalEnvironments();
