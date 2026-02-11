import { useState, useEffect, useRef, useCallback } from 'react';
import { Code, Eye, AlertCircle, Loader2, Pencil, RotateCcw, MessageSquare } from 'lucide-react';
import type { Compiler, MountedWidget } from '@aprovan/patchwork-compiler';
import { DEV_SANDBOX } from '@aprovan/patchwork-compiler';
import { EditModal, type CompileFn } from './edit';

interface CodePreviewProps {
  code: string;
  compiler: Compiler | null;
}

function useCodeCompiler(compiler: Compiler | null, code: string, enabled: boolean) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef<MountedWidget | null>(null);

  useEffect(() => {
    if (!enabled || !compiler || !containerRef.current) return;

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

        const widget = await compiler.compile(
          code,
          {
            name: 'preview',
            version: '1.0.0',
            platform: 'browser',
            image: '@aprovan/patchwork-shadcn',
          },
          { typescript: true }
        );

        if (cancelled) {
          return;
        }

        const mounted = await compiler.mount(widget, {
          target: containerRef.current,
          mode: 'embedded'
          // mode: 'iframe',
          // Use DEV_SANDBOX in development for same-origin module loading
          // sandbox: import.meta.env.DEV ? DEV_SANDBOX : undefined,
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
  }, [code, compiler, enabled]);

  return { containerRef, loading, error };
}

export function CodePreview({ code: originalCode, compiler }: CodePreviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [currentCode, setCurrentCode] = useState(originalCode);
  const [editCount, setEditCount] = useState(0);

  const { containerRef, loading, error } = useCodeCompiler(
    compiler,
    currentCode,
    showPreview && !isEditing
  );

  const compile: CompileFn = useCallback(
    async (code: string) => {
      if (!compiler) return { success: true };

      // Capture console.error outputs during compilation
      const errors: string[] = [];
      const originalError = console.error;
      console.error = (...args) => {
        errors.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
        originalError.apply(console, args);
      };

      try {
        await compiler.compile(
          code,
          {
            name: 'preview',
            version: '1.0.0',
            platform: 'browser',
            image: '@aprovan/patchwork-shadcn',
          },
          { typescript: true }
        );
        return { success: true };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Compilation failed';
        const consoleErrors = errors.length > 0 ? `\n\nConsole errors:\n${errors.join('\n')}` : '';
        return {
          success: false,
          error: errorMessage + consoleErrors,
        };
      } finally {
        console.error = originalError;
      }
    },
    [compiler]
  );

  const handleRevert = () => {
    setCurrentCode(originalCode);
    setEditCount(0);
  };

  const hasChanges = currentCode !== originalCode;

  return (
    <>
      <div className="my-3 border rounded-lg">
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b rounded-t-lg">
          <Code className="h-4 w-4 text-muted-foreground" />
          {editCount > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {editCount} edit{editCount !== 1 ? 's' : ''}
            </span>
          )}
          <div className="ml-auto flex gap-1">
            {hasChanges && (
              <button
                onClick={handleRevert}
                className="px-2 py-1 text-xs rounded flex items-center gap-1 hover:bg-muted text-muted-foreground"
                title="Revert to original"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={() => setIsEditing(true)}
              className="px-2 py-1 text-xs rounded flex items-center gap-1 hover:bg-muted"
              title="Edit component"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${showPreview ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/20 text-primary'}`}
            >
              {showPreview ? <Eye className="h-3 w-3" /> : <Code className="h-3 w-3" />}
              {showPreview ? 'Preview' : 'Code'}
            </button>
          </div>
        </div>

        {showPreview ? (
          <div className="bg-white">
            {error ? (
              <div className="p-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : loading ? (
              <div className="p-3 flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Rendering preview...</span>
              </div>
            ) : !compiler ? (
              <div className="p-3 text-sm text-muted-foreground">
                Compiler not initialized
              </div>
            ) : null}
            <div ref={containerRef} />
          </div>
        ) : (
          <div className="p-3 bg-muted/30 overflow-auto max-h-96">
            <pre className="text-xs whitespace-pre-wrap break-words m-0">
              <code>{currentCode}</code>
            </pre>
          </div>
        )}
      </div>

      <EditModal
        isOpen={isEditing}
        onClose={(finalCode, edits) => {
          setCurrentCode(finalCode);
          setEditCount((prev) => prev + edits);
          setIsEditing(false);
        }}
        originalCode={currentCode}
        compile={compile}
        renderPreview={(code) => <ModalPreview code={code} compiler={compiler} />}
      />
    </>
  );
}

function ModalPreview({
  code,
  compiler,
}: {
  code: string;
  compiler: Compiler | null;
}) {
  const { containerRef, loading, error } = useCodeCompiler(compiler, code, true);

  return (
    <>
      {error && (
        <div className="text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Rendering preview...</span>
        </div>
      )}
      {!compiler && !loading && !error && (
        <div className="text-sm text-muted-foreground">Compiler not initialized</div>
      )}
      <div ref={containerRef} />
    </>
  );
}
