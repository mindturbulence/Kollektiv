import React, { useState, useEffect, useCallback } from 'react';
import { useResearch } from '../contexts/ResearchContext';
import { PlusIcon, DeleteIcon } from './icons';
import { researchVault } from '../services/researchVaultService';
import { fileSystemManager } from '../utils/fileUtils';
import type { ProjectSummary } from '../types';

export const ResearchProjectBrowser: React.FC = () => {
  const { openProject } = useResearch();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fm = fileSystemManager.isDirectorySelected() ? fileSystemManager : null;

  const loadProjects = useCallback(async () => {
    if (!fm) return;
    try {
      const list = await researchVault.projects.list(fm);
      setProjects(list);
    } catch {
      setProjects([]);
    }
  }, [fm]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const handleCreate = async () => {
    if (!fm || !newTitle.trim()) return;
    setError(null);
    try {
      const slug = await researchVault.projects.create(newTitle.trim(), fm);
      await openProject(slug);
      setNewTitle('');
      setIsCreating(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to create project.');
    }
  };

  const handleDelete = async (slug: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!fm) return;
    if (!window.confirm('Delete this project and all its sources?')) return;
    try {
      await researchVault.projects.delete(slug, fm);
      await loadProjects();
    } catch {
      // ignore
    }
  };

  if (!fm) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-8">
          <p className="text-sm font-mono opacity-40 mb-2">No vault folder connected.</p>
          <p className="text-xs font-mono opacity-30">Connect one via Settings to use the Research Panel.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
      <div className="max-w-xl mx-auto w-full px-6 py-10 space-y-8">
        {/* Hero area */}
        <div className="text-center space-y-3 pb-4 border-b border-white/5">
          <h2 className="text-xl font-rajdhani uppercase tracking-[0.35em] opacity-80">
            Research Notebook
          </h2>
          <p className="text-xs font-mono opacity-40 max-w-sm mx-auto leading-relaxed">
            Create projects to collect sources, ask questions, and build findings — like a notebook for your research.
          </p>
        </div>

        {/* Create project area */}
        {isCreating ? (
          <div className="bg-base-200/40 border border-primary/20 rounded-lg p-5 space-y-3">
            <p className="text-xs font-mono uppercase tracking-wider opacity-50">New Project</p>
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Project title"
              className="w-full bg-base-300/50 border border-white/10 rounded px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-primary/50 transition-colors"
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
              autoFocus
            />
            {error && <p className="text-xs text-error">{error}</p>}
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={!newTitle.trim()} className="btn btn-sm btn-primary rounded-none">
                Create Project
              </button>
              <button onClick={() => { setIsCreating(false); setNewTitle(''); setError(null); }} className="btn btn-sm btn-ghost rounded-none">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsCreating(true)}
            className="w-full border-2 border-dashed border-white/10 hover:border-primary/30 rounded-lg py-6 flex flex-col items-center gap-2 transition-colors group cursor-pointer"
          >
            <PlusIcon className="w-5 h-5 text-primary/50 group-hover:text-primary/80 transition-colors" />
            <span className="text-xs font-mono uppercase tracking-wider opacity-40 group-hover:opacity-70 transition-colors">
              New Project
            </span>
          </button>
        )}

        {/* Projects list */}
        {projects.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-mono uppercase tracking-wider opacity-30 px-1">
              Your Projects — {projects.length}
            </p>
            {projects.map(p => (
              <div
                key={p.slug}
                onClick={() => openProject(p.slug)}
                className="group bg-base-200/20 border border-white/5 hover:border-primary/30 rounded-lg px-4 py-3.5 cursor-pointer transition-all flex items-center justify-between"
              >
                <div className="min-w-0">
                  <h3 className="text-sm font-mono text-base-content/80 truncate">{p.title}</h3>
                  <p className="text-xs font-mono opacity-30 mt-1">
                    {p.sourceCount} {p.sourceCount === 1 ? 'source' : 'sources'} · {p.messageCount} {p.messageCount === 1 ? 'message' : 'messages'}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDelete(p.slug, e)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-error/40 hover:text-error transition-all shrink-0 ml-2"
                  aria-label="Delete project"
                >
                  <DeleteIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {projects.length === 0 && !isCreating && (
          <div className="text-center py-8">
            <p className="text-sm font-mono opacity-30">No projects yet.</p>
            <p className="text-xs font-mono opacity-20 mt-1">Create one to start collecting sources.</p>
          </div>
        )}
      </div>
    </div>
  );
};
