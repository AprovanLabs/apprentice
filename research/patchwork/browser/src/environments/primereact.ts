import type { Environment } from './types';
import { environmentRegistry } from './registry';

const PRIMEREACT_BASE_CSS = `
/* PrimeReact base styles */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-family);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Ensure PrimeReact dialogs render correctly */
.p-component-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
`;

export const primereactEnvironment: Environment = {
  id: 'primereact@10',
  name: 'PrimeReact',
  description:
    'PrimeReact component library with PrimeFlex utilities and PrimeIcons',
  version: '1.0.0',

  dependencies: {
    // Core React
    react: '^18.0.0',
    'react-dom': '^18.0.0',

    // PrimeReact
    primereact: '^10.0.0',

    // React Transition Group (required by PrimeReact)
    'react-transition-group': '^4.4.0',
  },

  baseCss: {
    content: PRIMEREACT_BASE_CSS,
    description: 'PrimeReact base styles and resets',
  },

  themes: [
    {
      name: 'lara-light-indigo',
      htmlClass: '',
      bodyClass: '',
    },
    {
      name: 'lara-dark-indigo',
      htmlClass: 'p-dark',
      bodyClass: '',
    },
    {
      name: 'lara-light-blue',
      htmlClass: '',
      bodyClass: '',
    },
    {
      name: 'lara-dark-blue',
      htmlClass: 'p-dark',
      bodyClass: '',
    },
    {
      name: 'soho-light',
      htmlClass: '',
      bodyClass: '',
    },
    {
      name: 'soho-dark',
      htmlClass: 'p-dark',
      bodyClass: '',
    },
  ],

  defaultTheme: 'lara-light-indigo',

  cdnImports: [
    // PrimeReact theme (default to lara-light-indigo)
    {
      type: 'stylesheet',
      url: 'https://unpkg.com/primereact@10/resources/themes/lara-light-indigo/theme.css',
    },
    // PrimeReact core styles
    {
      type: 'stylesheet',
      url: 'https://unpkg.com/primereact@10/resources/primereact.min.css',
    },
    // PrimeFlex CSS utilities
    {
      type: 'stylesheet',
      url: 'https://unpkg.com/primeflex@3/primeflex.min.css',
    },
    // PrimeIcons
    {
      type: 'stylesheet',
      url: 'https://unpkg.com/primeicons@6/primeicons.css',
    },
  ],
};

export const primereactMinimalEnvironment: Environment = {
  id: 'primereact-minimal@10',
  name: 'PrimeReact (Minimal)',
  description: 'Minimal PrimeReact setup without PrimeFlex',
  version: '1.0.0',

  dependencies: {
    react: '^18.0.0',
    'react-dom': '^18.0.0',
    primereact: '^10.0.0',
    'react-transition-group': '^4.4.0',
  },

  baseCss: {
    content: PRIMEREACT_BASE_CSS,
    description: 'PrimeReact base styles',
  },

  themes: primereactEnvironment.themes,
  defaultTheme: 'lara-light-indigo',

  cdnImports: [
    {
      type: 'stylesheet',
      url: 'https://unpkg.com/primereact@10/resources/themes/lara-light-indigo/theme.css',
    },
    {
      type: 'stylesheet',
      url: 'https://unpkg.com/primereact@10/resources/primereact.min.css',
    },
    {
      type: 'stylesheet',
      url: 'https://unpkg.com/primeicons@6/primeicons.css',
    },
  ],
};

export function registerPrimereactEnvironments(): void {
  environmentRegistry.register(primereactEnvironment);
  environmentRegistry.register(primereactMinimalEnvironment);
}

registerPrimereactEnvironments();
