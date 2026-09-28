// ─── Kollektiv Video Editor — Project List ───────────────────────────────────
// Lists autosaved projects (metadata only, no media reads) with open / rename
// / duplicate / delete. Delete always goes through ConfirmationModal — never
// window.confirm — and re-lists after every mutating action.

import React, { useCallback, useEffect, useState } from 'react';
import {
  listProjects,
  deleteProject,
  renameProject,
  duplicateProject,
  estimateStorage,
  type ProjectSummary,
} from '../../core/autosave';
import ConfirmationModal from '../../../components/ConfirmationModal';
import EmptyState from '../../../components/EmptyState';
import { FolderClosedIcon, DeleteIcon, EditIcon, CopyIcon, CheckIcon } from '../../../components/icons';

interface ProjectListProps {
  onOpen: (id: string) => void;
  onError: (message: string) => void;
  currentProjectId?: string;
}

function formatRelativeTime(ms: number): string {
  const diffSec = Math.round((ms - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const divisions: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, secs] of divisions) {
    if (Math.abs(diffSec) >= secs) return rtf.format(Math.round(diffSec / secs), unit);
  }
  return rtf.format(diffSec, 'second');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

const ProjectList: React.FC<ProjectListProps> = ({ onOpen, onError, currentProjectId }) => {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, est] = await Promise.all([listProjects(), estimateStorage()]);
      setProjects(list);
      setStorage(est);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load projects');
    }
  }, [onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startRename = (p: ProjectSummary) => {
    setRenamingId(p.id);
    setRenameValue(p.name);
  };

  const commitRename = async (id: string) => {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name) return;
    try {
      await renameProject(id, name);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to rename project');
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateProject(id);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to duplicate project');
    }
  };

  const confirmDelete = async () => {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (!id) return;
    try {
      await deleteProject(id);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to delete project');
    }
  };

  if (projects === null) return null;

  if (projects.length === 0) {
    return <EmptyState icon={<FolderClosedIcon className="w-10 h-10" />} title="No saved projects" body="Import media to start a new project." />;
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5" aria-label="Saved projects">
        {projects.map((p) => {
          const isCurrent = p.id === currentProjectId;
          return (
            <li key={p.id} className="flex items-center gap-2 bg-base-100/10 px-3 py-2">
              <button
                type="button"
                onClick={() => onOpen(p.id)}
                className="flex-1 min-w-0 text-left"
                aria-label={`Open ${p.name}`}
              >
                {renamingId === p.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => void commitRename(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitRename(p.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="input input-xs w-full rounded-none"
                  />
                ) : (
                  <div className="truncate font-bold uppercase tracking-tight">
                    {p.name}
                    {isCurrent && <span className="ml-2 text-2xs text-primary uppercase tracking-widest">Current</span>}
                  </div>
                )}
                <div className="text-2xs text-base-content/60 uppercase tracking-widest">
                  {formatRelativeTime(p.updatedAt)} · {p.clipCount} {p.clipCount === 1 ? 'clip' : 'clips'}
                </div>
              </button>
              <div className="flex items-center gap-1 flex-shrink-0">
                {renamingId === p.id ? (
                  <button type="button" onClick={() => void commitRename(p.id)} className="btn btn-xs btn-ghost" aria-label="Save name">
                    <CheckIcon className="w-4 h-4" />
                  </button>
                ) : (
                  <button type="button" onClick={() => startRename(p)} className="btn btn-xs btn-ghost" aria-label={`Rename ${p.name}`}>
                    <EditIcon className="w-4 h-4" />
                  </button>
                )}
                <button type="button" onClick={() => void handleDuplicate(p.id)} className="btn btn-xs btn-ghost" aria-label={`Duplicate ${p.name}`}>
                  <CopyIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(p.id)}
                  disabled={isCurrent}
                  title={isCurrent ? 'Currently open' : undefined}
                  className="btn btn-xs btn-ghost text-error disabled:opacity-30"
                  aria-label={`Delete ${p.name}`}
                >
                  <DeleteIcon className="w-4 h-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {storage && (
        <div className="text-2xs text-base-content/50 uppercase tracking-widest px-1">
          {formatBytes(storage.usage)} used{storage.quota > 0 ? ` of ${formatBytes(storage.quota)}` : ''}
        </div>
      )}
      <ConfirmationModal
        isOpen={pendingDeleteId !== null}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete project"
        message="This permanently deletes the project and any media only it uses. This cannot be undone."
      />
    </div>
  );
};

export default ProjectList;
