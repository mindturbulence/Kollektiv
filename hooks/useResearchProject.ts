import { useState, useRef, useEffect, useCallback } from 'react';
import { appEventBus } from '../utils/eventBus';
import { researchVault } from '../services/researchVaultService';
import { runAssistantTurn, type ChatMsg } from '../services/assistantService';
import type { LLMSettings } from '../types';
import type { IFileSystemManager } from '../utils/fileUtils';
import type { ResearchProject, ChatMessage, SourceInput, SourceFile, SourceContext } from '../types';

/**
 * Supported message shape in research mode.
 * We extend the base ChatMsg with optional citations.
 */
interface ResearchChatMessage extends ChatMessage {
  citations?: { index: number; fileName: string; title: string }[];
}

export interface ResearchContextValue {
  // Mode
  mode: 'chat' | 'research';
  setMode: (m: 'chat' | 'research') => void;

  // Active project
  projectSlug: string | null;
  project: ResearchProject | null;
  isProjectLoading: boolean;
  openProject: (slug: string) => Promise<void>;
  closeProject: () => void;

  // Sources
  sources: SourceFile[];
  addSource: (input: SourceInput) => Promise<{ ok: true } | { ok: false; error: string }>;
  removeSource: (fileName: string) => Promise<void>;
  isAddingSource: boolean;

  // Messages
  messages: ResearchChatMessage[];
  sendMessage: (text: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  isProcessing: boolean;

  // Findings
  findings: string;
  saveFindings: (text: string) => Promise<void>;

  // Errors
  error: string | null;
  clearError: () => void;
}

const useResearchProject = (settings: LLMSettings, fileManager: IFileSystemManager | null): ResearchContextValue => {
  const [mode, setMode] = useState<'chat' | 'research'>('chat');
  const [projectSlug, setProjectSlug] = useState<string | null>(null);
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [messages, setMessages] = useState<ResearchChatMessage[]>([]);
  const [sources, setSources] = useState<SourceFile[]>([]);
  const [findings, setFindings] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isProjectLoading, setIsProjectLoading] = useState(false);
  const [isAddingSource, setIsAddingSource] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  const projectSlugRef = useRef(projectSlug);
  projectSlugRef.current = projectSlug;

  const projectRef = useRef(project);
  projectRef.current = project;

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fm = fileManager;

  // Autosave chat.json debounced
  useEffect(() => {
    if (!projectSlug || messages.length === 0 || !fm) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const p = projectRef.current;
        if (!p) return;
        p.messages = messagesRef.current;
        p.sourceFiles = sourcesRef.current;
        await researchVault.projects.save(projectSlug, p, fm);
      } catch (e) {
        console.error('[ResearchVault] autosave failed:', e);
      }
    }, 2000);
  }, [messages, projectSlug, fm]);

  // Open project
  const openProject = useCallback(async (slug: string) => {
    if (!fm) { setError('Vault not connected.'); return; }
    setIsProjectLoading(true);
    setError(null);
    try {
      const p = await researchVault.projects.open(slug, fm);
      const fnd = await researchVault.findings.load(slug, fm);
      setProject(p);
      setMessages(p.messages || []);
      setSources(p.sourceFiles || []);
      setFindings(fnd);
      setProjectSlug(slug);
      appEventBus.emit('research:projectOpened', { slug });
      // Also notify the active-project tracker for assistant tools
      const { setActiveProject } = await import('../services/researchVaultService');
      setActiveProject(slug);
    } catch (e: any) {
      setError(`Failed to open project: ${e?.message || e}`);
    } finally {
      setIsProjectLoading(false);
    }
  }, [fm]);

  // Close project
  const closeProject = useCallback(() => {
    setProjectSlug(null);
    setProject(null);
    setMessages([]);
    setSources([]);
    setFindings('');
    setError(null);
    appEventBus.emit('research:projectClosed', {});
    import('../services/researchVaultService').then(m => m.setActiveProject(null));
  }, []);

  // Add source
  const addSource = useCallback(async (input: SourceInput): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!fm) return { ok: false, error: 'Vault not connected.' };
    if (!projectSlug) return { ok: false, error: 'No active project.' };
    setIsAddingSource(true);
    setError(null);
    try {
      await researchVault.sources.add(projectSlug, input, fm);
      // Reload sources
      const p = await researchVault.projects.open(projectSlug, fm);
      setSources(p.sourceFiles || []);
      appEventBus.emit('research:sourceAdded', { slug: projectSlug, fileName: 'source' });
      return { ok: true };
    } catch (e: any) {
      const msg = `Failed to add source: ${e?.message || e}`;
      setError(msg);
      return { ok: false, error: msg };
    } finally {
      setIsAddingSource(false);
    }
  }, [fm, projectSlug]);

  // Remove source
  const removeSource = useCallback(async (fileName: string) => {
    if (!fm || !projectSlug) return;
    try {
      await researchVault.sources.remove(projectSlug, fileName, fm);
      setSources(prev => prev.filter(s => s.path !== `sources/${fileName}`));
      appEventBus.emit('research:sourceRemoved', { slug: projectSlug, fileName });
    } catch (e: any) {
      setError(`Failed to remove source: ${e?.message || e}`);
    }
  }, [fm, projectSlug]);

  // Send message
  const sendMessage = useCallback(async (text: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!fm) return { ok: false, error: 'Vault not connected.' };
    if (!projectSlug) return { ok: false, error: 'No active project.' };
    if (!text.trim()) return { ok: false, error: 'Message is empty.' };
    if (isProcessing) return { ok: false, error: 'Already processing.' };

    setIsProcessing(true);
    setError(null);

    const userMsg: ResearchChatMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);

    try {
      // Load source content so the assistant can answer questions about it
      // and cite it (buildSystemIdentity handles truncation + citation instructions).
      const sourceContext: SourceContext[] = await Promise.all(
        sourcesRef.current.map(async s => ({
          title: s.title,
          content: await researchVault.sources.readContent(projectSlug, s.path.replace(/^sources\//, ''), fm),
        }))
      );

      const augmentedMessages: ChatMsg[] = [
        ...messagesRef.current.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: text },
      ];

      let assistantText = '';
      for await (const event of runAssistantTurn(augmentedMessages, settings, sourceContext)) {
        if (event.type === 'text') assistantText += event.chunk;
      }

      // Parse citation footer from response
      let cleanText = assistantText;
      let citations: { index: number; fileName: string; title: string }[] | undefined;

      const footerMarker = '\n---\n';
      const footerIdx = assistantText.lastIndexOf(footerMarker);
      if (footerIdx !== -1) {
        cleanText = assistantText.slice(0, footerIdx);
        const footerLines = assistantText.slice(footerIdx + footerMarker.length).trim().split('\n');
        citations = footerLines
          .map(line => {
            const match = line.match(/\[(\d+)\]:\s*<?([^>]+)>?\s*-?\s*(.*)/);
            if (match) {
              return { index: parseInt(match[1], 10), fileName: match[2].trim(), title: match[3]?.trim() || match[2].trim() };
            }
            return null;
          })
          .filter((c): c is NonNullable<typeof c> => c !== null);
      }

      const assistantMsg: ResearchChatMessage = {
        role: 'assistant',
        content: cleanText,
        timestamp: new Date().toISOString(),
        citations: citations?.length ? citations : undefined,
      };

      setMessages(prev => [...prev, assistantMsg]);
      setIsProcessing(false);
      return { ok: true };
    } catch (e: any) {
      const msg = `Failed to send message: ${e?.message || e}`;
      setError(msg);
      // Keep the user message visible and add a system note about the failure
      setMessages(prev => [...prev, { role: 'system', content: msg, timestamp: new Date().toISOString() }]);
      setIsProcessing(false);
      return { ok: false, error: msg };
    }
  }, [projectSlug, fm, settings, isProcessing]);

  // Save findings
  const saveFindings = useCallback(async (text: string) => {
    if (!fm || !projectSlug) return;
    try {
      await researchVault.findings.save(projectSlug, text, fm);
      setFindings(text);
    } catch (e: any) {
      setError(`Failed to save findings: ${e?.message || e}`);
    }
  }, [fm, projectSlug]);

  // Listen for findingsAppended events (from assistant tools)
  useEffect(() => {
    if (!fm || !projectSlug) return;
    return appEventBus.on('research:findingsAppended', async ({ slug }: { slug: string }) => {
      if (slug === projectSlug) {
        const fnd = await researchVault.findings.load(slug, fm);
        setFindings(fnd);
      }
    });
  }, [fm, projectSlug]);

  return {
    mode, setMode,
    projectSlug, project, isProjectLoading, openProject, closeProject,
    sources, addSource, removeSource, isAddingSource,
    messages, sendMessage, isProcessing,
    findings, saveFindings,
    error, clearError,
  };
};

export { useResearchProject };
