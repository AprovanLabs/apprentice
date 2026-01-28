/**
 * Interactive Service Demo - Story 12.2
 *
 * Demonstrates a more realistic widget that uses service calls
 * to fetch and display data.
 */

import { compileWidget, type Dependencies } from './compiler.js';
import { generateSandboxHtml, type ServiceGlobal } from './iframe-sandbox.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const DIST_DIR = join(import.meta.dirname, '..', 'dist');

/**
 * A more realistic widget that fetches data via service proxy
 */
const interactiveWidget = `
import React, { useState, useEffect } from 'react';

interface DataItem {
  id: number;
  name: string;
  status: 'active' | 'pending' | 'inactive';
}

export default function DataDashboard() {
  const [items, setItems] = useState<DataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      // Use injected service to fetch data
      const data = await window.__services.dataService.fetchItems();
      setItems(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function addItem() {
    if (!newItemName.trim()) return;
    try {
      const newItem = await window.__services.dataService.addItem(newItemName);
      setItems(prev => [...prev, newItem]);
      setNewItemName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add item');
    }
  }

  async function toggleStatus(id: number) {
    try {
      const updated = await window.__services.dataService.toggleStatus(id);
      setItems(prev => prev.map(item => 
        item.id === updated.id ? updated : item
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  }

  const statusColors = {
    active: 'bg-green-500/20 text-green-400 border-green-500/30',
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    inactive: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };

  return (
    <div className="p-6 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">📊 Data Dashboard</h1>
      <p className="text-muted-foreground mb-6">
        This widget runs in a sandboxed iframe and fetches data via postMessage service calls.
      </p>

      {error && (
        <div className="p-4 mb-4 bg-destructive/20 border border-destructive/30 rounded-lg text-destructive">
          {error}
        </div>
      )}

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
          placeholder="Enter item name..."
          className="flex-1 px-4 py-2 bg-card border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={addItem}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          Add Item
        </button>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No items yet. Add one above!
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-4 bg-card border border-border rounded-lg"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium">{item.name}</span>
                <span className={\`px-2 py-1 text-xs rounded border \${statusColors[item.status]}\`}>
                  {item.status}
                </span>
              </div>
              <button
                onClick={() => toggleStatus(item.id)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Toggle Status
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Type declaration for the injected services
declare global {
  interface Window {
    __services: {
      dataService: {
        fetchItems: () => Promise<DataItem[]>;
        addItem: (name: string) => Promise<DataItem>;
        toggleStatus: (id: number) => Promise<DataItem>;
      };
    };
  }
}
`;

async function main() {
  console.log('\n🎮 Generating Interactive Service Demo\n');

  await mkdir(DIST_DIR, { recursive: true });

  const deps: Dependencies = {
    react: '^18.0.0',
    'react-dom': '^18.0.0',
  };

  const compiled = await compileWidget(interactiveWidget, {
    dependencies: deps,
  });

  if (compiled.errors?.length && compiled.code === '') {
    console.error('❌ Compilation failed:', compiled.errors);
    process.exit(1);
  }

  console.log(`✓ Widget compiled (${compiled.compilationTimeMs.toFixed(2)}ms)`);

  // Define the mock services that will run in the host page
  const services: ServiceGlobal[] = [
    {
      name: 'dataService',
      methods: {
        fetchItems: async () => [],
        addItem: async () => ({}),
        toggleStatus: async () => ({}),
      },
    },
  ];

  const sandboxHtml = generateSandboxHtml(compiled.code, {
    title: 'Data Dashboard',
    theme: 'dark',
    services,
  });

  // Create host page with service implementations
  const hostHtml = generateInteractiveDemoHost(sandboxHtml);

  await writeFile(join(DIST_DIR, 'service-demo.html'), hostHtml);
  console.log('✓ Generated dist/service-demo.html');
  console.log(
    '\n📂 Open the file in a browser to test service communication!\n',
  );
}

function generateInteractiveDemoHost(sandboxHtml: string): string {
  const escapedHtml = sandboxHtml
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Patchwork Service Demo - Iframe Sandbox</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0a0a12;
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: #12121f;
      border-bottom: 1px solid #252540;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    header h1 { font-size: 18px; font-weight: 600; }
    header .badge {
      background: #4fc3f7;
      color: #0a0a12;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .container {
      display: grid;
      grid-template-columns: 1fr 400px;
      flex: 1;
      min-height: 0;
    }
    .sandbox-area {
      border-right: 1px solid #252540;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    .panel {
      display: flex;
      flex-direction: column;
      background: #12121f;
    }
    .panel-header {
      padding: 12px 16px;
      border-bottom: 1px solid #252540;
      font-weight: 600;
      color: #4fc3f7;
    }
    .panel-content {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }
    .log-entry {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 12px;
      padding: 8px;
      margin-bottom: 4px;
      border-radius: 4px;
      background: #1a1a2e;
      word-break: break-all;
    }
    .log-entry.request { border-left: 3px solid #ff9800; }
    .log-entry.response { border-left: 3px solid #4caf50; }
    .log-entry.ready { border-left: 3px solid #4fc3f7; }
    .log-entry.error { border-left: 3px solid #f44336; }
    .log-time { color: #666; }
    .log-type { font-weight: 600; margin: 0 4px; }
    .log-type.request { color: #ff9800; }
    .log-type.response { color: #4caf50; }
    .log-type.ready { color: #4fc3f7; }
    .log-type.error { color: #f44336; }
    .stats {
      padding: 12px 16px;
      border-top: 1px solid #252540;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      font-size: 12px;
    }
    .stat { background: #1a1a2e; padding: 8px; border-radius: 4px; }
    .stat-label { color: #666; }
    .stat-value { font-weight: 600; color: #4fc3f7; }
  </style>
</head>
<body>
  <header>
    <h1>🔒 Patchwork Sandbox Demo</h1>
    <span class="badge">sandbox="allow-scripts"</span>
  </header>
  
  <div class="container">
    <div class="sandbox-area">
      <iframe 
        id="widget-frame" 
        sandbox="allow-scripts"
        srcdoc="${escapedHtml}"
      ></iframe>
    </div>
    
    <div class="panel">
      <div class="panel-header">📬 Service Communication Log</div>
      <div class="panel-content" id="log"></div>
      <div class="stats">
        <div class="stat">
          <div class="stat-label">Requests</div>
          <div class="stat-value" id="stat-requests">0</div>
        </div>
        <div class="stat">
          <div class="stat-label">Responses</div>
          <div class="stat-value" id="stat-responses">0</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    // Mock data store
    let items = [
      { id: 1, name: 'Initial Item 1', status: 'active' },
      { id: 2, name: 'Initial Item 2', status: 'pending' },
      { id: 3, name: 'Initial Item 3', status: 'inactive' },
    ];
    let nextId = 4;
    let requestCount = 0;
    let responseCount = 0;

    const log = document.getElementById('log');
    const iframe = document.getElementById('widget-frame');
    const statRequests = document.getElementById('stat-requests');
    const statResponses = document.getElementById('stat-responses');

    function addLog(type, data) {
      const entry = document.createElement('div');
      entry.className = 'log-entry ' + type;
      const time = new Date().toISOString().split('T')[1].slice(0, 12);
      entry.innerHTML = \`<span class="log-time">\${time}</span><span class="log-type \${type}">\${type.toUpperCase()}</span>\${JSON.stringify(data, null, 0)}\`;
      log.insertBefore(entry, log.firstChild);
    }

    // Service implementations (run in host, not in sandbox)
    const services = {
      dataService: {
        fetchItems: async () => {
          await delay(200); // Simulate network delay
          return items;
        },
        addItem: async (name) => {
          await delay(100);
          const item = { id: nextId++, name, status: 'pending' };
          items.push(item);
          return item;
        },
        toggleStatus: async (id) => {
          await delay(50);
          const item = items.find(i => i.id === id);
          if (!item) throw new Error('Item not found');
          const statusOrder = ['pending', 'active', 'inactive'];
          const currentIndex = statusOrder.indexOf(item.status);
          item.status = statusOrder[(currentIndex + 1) % 3];
          return item;
        },
      },
    };

    function delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Handle messages from sandbox
    window.addEventListener('message', async (event) => {
      if (event.source !== iframe.contentWindow) return;
      
      const { type, payload } = event.data;
      
      if (type === 'ready') {
        addLog('ready', { message: 'Widget mounted successfully' });
      } else if (type === 'error') {
        addLog('error', payload);
      } else if (type === 'service-call') {
        requestCount++;
        statRequests.textContent = requestCount;
        
        const { id, service, method, args } = payload;
        addLog('request', { service, method, args });
        
        try {
          const serviceMethods = services[service];
          if (!serviceMethods) throw new Error('Service not found: ' + service);
          
          const methodFn = serviceMethods[method];
          if (!methodFn) throw new Error('Method not found: ' + method);
          
          const result = await methodFn(...args);
          
          responseCount++;
          statResponses.textContent = responseCount;
          addLog('response', { id, result });
          
          iframe.contentWindow.postMessage({
            type: 'service-response',
            payload: { id, result }
          }, '*');
        } catch (err) {
          responseCount++;
          statResponses.textContent = responseCount;
          addLog('error', { id, error: err.message });
          
          iframe.contentWindow.postMessage({
            type: 'service-response',
            payload: { id, error: err.message }
          }, '*');
        }
      }
    });
  </script>
</body>
</html>`;
}

main().catch(console.error);
