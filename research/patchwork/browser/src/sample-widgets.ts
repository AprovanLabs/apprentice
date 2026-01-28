export const simpleCounter = `
import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  
  return (
    <div className="p-4 bg-slate-800 rounded-lg">
      <h2 className="text-xl font-bold text-white mb-2">Counter</h2>
      <p className="text-2xl text-blue-400">{count}</p>
      <div className="flex gap-2 mt-2">
        <button 
          onClick={() => setCount(c => c - 1)}
          className="px-3 py-1 bg-red-600 text-white rounded"
        >
          -
        </button>
        <button 
          onClick={() => setCount(c => c + 1)}
          className="px-3 py-1 bg-green-600 text-white rounded"
        >
          +
        </button>
      </div>
    </div>
  );
}
`;

export const widgetWithEffects = `
import { useState, useEffect, useCallback } from 'react';

interface DataItem {
  id: number;
  name: string;
  status: 'active' | 'inactive';
}

export function DataWidget({ serviceApi }: { serviceApi: any }) {
  const [data, setData] = useState<DataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await serviceApi.getData();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [serviceApi]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredData = data.filter(item => {
    if (filter === 'all') return true;
    return item.status === filter;
  });

  if (loading) {
    return (
      <div className="p-4 bg-slate-800 rounded-lg">
        <div className="animate-pulse flex space-x-4">
          <div className="h-4 bg-slate-600 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900 rounded-lg">
        <p className="text-red-200">Error: {error}</p>
        <button 
          onClick={fetchData}
          className="mt-2 px-3 py-1 bg-red-600 text-white rounded"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 bg-slate-800 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-white">Data Widget</h2>
        <select 
          value={filter} 
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="bg-slate-700 text-white px-2 py-1 rounded"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <ul className="space-y-2">
        {filteredData.map(item => (
          <li 
            key={item.id}
            className="flex justify-between p-2 bg-slate-700 rounded"
          >
            <span className="text-white">{item.name}</span>
            <span className={\`text-sm \${
              item.status === 'active' ? 'text-green-400' : 'text-gray-400'
            }\`}>
              {item.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
`;

export const complexWidget = `
import { useState, useEffect, useMemo, useReducer } from 'react';

type Action = 
  | { type: 'ADD_ITEM'; payload: string }
  | { type: 'REMOVE_ITEM'; payload: number }
  | { type: 'TOGGLE_ITEM'; payload: number }
  | { type: 'SET_FILTER'; payload: 'all' | 'completed' | 'pending' };

interface State {
  items: Array<{ id: number; text: string; completed: boolean }>;
  filter: 'all' | 'completed' | 'pending';
  nextId: number;
}

const initialState: State = {
  items: [],
  filter: 'all',
  nextId: 1,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_ITEM':
      return {
        ...state,
        items: [...state.items, { id: state.nextId, text: action.payload, completed: false }],
        nextId: state.nextId + 1,
      };
    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter(item => item.id !== action.payload),
      };
    case 'TOGGLE_ITEM':
      return {
        ...state,
        items: state.items.map(item =>
          item.id === action.payload ? { ...item, completed: !item.completed } : item
        ),
      };
    case 'SET_FILTER':
      return { ...state, filter: action.payload };
    default:
      return state;
  }
}

export function TodoWidget() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [newItem, setNewItem] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const filteredItems = useMemo(() => {
    return state.items.filter(item => {
      if (state.filter === 'all') return true;
      if (state.filter === 'completed') return item.completed;
      return !item.completed;
    });
  }, [state.items, state.filter]);

  const stats = useMemo(() => ({
    total: state.items.length,
    completed: state.items.filter(i => i.completed).length,
    pending: state.items.filter(i => !i.completed).length,
  }), [state.items]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newItem.trim()) {
      dispatch({ type: 'ADD_ITEM', payload: newItem.trim() });
      setNewItem('');
    }
  };

  if (!mounted) {
    return <div className="p-4 bg-slate-800 rounded-lg animate-pulse" />;
  }

  return (
    <div className="p-4 bg-slate-800 rounded-lg max-w-md">
      <h2 className="text-xl font-bold text-white mb-4">Todo List</h2>
      
      <div className="flex gap-2 mb-4 text-sm">
        <span className="text-blue-400">Total: {stats.total}</span>
        <span className="text-green-400">Done: {stats.completed}</span>
        <span className="text-yellow-400">Pending: {stats.pending}</span>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="Add new item..."
          className="flex-1 px-3 py-2 bg-slate-700 text-white rounded"
        />
        <button 
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500"
        >
          Add
        </button>
      </form>

      <div className="flex gap-2 mb-4">
        {(['all', 'completed', 'pending'] as const).map(f => (
          <button
            key={f}
            onClick={() => dispatch({ type: 'SET_FILTER', payload: f })}
            className={\`px-3 py-1 rounded text-sm \${
              state.filter === f 
                ? 'bg-blue-600 text-white' 
                : 'bg-slate-700 text-gray-300'
            }\`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {filteredItems.map(item => (
          <li 
            key={item.id}
            className="flex items-center gap-2 p-2 bg-slate-700 rounded"
          >
            <input
              type="checkbox"
              checked={item.completed}
              onChange={() => dispatch({ type: 'TOGGLE_ITEM', payload: item.id })}
              className="w-4 h-4"
            />
            <span className={\`flex-1 \${
              item.completed ? 'text-gray-400 line-through' : 'text-white'
            }\`}>
              {item.text}
            </span>
            <button
              onClick={() => dispatch({ type: 'REMOVE_ITEM', payload: item.id })}
              className="text-red-400 hover:text-red-300"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
`;

export const syntaxErrorWidget = `
import { useState } from 'react';

export function BrokenWidget() {
  const [count, setCount] = useState(0;  // Missing closing parenthesis
  
  return (
    <div>
      <p>{count}</p>
    </div>
  );
}
`;

export const typeErrorWidget = `
import { useState } from 'react';

export function TypeErrorWidget() {
  const [count, setCount] = useState<number>('not a number');  // Type mismatch
  
  return (
    <div>
      <p>{count}</p>
    </div>
  );
}
`;
