import React, { createContext, useContext, useMemo } from 'react';
import type { LLMSettings } from '../types';
import type { IFileSystemManager } from '../utils/fileUtils';
import { useResearchProject } from '../hooks/useResearchProject';
import type { ResearchContextValue } from '../hooks/useResearchProject';

const ResearchContext = createContext<ResearchContextValue | null>(null);

export const useResearch = (): ResearchContextValue => {
  const ctx = useContext(ResearchContext);
  if (!ctx) throw new Error('useResearch must be used within a ResearchProvider');
  return ctx;
};

interface ResearchProviderProps {
  children: React.ReactNode;
  settings: LLMSettings;
  fileManager: IFileSystemManager | null;
}

export const ResearchProvider: React.FC<ResearchProviderProps> = ({ children, settings, fileManager }) => {
  const ctx = useResearchProject(settings, fileManager);

  const value = useMemo(() => ctx, [
    ctx.mode, ctx.projectSlug, ctx.project, ctx.isProjectLoading,
    ctx.sources, ctx.isAddingSource, ctx.messages, ctx.isProcessing,
    ctx.findings, ctx.error,
  ]);

  return (
    <ResearchContext.Provider value={value}>
      {children}
    </ResearchContext.Provider>
  );
};
