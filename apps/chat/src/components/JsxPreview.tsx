import { useState, useEffect, useRef } from 'react';
import { Code, Eye, AlertCircle, Loader2 } from 'lucide-react';
import type { Compiler, MountedWidget } from '@aprovan/patchwork-compiler';

interface JsxPreviewProps {
  code: string;
  compiler: Compiler | null;
}

export function JsxPreview({ code, compiler }: JsxPreviewProps) {
  const [showPreview, setShowPreview] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef<MountedWidget | null>(null);

  useEffect(() => {
    if (!showPreview || !compiler || !containerRef.current) return;

    let cancelled = false;

    async function compileAndMount() {
      if (!containerRef.current || !compiler) return;

      setLoading(true);
      setError(null);

      try {
        if (mountedRef.current) {
          compiler.unmount(mountedRef.current);
          mountedRef.current = null;
        }

        const image = compiler.getImage();
        const widget = await compiler.compile(code, {
          name: 'preview',
          version: '1.0.0',
          platform: 'browser',
          image: image?.name || '@aprovan/patchwork-shadcn',
        });

        if (cancelled) return;

        const mounted = await compiler.mount(widget, {
          target: containerRef.current,
          mode: 'embedded',
        });

        mountedRef.current = mounted;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render JSX');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    compileAndMount();

    return () => {
      cancelled = true;
      if (mountedRef.current && compiler) {
        compiler.unmount(mountedRef.current);
        mountedRef.current = null;
      }
    };
  }, [code, compiler, showPreview]);

  return (
    <div className="my-3 border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
        <Code className="h-4 w-4 text-muted-foreground" />
        <div className="ml-auto flex gap-1">
          <button
            onClick={() => setShowPreview(false)}
            className={`px-2 py-1 text-xs rounded ${!showPreview ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            Code
          </button>
          <button
            onClick={() => setShowPreview(true)}
            className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${showPreview ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            <Eye className="h-3 w-3" />
            Preview
          </button>
        </div>
      </div>

      {showPreview ? (
        <div className="bg-white">
          {error ? (
            <div className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Rendering preview...</span>
            </div>
          ) : !compiler ? (
            <div className="text-sm text-muted-foreground">
              Compiler not initialized
            </div>
          ) : null}
          <div ref={containerRef} />
        </div>
      ) : (
        <div className="p-3 bg-muted/30 overflow-auto max-h-96">
          <pre className="text-xs whitespace-pre-wrap break-words m-0">
            <code>{code}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
