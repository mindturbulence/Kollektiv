
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { gsap } from 'gsap';
import type { LLMSettings, ActiveSettingsTab, PromptCategory, FeatureSettings, YouTubeConnection, GoogleIdentityConnection } from '../types';
import { testOllamaConnection, type OllamaTestResult } from '../services/llmService';
import { fileSystemManager, createZipAndDownload } from '../utils/fileUtils';
import { useSettings } from '../contexts/SettingsContext';
import { NestedCategoryManager } from './NestedCategoryManager';
import { 
    loadCategories as loadGalleryCategoriesFS, 
    addCategory as addGalleryCategoryFS, 
    updateCategory as updateCategoryFS, 
    deleteCategory as deleteGalleryCategoryFS,
    saveCategoriesOrder as saveGalleryCategoriesOrderFS
} from '../utils/galleryStorage';
import { 
    loadPromptCategories, 
    addPromptCategory, 
    updatePromptCategory, 
    deletePromptCategory, 
    savePromptCategoriesOrder as savePromptCategoriesOrderFS
} from '../utils/promptStorage';
import { resetAllSettings, defaultLLMSettings } from '../utils/settingsStorage';
import { DAISYUI_DARK_THEMES } from '../constants';
import ConfirmationModal from './ConfirmationModal';
import { Cog6ToothIcon, CpuChipIcon, AppIcon, PromptIcon, PhotoIcon, FolderClosedIcon, PaintBrushIcon, AdjustmentsVerticalIcon, DownloadIcon, LinkIcon, PlayIcon, RefreshIcon, InformationCircleIcon, UploadIcon, InstagramIcon } from './icons';
import FeedbackModal from './FeedbackModal';
import { audioService } from '../services/audioService';
import { PromptTxtImportModal } from './PromptTxtImportModal';
import { rebuildGalleryDatabase, rebuildPromptDatabase, optimizeManifests, verifyAndRepairFiles } from '../utils/integrity';
import AutocompleteSelect from './AutocompleteSelect';

interface SetupPageProps {
  activeSettingsTab: ActiveSettingsTab;
  setActiveSettingsTab: (tab: ActiveSettingsTab) => void;
  activeSubTab: string;
  setActiveSubTab: (subTab: string) => void;
  showGlobalFeedback: (message: string, isError?: boolean) => void;
}

const subMenuConfig: Record<string, { id: string; label: string, icon: React.ReactNode, description: string }[]> = {
    app: [
        { id: 'general', label: 'General', icon: <Cog6ToothIcon className="w-4 h-4" />, description: "Storage and engine lifecycle." },
        { id: 'features', label: 'Features', icon: <AdjustmentsVerticalIcon className="w-4 h-4" />, description: "Toggle available modules." },
        { id: 'data', label: 'Backup & Restore', icon: <FolderClosedIcon className="w-4 h-4" />, description: "System data management." }
    ],
    appearance: [
        { id: 'styling', label: 'Visual Interface', icon: <PaintBrushIcon className="w-4 h-4" />, description: "Themes, scales, and dashboard cinematic assets." }
    ],
    integrations: [
        { id: 'llm', label: 'AI Engine', icon: <CpuChipIcon className="w-4 h-4" />, description: "AI models and local/cloud API connections." },
        { id: 'google', label: 'Cloud Identity', icon: <LinkIcon className="w-4 h-4" />, description: "Link your Google account for Cloud AI." },
        { id: 'youtube', label: 'YouTube', icon: <PlayIcon className="w-4 h-4" />, description: "Manage YouTube API credentials." },
        { id: 'instagram', label: 'Instagram', icon: <InstagramIcon className="w-4 h-4" />, description: "Manage Instagram API credentials." }
    ],
    prompt: [
        { id: 'categories', label: 'Prompt Folders', icon: <FolderClosedIcon className="w-4 h-4" />, description: "Organize prompt hierarchies." },
        { id: 'data', label: 'Prompt Data', icon: <FolderClosedIcon className="w-4 h-4" />, description: "Import and export prompt text." }
    ],
    gallery: [
        { id: 'categories', label: 'Gallery Folders', icon: <FolderClosedIcon className="w-4 h-4" />, description: "Organize image hierarchies." },
        { id: 'data', label: 'Gallery Data', icon: <FolderClosedIcon className="w-4 h-4" />, description: "Export and manage gallery files." }
    ],
};

const MaintenanceOverlay: React.FC<{ progress: number, message: string }> = ({ progress, message }) => {
    const textWrapperRef = useRef<HTMLDivElement>(null);
    
    useLayoutEffect(() => {
        if (!textWrapperRef.current) return;
        gsap.fromTo(textWrapperRef.current, 
            { yPercent: 100, autoAlpha: 0 }, 
            { yPercent: 0, autoAlpha: 1, duration: 1.2, ease: "expo.out" }
        );
    }, []);

    // Exit Sequence
    useEffect(() => {
        if (progress >= 100 && textWrapperRef.current) {
            gsap.to(textWrapperRef.current, {
                y: -80,
                autoAlpha: 0,
                duration: 0.8,
                ease: "expo.inOut",
                delay: 0.2
            });
        }
    }, [progress]);

    return (
        <div className="fixed inset-0 bg-base-100 z-[500] flex flex-col items-center justify-center overflow-hidden select-none">
            <div className="absolute inset-0 bg-grid-texture opacity-[0.03] pointer-events-none"></div>
            
            {/* Large Background Percentage (SR Seventy One Style) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                <span 
                    className="text-[25vw] font-black opacity-[0.03] leading-none select-none transition-all duration-500 ease-out font-logo"
                    style={{ transform: `translateY(${(100 - progress) * 0.2}px)` }}
                >
                    {Math.round(progress).toString().padStart(2, '0')}
                </span>
            </div>

            <div className="relative z-10 flex flex-col items-center">
                <div className="overflow-hidden mb-6 px-4">
                    <h1 ref={textWrapperRef} className="grid grid-cols-1 grid-rows-1 text-2xl md:text-4xl font-black tracking-tighter uppercase select-none items-center font-logo">
                        <span className="text-base-content/10 block leading-none py-2 row-start-1 col-start-1">
                            Kollektiv<span className="text-primary/10 italic">.</span>
                        </span>
                        
                        <div 
                            className="row-start-1 col-start-1 h-full overflow-hidden transition-all duration-700 ease-out border-r border-base-content/20"
                            style={{ width: `${progress}%` }}
                        >
                            <span className="text-base-content block whitespace-nowrap leading-none py-2 drop-shadow-[0_0_20px_rgba(var(--bc),0.15)]">
                                Kollektiv<span className="text-primary italic">.</span>
                            </span>
                        </div>
                    </h1>
                </div>

                <div className={`flex flex-col items-center gap-4 transition-all duration-500 ${progress >= 100 ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}`}>
                    <div className="flex flex-col items-center gap-2">
                        <p className="text-[10px] font-mono font-bold uppercase tracking-[0.5em] text-center text-base-content/40">
                            {message || 'DIAGNOSTIC_ACTIVE'}
                        </p>
                        
                        {/* Minimal Progress Bar */}
                        <div className="w-32 h-[1px] bg-base-content/10 relative overflow-hidden">
                            <div 
                                className="absolute inset-y-0 left-0 bg-primary transition-all duration-500 ease-out"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        
                        <span className="text-[10px] font-mono font-bold text-primary/60">
                            {Math.round(progress)}%
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const SetupNavItem: React.FC<{
  id: string;
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
  registerRef: (el: HTMLAnchorElement | null) => void;
}> = ({ label, icon, isActive, onClick, registerRef }) => (
    <li>
        <a
          ref={registerRef}
          onClick={() => {
            audioService.playClick();
            onClick();
          }}
          onMouseEnter={() => audioService.playHover()}
          className={`flex items-center p-2.5 text-base font-medium transition-colors cursor-pointer relative z-10 ${
            isActive
              ? 'text-primary'
              : 'text-base-content/70 hover:text-base-content'
          }`}
        >
          <div className="mr-3">{icon}</div>
          <span className="uppercase text-[10px] font-black tracking-widest">{label}</span>
        </a>
    </li>
);

const SettingRow: React.FC<{ label: string, desc?: string, children: React.ReactNode }> = ({ label, desc, children }) => (
    <div className="p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 group hover:bg-base-200/30 transition-all">
        <div className="max-w-md min-w-0">
            <h4 className="text-sm font-black uppercase tracking-widest text-base-content/70 group-hover:text-primary transition-colors">{label}</h4>
            {desc && <p className="text-[10px] font-medium text-base-content/40 mt-1 uppercase leading-relaxed">{desc}</p>}
        </div>
        <div className="flex-shrink-0 w-full md:w-auto">
            {children}
        </div>
    </div>
);

export const SetupPage: React.FC<SetupPageProps> = ({ 
    activeSettingsTab, setActiveSettingsTab, activeSubTab, setActiveSubTab, showGlobalFeedback
}) => {
  const { settings: globalSettings, updateSettings, availableOllamaModels, availableOllamaCloudModels, refreshOllamaModels } = useSettings();
  const { features } = globalSettings;
  const [settings, setSettings] = useState<LLMSettings>(globalSettings);
  const [modalFeedback, setModalFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [isTestingOllama, setIsTestingOllama] = useState(false);
  const [ollamaTestResult, setOllamaTestResult] = useState<OllamaTestResult | null>(null);
  const [appDataDirectory, setAppDataDirectory] = useState<string | null>(fileSystemManager.appDirectoryName);
  
  const [resetTarget, setResetTarget] = useState<'all' | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [maintenanceProgress, setMaintenanceProgress] = useState(0);
  const [maintenanceMsg, setMaintenanceMsg] = useState("");
  
  // Keep appDataDirectory in sync with fileSystemManager
  useEffect(() => {
    setAppDataDirectory(fileSystemManager.appDirectoryName);
  }, [fileSystemManager.appDirectoryName]);
  
  const [isRestartModalOpen, setIsRestartModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isTxtImportModalOpen, setIsTxtImportModalOpen] = useState(false);
  const [promptCategories, setPromptCategories] = useState<PromptCategory[]>([]);

  const navRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const tokenClientRef = useRef<any>(null);
  const lastClientIdRef = useRef<string | null>(null);
  const authModeRef = useRef<'youtube' | 'google'>('google');
  const authTimeoutRef = useRef<number | null>(null);

  // --- AUDIO ENGINE: SUCCESS CHIME ---
  const playSuccessChime = useCallback(() => {
    audioService.playSuccess();
  }, []);

  const handleAuthResponse = useCallback(async (accessToken: string, mode: 'youtube' | 'google') => {
    if (authTimeoutRef.current) {
        window.clearTimeout(authTimeoutRef.current);
        authTimeoutRef.current = null;
    }

    try {
      if (mode === 'youtube') {
          // Use proxy to bypass COEP/CORS
          const response = await fetch('/google-api/youtube/v3/channels?part=snippet,statistics&mine=true', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          
          if (!response.ok) throw new Error("YouTube metadata acquisition failed.");
          const data = await response.json();
          if (data.items && data.items.length > 0) {
            const channel = data.items[0];
            const updatedYouTube: YouTubeConnection = {
              ...settings.youtube,
              isConnected: true,
              channelName: channel.snippet.title,
              accessToken: accessToken,
              subscriberCount: channel.statistics.subscriberCount,
              videoCount: parseInt(channel.statistics.videoCount),
              thumbnailUrl: channel.snippet.thumbnails.default.url,
              connectedAt: Date.now()
            };
            const updatedSettings = { ...settings, youtube: updatedYouTube };
            setSettings(updatedSettings);
            updateSettings(updatedSettings);
            playSuccessChime();
            showGlobalFeedback(`YouTube Linked: ${channel.snippet.title}`);
          }
      } else {
          // Use proxy to bypass COEP/CORS
          const response = await fetch('/google-api/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          if (!response.ok) throw new Error("Cloud Identity fetch failed.");
          const user = await response.json();
          const updatedGoogle: GoogleIdentityConnection = {
            isConnected: true,
            email: user.email,
            name: user.name,
            picture: user.picture,
            accessToken: accessToken,
            connectedAt: Date.now()
          };
          const updatedSettings = { ...settings, googleIdentity: updatedGoogle };
          setSettings(updatedSettings);
          updateSettings(updatedSettings);
          playSuccessChime();
          showGlobalFeedback(`Uplink confirmed for ${user.email}`);
      }
    } catch (error: any) {
      console.error("Auth Fetch Error:", error);
      showGlobalFeedback(`Integration Error: ${error.message}`, true);
    } finally {
      setIsWorking(false);
      setMaintenanceMsg("");
      setMaintenanceProgress(0);
    }
  }, [settings, updateSettings, showGlobalFeedback, playSuccessChime]);

  const initGsi = useCallback((clientId: string) => {
      if (lastClientIdRef.current === clientId && tokenClientRef.current) return;
      
      try {
          if ((window as any).google?.accounts?.oauth2) {
              tokenClientRef.current = (window as any).google.accounts.oauth2.initTokenClient({
                  client_id: clientId,
                  scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid',
                  callback: (response: any) => {
                      if (authTimeoutRef.current) {
                        window.clearTimeout(authTimeoutRef.current);
                        authTimeoutRef.current = null;
                      }

                      if (response.error) {
                          setIsWorking(false);
                          setMaintenanceMsg("");
                          setMaintenanceProgress(0);
                          if (response.error !== 'popup_closed') {
                              showGlobalFeedback(`Authentication failed: ${response.error}`, true);
                          }
                          return;
                      }

                      if (response.access_token) {
                          handleAuthResponse(response.access_token, authModeRef.current);
                      } else {
                          setIsWorking(false);
                          setMaintenanceMsg("");
                      }
                  },
              });
              lastClientIdRef.current = clientId;
          }
      } catch (e) {
          console.error("GSI Client Init Error:", e);
          tokenClientRef.current = null;
      }
  }, [handleAuthResponse, showGlobalFeedback]);

  useEffect(() => {
    const clientId = settings.youtube?.customClientId || process.env.YOUTUBE_CLIENT_ID;
    if (!clientId || clientId.includes('PLACEHOLDER')) return;
    const checkGsi = () => {
        if ((window as any).google?.accounts?.oauth2) initGsi(clientId);
        else setTimeout(checkGsi, 500);
    };
    checkGsi();
    return () => { if (authTimeoutRef.current) window.clearTimeout(authTimeoutRef.current); }
  }, [settings.youtube?.customClientId, initGsi]);

  const handleAuthConnect = (mode: 'youtube' | 'google') => {
    const clientId = settings.youtube?.customClientId || process.env.YOUTUBE_CLIENT_ID;
    if (!clientId || clientId.includes('PLACEHOLDER')) {
        showGlobalFeedback("Configuration Error: Missing Google Client ID in Settings.", true);
        return;
    }
    
    authModeRef.current = mode;
    if (!tokenClientRef.current) initGsi(clientId);
    if (!tokenClientRef.current) {
        showGlobalFeedback("System Error: Google Auth library failed to load.", true);
        return;
    }

    setIsWorking(false);
    
    try {
        tokenClientRef.current.requestAccessToken({ prompt: 'consent' });
    } catch (e) {
        if (authTimeoutRef.current) window.clearTimeout(authTimeoutRef.current);
        showGlobalFeedback("Popup blocked or init error.", true);
    }
  };

  const handleGoogleDisconnect = () => {
    const updatedGoogle: GoogleIdentityConnection = { isConnected: false };
    const updatedSettings = { ...settings, googleIdentity: updatedGoogle };
    setSettings(updatedSettings);
    updateSettings(updatedSettings);
    showGlobalFeedback('Cloud Identity revoked.');
  };

  const mainCategories = useMemo(() => {
    const categories: {id: ActiveSettingsTab, label: string, icon: React.ReactNode}[] = [
        { id: 'app', label: 'APPLICATION', icon: <AppIcon className="w-5 h-5"/> },
        { id: 'appearance', label: 'APPEARANCE', icon: <PaintBrushIcon className="w-5 h-5"/> },
        { id: 'integrations', label: 'INTEGRATIONS', icon: <LinkIcon className="w-5 h-5"/> },
    ];
    if (features.isPromptLibraryEnabled) categories.push({ id: 'prompt', label: 'PROMPTS', icon: <PromptIcon className="w-5 h-5"/> });
    if (features.isGalleryEnabled) categories.push({ id: 'gallery', label: 'GALLERY', icon: <PhotoIcon className="w-5 h-5"/> });
    return categories;
  }, [features]);

  useEffect(() => { setSettings(globalSettings); }, [globalSettings]);

  useEffect(() => {
    const subTabs = subMenuConfig[activeSettingsTab] || [];
    if (!subTabs.some(st => st.id === activeSubTab)) {
        setActiveSubTab(subTabs[0]?.id || '');
    }
    if (activeSettingsTab === 'prompt') {
        loadPromptCategories().then(setPromptCategories);
    }
  }, [activeSettingsTab, activeSubTab, setActiveSubTab]);
  
  const showFeedback = (message: string, isError: boolean = false) => {
    setModalFeedback({ message, type: isError ? 'error' : 'success' });
  };

  const handleSettingsChange = (field: keyof LLMSettings, value: any) => {
    const updated = { ...settings, [field]: value };
    setSettings(updated);
    if (['youtube', 'instagram', 'googleIdentity'].includes(field)) updateSettings(updated);
    if (field === 'fontSize' && typeof window !== 'undefined') (window as any).document.documentElement.style.fontSize = `${value}px`;
  };

  const handleFeatureToggle = (feature: keyof FeatureSettings, value: boolean) => {
    updateSettings({ ...settings, features: { ...settings.features, [feature]: value } });
  };

  const saveSettings = () => { updateSettings(settings); showGlobalFeedback('Settings synchronized with vault.'); };
  const handleCancel = () => { setSettings(globalSettings); showGlobalFeedback('Changes abandoned.'); };
  
  const handleTestOllamaConnection = async (isCloud: boolean = false) => {
    setIsTestingOllama(true);
    setOllamaTestResult(null);
    try {
        const url = isCloud ? settings.ollamaCloudBaseUrl : settings.ollamaBaseUrl;
        const result = await testOllamaConnection(url);
        setOllamaTestResult(result);
        if (result.success) refreshOllamaModels();
    } catch(e) {
        setOllamaTestResult({ success: false, message: "CRITICAL PING FAILURE" });
    }
    setIsTestingOllama(false);
  };

  const handleIntegrityCheck = async () => {
    if (!fileSystemManager.isDirectorySelected()) {
        showGlobalFeedback("Please select a storage directory first.", true);
        return;
    }

    setIsSyncing(true);
    setIsWorking(true);
    setMaintenanceProgress(10);
    setMaintenanceMsg("INITIATING VAULT_INTEGRITY_CHECK...");

    try {
        setMaintenanceProgress(20);
        setMaintenanceMsg("VERIFYING_FILE_STRUCTURE...");
        await verifyAndRepairFiles((msg, p) => {
            setMaintenanceMsg(msg);
            if (p !== undefined) setMaintenanceProgress(20 + p * 20);
        }, globalSettings);
        
        setMaintenanceProgress(40);
        setMaintenanceMsg("REBUILDING_GALLERY_DATABASE...");
        await rebuildGalleryDatabase((msg) => setMaintenanceMsg(msg));
        setMaintenanceProgress(60);
        
        setMaintenanceMsg("REBUILDING_PROMPT_DATABASE...");
        await rebuildPromptDatabase((msg) => setMaintenanceMsg(msg));
        setMaintenanceProgress(80);
        
        setMaintenanceMsg("OPTIMIZING_MANIFESTS...");
        await optimizeManifests((msg) => setMaintenanceMsg(msg));
        
        setMaintenanceProgress(100);
        showGlobalFeedback("Vault synchronized successfully.");
    } catch (error: any) {
        console.error("Sync Vault Error:", error);
        showGlobalFeedback(`Sync Error: ${error.message || 'Unknown error'}`, true);
    } finally {
        setIsSyncing(false);
        setIsWorking(false);
        setMaintenanceProgress(0);
        setMaintenanceMsg("");
    }
  };

  const handleConfirmReset = async () => {
    setIsResetModalOpen(false);
    if (resetTarget === 'all') {
        setIsWorking(true);
        setMaintenanceMsg("WIPING LOCAL DATA...");
        setMaintenanceProgress(50);
        try {
            await resetAllSettings();
            window.location.reload();
        } catch (error: any) {
            showGlobalFeedback(`Reset Failure: ${error.message}`, true);
        } finally {
            setIsWorking(false);
        }
    }
  };

  const handleMainTabClick = (tab: ActiveSettingsTab) => setActiveSettingsTab(tab);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
  const localModelOptions = useMemo(() => availableOllamaModels.map(m => ({ label: m, value: m })), [availableOllamaModels]);
  const cloudModelOptions = useMemo(() => availableOllamaCloudModels.map(m => ({ label: m, value: m })), [availableOllamaCloudModels]);

    const renderAppSettings = () => {
        switch(activeSubTab) {
            case 'general':
                return (
                    <div className="flex flex-col h-full overflow-y-auto animate-fade-in">
                        <SettingRow label="Storage Vault" desc="Current active directory for all local generative artifacts.">
                             <button onClick={async () => {
                                 const handle = await fileSystemManager.selectAndSetAppDataDirectory();
                                 if (handle) {
                                     setAppDataDirectory(fileSystemManager.appDirectoryName);
                                     showFeedback('Vault Connected');
                                 }
                             }} className="form-btn px-6">
                                {appDataDirectory ? `PATH: ${appDataDirectory}` : 'CONNECT DIRECTORY'}
                             </button>
                        </SettingRow>
                        <SettingRow label="Cold Reboot" desc="Clear application cache and force-reload the interface.">
                             <button onClick={() => setIsRestartModalOpen(true)} className="form-btn bg-warning text-warning-content border-warning px-6">RELOAD ENGINE</button>
                        </SettingRow>
                    </div>
                );
            case 'features':
                return (
                    <div className="flex flex-col h-full overflow-y-auto animate-fade-in">
                        <SettingRow label="Token Archiver" desc="Toggle the specialized prompt library and folder management.">
                            <input type="checkbox" checked={settings.features.isPromptLibraryEnabled} onChange={(e) => handleFeatureToggle('isPromptLibraryEnabled', (e.currentTarget as any).checked)} className="toggle toggle-primary toggle-sm" />
                        </SettingRow>
                        <SettingRow label="Visual Repository" desc="Toggle the high-performance media gallery and image vault.">
                            <input type="checkbox" checked={settings.features.isGalleryEnabled} onChange={(e) => handleFeatureToggle('isGalleryEnabled', (e.currentTarget as any).checked)} className="toggle toggle-primary toggle-sm" />
                        </SettingRow>
                        <SettingRow label="Archival Guides" desc="Toggle access to curated artists and style cheatsheets.">
                            <input type="checkbox" checked={settings.features.isCheatsheetsEnabled} onChange={(e) => handleFeatureToggle('isCheatsheetsEnabled', (e.currentTarget as any).checked)} className="toggle toggle-primary toggle-sm" />
                        </SettingRow>
                        <SettingRow label="Utility Suite" desc="Toggle the composer, resizer, and palette extractor modules.">
                            <input type="checkbox" checked={settings.features.isToolsEnabled} onChange={(e) => handleFeatureToggle('isToolsEnabled', (e.currentTarget as any).checked)} className="toggle toggle-primary toggle-sm" />
                        </SettingRow>
                    </div>
                );
            case 'data':
                 return (
                     <div className="flex flex-col h-full overflow-y-auto animate-fade-in">
                         <SettingRow label="Sync & Reorganize" desc="Verify manifests and move files to correct category folders.">
                            <button 
                                onClick={handleIntegrityCheck} 
                                disabled={isSyncing}
                                className="form-btn px-6"
                            >
                                {isSyncing ? 'SYNCING...' : 'SYNC VAULT'}
                            </button>
                        </SettingRow>
                        <SettingRow label="Full Archival Export" desc="Generate a complete ZIP archive of all local data and files.">
                             <button 
                                onClick={() => createZipAndDownload([], 'kollektiv_backup.zip')} 
                                disabled={isWorking}
                                className="form-btn form-btn-primary px-6"
                            >
                                EXPORT ALL
                            </button>
                        </SettingRow>
                        <SettingRow label="Registry Purge" desc="Irreversible deletion of all settings, prompts, and media.">
                            <button onClick={() => { setResetTarget('all'); setIsResetModalOpen(true); }} className="form-btn bg-error text-error-content border-error px-6">WIPE STORAGE</button>
                        </SettingRow>
                     </div>
                 );
            default: return null;
        }
    };

    const renderAppearanceSettings = () => {
        return (
            <div className="flex flex-col h-full overflow-y-auto animate-fade-in">
                <SettingRow label="Obscure Cycle Theme" desc="Visual palette used when in dark mode.">
                    <select value={settings.darkTheme} onChange={(e) => handleSettingsChange('darkTheme', (e.currentTarget as any).value)} className="form-select w-64">
                        {DAISYUI_DARK_THEMES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                    </select>
                </SettingRow>
                <SettingRow label="Dashboard Video" desc="Direct MP4 URL for the cinematic dashboard background.">
                    <div className="flex w-full md:w-96">
                        <input 
                            type="text" 
                            value={settings.dashboardVideoUrl} 
                            onChange={(e) => handleSettingsChange('dashboardVideoUrl', e.target.value)} 
                            className="form-input flex-1" 
                            placeholder="https://..."
                        />
                        <button 
                            onClick={() => handleSettingsChange('dashboardVideoUrl', defaultLLMSettings.dashboardVideoUrl)}
                            className="form-btn px-4 border-l-0"
                            title="Reset to Default"
                        >
                            <RefreshIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </SettingRow>
                <SettingRow label="Standby Mode" desc="Choose the visual experience shown during system idle state.">
                    <div className="flex bg-white/5 p-1 rounded-none border border-white/10">
                        <button 
                            onClick={() => handleSettingsChange('idleScreenType', 'matrix')}
                            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${settings.idleScreenType === 'matrix' ? 'bg-primary text-primary-content shadow-lg' : 'text-white/40 hover:text-white'}`}
                        >
                            Falling Codes
                        </button>
                        <button 
                            onClick={() => handleSettingsChange('idleScreenType', 'gallery')}
                            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${settings.idleScreenType === 'gallery' ? 'bg-primary text-primary-content shadow-lg' : 'text-white/40 hover:text-white'}`}
                        >
                            Neural Gallery
                        </button>
                    </div>
                </SettingRow>
                <SettingRow label="Interface Scale" desc="Global font sizing for the dashboard and workspaces.">
                     <div className="flex items-center gap-4 w-48">
                        <input type="range" min={10} max={18} value={settings.fontSize} onChange={(e) => handleSettingsChange('fontSize', Number((e.currentTarget as any).value))} className="range range-xs range-primary" />
                        <span className="text-[10px] font-mono font-bold text-primary">{settings.fontSize}PX</span>
                     </div>
                </SettingRow>
            </div>
        );
    };

    const renderIntegrationSettings = () => {
        switch(activeSubTab) {
            case 'llm':
                return (
                    <div className="flex flex-col h-full overflow-y-auto animate-fade-in">
                        <SettingRow label="Neural Intelligence Core" desc="Choose the primary processing engine for prompt construction.">
                             <div className="tab-group">
                                <div 
                                    className={`tab-item ${settings.activeLLM === 'gemini' ? 'tab-item-active' : ''}`}
                                    onClick={() => { audioService.playClick(); handleSettingsChange('activeLLM', 'gemini'); }}
                                >
                                    Gemini
                                </div>
                                <div 
                                    className={`tab-item ${settings.activeLLM === 'ollama' ? 'tab-item-active' : ''}`}
                                    onClick={() => { audioService.playClick(); handleSettingsChange('activeLLM', 'ollama'); }}
                                >
                                    Ollama
                                </div>
                                <div 
                                    className={`tab-item ${settings.activeLLM === 'ollama_cloud' ? 'tab-item-active' : ''}`}
                                    onClick={() => { audioService.playClick(); handleSettingsChange('activeLLM', 'ollama_cloud'); }}
                                >
                                    Cloud Ollama
                                </div>
                             </div>
                        </SettingRow>
                        {settings.activeLLM === 'ollama_cloud' && (
                             <div className="animate-fade-in flex flex-col bg-transparent">
                                <SettingRow label="Remote Endpoint" desc="HTTPS URL of your hosted Ollama server.">
                                    <div className="space-y-4">
                                        <div className="flex w-full md:w-[620px]">
                                            <input type="text" value={settings.ollamaCloudBaseUrl} onChange={(e) => handleSettingsChange('ollamaCloudBaseUrl', (e.currentTarget as any).value)} className="form-input flex-1" placeholder="https://api.ollama-host.com" />
                                            <button onClick={() => handleTestOllamaConnection(true)} disabled={isTestingOllama} className="form-btn px-4 border-l-0">{isTestingOllama ? '...' : 'PING'}</button>
                                        </div>
                                        {ollamaTestResult && (
                                            <div className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 border ${ollamaTestResult.success ? 'bg-success/5 border-success/30 text-success' : 'bg-error/5 border-error/30 text-error'} animate-fade-in md:w-[620px]`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${ollamaTestResult.success ? 'bg-success' : 'bg-error'} animate-pulse`}></span>
                                                {ollamaTestResult.message}
                                            </div>
                                        )}
                                    </div>
                                </SettingRow>
                                <SettingRow label="Cloud Model" desc="The exact model tag to invoke on the remote server.">
                                    <AutocompleteSelect 
                                        value={settings.ollamaCloudModel} 
                                        onChange={(v) => handleSettingsChange('ollamaCloudModel', v)} 
                                        options={cloudModelOptions} 
                                        placeholder="SELECT CLOUD MODEL..." 
                                        className="w-full md:w-[620px]"
                                    />
                                </SettingRow>
                                <SettingRow label="Remote Authorization" desc="Inject a Bearer token automatically via Google Identity or manual key.">
                                    <div className="flex flex-col gap-4">
                                        <label className="label cursor-pointer justify-start gap-4 p-0">
                                            <input type="checkbox" checked={settings.ollamaCloudUseGoogleAuth} onChange={e => handleSettingsChange('ollamaCloudUseGoogleAuth', e.target.checked)} className="toggle toggle-primary toggle-xs" />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Use Linked Google Token</span>
                                        </label>
                                        {!settings.ollamaCloudUseGoogleAuth && (
                                            <input type="password" value={settings.ollamaCloudApiKey} onChange={(e) => handleSettingsChange('ollamaCloudApiKey', (e.currentTarget as any).value)} className="form-input w-full md:w-[620px]" placeholder="SECRET_API_TOKEN"/>
                                        )}
                                    </div>
                                </SettingRow>
                            </div>
                        )}
                        {settings.activeLLM === 'ollama' && (
                            <div className="animate-fade-in flex flex-col bg-transparent">
                                <SettingRow label="Host Address" desc="Local server URL (Default: http://localhost:11434).">
                                     <div className="space-y-4">
                                        <div className="flex w-full md:w-[620px]">
                                            <input type="text" value={settings.ollamaBaseUrl} onChange={(e) => handleSettingsChange('ollamaBaseUrl', (e.currentTarget as any).value)} className="form-input flex-1" />
                                            <button onClick={() => handleTestOllamaConnection(false)} disabled={isTestingOllama} className="form-btn px-4 border-l-0">PING</button>
                                        </div>
                                        {ollamaTestResult && (
                                            <div className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 border ${ollamaTestResult.success ? 'bg-success/5 border-success/30 text-success' : 'bg-error/5 border-error/30 text-error'} animate-fade-in md:w-[620px]`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${ollamaTestResult.success ? 'bg-success' : 'bg-error'} animate-pulse`}></span>
                                                {ollamaTestResult.message}
                                            </div>
                                        )}
                                         <div className="p-4 bg-info/5 border border-info/20 rounded-none space-y-3 md:w-[620px]">
                                            <h5 className="text-[10px] font-black uppercase tracking-widest text-info flex items-center gap-2">
                                                <InformationCircleIcon className="w-3.5 h-3.5" /> CORS POLICY GUIDE
                                            </h5>
                                            <p className="text-[10px] font-bold uppercase tracking-tight text-base-content/60 leading-relaxed">
                                                For local access, set <code className="text-primary px-1 bg-base-100">OLLAMA_ORIGINS</code> to <code className="text-primary">*</code> or <code className="text-primary">{currentOrigin}</code> in your system variables.
                                            </p>
                                        </div>
                                    </div>
                                </SettingRow>
                                <SettingRow label="Local Model Tag" desc="The model tag currently downloaded to your machine.">
                                    <AutocompleteSelect 
                                        value={settings.ollamaModel} 
                                        onChange={(v) => handleSettingsChange('ollamaModel', v)} 
                                        options={localModelOptions} 
                                        placeholder="SELECT LOCAL MODEL..." 
                                        className="w-full md:w-[620px]"
                                    />
                                </SettingRow>
                            </div>
                        )}
                    </div>
                );
            case 'google':
                return (
                    <div className="flex flex-col h-full overflow-y-auto animate-fade-in">
                        <SettingRow label="Global Client ID" desc="Google Cloud OAuth 2.0 Identifier used for all Identity services.">
                            <div className="flex flex-col gap-2 w-full max-w-md">
                                <input type="text" value={settings.youtube?.customClientId || ''} onChange={(e) => handleSettingsChange('youtube', { ...settings.youtube, customClientId: e.target.value })} className="form-input w-full" placeholder="407408718192-..." />
                                <div className="p-4 bg-primary/5 border border-primary/20 space-y-2">
                                    <p className="text-[9px] font-black uppercase text-primary tracking-widest leading-tight">CRITICAL: AUTHORIZED ORIGIN</p>
                                    <p className="text-[10px] font-mono text-base-content/60 break-all select-all py-1 bg-black/20 px-2">{currentOrigin}</p>
                                    <p className="text-[8px] font-bold text-base-content/30 uppercase leading-relaxed">Add the above URL to 'Authorized JavaScript origins' in Google Cloud Console Credentials.</p>
                                </div>
                            </div>
                        </SettingRow>
                        <SettingRow label="Cloud Identity Link" desc="Connect your account to enable Cloud AI and data sync features.">
                            {settings.googleIdentity?.isConnected ? (
                                <div className="flex flex-col gap-4 w-full max-w-lg">
                                    <div className="flex items-center gap-4 p-4">
                                        <img src={settings.googleIdentity.picture} className="w-12 h-12 rounded-full bg-black" alt="profile"/>
                                        <div className="min-w-0">
                                            <p className="text-sm font-black uppercase truncate">{settings.googleIdentity.name}</p>
                                            <p className="text-[10px] font-mono opacity-40 truncate">{settings.googleIdentity.email}</p>
                                        </div>
                                    </div>
                                    <button onClick={handleGoogleDisconnect} className="form-btn text-error px-4">Revoke Access</button>
                                </div>
                            ) : (
                                <button onClick={() => handleAuthConnect('google')} className="form-btn px-6">AUTHENTICATE WITH GOOGLE</button>
                            )}
                        </SettingRow>
                        <SettingRow label="Session Status" desc="Current encryption status of the cloud identity link.">
                            <span className={`text-[10px] font-black uppercase px-3 py-1.5 rounded-none border ${settings.googleIdentity?.isConnected ? 'bg-success/5 border-success/30 text-success' : 'bg-warning/5 border-warning/30 text-warning'}`}>
                                {settings.googleIdentity?.isConnected ? 'ACTIVE & ENCRYPTED' : 'AWAITING UPLINK'}
                            </span>
                        </SettingRow>
                    </div>
                );
            case 'youtube':
                return (
                    <div className="flex flex-col h-full overflow-y-auto animate-fade-in">
                        <SettingRow label="Global Client ID" desc="Google Cloud OAuth 2.0 Identifier used for all Identity services.">
                            <div className="flex flex-col gap-2 w-full max-w-md">
                                <input type="text" value={settings.youtube?.customClientId || ''} onChange={(e) => handleSettingsChange('youtube', { ...settings.youtube, customClientId: e.target.value })} className="form-input w-full" placeholder="407408718192-..." />
                                <div className="p-4 bg-primary/5 border border-primary/20 space-y-2">
                                    <p className="text-[9px] font-black uppercase text-primary tracking-widest leading-tight">CRITICAL: AUTHORIZED ORIGIN</p>
                                    <p className="text-[10px] font-mono text-base-content/60 break-all select-all py-1 bg-black/20 px-2">{currentOrigin}</p>
                                    <p className="text-[8px] font-bold text-base-content/30 uppercase leading-relaxed">Add the above URL to 'Authorized JavaScript origins' in Google Cloud Console Credentials.</p>
                                </div>
                            </div>
                        </SettingRow>
                        <SettingRow label="Channel Integration" desc="Connect to your YouTube account for direct artifact publishing.">
                            {settings.youtube?.isConnected ? (
                                <div className="flex flex-col gap-4 w-full max-w-lg">
                                    <div className="flex items-center gap-4 p-4">
                                        <img src={settings.youtube.thumbnailUrl} className="w-12 h-12 rounded-none bg-black" alt="channel"/>
                                        <div className="min-w-0">
                                            <p className="text-sm font-black uppercase truncate">{settings.youtube.channelName}</p>
                                            <p className="text-[10px] font-mono opacity-40 uppercase">{settings.youtube.subscriberCount} Subscribers</p>
                                        </div>
                                    </div>
                                    <button onClick={() => handleSettingsChange('youtube', { ...settings.youtube, isConnected: false })} className="form-btn text-error px-4">Unlink Channel</button>
                                </div>
                            ) : (
                                <button onClick={() => handleAuthConnect('youtube')} className="form-btn px-6">LINK CHANNEL</button>
                            )}
                        </SettingRow>
                    </div>
                );
            case 'instagram':
                return (
                    <div className="flex flex-col h-full overflow-y-auto animate-fade-in">
                        <SettingRow label="Developer Key" desc="Meta for Developers Client Key.">
                            <input type="text" value={settings.instagram?.clientKey || ''} onChange={(e) => handleSettingsChange('instagram', { ...settings.instagram, clientKey: e.target.value })} className="form-input w-full max-w-md" placeholder="CLIENT_KEY" />
                        </SettingRow>
                        <SettingRow label="Secret Fragment" desc="Meta for Developers Client Secret.">
                            <input type="password" value={settings.instagram?.clientSecret || ''} onChange={(e) => handleSettingsChange('instagram', { ...settings.instagram, clientSecret: e.target.value })} className="form-input w-full max-w-md" placeholder="CLIENT_SECRET" />
                        </SettingRow>
                        <SettingRow label="Instagram Link" desc="Authenticate with Instagram for artifact distribution.">
                             <button className="form-btn px-6" disabled>UNAVAILABLE IN ALPHA</button>
                        </SettingRow>
                    </div>
                );
            default: return null;
        }
    };

    const renderPromptSettings = () => {
        switch(activeSubTab) {
            case 'categories':
                return (
                    <NestedCategoryManager 
                        title="Prompt Folder Management"
                        type="prompt"
                        loadFn={loadPromptCategories}
                        addFn={addPromptCategory}
                        updateFn={updatePromptCategory}
                        deleteFn={deletePromptCategory}
                        saveOrderFn={savePromptCategoriesOrderFS}
                        deleteConfirmationMessage={(name) => `Permanently remove prompt folder "${name}"?`}
                    />
                );
            case 'data':
                return (
                    <div className="flex flex-col h-full overflow-y-auto animate-fade-in">
                        <SettingRow label="Batch Ingestion" desc="Import multiple prompts from a ZIP archive containing .txt files.">
                            <button onClick={() => setIsTxtImportModalOpen(true)} className="form-btn px-6">
                                <UploadIcon className="w-4 h-4 mr-2" />
                                OPEN IMPORT MODULE
                            </button>
                        </SettingRow>
                    </div>
                );
            default: return null;
        }
    };

    const renderGallerySettings = () => {
        switch(activeSubTab) {
            case 'categories':
                return (
                    <NestedCategoryManager 
                        title="Gallery Folder Management"
                        type="gallery"
                        loadFn={loadGalleryCategoriesFS}
                        addFn={addGalleryCategoryFS}
                        updateFn={updateCategoryFS}
                        deleteFn={deleteGalleryCategoryFS}
                        saveOrderFn={saveGalleryCategoriesOrderFS}
                        deleteConfirmationMessage={(name) => `Permanently remove gallery folder "${name}"?`}
                    />
                );
            case 'data':
                return (
                    <div className="flex flex-col h-full overflow-y-auto animate-fade-in">
                        <SettingRow label="Bulk Export" desc="Package all gallery artifacts into a single ZIP archive for backup.">
                            <button onClick={() => createZipAndDownload([], 'gallery_archive.zip')} className="form-btn form-btn-primary px-6">
                                <DownloadIcon className="w-4 h-4 mr-2" />
                                DOWNLOAD VAULT
                            </button>
                        </SettingRow>
                    </div>
                );
            default: return null;
        }
    };

    const renderActiveTabContent = () => {
        switch(activeSettingsTab) {
            case 'app': return renderAppSettings();
            case 'appearance': return renderAppearanceSettings();
            case 'integrations': return renderIntegrationSettings();
            case 'prompt': return renderPromptSettings();
            case 'gallery': return renderGallerySettings();
            default: return null;
        }
    };

    const currentSubTabs = subMenuConfig[activeSettingsTab] || [];
    const currentSubTab = currentSubTabs.find(sub => sub.id === activeSubTab);
    
  const navScrollRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);

  return (
    <>
    <section className="flex flex-row h-full bg-transparent w-full relative overflow-visible">
      <div className="flex flex-row h-full w-full overflow-hidden relative z-10 bg-transparent gap-4">

        <aside className="w-80 flex-shrink-0 flex flex-col relative p-[3px] corner-frame overflow-visible h-full bg-transparent">
            <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
                <h1 className="h-16 flex-shrink-0 flex items-center px-6 text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 panel-header">System Hub</h1>
                <div ref={navScrollRef} className="flex-grow px-4 py-6 overflow-y-auto relative">
                    <ul className="menu menu-sm p-0 gap-1 relative z-10">
                    {mainCategories.map(mainCat => (
                        <SetupNavItem 
                                key={mainCat.id} id={mainCat.id} label={mainCat.label} icon={mainCat.icon}
                                isActive={activeSettingsTab === mainCat.id} onClick={() => handleMainTabClick(mainCat.id as ActiveSettingsTab)}
                                registerRef={(el) => { navRefs.current[mainCat.id] = el; }}
                            />
                    ))}
                    </ul>
                </div>
            </div>
            {/* Manual Corner Accents */}
            <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
            <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
            <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
            <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
        </aside>

        <main className="flex-grow flex flex-col h-full bg-transparent relative p-[3px] corner-frame overflow-visible">
            <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
                <section className="p-10 flex-shrink-0">
                    <h1 className="text-2xl lg:text-3xl font-black tracking-tighter uppercase leading-none">{mainCategories.find(c => c.id === activeSettingsTab)?.label}<span className="text-primary">.</span></h1>
                    <p className="text-[11px] font-bold text-base-content/30 uppercase tracking-[0.3em] mt-1">{currentSubTab?.description}</p>
                </section>
                {currentSubTabs.length > 0 && (
                    <div className="flex-shrink-0 px-6 py-2 overflow-x-auto">
                        <div className="form-tab-group">
                            {currentSubTabs.map(tab => (
                                <button key={tab.id} onClick={() => setActiveSubTab(tab.id)} className={`form-tab-item ${activeSubTab === tab.id ? 'active' : ''}`}>{tab.label}</button>
                            ))}
                        </div>
                    </div>
                )}
                <div ref={mainScrollRef} className="flex-grow overflow-y-auto">{renderActiveTabContent()}</div>
                <footer className="flex flex-row p-0 overflow-hidden flex-shrink-0 panel-footer">
                    <button onClick={handleCancel} className="form-btn flex-1">Abort</button>
                    <button onClick={saveSettings} className="form-btn form-btn-primary flex-1 shadow-lg">Confirm</button>
                </footer>
            </div>
            {/* Manual Corner Accents */}
            <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
            <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
            <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
            <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
        </main>
      </div>
      {/* Manual Corner Accents */}
      <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
      <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
      <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
      <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
    </section>
      {modalFeedback && <FeedbackModal isOpen={!!modalFeedback} onClose={() => setModalFeedback(null)} message={modalFeedback.message} type={modalFeedback.type} />}
      <ConfirmationModal isOpen={isRestartModalOpen} onClose={() => setIsRestartModalOpen(false)} onConfirm={() => window.location.reload()} title="RELOAD REQUEST" message="Purge neuronal state and restart interface?" btnClassName="btn-warning" />
      <ConfirmationModal 
        isOpen={isResetModalOpen} 
        onClose={() => setIsResetModalOpen(false)} 
        onConfirm={handleConfirmReset} 
        title="VAULT RESET" 
        message="Permanently erase all local artifacts and configuration?" 
      />
      <PromptTxtImportModal 
          isOpen={isTxtImportModalOpen} 
          onClose={() => setIsTxtImportModalOpen(false)} 
          onImport={() => {}} 
          categories={promptCategories}
      />
      {isWorking && <MaintenanceOverlay progress={maintenanceProgress} message={maintenanceMsg} />}
    </>
  );
};
