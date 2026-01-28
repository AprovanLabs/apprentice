export const counterWidget = `
import { useState } from 'react';
import { Text, Box, useInput } from 'ink';

export default function Counter() {
  const [count, setCount] = useState(0);

  useInput((input) => {
    if (input === '+' || input === '=') setCount(c => c + 1);
    if (input === '-') setCount(c => c - 1);
    if (input === 'r') setCount(0);
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Counter Widget</Text>
      <Text>Count: <Text color="green">{count}</Text></Text>
      <Text dimColor>Press +/- to change, r to reset, q to quit</Text>
    </Box>
  );
}
`;

export const spinnerWidget = `
import { useState, useEffect } from 'react';
import { Text, Box } from 'ink';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export default function Spinner({ label = 'Loading...' }: { label?: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <Box gap={1}>
      <Text color="cyan">{FRAMES[frame]}</Text>
      <Text>{label}</Text>
    </Box>
  );
}
`;

export const dataListWidget = `
import { useState, useEffect } from 'react';
import { Text, Box } from 'ink';

interface Item {
  id: number;
  name: string;
  status: 'active' | 'inactive';
}

export default function DataList({ services }: { services?: any }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (services?.dataService?.getItems) {
        const data = await services.dataService.getItems();
        setItems(data);
      } else {
        setItems([
          { id: 1, name: 'Item 1', status: 'active' },
          { id: 2, name: 'Item 2', status: 'inactive' },
          { id: 3, name: 'Item 3', status: 'active' },
        ]);
      }
      setLoading(false);
    };
    load();
  }, [services]);

  if (loading) {
    return <Text color="yellow">Loading...</Text>;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Data List</Text>
      {items.map(item => (
        <Box key={item.id} gap={2}>
          <Text>[{item.id}]</Text>
          <Text>{item.name}</Text>
          <Text color={item.status === 'active' ? 'green' : 'gray'}>
            {item.status}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
`;

export const widgetWithMeta = `
export const meta = {
  name: "Dashboard Widget",
  description: "A terminal dashboard with stats",
  packages: {
    "ink-spinner": "latest"
  },
  services: ["statsService"]
};

import { useState, useEffect } from 'react';
import { Text, Box } from 'ink';

export default function Dashboard({ services }: { services?: any }) {
  const [stats, setStats] = useState({ cpu: 0, memory: 0, uptime: 0 });

  useEffect(() => {
    const update = async () => {
      if (services?.statsService?.getStats) {
        const data = await services.statsService.getStats();
        setStats(data);
      } else {
        setStats({ cpu: Math.random() * 100, memory: Math.random() * 100, uptime: Date.now() });
      }
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [services]);

  return (
    <Box flexDirection="column" borderStyle="round" padding={1}>
      <Text bold color="cyan">System Dashboard</Text>
      <Text>CPU: <Text color="yellow">{stats.cpu.toFixed(1)}%</Text></Text>
      <Text>Memory: <Text color="green">{stats.memory.toFixed(1)}%</Text></Text>
      <Text dimColor>Uptime: {stats.uptime}ms</Text>
    </Box>
  );
}
`;

export const reducerWidget = `
import { useReducer } from 'react';
import { Text, Box, useInput } from 'ink';

type Action = { type: 'INCREMENT' } | { type: 'DECREMENT' } | { type: 'RESET' };
type State = { count: number; history: number[] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'INCREMENT':
      return { count: state.count + 1, history: [...state.history, state.count + 1] };
    case 'DECREMENT':
      return { count: state.count - 1, history: [...state.history, state.count - 1] };
    case 'RESET':
      return { count: 0, history: [] };
  }
}

export default function ReducerDemo() {
  const [state, dispatch] = useReducer(reducer, { count: 0, history: [] });

  useInput((input) => {
    if (input === '+') dispatch({ type: 'INCREMENT' });
    if (input === '-') dispatch({ type: 'DECREMENT' });
    if (input === 'r') dispatch({ type: 'RESET' });
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">useReducer Demo</Text>
      <Text>Count: <Text color="green">{state.count}</Text></Text>
      <Text dimColor>History: [{state.history.slice(-5).join(', ')}]</Text>
      <Text dimColor>Press +/- to change, r to reset</Text>
    </Box>
  );
}
`;
