import type { Environment } from './types';
import { environmentRegistry } from './registry';

const SHADCN_CSS_VARIABLES = `
/* ShadCN CSS Variables - Light Theme */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
  --radius: 0.5rem;
}

/* ShadCN CSS Variables - Dark Theme */
.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --card: 222.2 84% 4.9%;
  --card-foreground: 210 40% 98%;
  --popover: 222.2 84% 4.9%;
  --popover-foreground: 210 40% 98%;
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;
  --secondary: 217.2 32.6% 17.5%;
  --secondary-foreground: 210 40% 98%;
  --muted: 217.2 32.6% 17.5%;
  --muted-foreground: 215 20.2% 65.1%;
  --accent: 217.2 32.6% 17.5%;
  --accent-foreground: 210 40% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 210 40% 98%;
  --border: 217.2 32.6% 17.5%;
  --input: 217.2 32.6% 17.5%;
  --ring: 212.7 26.8% 83.9%;
}

/* Base body styles */
body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

/* Smooth transitions for theme changes */
* {
  transition: background-color 0.2s ease-in-out, color 0.2s ease-in-out, border-color 0.2s ease-in-out;
}
`;

export const shadcnEnvironment: Environment = {
  id: 'shadcn@latest',
  name: 'ShadCN/UI',
  description:
    'ShadCN/UI component library with Tailwind CSS, Radix UI primitives, and utility libraries',
  version: '1.0.0',

  dependencies: {
    // Core React
    react: '^18.0.0',
    'react-dom': '^18.0.0',

    // Radix UI Primitives (commonly used in ShadCN)
    '@radix-ui/react-slot': 'latest',
    '@radix-ui/react-dialog': 'latest',
    '@radix-ui/react-dropdown-menu': 'latest',
    '@radix-ui/react-popover': 'latest',
    '@radix-ui/react-tooltip': 'latest',
    '@radix-ui/react-select': 'latest',
    '@radix-ui/react-checkbox': 'latest',
    '@radix-ui/react-switch': 'latest',
    '@radix-ui/react-tabs': 'latest',
    '@radix-ui/react-accordion': 'latest',
    '@radix-ui/react-alert-dialog': 'latest',
    '@radix-ui/react-avatar': 'latest',
    '@radix-ui/react-label': 'latest',
    '@radix-ui/react-scroll-area': 'latest',
    '@radix-ui/react-separator': 'latest',
    '@radix-ui/react-slider': 'latest',
    '@radix-ui/react-toast': 'latest',

    // Utility libraries
    clsx: 'latest',
    'tailwind-merge': 'latest',
    'class-variance-authority': 'latest',

    // Icons
    'lucide-react': 'latest',
  },

  baseCss: {
    content: SHADCN_CSS_VARIABLES,
    description: 'ShadCN CSS variables for theming',
  },

  themes: [
    {
      name: 'light',
      htmlClass: '',
      bodyClass: '',
    },
    {
      name: 'dark',
      htmlClass: 'dark',
      bodyClass: '',
    },
    {
      name: 'system',
      htmlClass: '',
      bodyClass: '',
      css: `
@media (prefers-color-scheme: dark) {
  :root {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}
`,
    },
  ],

  defaultTheme: 'light',

  cdnImports: [
    {
      type: 'script',
      url: 'https://cdn.tailwindcss.com',
      attributes: {},
    },
  ],
};

export const shadcnMinimalEnvironment: Environment = {
  id: 'shadcn-minimal@latest',
  name: 'ShadCN/UI (Minimal)',
  description: 'Minimal ShadCN setup with only core dependencies',
  version: '1.0.0',

  dependencies: {
    react: '^18.0.0',
    'react-dom': '^18.0.0',
    '@radix-ui/react-slot': 'latest',
    clsx: 'latest',
    'tailwind-merge': 'latest',
    'class-variance-authority': 'latest',
    'lucide-react': 'latest',
  },

  baseCss: {
    content: SHADCN_CSS_VARIABLES,
    description: 'ShadCN CSS variables for theming',
  },

  themes: shadcnEnvironment.themes,
  defaultTheme: 'light',

  cdnImports: [
    {
      type: 'script',
      url: 'https://cdn.tailwindcss.com',
    },
  ],
};

export function registerShadcnEnvironments(): void {
  environmentRegistry.register(shadcnEnvironment);
  environmentRegistry.register(shadcnMinimalEnvironment);
}

registerShadcnEnvironments();
