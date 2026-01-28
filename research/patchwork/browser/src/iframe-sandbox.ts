export interface ServiceGlobal {
  name: string;
  methods: Record<string, (...args: unknown[]) => unknown>;
}

export interface SandboxOptions {
  /** Widget title for the iframe document */
  title?: string;
  /** Service globals to inject before component mounts */
  services?: ServiceGlobal[];
  /** Custom CSS to include (replaces any preset CSS) */
  customCss?: string;
  /** Callback for messages from the widget */
  onMessage?: (message: WidgetMessage) => void;
  /** Callback for errors from the widget */
  onError?: (error: Error) => void;
  /** Include Tailwind CSS via CDN */
  includeTailwind?: boolean;
  /**
   * CSS preset to apply. Presets include both CSS variables and body styling.
   * - 'shadcn-light': ShadCN light theme
   * - 'shadcn-dark': ShadCN dark theme
   * - 'none': No preset (default)
   */
  cssPreset?: 'shadcn-light' | 'shadcn-dark' | 'none';
}

export interface WidgetMessage {
  type: 'service-call' | 'event' | 'ready' | 'error';
  payload: unknown;
}

export interface ServiceCallPayload {
  id: string;
  service: string;
  method: string;
  args: unknown[];
}

export interface ServiceResponsePayload {
  id: string;
  result?: unknown;
  error?: string;
}

const CSS_PRESETS = {
  'shadcn-light': `
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
body { background-color: hsl(var(--background)); color: hsl(var(--foreground)); }
`,
  'shadcn-dark': `
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
  --radius: 0.5rem;
}
body { background-color: hsl(var(--background)); color: hsl(var(--foreground)); }
`,
  none: '',
};

export function generateSandboxHtml(
  compiledJs: string,
  options: SandboxOptions = {},
): string {
  const {
    title = 'Widget',
    services = [],
    customCss = '',
    includeTailwind = false,
    cssPreset = 'none',
  } = options;

  // Generate service proxy code
  const serviceProxyCode = generateServiceProxyCode(services);

  // Process the compiled JS to expose the component
  let widgetCode = compiledJs;

  // Handle 'export { ComponentName as default }'
  const namedDefaultMatch = widgetCode.match(
    /export\s*{\s*(\w+)\s+as\s+default\s*}/,
  );
  if (namedDefaultMatch) {
    widgetCode = widgetCode.replace(
      /export\s*{\s*\w+\s+as\s+default\s*};?/,
      `window.__WIDGET_COMPONENT__ = ${namedDefaultMatch[1]};`,
    );
  }

  // Handle 'export default function ComponentName' or 'export default ComponentName'
  const directDefaultMatch = widgetCode.match(
    /export\s+default\s+(?:function\s+)?(\w+)/,
  );
  if (directDefaultMatch && !namedDefaultMatch) {
    widgetCode = widgetCode.replace(
      /export\s+default\s+(?:function\s+)?(\w+)/,
      `window.__WIDGET_COMPONENT__ = $1`,
    );
  }

  // Remove any remaining export statements
  widgetCode = widgetCode.replace(/export\s*{[^}]*};?/g, '');

  // Build CSS from preset + custom
  const presetCss = CSS_PRESETS[cssPreset] || '';
  const cssContent = [
    '* { margin: 0; padding: 0; box-sizing: border-box; }',
    'body { font-family: system-ui, -apple-system, sans-serif; }',
    presetCss,
    customCss,
  ]
    .filter(Boolean)
    .join('\n');

  const themeClass = cssPreset === 'shadcn-dark' ? 'dark' : '';
  const tailwindScript = includeTailwind
    ? '<script src="https://cdn.tailwindcss.com"></script>'
    : '';

  return `<!DOCTYPE html>
<html lang="en" class="${themeClass}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${tailwindScript}
  <style>
${cssContent}
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module">
// Service proxy setup (injected before widget code)
${serviceProxyCode}

// Notify parent that sandbox is initializing
window.parent.postMessage({ type: 'initializing' }, '*');

// Widget code
${widgetCode}

// Mount the component
import { createRoot } from "https://esm.sh/react-dom@18/client";
import React from "https://esm.sh/react@18";

const Component = window.__WIDGET_COMPONENT__;
if (Component) {
  try {
    const root = createRoot(document.getElementById('root'));
    root.render(React.createElement(Component));
    window.parent.postMessage({ type: 'ready' }, '*');
  } catch (err) {
    window.parent.postMessage({ type: 'error', payload: { message: err.message, stack: err.stack } }, '*');
  }
} else {
  const errorMsg = 'No component found. Make sure your widget has a default export.';
  document.getElementById('root').innerHTML = '<div style="color: red; padding: 20px;"><h2>Error</h2><p>' + errorMsg + '</p></div>';
  window.parent.postMessage({ type: 'error', payload: { message: errorMsg } }, '*');
}

// Global error handler
window.onerror = (message, source, lineno, colno, error) => {
  window.parent.postMessage({ 
    type: 'error', 
    payload: { message: String(message), source, lineno, colno, stack: error?.stack }
  }, '*');
};

window.onunhandledrejection = (event) => {
  window.parent.postMessage({ 
    type: 'error', 
    payload: { message: 'Unhandled promise rejection: ' + event.reason }
  }, '*');
};
  </script>
</body>
</html>`;
}

function generateServiceProxyCode(services: ServiceGlobal[]): string {
  if (services.length === 0) {
    return `window.__services = {};`;
  }

  const serviceNames = services.map((s) => s.name);
  const methodsByService = services.reduce((acc, s) => {
    acc[s.name] = Object.keys(s.methods);
    return acc;
  }, {} as Record<string, string[]>);

  return `
// Pending service call promises
const __pendingCalls = new Map();
let __callId = 0;

// Listen for service responses from parent
window.addEventListener('message', (event) => {
  if (event.data?.type === 'service-response') {
    const { id, result, error } = event.data.payload;
    const pending = __pendingCalls.get(id);
    if (pending) {
      __pendingCalls.delete(id);
      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(result);
      }
    }
  }
});

// Create service proxies
window.__services = {};
const __serviceConfig = ${JSON.stringify(methodsByService)};

for (const [serviceName, methods] of Object.entries(__serviceConfig)) {
  window.__services[serviceName] = {};
  for (const method of methods) {
    window.__services[serviceName][method] = (...args) => {
      return new Promise((resolve, reject) => {
        const id = String(++__callId);
        __pendingCalls.set(id, { resolve, reject });
        window.parent.postMessage({
          type: 'service-call',
          payload: { id, service: serviceName, method, args }
        }, '*');
      });
    };
  }
}
`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface SandboxController {
  iframe: HTMLIFrameElement;
  destroy: () => void;
  respondToService: (response: ServiceResponsePayload) => void;
  ready: Promise<void>;
}

export function createSandbox(
  compiledJs: string,
  container: HTMLElement,
  options: SandboxOptions = {},
): SandboxController {
  const { services = [], onMessage, onError } = options;

  const html = generateSandboxHtml(compiledJs, options);

  // Create iframe with sandbox attribute
  const iframe = document.createElement('iframe');
  iframe.sandbox.add('allow-scripts'); // Only allow scripts, no same-origin access
  iframe.style.cssText = 'width: 100%; height: 100%; border: none;';
  iframe.srcdoc = html;

  let readyResolve: () => void;
  let readyReject: (error: Error) => void;
  const readyPromise = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  // Message handler
  const handleMessage = (event: MessageEvent) => {
    // Only accept messages from our iframe
    if (event.source !== iframe.contentWindow) return;

    const message = event.data as WidgetMessage;

    switch (message.type) {
      case 'ready':
        readyResolve();
        break;
      case 'error':
        const errorPayload = message.payload as { message: string };
        const error = new Error(errorPayload.message);
        onError?.(error);
        break;
      case 'service-call':
        handleServiceCall(message.payload as ServiceCallPayload);
        break;
    }

    onMessage?.(message);
  };

  // Service call handler
  const handleServiceCall = async (payload: ServiceCallPayload) => {
    const { id, service, method, args } = payload;
    const serviceObj = services.find((s) => s.name === service);

    if (!serviceObj) {
      respondToService({ id, error: `Service '${service}' not found` });
      return;
    }

    const methodFn = serviceObj.methods[method];
    if (!methodFn) {
      respondToService({
        id,
        error: `Method '${method}' not found on service '${service}'`,
      });
      return;
    }

    try {
      const result = await methodFn(...args);
      respondToService({ id, result });
    } catch (err) {
      respondToService({
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const respondToService = (response: ServiceResponsePayload) => {
    iframe.contentWindow?.postMessage(
      { type: 'service-response', payload: response },
      '*',
    );
  };

  window.addEventListener('message', handleMessage);
  container.appendChild(iframe);

  // Timeout for ready state
  const readyTimeout = setTimeout(() => {
    readyReject(new Error('Widget initialization timed out'));
  }, 10000);

  readyPromise.then(() => clearTimeout(readyTimeout)).catch(() => {});

  return {
    iframe,
    ready: readyPromise,
    respondToService,
    destroy: () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(readyTimeout);
      iframe.remove();
    },
  };
}

export const sandboxSecurityTests = {
  parentAccessBlocked: `
    export default function TestWidget() {
      const [result, setResult] = React.useState('testing...');
      
      React.useEffect(() => {
        try {
          // This should throw or return null due to sandbox
          const parent = window.parent.document;
          setResult('FAIL: Accessed parent document');
        } catch (e) {
          setResult('PASS: Parent access blocked - ' + e.message);
        }
      }, []);
      
      return React.createElement('div', { 
        style: { padding: '20px', fontFamily: 'monospace' }
      }, result);
    }
  `,

  topAccessBlocked: `
    export default function TestWidget() {
      const [result, setResult] = React.useState('testing...');
      
      React.useEffect(() => {
        try {
          const top = window.top.document;
          setResult('FAIL: Accessed top document');
        } catch (e) {
          setResult('PASS: Top access blocked - ' + e.message);
        }
      }, []);
      
      return React.createElement('div', { 
        style: { padding: '20px', fontFamily: 'monospace' }
      }, result);
    }
  `,

  fetchBlocked: `
    export default function TestWidget() {
      const [result, setResult] = React.useState('testing...');
      
      React.useEffect(() => {
        fetch('https://api.github.com/users/octocat')
          .then(() => setResult('WARN: Fetch succeeded (may be allowed in some contexts)'))
          .catch(e => setResult('PASS: Fetch blocked - ' + e.message));
      }, []);
      
      return React.createElement('div', { 
        style: { padding: '20px', fontFamily: 'monospace' }
      }, result);
    }
  `,

  serviceCallWorks: `
    export default function TestWidget() {
      const [result, setResult] = React.useState('testing...');
      
      React.useEffect(() => {
        if (window.__services?.testService?.getData) {
          window.__services.testService.getData('hello')
            .then(data => setResult('PASS: Service returned - ' + JSON.stringify(data)))
            .catch(e => setResult('FAIL: Service error - ' + e.message));
        } else {
          setResult('FAIL: Service not injected');
        }
      }, []);
      
      return React.createElement('div', { 
        style: { padding: '20px', fontFamily: 'monospace' }
      }, result);
    }
  `,
};
