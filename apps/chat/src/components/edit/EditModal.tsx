import { useState, type ReactNode } from 'react';
import {
  Code,
  Eye,
  AlertCircle,
  Loader2,
  Pencil,
  X,
  RotateCcw,
  Send,
} from 'lucide-react';
import { MarkdownEditor } from '../MarkdownEditor';
import { EditHistory } from './EditHistory';
import { useEditSession, type UseEditSessionOptions } from './useEditSession';

// Simple hash for React key to force re-render on code changes
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

export interface EditModalProps extends UseEditSessionOptions {
  isOpen: boolean;
  onClose: (finalCode: string, editCount: number) => void;
  renderPreview: (code: string) => ReactNode;
  renderLoading?: () => ReactNode;
  renderError?: (error: string) => ReactNode;
  previewError?: string | null;
  previewLoading?: boolean;
}

export function EditModal({
  isOpen,
  onClose,
  renderPreview,
  renderLoading,
  renderError,
  previewError,
  previewLoading,
  ...sessionOptions
}: EditModalProps) {
  const [showPreview, setShowPreview] = useState(true);
  const [editInput, setEditInput] = useState('');

  const session = useEditSession(sessionOptions);
  const hasChanges = session.code !== session.originalCode;

  const handleSubmit = () => {
    if (!editInput.trim() || session.isApplying) return;
    session.submitEdit(editInput);
    setEditInput('');
  };

  const handleClose = () => {
    const editCount = session.history.length;
    const finalCode = session.code;
    setEditInput('');
    session.clearError();
    onClose(finalCode, editCount);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8">
      <div className="flex flex-col bg-background rounded-lg shadow-xl w-full h-full max-w-6xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-background border-b-2">
          <Pencil className="h-4 w-4 text-primary" />
          {session.isApplying && (
            <span className="text-xs font-medium text-primary flex items-center gap-1 ml-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Applying edits...
            </span>
          )}
          <div className="ml-auto flex gap-2">
            {hasChanges && (
              <button
                onClick={session.revert}
                className="px-2 py-1 text-xs rounded flex items-center gap-1 hover:bg-primary/20 text-primary"
                title="Revert to original"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${showPreview ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/20 text-primary'}`}
            >
              {showPreview ? <Eye className="h-3 w-3" /> : <Code className="h-3 w-3" />}
              {showPreview ? 'Preview' : 'Code'}
            </button>
            <button
              onClick={handleClose}
              className="px-2 py-1 text-xs rounded flex items-center gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
              title="Exit edit mode"
            >
              <X className="h-3 w-3" />
              Done
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 border-b-2 overflow-auto">
          {showPreview ? (
            <div className="bg-white h-full">
              {previewError && renderError ? (
                renderError(previewError)
              ) : previewError ? (
                <div className="p-4 text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{previewError}</span>
                </div>
              ) : previewLoading && renderLoading ? (
                renderLoading()
              ) : previewLoading ? (
                <div className="p-4 flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Rendering preview...</span>
                </div>
              ) : (
                <div className="p-4" key={hashCode(session.code)}>{renderPreview(session.code)}</div>
              )}
            </div>
          ) : (
            <div className="p-4 bg-muted/10 h-full overflow-auto">
              <pre className="text-xs whitespace-pre-wrap break-words m-0">
                <code>{session.code}</code>
              </pre>
            </div>
          )}
        </div>

        <EditHistory
          entries={session.history}
          streamingNotes={session.streamingNotes}
          isStreaming={session.isApplying}
          className="h-48"
        />

        {session.error && (
          <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm flex items-center gap-2 border-t-2 border-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {session.error}
          </div>
        )}

        <div className="p-4 border-t-2 bg-primary/5 flex gap-2 items-end">
          <div className="flex-1">
            <MarkdownEditor
              value={editInput}
              onChange={setEditInput}
              onSubmit={handleSubmit}
              placeholder="Describe changes..."
              disabled={session.isApplying}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!editInput.trim() || session.isApplying}
            className="px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1 shrink-0"
          >
            {session.isApplying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
