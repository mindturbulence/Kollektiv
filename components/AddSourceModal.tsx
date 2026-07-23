import React, { useState, useEffect, useCallback } from 'react';
import { useResearch } from '../contexts/ResearchContext';
import { CloseIcon, BookOpenIcon } from './icons';
import { fileSystemManager } from '../utils/fileUtils';

interface AddSourceModalProps {
  open: boolean;
  onClose: () => void;
}

interface VaultEntry {
  name: string;
  kind: 'file' | 'directory';
}

export const AddSourceModal: React.FC<AddSourceModalProps> = ({ open, onClose }) => {
  const { addSource, isAddingSource } = useResearch();
  const [tab, setTab] = useState<'url' | 'vault' | 'upload'>('url');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [vaultPath, setVaultPath] = useState('');
  const [vaultEntries, setVaultEntries] = useState<VaultEntry[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);

  const handleAddUrl = async () => {
    if (!url.trim()) return;
    setError(null);
    const result = await addSource({ kind: 'url', value: url.trim() });
    if (result.ok) {
      setUrl('');
      onClose();
    } else {
      setError(result.error);
    }
  };

  const loadVaultDir = useCallback(async (path: string) => {
    setVaultLoading(true);
    setVaultError(null);
    try {
      const entries: VaultEntry[] = [];
      for await (const handle of fileSystemManager.listDirectoryContents(path)) {
        entries.push({ name: handle.name, kind: handle.kind as 'file' | 'directory' });
      }
      entries.sort((a, b) => (a.kind !== b.kind ? (a.kind === 'directory' ? -1 : 1) : a.name.localeCompare(b.name)));
      setVaultEntries(entries);
      setVaultPath(path);
    } catch (e: any) {
      setVaultError(e?.message || 'Failed to list vault directory.');
      setVaultEntries([]);
    } finally {
      setVaultLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && tab === 'vault') void loadVaultDir('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  const handleAddVaultFile = async (fileName: string) => {
    setError(null);
    const fullPath = vaultPath ? `${vaultPath}/${fileName}` : fileName;
    const result = await addSource({ kind: 'vault-file', vaultPath: fullPath });
    if (result.ok) {
      onClose();
    } else {
      setError(result.error);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50">
      <div className="bg-base-200 border border-white/10 rounded-lg shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <h3 className="text-sm font-mono uppercase tracking-wider">Add Source</h3>
          <button onClick={onClose} className="btn btn-xs btn-ghost rounded-none p-1 opacity-60 hover:opacity-100">
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5">
          {(['url', 'vault', 'upload'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-mono uppercase tracking-wider transition-colors ${
                tab === t
                  ? 'bg-primary/10 text-primary border-b-2 border-primary'
                  : 'opacity-50 hover:opacity-80'
              }`}
            >
              {t === 'url' ? 'URL' : t === 'vault' ? 'Vault' : 'Upload'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4">
          {tab === 'url' && (
            <div className="space-y-3">
              <p className="text-xs font-mono opacity-50">
                Paste a URL to capture its content as a source.
              </p>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://example.com/article"
                className="w-full bg-base-300/50 border border-white/10 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/50"
                onKeyDown={e => { if (e.key === 'Enter') handleAddUrl(); }}
              />
              {error && <p className="text-xs text-error">{error}</p>}
              <button
                onClick={handleAddUrl}
                disabled={!url.trim() || isAddingSource}
                className="btn btn-sm btn-primary rounded-none w-full"
              >
                {isAddingSource ? 'Fetching...' : 'Add URL'}
              </button>
            </div>
          )}

          {tab === 'vault' && (
            <div className="space-y-2">
              <p className="text-xs font-mono opacity-50">
                Browse files from your vault to add as sources.
              </p>
              <div className="flex items-center gap-2 text-[11px] font-mono opacity-60">
                <span className="truncate">/{vaultPath}</span>
                {vaultPath && (
                  <button
                    onClick={() => loadVaultDir(vaultPath.split('/').slice(0, -1).join('/'))}
                    className="shrink-0 opacity-70 hover:opacity-100 underline"
                  >
                    Up
                  </button>
                )}
              </div>
              <div className="max-h-56 overflow-y-auto custom-scrollbar border border-white/10 rounded">
                {vaultLoading ? (
                  <div className="text-center py-8 text-xs font-mono opacity-30">Loading…</div>
                ) : vaultError ? (
                  <div className="text-center py-8 text-xs text-error">{vaultError}</div>
                ) : vaultEntries.length === 0 ? (
                  <div className="text-center py-8 text-xs font-mono opacity-30">Empty folder.</div>
                ) : (
                  vaultEntries.map(entry => (
                    <button
                      key={entry.name}
                      onClick={() => entry.kind === 'directory'
                        ? loadVaultDir(vaultPath ? `${vaultPath}/${entry.name}` : entry.name)
                        : handleAddVaultFile(entry.name)}
                      disabled={isAddingSource}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-left hover:bg-base-300/40 border-b border-white/5 last:border-b-0"
                    >
                      {entry.kind === 'directory' ? '📁' : <BookOpenIcon className="w-3.5 h-3.5 text-primary/40 shrink-0" />}
                      <span className="truncate">{entry.name}</span>
                    </button>
                  ))
                )}
              </div>
              {error && <p className="text-xs text-error">{error}</p>}
            </div>
          )}

          {tab === 'upload' && (
            <div className="space-y-3">
              <p className="text-xs font-mono opacity-50">
                Upload a file from your computer.
              </p>
              <input
                type="file"
                accept=".md,.txt,.pdf,.html"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setError(null);
                  const result = await addSource({ kind: 'upload', file, fileName: file.name });
                  if (result.ok) {
                    onClose();
                  } else {
                    setError(result.error);
                  }
                }}
                className="file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-primary/20 file:text-primary text-xs font-mono"
              />
              {error && <p className="text-xs text-error">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
