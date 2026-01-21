import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { LLMSettings, ActiveSettingsTab, GalleryCategory, PromptCategory, SavedPrompt, FeatureSettings, YouTubeConnection } from '../types';
import { testOllamaConnection } from '../services/llmService';
import { fileSystemManager, createZipAndDownload, readZip } from '../utils/fileUtils';
import { useSettings } from '../contexts/SettingsContext';
import { NestedCategoryManager } from './NestedCategoryManager';
import { 
    loadCategories as loadGalleryCategoriesFS, 
    addCategory as addGalleryCategoryFS, 
    updateCategory as updateGalleryCategoryFS, 
    deleteCategory as deleteGalleryCategoryFS,
    saveCategoriesOrder as saveGalleryCategoriesOrderFS
} from '../utils/galleryStorage';
import { 
    loadPromptCategories, 
    addPromptCategory, 
    updatePromptCategory, 
    deletePromptCategory, 
    addMultipleSavedPrompts,
    savePromptCategoriesOrder as savePromptCategoriesOrderFS
} from '../utils/promptStorage';
import { resetAllSettings } from '../utils/settingsStorage';
import { AVAILABLE_LLM_MODELS, DAISYUI_LIGHT_THEMES, DAISYUI_DARK_THEMES } from '../constants';
import ConfirmationModal from './ConfirmationModal';
import { Cog6ToothIcon, CpuChipIcon, AppIcon, PromptIcon, PhotoIcon, FolderClosedIcon, PaintBrushIcon, DeleteIcon, CheckIcon, EditIcon, AdjustmentsVerticalIcon, SparklesIcon, DownloadIcon, LinkIcon, PlayIcon } from './icons';
import FeedbackModal from './FeedbackModal';
import { PromptTxtImportModal } from './PromptTxtImportModal';
import { enrichArtistDataWithDescriptions } from '../utils/artistStorage';
import LoadingSpinner from './LoadingSpinner';

interface SetupPageProps {
  activeSettingsTab: ActiveSettingsTab;
  setActiveSettingsTab: (tab: ActiveSettingsTab) => void;
  activeSubTab: string;
  setActiveSubTab: (subTab: string) => void;
  showGlobalFeedback: (message: string, isError?: boolean) => void;
}

const subMenuConfig: Record<string, { id: string; label: string, icon: React.ReactNode, description: string }[]> = {
    app: [
        { id: 'general', label: 'General', icon: <Cog6ToothIcon className="w-5 h-5" />, description: "Storage and system scale." },
        { id: 'features', label: 'Features', icon: <AdjustmentsVerticalIcon className="w-5 h-5" />, description: "Toggle available modules." },
        { id: 'integrations', label: 'Integrations', icon: <LinkIcon className="w-5 h-5" />, description: "Connect to third-party services." },
        { id: 'appearance', label: 'Appearance', icon: <PaintBrushIcon className="w-5 h-5" />, description: "Themes and visual styling." },
        { id: 'data', label: 'Backup & Restore', icon: <FolderClosedIcon className="w-5 h-5" />, description: "System data management." }
    ],
    llm: [ { id: 'provider', label: 'AI Settings', icon: <CpuChipIcon className="w-5 h-5" />, description: "AI models and API connections." } ],
    prompt: [
        { id: 'categories', label: 'Prompt Folders', icon: <FolderClosedIcon className="w-5 h-5" />, description: "Organize prompt hierarchies." },
        { id: 'data', label: 'Prompt Data', icon: <FolderClosedIcon className="w-5 h-5" />, description: "Import and export prompt text." }
    ],
    gallery: [
        { id: 'categories', label: 'Gallery Folders', icon: <FolderClosedIcon className="w-5 h-5" />, description: "Organize image hierarchies." },
        { id: 'data', label: 'Gallery Data', icon: <FolderClosedIcon className="w-5 h-5" />, description: "Export and manage gallery files." }
    ],
};

const SettingRow: React.FC<{ label: string, desc?: string, children: React.ReactNode }> = ({ label, desc, children }) => (
    <div className="p-8 border-b border-base-300 last:border-b-0 flex flex-col md:flex-row md:items-center justify-between gap-6 group hover:bg-base-200/30 transition-all">
        <div className="max-w-md min-w-0">
            <h4 className="text-sm font-black uppercase tracking-widest text-base-content/70 group-hover:text-primary transition-colors">{label}</h4>
            {desc && <p className="text-[10px] font-medium text-base-content/40 mt-1 uppercase leading-relaxed">{desc}</p>}
        </div>
        <div className="flex-shrink-0">
            {children}
        </div>
    </div>
);

export const SetupPage: React.FC<SetupPageProps> = ({ 
    activeSettingsTab, setActiveSettingsTab, activeSubTab, setActiveSubTab, showGlobalFeedback
}) => {
  const { settings: globalSettings, updateSettings } = useSettings();
  const { features } = globalSettings;
  const [settings, setSettings] = useState<LLMSettings>(globalSettings);
  const [modalFeedback, setModalFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [isTestingOllama, setIsTestingOllama] = useState(false);
  const [ollamaTestStatus, setOllamaTestStatus] = useState<'idle' | 'success' | 'failed' | 'error'>('idle');
  const [appDataDirectory, setAppDataDirectory] = useState<string | null>(fileSystemManager.appDirectoryName);
  
  const [resetTarget, setResetTarget] = useState<'all' | null>(null);
  const [isWorking, setIsWorking] = useState<boolean>(false);
  const importAllRefRef = useRef<HTMLInputElement>(null);
  const importGalleryRef = useRef<HTMLInputElement>(null);
  
  const [isTxtImportModalOpen, setIsTxtImportModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isRestartModalOpen, setIsRestartModalOpen] = useState(false);

  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState({ current: 0, total: 0 });

  const navRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [pillStyle, setPillStyle] = useState<React.CSSProperties>({ display: 'none' });
  const tokenClientRef = useRef<any>(null);

  useEffect(() => {
    // Access the build-injected environment variable
    const clientId = process.env.YOUTUBE_CLIENT_ID;
    
    const initGsi = () => {
        if (!clientId || clientId.includes('PLACEHOLDER')) {
            console.warn("YouTube Integration: YOUTUBE_CLIENT_ID is not configured in .env.local");
            return;
        }

        if ((window as any).google?.accounts?.oauth2) {
            tokenClientRef.current = (window as any).google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
                callback: (response: any) => {
                    if (response.error) {
                        showGlobalFeedback(`Auth Refused: ${response.error}`, true);
                        setIsWorking(false);
                        return;
                    }
                    handleAuthResponse(response.access_token);
                },
            });
        }
    };

    if (!(window as any).google) {
        const script = document.createElement('script');
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = initGsi;
        document.head.appendChild(script);
    } else {
        initGsi();
    }
  }, []);

  const handleAuthResponse = async (accessToken: string) => {
    setIsWorking(true);
    try {
      const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error?.message || "Failed to fetch channel.");
      }

      const data = await response.json();
      
      if (data.items && data.items.length > 0) {
        const channel = data.items[0];
        const updatedYoutube: YouTubeConnection = {
          isConnected: true,
          channelName: channel.snippet.title,
          accessToken: accessToken,
          subscriberCount: channel.statistics.subscriberCount,
          videoCount: parseInt(channel.statistics.videoCount),
          thumbnailUrl: channel.snippet.thumbnails.default.url,
          connectedAt: Date.now()
        };
        const updatedSettings = { ...settings, youtube: updatedYoutube };
        setSettings(updatedSettings);
        updateSettings(updatedSettings);
        showGlobalFeedback(`Linked to channel: ${channel.snippet.title}`);
      } else {
        showGlobalFeedback("Auth successful but no YouTube channel found.", true);
      }
    } catch (error: any) {
      showGlobalFeedback(`Integration Error: ${error.message}`, true);
    } finally {
      setIsWorking(false);
    }
  };

  const handleYouTubeConnect = () => {
    if (!process.env.YOUTUBE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID.includes('PLACEHOLDER')) {
        showGlobalFeedback("Configuration Missing: Add YOUTUBE_CLIENT_ID to .env.local", true);
        return;
    }

    if (!tokenClientRef.current) {
        showGlobalFeedback("Google Identity Client not initialized. Refresh and try again.", true);
        return;
    }
    setIsWorking(true);
    tokenClientRef.current.requestAccessToken({ prompt: 'consent' });
  };

  const mainCategories = useMemo(() => {
    const categories: {id: ActiveSettingsTab, label: string, icon: React.ReactNode}[] = [
        { id: 'app', label: 'APPLICATION', icon: <AppIcon className="w-5 h-5"/> },
        { id: 'llm', label: 'AI MODELS', icon: <CpuChipIcon className="w-5 h-5"/> },
    ];

    if (features.isPromptLibraryEnabled) {
        categories.push({ id: 'prompt', label: 'PROMPTS', icon: <PromptIcon className="w-5 h-5"/> });
    }
    if (features.isGalleryEnabled) {
        categories.push({ id: 'gallery', label: 'GALLERY', icon: <PhotoIcon className="w-5 h-5"/> });
    }
    return categories;
  }, [features]);

  useEffect(() => {
      const activeKey = `${activeSettingsTab}-${activeSubTab}`;
      const activeEl = navRefs.current[activeKey];
      const container = activeEl?.closest('nav');
      if (activeEl && container) {
          const rect = activeEl.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          setPillStyle({
              top: rect.top - containerRect.top + container.scrollTop,
              height: rect.height,
              width: rect.width,
              left: rect.left - containerRect.left,
              opacity: 1,
          });
      } else {
          setPillStyle({ opacity: 0 });
      }
  }, [activeSettingsTab, activeSubTab]);

  useEffect(() => {
    setSettings(globalSettings);
  }, [globalSettings]);
  
  const showFeedback = (message: string, isError: boolean = false) => {
    setModalFeedback({ message, type: isError ? 'error' : 'success' });
  };

  const handleSettingsChange = (field: keyof LLMSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    if (field === 'fontSize' && typeof window !== 'undefined') {
      (window as any).document.documentElement.style.fontSize = `${value}px`;
    }
  };

  const handleFeatureToggle = (feature: keyof FeatureSettings, value: boolean) => {
    setSettings(prev => ({
      ...prev,
      features: {
        ...prev.features,
        [feature]: value
      }
    }));
  };

  const handleYouTubeDisconnect = () => {
    const updatedYoutube: YouTubeConnection = { isConnected: false };
    const updatedSettings = { ...settings, youtube: updatedYoutube };
    setSettings(updatedSettings);
    updateSettings(updatedSettings); 
    showGlobalFeedback('YouTube connection revoked.');
  };

  const saveSettings = () => {
    updateSettings(settings);
    showFeedback('Settings verified.');
  };
  
  const handleCancel = () => {
      setSettings(globalSettings);
      if (typeof window !== 'undefined') {
        (window as any).document.documentElement.style.fontSize = `${globalSettings.fontSize}px`;
      }
      showFeedback('Changes abandoned.');
  };
  
  const handleTestOllamaConnection = async () => {
    setIsTestingOllama(true);
    setOllamaTestStatus('idle');
    try {
        const result = await testOllamaConnection(settings.ollamaBaseUrl);
        setOllamaTestStatus(result ? 'success' : 'failed');
    } catch(e) {
        setOllamaTestStatus('error');
    }
    setIsTestingOllama(false);
  };

  const handleSelectAppDataDirectory = async () => {
    const handle = await fileSystemManager.selectAndSetAppDataDirectory();
    if(handle) {
        setAppDataDirectory(handle.name);
        showFeedback('Local storage linked.');
        if (typeof window !== 'undefined') {
            setTimeout(() => (window as any).location.reload(), 1500);
        }
    }
  };
  
  const handleExportAll = async () => {
    setIsWorking(true);
    const manifestFiles = [ 'kollektiv_gallery_manifest.json', 'prompts_manifest.json' ];
    const filesToZip: {name: string, content: Blob}[] = [];

    for await (const handle of fileSystemManager.listDirectoryContents('')) {
        if(handle.kind === 'file' && manifestFiles.includes(handle.name)) {
            const file = await (handle as FileSystemFileHandle).getFile();
            filesToZip.push({ name: handle.name, content: file });
        } else if (handle.kind === 'directory') {
            for await (const subHandle of fileSystemManager.listDirectoryContents(handle.name)) {
                 if (subHandle.kind === 'file') {
                    const file = await (subHandle as FileSystemFileHandle).getFile();
                    filesToZip.push({ name: `${handle.name}/${subHandle.name}`, content: file });
                 }
            }
        }
    }
    await createZipAndDownload(filesToZip, `kollektiv_backup_${new Date().toISOString().split('T')[0]}.zip`);
    setIsWorking(false);
  };

  const handleExportPrompts = async () => {
    setIsWorking(true);
    const filesToZip: {name: string, content: Blob}[] = [];
    try {
        const manifestBlob = await fileSystemManager.getFileAsBlob('prompts_manifest.json');
        if (manifestBlob) filesToZip.push({ name: 'prompts_manifest.json', content: manifestBlob });
        for await (const handle of fileSystemManager.listDirectoryContents('prompts')) {
            if (handle.kind === 'file') {
                const file = await (handle as FileSystemFileHandle).getFile();
                filesToZip.push({ name: `prompts/${handle.name}`, content: file });
            }
        }
        if (filesToZip.length > 0) await createZipAndDownload(filesToZip, `kollektiv_prompts_backup_${new Date().toISOString().split('T')[0]}.zip`);
        else showFeedback('Empty prompt vault.', true);
    } catch (err) {
         showFeedback('Export failure.', true);
    } finally {
        setIsWorking(false);
    }
  };
  
  const handleImportAll = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!(e.currentTarget as any).files?.length) return;
    setIsWorking(true);
    try {
        const zipFile = (e.currentTarget as any).files![0];
        const zip = await readZip(zipFile);
        for(const relativePath in zip.files) {
            const fileData = await zip.files[relativePath].async('blob');
            await fileSystemManager.saveFile(relativePath, fileData);
        }
        showFeedback('Restoration complete. Refreshing...');
        setTimeout(() => { if (typeof window !== 'undefined') (window as any).location.reload(); }, 2000);
    } catch (err) {
        showFeedback('Import failure.', true);
    } finally {
        setIsWorking(false);
    }
  };

  const handleExportGallery = async () => {
    setIsWorking(true);
    const filesToZip: {name: string, content: Blob}[] = [];
    try {
        const manifestBlob = await fileSystemManager.getFileAsBlob('kollektiv_gallery_manifest.json');
        if (manifestBlob) filesToZip.push({ name: 'kollektiv_gallery_manifest.json', content: manifestBlob });
        async function recursivelyAddFiles(currentPath: string) {
            for await (const handle of fileSystemManager.listDirectoryContents(currentPath)) {
                const newPath = `${currentPath}/${handle.name}`;
                if (handle.kind === 'file') {
                    const file = await (handle as FileSystemFileHandle).getFile();
                    filesToZip.push({ name: newPath, content: file });
                } else if (handle.kind === 'directory') {
                    await recursivelyAddFiles(newPath);
                }
            }
        }
        await recursivelyAddFiles('gallery');
        if (filesToZip.length > 0) await createZipAndDownload(filesToZip, `kollektiv_gallery_backup_${new Date().toISOString().split('T')[0]}.zip`);
        else showFeedback('No media artifacts found.', true);
    } catch (err) {
         showFeedback('Archival failure.', true);
    } finally {
        setIsWorking(false);
    }
  };

  const handleImportGallery = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!(e.currentTarget as any).files?.length) return;
    setIsWorking(true);
    try {
        const zipFile = (e.currentTarget as any).files![0];
        const zip = await readZip(zipFile);
        let foundGalleryData = false;
        for(const relativePath in zip.files) {
            if (relativePath.startsWith('gallery/') || relativePath === 'kollektiv_gallery_manifest.json') {
                foundGalleryData = true;
                const fileData = await zip.files[relativePath].async('blob');
                await fileSystemManager.saveFile(relativePath, fileData);
            }
        }
        if (foundGalleryData) {
            showFeedback('Gallery merged. Refreshing...');
            setTimeout(() => { if (typeof window !== 'undefined') (window as any).reload(); }, 2000);
        } else showFeedback('No recognized media in package.', true);
    } catch (err) {
        showFeedback('Ingestion failed.', true);
    } finally {
        setIsWorking(false);
    }
  };

  const handleReset = async () => {
      if (!resetTarget) return;
      setIsWorking(true);
      if (resetTarget === 'all') {
          await resetAllSettings();
          showFeedback('Factory reset confirmed. Purging...');
          setTimeout(() => { if (typeof window !== 'undefined') (window as any).location.reload(); }, 2000);
      }
      setIsWorking(false);
      setResetTarget(null);
      setIsResetModalOpen(false);
  };
  
  const handleConfirmRestart = async () => {
      setIsRestartModalOpen(false);
      setIsWorking(true);
      showFeedback('Flushing neural buffers...');
      try {
          if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
              const registrations = await navigator.serviceWorker.getRegistrations();
              for (const registration of registrations) { await registration.unregister(); }
          }
          if (typeof window !== 'undefined' && 'caches' in window) {
              const keys = await caches.keys();
              await Promise.all(keys.map(key => caches.delete(key)));
          }
          showFeedback('Cycle complete.');
          setTimeout(() => { if (typeof window !== 'undefined') (window as any).location.reload(); }, 1500);
      } catch (error) {
          showFeedback('Reset sequence failure.', true);
          setIsWorking(false);
      }
  };

  const handleEnrichArtistData = async () => {
    setIsEnriching(true);
    setEnrichmentProgress({ current: 0, total: 0 });
    try {
        const { updated, total } = await enrichArtistDataWithDescriptions(settings, (progress) => {
            setEnrichmentProgress(progress);
        });
        if (total > 0) showFeedback(`Synchronized ${updated} records.`);
        else showFeedback('Archives are up to date.');
    } catch (e) {
        showFeedback('Synchronization error.', true);
    } finally {
        setIsEnriching(false);
    }
  };

  const handleSubCategoryClick = (mainTab: ActiveSettingsTab, subTab: string) => {
      setActiveSettingsTab(mainTab);
      setActiveSubTab(subTab);
  };
  
  const isGeminiKeyMissing = useMemo(() => {
    return settings.activeLLM === 'gemini' && !process.env.API_KEY;
  }, [settings.activeLLM]);

    const renderAppSettings = () => {
        switch(activeSubTab) {
            case 'general':
                return (
                    <div className="flex flex-col">
                        <SettingRow label="Data Vault" desc="Link a local directory to host your generative library.">
                             <button onClick={handleSelectAppDataDirectory} className="btn btn-secondary btn-sm rounded-none font-black text-[10px] tracking-widest px-6">
                                {appDataDirectory ? `VAULT: ${appDataDirectory}` : 'SELECT FOLDER'}
                             </button>
                        </SettingRow>
                        <SettingRow label="Text Scale" desc="Interface font size for high-density information.">
                             <div className="flex items-center gap-4 w-48">
                                <input type="range" min={10} max={18} value={settings.fontSize} onChange={(e) => handleSettingsChange('fontSize', Number((e.currentTarget as any).value))} className="range range-xs range-primary" />
                                <span className="text-[10px] font-mono font-bold text-primary">{settings.fontSize}PX</span>
                             </div>
                        </SettingRow>
                        <SettingRow label="System Reset" desc="Purge cached assets and reload the core engine.">
                             <button onClick={() => setIsRestartModalOpen(true)} className="btn btn-warning btn-sm rounded-none font-black text-[10px] tracking-widest" disabled={isWorking}>
                                {isWorking ? 'WORKING...' : 'COLD RESTART'}
                            </button>
                        </SettingRow>
                    </div>
                );
            case 'features':
                return (
                    <div className="flex flex-col">
                        <SettingRow label="Prompt Archiver" desc="Enable the module for long-term token storage.">
                            <input type="checkbox" checked={settings.features.isPromptLibraryEnabled} onChange={(e) => handleFeatureToggle('isPromptLibraryEnabled', (e.currentTarget as any).checked)} className="toggle toggle-primary toggle-sm" />
                        </SettingRow>
                        <SettingRow label="Visual Repository" desc="Enable the high-performance media gallery.">
                            <input type="checkbox" checked={settings.features.isGalleryEnabled} onChange={(e) => handleFeatureToggle('isGalleryEnabled', (e.currentTarget as any).checked)} className="toggle toggle-primary toggle-sm" />
                        </SettingRow>
                        <SettingRow label="Archival Guides" desc="Enable the curated aesthetic and creator index.">
                            <input type="checkbox" checked={settings.features.isCheatsheetsEnabled} onChange={(e) => handleFeatureToggle('isCheatsheetsEnabled', (e.currentTarget as any).checked)} className="toggle toggle-primary toggle-sm" />
                        </SettingRow>
                        <SettingRow label="Utility Suite" desc="Enable the image processor and video joiner modules.">
                            <input type="checkbox" checked={settings.features.isToolsEnabled} onChange={(e) => handleFeatureToggle('isToolsEnabled', (e.currentTarget as any).checked)} className="toggle toggle-primary toggle-sm" />
                        </SettingRow>
                    </div>
                );
            case 'integrations':
                return (
                    <div className="flex flex-col">
                        <SettingRow label="YouTube Direct" desc="Securely link your account to publish artifacts via Google API. Requires OAuth Client ID in environment.">
                            {settings.youtube?.isConnected ? (
                                <div className="flex flex-col gap-6 w-full max-w-lg">
                                    <div className="flex items-start gap-6 p-6 bg-base-200/50 border border-base-300 rounded-none group/card">
                                        <div className="relative flex-shrink-0">
                                            <img src={settings.youtube.thumbnailUrl} className="w-20 h-20 rounded-none bg-black grayscale group-hover/card:grayscale-0 transition-all duration-500" alt="Identity" />
                                            <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-primary flex items-center justify-center shadow-xl">
                                                <PlayIcon className="w-4 h-4 text-primary-content" />
                                            </div>
                                        </div>
                                        <div className="flex-grow min-w-0">
                                            <h5 className="text-xl font-black tracking-tighter uppercase mb-1 truncate">{settings.youtube.channelName}</h5>
                                            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                                <div className="flex flex-col">
                                                    <span className="text-[8px] font-black uppercase text-base-content/30 tracking-widest">Global Audience</span>
                                                    <span className="text-sm font-bold font-mono">{settings.youtube.subscriberCount}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[8px] font-black uppercase text-base-content/30 tracking-widest">Artifact Count</span>
                                                    <span className="text-sm font-bold font-mono">{settings.youtube.videoCount}</span>
                                                </div>
                                                <div className="flex flex-col col-span-2 mt-2">
                                                    <span className="text-[8px] font-black uppercase text-base-content/30 tracking-widest">Connection State</span>
                                                    <span className="text-[10px] font-mono text-success uppercase">AUTHORIZED</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <button onClick={handleYouTubeConnect} className="btn btn-xs btn-ghost text-primary font-black uppercase tracking-widest">Refresh Token</button>
                                        <button onClick={handleYouTubeDisconnect} className="btn btn-xs btn-ghost text-error font-black uppercase tracking-widest hover:bg-error/10">Purge Access</button>
                                    </div>
                                </div>
                            ) : (
                                <button onClick={handleYouTubeConnect} className="btn btn-sm btn-outline rounded-none font-black text-[10px] tracking-widest uppercase px-6" disabled={isWorking}>
                                    {isWorking ? 'INITIALIZING...' : 'AUTHORIZE YOUTUBE'}
                                </button>
                            )}
                        </SettingRow>
                    </div>
                );
            case 'appearance':
                return (
                    <div className="flex flex-col">
                        <SettingRow label="Chroma: Bright" desc="Primary theme for illuminated environments.">
                            <select value={settings.lightTheme} onChange={(e) => handleSettingsChange('lightTheme', (e.currentTarget as any).value)} className="select select-bordered select-sm rounded-none font-bold tracking-tight w-48">
                                {DAISYUI_LIGHT_THEMES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                            </select>
                        </SettingRow>
                        <SettingRow label="Chroma: Obscure" desc="Primary theme for low-light environments.">
                            <select value={settings.darkTheme} onChange={(e) => handleSettingsChange('darkTheme', (e.currentTarget as any).value)} className="select select-bordered select-sm rounded-none font-bold tracking-tight w-48">
                                {DAISYUI_DARK_THEMES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                            </select>
                        </SettingRow>
                    </div>
                );
            case 'data':
                 return (
                     <div className="flex flex-col">
                        <SettingRow label="Global Archival" desc="Package all tokens and media into a compressed archive.">
                             <button onClick={handleExportAll} className="btn btn-sm btn-secondary rounded-none font-black text-[10px] tracking-widest px-6" disabled={isWorking || isEnriching}>{isWorking ? 'ARCHIVING...' : 'EXPORT ALL'}</button>
                        </SettingRow>
                        <SettingRow label="Vault Restoration" desc="Overwrite current registry with a previous backup file.">
                             <button onClick={() => (importAllRefRef.current as any)?.click()} className="btn btn-sm btn-ghost border border-base-300 rounded-none font-black text-[10px] tracking-widest px-6" disabled={isWorking || isEnriching}>{isWorking ? 'WAITING...' : 'IMPORT ZIP'}</button>
                             <input type="file" ref={importAllRefRef} onChange={handleImportAll} className="hidden" accept=".zip"/>
                        </SettingRow>
                        <SettingRow label="AI Data Enrichment" desc="Utilize intelligence to populate missing artist metadata.">
                            {isEnriching ? (
                                <div className="space-y-2 w-48">
                                    <span className="text-[9px] font-black uppercase text-primary">SCANNING: {enrichmentProgress.current}/{enrichmentProgress.total}</span>
                                    <span className="text-[10px] font-mono text-base-content/40 ml-2">({enrichmentProgress.current}/{enrichmentProgress.total})</span>
                                    <progress className="progress progress-primary w-full h-1" value={enrichmentProgress.current} max={enrichmentProgress.total}></progress>
                                </div>
                            ) : (
                                <button onClick={handleEnrichArtistData} className="btn btn-sm btn-secondary rounded-none font-black text-[10px] tracking-widest" disabled={isWorking || isGeminiKeyMissing}>
                                    INITIALIZE SCAN
                                </button>
                            )}
                        </SettingRow>
                        <SettingRow label="Registry Wipe" desc="Permanent deletion of all local files and configuration.">
                            <button onClick={() => { setResetTarget('all'); setIsResetModalOpen(true); }} className="btn btn-sm btn-error rounded-none font-black text-[10px] tracking-widest" disabled={isWorking || isEnriching}>WIPE VAULT</button>
                        </SettingRow>
                     </div>
                 );
            default: return null;
        }
    };

    const renderLLMSettings = () => (
        <div className="flex flex-col">
            <SettingRow label="Intelligence Engine" desc="Select the neural core for prompt construction.">
                 <div className="flex flex-col gap-2">
                    <label className="label cursor-pointer gap-4 p-0">
                        <span className="text-[10px] font-black uppercase tracking-widest text-base-content/40">CLOUD: GOOGLE GEMINI</span>
                        <input type="radio" name="llm-provider" className="radio radio-primary radio-sm" checked={settings.activeLLM === 'gemini'} onChange={() => handleSettingsChange('activeLLM', 'gemini')} />
                    </label>
                    <label className="label cursor-pointer gap-4 p-0">
                        <span className="text-[10px] font-black uppercase tracking-widest text-base-content/40">LOCAL: OLLAMA SERVER</span>
                        <input type="radio" name="llm-provider" className="radio radio-primary radio-sm" checked={settings.activeLLM === 'ollama'} onChange={() => handleSettingsChange('activeLLM', 'ollama')} />
                    </label>
                 </div>
            </SettingRow>
            {settings.activeLLM === 'gemini' && (
                <div className="animate-fade-in flex flex-col">
                    <SettingRow label="Gemini Tier" desc="Specific model variant for complex reasoning.">
                        <select value={settings.llmModel} onChange={(e) => handleSettingsChange('llmModel', (e.currentTarget as any).value)} className="select select-bordered select-sm rounded-none font-bold tracking-tight w-64">
                            {AVAILABLE_LLM_MODELS.map(m => <option key={m.id} value={m.id}>{m.name.toUpperCase()}</option>)}
                        </select>
                    </SettingRow>
                </div>
            )}
            {settings.activeLLM === 'ollama' && (
                 <div className="animate-fade-in flex flex-col">
                    <SettingRow label="Host Address" desc="Network endpoint of your local Ollama instance.">
                        <div className="join w-64">
                            <input type="text" value={settings.ollamaBaseUrl} onChange={(e) => handleSettingsChange('ollamaBaseUrl', (e.currentTarget as any).value)} className="input input-bordered input-sm join-item w-full font-mono text-xs" />
                            <button onClick={handleTestOllamaConnection} disabled={isTestingOllama} className="btn btn-sm btn-ghost border border-base-300 join-item text-[10px] font-black">{isTestingOllama ? '...' : 'PING'}</button>
                        </div>
                    </SettingRow>
                    <SettingRow label="Model Identifier" desc="Exact name of the local weights to utilize.">
                        <input type="text" value={settings.ollamaModel} onChange={(e) => handleSettingsChange('ollamaModel', (e.currentTarget as any).value)} className="input input-bordered input-sm rounded-none font-bold tracking-tight w-64" placeholder="llama3.2"/>
                    </SettingRow>
                </div>
            )}
        </div>
    );

    const renderPromptSettings = () => {
        switch(activeSubTab) {
            case 'categories': return (
                <NestedCategoryManager 
                    title="Prompt Registry" 
                    type="prompt"
                    loadFn={loadPromptCategories} 
                    addFn={(name, _isNsfw, parentId) => addPromptCategory(name, parentId)} 
                    updateFn={updatePromptCategory} 
                    deleteFn={deletePromptCategory} 
                    saveOrderFn={savePromptCategoriesOrderFS}
                    deleteConfirmationMessage={(name) => `Delete folder "${name}"? Tokens will be moved to general.`} 
                />
            );
            case 'data': return (
                <div className="flex flex-col">
                    <SettingRow label="Token Export" desc="Download all generative formulas as a single archive.">
                        <button onClick={handleExportPrompts} className="btn btn-sm btn-secondary rounded-none font-black text-[10px] tracking-widest px-8" disabled={isWorking}>DOWNLOAD ZIP</button>
                    </SettingRow>
                    <SettingRow label="Bulk Ingestion" desc="Import a collection of text files into the library.">
                        <button onClick={() => setIsTxtImportModalOpen(true)} className="btn btn-sm btn-accent rounded-none font-black text-[10px] tracking-widest px-8">INITIALIZE IMPORT</button>
                    </SettingRow>
                </div>
            );
            default: return null;
        }
    };

    const renderGallerySettings = () => {
        switch(activeSubTab) {
            case 'categories': return (
                <NestedCategoryManager 
                    title="Media Registry" 
                    type="gallery"
                    loadFn={loadGalleryCategoriesFS} 
                    addFn={addGalleryCategoryFS} 
                    updateFn={updateGalleryCategoryFS} 
                    deleteFn={deleteGalleryCategoryFS} 
                    saveOrderFn={saveGalleryCategoriesOrderFS}
                    deleteConfirmationMessage={(name) => `Delete folder "${name}"? Media will be moved to general collection.`} 
                />
            );
            case 'data': return (
                <div className="flex flex-col">
                    <SettingRow label="Media Export" desc="Archive all gallery images and sequences to your local disk.">
                         <button onClick={handleExportGallery} className="btn btn-sm btn-secondary rounded-none font-black text-[10px] tracking-widest px-8" disabled={isWorking}>DOWNLOAD ZIP</button>
                    </SettingRow>
                    <SettingRow label="Media Restore" desc="Inject an external media archive into your local vault.">
                         <button onClick={() => (importGalleryRef.current as any)?.click()} className="btn btn-sm btn-ghost border border-base-300 rounded-none font-black text-[10px] tracking-widest px-8" disabled={isWorking}>UPLOAD ZIP</button>
                         <input type="file" ref={importGalleryRef} onChange={handleImportGallery} className="hidden" accept=".zip"/>
                    </SettingRow>
                </div>
            );
            default: return null;
        }
    };
    
    const renderContent = () => {
        switch(activeSettingsTab) {
            case 'app': return renderAppSettings();
            case 'llm': return renderLLMSettings();
            case 'prompt': return renderPromptSettings();
            case 'gallery': return renderGallerySettings();
            default: return null;
        }
    };

    const currentSubTab = subMenuConfig[activeSettingsTab]?.find(sub => sub.id === activeSubTab);
    const heroTitle = mainCategories.find(c => c.id === activeSettingsTab)?.label || 'REGISTRY';
    const heroDesc = currentSubTab?.description || 'Core Configuration';
    
  return (
    <>
    <section className="flex flex-row bg-base-100 text-base-content h-full overflow-hidden">
        <aside className="w-80 flex-shrink-0 bg-base-100 p-6 flex flex-col">
            <h1 className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 mb-8 px-3">System Navigation</h1>
            <nav className="flex-grow overflow-y-auto custom-scrollbar relative">
                <div className="absolute bg-primary rounded-lg shadow-lg pointer-events-none transition-all duration-300 ease-in-out" style={pillStyle} />
                <ul className="menu p-0 gap-8 relative z-10">
                   {mainCategories.map(mainCat => (
                       <li key={mainCat.id}>
                           <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 mb-2 px-3">{mainCat.label}</h2>
                           <ul className="gap-0.5">
                            {(subMenuConfig[mainCat.id as ActiveSettingsTab] || []).map(subCat => (
                                <li key={subCat.id} className="p-0">
                                    <a ref={(el) => { navRefs.current[`${mainCat.id}-${subCat.id}`] = el; }} onClick={() => handleSubCategoryClick(mainCat.id as ActiveSettingsTab, subCat.id)}
                                        className={`flex items-center p-2.5 rounded-lg text-base font-medium transition-colors cursor-pointer relative z-10 ${
                                            activeSettingsTab === mainCat.id && activeSubTab === subCat.id ? 'text-primary-content font-bold' : 'text-base-content/70 hover:bg-base-200'
                                        }`}
                                    >
                                        <div className="mr-3 opacity-40">{subCat.icon}</div>
                                        <div className="flex flex-col"><span className="text-[11px] font-black uppercase tracking-widest">{subCat.label}</span></div>
                                    </a>
                                </li>
                            ))}
                           </ul>
                       </li>
                   ))}
                </ul>
            </nav>
        </aside>

        <main className="flex-grow flex flex-col overflow-hidden bg-base-100 border-l border-base-300">
            <div className="flex-grow overflow-y-auto overflow-x-hidden custom-scrollbar">
                <section className="p-10 lg:p-16 border-b border-base-300 bg-base-200/20">
                    <div className="max-w-screen-2xl mx-auto flex flex-col md:flex-row items-end justify-between gap-12">
                        <div className="flex-1">
                            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-base-content leading-tight mb-6">{heroTitle}<span className="text-primary">.</span></h1>
                            <p className="text-base font-bold text-base-content/40 uppercase tracking-[0.3em] max-w-md">{heroDesc}</p>
                        </div>
                    </div>
                </section>
                <div className="bg-base-100">{renderContent()}</div>
            </div>
            {(activeSettingsTab === 'app' || activeSettingsTab === 'llm') && (
                 <footer className="border-t border-base-300 flex bg-base-200/5 p-0 overflow-hidden flex-shrink-0">
                    <button onClick={handleCancel} className="btn flex-1 rounded-none uppercase font-black text-[10px] tracking-widest hover:bg-base-300 border-r border-base-300 transition-colors">Revert</button>
                    <button onClick={saveSettings} className="btn btn-primary flex-1 rounded-none uppercase font-black text-[10px] tracking-widest shadow-lg transition-colors">Confirm Changes</button>
                </footer>
            )}
        </main>
      </section>
      {modalFeedback && <FeedbackModal isOpen={!!modalFeedback} onClose={() => setModalFeedback(null)} message={modalFeedback.message} type={modalFeedback.type} />}
      <ConfirmationModal isOpen={isResetModalOpen} onClose={() => setIsResetModalOpen(false)} onConfirm={handleReset} title={`VAULT PURGE`} message={'Erase all media, tokens, and settings? This cycle is non-reversible.'} />
      <ConfirmationModal isOpen={isRestartModalOpen} onClose={() => setIsRestartModalOpen(false)} onConfirm={handleConfirmRestart} title="SYSTEM REBOOT" message="Clear neural cache and reload core interface. Proceed?" btnClassName="btn-warning" />
      <PromptTxtImportModal isOpen={isTxtImportModalOpen} onClose={() => setIsTxtImportModalOpen(false)} categories={[]} onImport={async (file, categoryId) => {
          const zip = await readZip(file);
          const promptsToSave: Omit<SavedPrompt, 'id' | 'createdAt'>[] = [];
          for(const relativePath in zip.files) {
              if (relativePath.toLowerCase().endsWith('.txt')) {
                  const text = await zip.files[relativePath].async('string');
                  if (text.trim()) promptsToSave.push({ text: text.trim(), title: relativePath.replace(/\.txt$/i, ''), categoryId: categoryId || undefined });
              }
          }
          if (promptsToSave.length > 0) {
              await addMultipleSavedPrompts(promptsToSave);
              showGlobalFeedback(`Ingested ${promptsToSave.length} formulas.`);
          } else showGlobalFeedback('No text artifacts detected.', true);
          setIsTxtImportModalOpen(false);
      }} />
    </>
  );
};