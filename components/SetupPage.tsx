
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { gsap } from 'gsap';
import type { LLMSettings, ActiveSettingsTab, GalleryCategory, PromptCategory, SavedPrompt, FeatureSettings, YouTubeConnection, InstagramConnection, GoogleIdentityConnection } from '../types';
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
import { AVAILABLE_LLM_MODELS, DAISYUI_LIGHT_THEMES, DAISYUI_DARK_THEMES } from '../constants';
import ConfirmationModal from './ConfirmationModal';
import { Cog6ToothIcon, CpuChipIcon, AppIcon, PromptIcon, PhotoIcon, FolderClosedIcon, PaintBrushIcon, DeleteIcon, CheckIcon, EditIcon, AdjustmentsVerticalIcon, DownloadIcon, LinkIcon, PlayIcon, RefreshIcon, InstagramIcon, InformationCircleIcon, UploadIcon } from './icons';
import FeedbackModal from './FeedbackModal';
import { PromptTxtImportModal } from './PromptTxtImportModal';
import LoadingSpinner from './LoadingSpinner';
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
        <div className="fixed inset-0 bg-base-100 z-[500] flex flex-col items-center justify-center overflow-hidden">
            <div className="absolute inset-0 bg-grid-texture opacity-[0.03] pointer-events-none"></div>
            
            <div className="relative z-10 flex flex-col items-center">
                {/* Brand Text Wrapper with Masking */}
                <div className="overflow-hidden mb-8 px-4">
                    <h1 ref={textWrapperRef} className="grid grid-cols-1 grid-rows-1 text-xl md:text-3xl font-black tracking-tighter uppercase select-none items-center">
                        {/* Layer 1: Ghost Text */}
                        <span className="text-base-content/10 block leading-none py-2 row-start-1 col-start-1">
                            Kollektiv<span className="text-primary/10 italic">.</span>
                        </span>
                        
                        {/* Layer 2: Theme-Aware Fill Masked Text */}
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

                {/* Sub-label */}
                <div className={`flex flex-col items-center gap-3 transition-all duration-500 ${progress >= 100 ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}`}>
                    <div className="flex items-center gap-3">
                        <p className="text-[10px] font-mono font-bold uppercase tracking-[0.5em] text-center text-base-content/40">
                            {message || 'DIAGNOSTIC_ACTIVE'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Corner Metadata */}
            <div className="absolute bottom-12 left-12 hidden md:block">
                <span className="text-[8px] font-mono font-bold text-base-content/10 uppercase tracking-widest">Protocol: Integrity_Check_Alpha</span>
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
          onClick={onClick}
          className={`flex items-center p-2.5 rounded-lg text-base font-medium transition-colors cursor-pointer relative z-10 ${
            isActive
              ? 'text-primary-content font-bold'
              : 'text-base-content/70 hover:bg-base-200'
          }`}
        >
          <div className="mr-3">{icon}</div>
          <span className="uppercase text-[10px] font-black tracking-widest">{label}</span>
        </a>
    </li>
);

const SettingRow: React.FC<{ label: string, desc?: string, children: React.ReactNode }> = ({ label, desc, children }) => (
    <div className="p-8 border-b border-base-300 last:border-b-0 flex flex-col md:flex-row md:items-center justify-between gap-6 group hover:bg-base-200/30 transition-all">
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
  const [isWorking, setIsWorking] = useState<boolean>(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState<string>('');
  const [maintenanceProgress, setMaintenanceProgress] = useState<number>(0);
  
  const [isRestartModalOpen, setIsRestartModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isTxtImportModalOpen, setIsTxtImportModalOpen] = useState(false);
  const [promptCategories, setPromptCategories] = useState<PromptCategory[]>([]);

  const navRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [pillStyle, setPillStyle] = useState<React.CSSProperties>({ display: 'none' });
  const tokenClientRef = useRef<any>(null);
  const lastClientIdRef = useRef<string | null>(null);
  const authModeRef = useRef<'youtube' | 'google'>('google');
  const authTimeoutRef = useRef<number | null>(null);

  // --- AUDIO ENGINE: SUCCESS CHIME (IMPROVED Audibility) ---
  const playSuccessChime = useCallback(() => {
    try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const master = ctx.createGain();
        master.connect(ctx.destination);
        master.gain.value = 0.5; // Sufficiently audible
        
        const now = ctx.currentTime;
        
        // Osc 1: The Mechanical Impact
        const osc1 = ctx.createOscillator();
        const g1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(150, now);
        osc1.frequency.exponentialRampToValueAtTime(40, now + 0.15);
        g1.gain.setValueAtTime(0.6, now);
        g1.gain.linearRampToValueAtTime(0, now + 0.15);
        osc1.connect(g1);
        g1.connect(master);
        
        // Osc 2: The Digital Ascent
        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(880, now + 0.05);
        osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.3);
        g2.gain.setValueAtTime(0, now + 0.05);
        g2.gain.linearRampToValueAtTime(0.4, now + 0.1);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        osc2.connect(g2);
        g2.connect(master);

        // Osc 3: The Polish Shimmer
        const osc3 = ctx.createOscillator();
        const g3 = ctx.createGain();
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(3520, now + 0.1);
        g3.gain.setValueAtTime(0, now + 0.1);
        g3.gain.linearRampToValueAtTime(0.15, now + 0.15);
        g3.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc3.connect(g3);
        g3.connect(master);

        osc1.start(now);
        osc1.stop(now + 0.15);
        osc2.start(now + 0.05);
        osc2.stop(now + 1.2);
        osc3.start(now + 0.1);
        osc3.stop(now + 0.8);

        // Forced context resumption for browser compliance
        if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {
        console.warn("Audio logic failed - likely interaction block.");
    }
  }, []);

  const handleAuthResponse = useCallback(async (accessToken: string, mode: 'youtube' | 'google') => {
    if (authTimeoutRef.current) {
        window.clearTimeout(authTimeoutRef.current);
        authTimeoutRef.current = null;
    }

    setIsWorking(true);
    setMaintenanceProgress(20);
    setMaintenanceMsg(`ESTABLISHING ${mode.toUpperCase()} UPLINK...`);
    try {
      if (mode === 'youtube') {
          const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          
          if (!response.ok) throw new Error("YouTube metadata acquisition failed.");
          const data = await response.json();
          if (data.items && data.items.length > 0) {
            setMaintenanceProgress(80);
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
            showGlobalFeedback(`YouTube Linked: ${channel.snippet.title}`);
          }
      } else {
          const response = await fetch('https://www.oauth2.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          if (!response.ok) throw new Error("Cloud Identity fetch failed.");
          const user = await response.json();
          setMaintenanceProgress(80);
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
          showGlobalFeedback(`Uplink confirmed for ${user.email}`);
      }
      setMaintenanceProgress(100);
    } catch (error: any) {
      console.error("Auth Fetch Error:", error);
      showGlobalFeedback(`Integration Error: ${error.message}`, true);
    } finally {
      setIsWorking(false);
      setMaintenanceMsg("");
      setMaintenanceProgress(0);
    }
  }, [settings, updateSettings, showGlobalFeedback]);

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

    setIsWorking(true);
    setMaintenanceProgress(10);
    setMaintenanceMsg("NEGOTIATING HANDSHAKE...");

    authTimeoutRef.current = window.setTimeout(() => {
        if (isWorking) {
            setIsWorking(false);
            setMaintenanceMsg("");
            setMaintenanceProgress(0);
            showGlobalFeedback("Authentication timed out.", true);
        }
    }, 60000);
    
    try {
        tokenClientRef.current.requestAccessToken({ prompt: 'consent' });
    } catch (e) {
        if (authTimeoutRef.current) window.clearTimeout(authTimeoutRef.current);
        setIsWorking(false);
        setMaintenanceMsg("");
        setMaintenanceProgress(0);
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

  useEffect(() => {
      const activeKey = activeSettingsTab;
      const activeEl = navRefs.current[activeKey];
      const container = activeEl?.closest('nav');
      if (activeEl && container) {
          const rect = activeEl.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          setPillStyle({
              top: rect.top - containerRect.top + container.scrollTop,
              height: rect.height, width: rect.width, left: rect.left - containerRect.left, opacity: 1,
          });
      } else { setPillStyle({ opacity: 0 }); }
  }, [activeSettingsTab]);

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
    setIsWorking(true);
    setMaintenanceProgress(0);
    setMaintenanceMsg("INITIATING SCAN...");
    
    // Snappy delay for better UX
    const artificialDelay = (ms: number) => new Promise(r => setTimeout(r, ms));

    try {
        const onProgress = (msg: string, p?: number) => {
            setMaintenanceMsg(msg.toUpperCase());
            if (p !== undefined) setMaintenanceProgress(p * 100);
        };
        
        await artificialDelay(400);

        // Phase 1: File Check (0-25%)
        onProgress("Verifying Registry Files...", 0);
        await verifyAndRepairFiles((m, p) => onProgress(m, (p || 0) * 0.25), globalSettings);
        await artificialDelay(400);
        
        // Phase 2: Gallery Sync (25-50%)
        setMaintenanceProgress(25);
        onProgress("Synchronizing Media Vault...", 0.25);
        await rebuildGalleryDatabase(m => onProgress(m, 0.25 + 0.25));
        await artificialDelay(400);
        
        // Phase 3: Prompt Sync (50-75%)
        setMaintenanceProgress(50);
        onProgress("Indexing Neural Library...", 0.5);
        await rebuildPromptDatabase(m => onProgress(m, 0.5 + 0.25));
        await artificialDelay(400);
        
        // Phase 4: Optimization (75-100%)
        setMaintenanceProgress(75);
        onProgress("Optimizing Performance...", 0.75);
        await optimizeManifests(m => onProgress(m, 0.75 + 0.25));
        await artificialDelay(400);
        
        setMaintenanceProgress(100);
        
        // --- ACOUSTIC CONFIRMATION ---
        playSuccessChime();
        
        // Allow time for the slide-up exit animation in overlay
        await artificialDelay(1000);
        
        showGlobalFeedback("Integrity check complete.");
    } catch (error: any) {
        showGlobalFeedback(`Maintenance Error: ${error.message}`, true);
    } finally {
        setIsWorking(false);
        setMaintenanceMsg("");
        setMaintenanceProgress(0);
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
                    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar animate-fade-in">
                        <SettingRow label="Storage Vault" desc="Current active directory for all local generative artifacts.">
                             <button onClick={() => fileSystemManager.selectAndSetAppDataDirectory().then(h => h && showFeedback('Vault Connected'))} className="btn btn-secondary btn-sm rounded-none font-black text-[10px] tracking-widest px-6">
                                {appDataDirectory ? `PATH: ${appDataDirectory}` : 'CONNECT DIRECTORY'}
                             </button>
                        </SettingRow>
                        <SettingRow label="Cold Reboot" desc="Clear application cache and force-reload the interface.">
                             <button onClick={() => setIsRestartModalOpen(true)} className="btn btn-warning btn-sm rounded-none font-black text-[10px] tracking-widest px-6">RELOAD ENGINE</button>
                        </SettingRow>
                    </div>
                );
            case 'features':
                return (
                    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar animate-fade-in">
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
                     <div className="flex flex-col h-full overflow-y-auto custom-scrollbar animate-fade-in">
                        <SettingRow label="Sync & Reorganize" desc="Verify manifests and move files to correct category folders.">
                            <button onClick={handleIntegrityCheck} className="btn btn-sm btn-outline rounded-none font-black text-[10px] tracking-widest px-6">SYNC VAULT</button>
                        </SettingRow>
                        <SettingRow label="Full Archival Export" desc="Generate a complete ZIP archive of all local data and files.">
                             <button onClick={() => createZipAndDownload([], 'kollektiv_backup.zip')} className="btn btn-sm btn-secondary rounded-none font-black text-[10px] tracking-widest px-6">EXPORT ALL</button>
                        </SettingRow>
                        <SettingRow label="Registry Purge" desc="Irreversible deletion of all settings, prompts, and media.">
                            <button onClick={() => { setResetTarget('all'); setIsResetModalOpen(true); }} className="btn btn-sm btn-error rounded-none font-black text-[10px] tracking-widest px-6">WIPE STORAGE</button>
                        </SettingRow>
                     </div>
                 );
            default: return null;
        }
    };

    const renderAppearanceSettings = () => {
        return (
            <div className="flex flex-col h-full overflow-y-auto custom-scrollbar animate-fade-in">
                <SettingRow label="Light Cycle Theme" desc="Visual palette used when in illuminated mode.">
                    <select value={settings.lightTheme} onChange={(e) => handleSettingsChange('lightTheme', (e.currentTarget as any).value)} className="select select-bordered select-sm rounded-none font-bold w-64 uppercase text-[10px] tracking-widest">
                        {DAISYUI_LIGHT_THEMES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                    </select>
                </SettingRow>
                <SettingRow label="Obscure Cycle Theme" desc="Visual palette used when in dark mode.">
                    <select value={settings.darkTheme} onChange={(e) => handleSettingsChange('darkTheme', (e.currentTarget as any).value)} className="select select-bordered select-sm rounded-none font-bold w-64 uppercase text-[10px] tracking-widest">
                        {DAISYUI_DARK_THEMES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                    </select>
                </SettingRow>
                <SettingRow label="Dashboard Video" desc="Direct MP4 URL for the cinematic dashboard background.">
                    <div className="join w-full md:w-96">
                        <input 
                            type="text" 
                            value={settings.dashboardVideoUrl} 
                            onChange={(e) => handleSettingsChange('dashboardVideoUrl', e.target.value)} 
                            className="input input-bordered input-sm rounded-none join-item w-full font-mono text-xs" 
                            placeholder="https://..."
                        />
                        <button 
                            onClick={() => handleSettingsChange('dashboardVideoUrl', defaultLLMSettings.dashboardVideoUrl)}
                            className="btn btn-sm btn-ghost border border-base-300 join-item text-[10px] font-black"
                            title="Reset to Default"
                        >
                            <RefreshIcon className="w-3.5 h-3.5" />
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
                    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar animate-fade-in">
                        <SettingRow label="Neural Intelligence Core" desc="Choose the primary processing engine for prompt construction.">
                             <div className="flex flex-row flex-wrap gap-6">
                                <label className="label cursor-pointer justify-start gap-3 p-0">
                                    <input type="radio" name="llm-provider" className="radio radio-primary radio-sm" checked={settings.activeLLM === 'gemini'} onChange={() => handleSettingsChange('activeLLM', 'gemini')} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Gemini</span>
                                </label>
                                <label className="label cursor-pointer justify-start gap-3 p-0">
                                    <input type="radio" name="llm-provider" className="radio radio-primary radio-sm" checked={settings.activeLLM === 'ollama'} onChange={() => handleSettingsChange('activeLLM', 'ollama')} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Ollama</span>
                                </label>
                                <label className="label cursor-pointer justify-start gap-3 p-0">
                                    <input type="radio" name="llm-provider" className="radio radio-primary radio-sm" checked={settings.activeLLM === 'ollama_cloud'} onChange={() => handleSettingsChange('activeLLM', 'ollama_cloud')} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Cloud Ollama</span>
                                </label>
                             </div>
                        </SettingRow>
                        {settings.activeLLM === 'ollama_cloud' && (
                             <div className="animate-fade-in flex flex-col bg-base-200/20">
                                <SettingRow label="Remote Endpoint" desc="HTTPS URL of your hosted Ollama server.">
                                    <div className="space-y-4">
                                        <div className="join w-full md:w-[620px]">
                                            <input type="text" value={settings.ollamaCloudBaseUrl} onChange={(e) => handleSettingsChange('ollamaCloudBaseUrl', (e.currentTarget as any).value)} className="input input-bordered input-sm join-item w-full font-mono text-xs" placeholder="https://api.ollama-host.com" />
                                            <button onClick={() => handleTestOllamaConnection(true)} disabled={isTestingOllama} className="btn btn-sm btn-ghost border border-base-300 join-item text-[10px] font-black">{isTestingOllama ? '...' : 'PING'}</button>
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
                                            <input type="password" value={settings.ollamaCloudApiKey} onChange={(e) => handleSettingsChange('ollamaCloudApiKey', (e.currentTarget as any).value)} className="input input-bordered input-sm rounded-none font-mono text-xs w-full md:w-[620px]" placeholder="SECRET_API_TOKEN"/>
                                        )}
                                    </div>
                                </SettingRow>
                            </div>
                        )}
                        {settings.activeLLM === 'ollama' && (
                            <div className="animate-fade-in flex flex-col bg-base-200/20">
                                <SettingRow label="Host Address" desc="Local server URL (Default: http://localhost:11434).">
                                     <div className="space-y-4">
                                        <div className="join w-full md:w-[620px]">
                                            <input type="text" value={settings.ollamaBaseUrl} onChange={(e) => handleSettingsChange('ollamaBaseUrl', (e.currentTarget as any).value)} className="input input-bordered input-sm join-item w-full font-mono text-xs" />
                                            <button onClick={() => handleTestOllamaConnection(false)} disabled={isTestingOllama} className="btn btn-sm btn-ghost border border-base-300 join-item text-[10px] font-black">PING</button>
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
                    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar animate-fade-in">
                        <SettingRow label="Cloud Identity Link" desc="Connect your account to enable Cloud AI and data sync features.">
                            {settings.googleIdentity?.isConnected ? (
                                <div className="flex flex-col gap-4 w-full max-w-lg">
                                    <div className="flex items-center gap-4 p-4 bg-base-200/50 border border-base-300">
                                        <img src={settings.googleIdentity.picture} className="w-12 h-12 rounded-full bg-black border border-white/10" alt="profile"/>
                                        <div className="min-w-0">
                                            <p className="text-sm font-black uppercase truncate">{settings.googleIdentity.name}</p>
                                            <p className="text-[10px] font-mono opacity-40 truncate">{settings.googleIdentity.email}</p>
                                        </div>
                                    </div>
                                    <button onClick={handleGoogleDisconnect} className="btn btn-xs btn-ghost text-error font-black uppercase tracking-widest">Revoke Access</button>
                                </div>
                            ) : (
                                <button onClick={() => handleAuthConnect('google')} className="btn btn-sm btn-outline rounded-none font-black text-[10px] tracking-widest uppercase px-6">AUTHENTICATE WITH GOOGLE</button>
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
                    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar animate-fade-in">
                        <SettingRow label="Client ID" desc="Your Google OAuth 2.0 Client ID for the YouTube API.">
                            <div className="flex flex-col gap-2 w-full max-w-md">
                                <input type="text" value={settings.youtube?.customClientId || ''} onChange={(e) => handleSettingsChange('youtube', { ...settings.youtube, customClientId: e.target.value })} className="input input-bordered input-sm rounded-none w-full font-mono text-xs" placeholder="407408718192-..." />
                                <p className="text-[8px] font-mono text-base-content/20 uppercase">REQUIRED: Ensure 'https://localhost:5173' is in authorized origins in GCP Console.</p>
                            </div>
                        </SettingRow>
                        <SettingRow label="Channel Integration" desc="Connect to your YouTube account for direct artifact publishing.">
                            {settings.youtube?.isConnected ? (
                                <div className="flex flex-col gap-4 w-full max-w-lg">
                                    <div className="flex items-center gap-4 p-4 bg-base-200/50 border border-base-300">
                                        <img src={settings.youtube.thumbnailUrl} className="w-12 h-12 rounded-none bg-black" alt="channel"/>
                                        <div className="min-w-0">
                                            <p className="text-sm font-black uppercase truncate">{settings.youtube.channelName}</p>
                                            <p className="text-[10px] font-mono opacity-40 uppercase">{settings.youtube.subscriberCount} Subscribers</p>
                                        </div>
                                    </div>
                                    <button onClick={(e) => handleSettingsChange('youtube', { ...settings.youtube, isConnected: false })} className="btn btn-xs btn-ghost text-error font-black uppercase tracking-widest">Unlink Channel</button>
                                </div>
                            ) : (
                                <button onClick={() => handleAuthConnect('youtube')} className="btn btn-sm btn-outline rounded-none font-black text-[10px] tracking-widest uppercase px-6">LINK CHANNEL</button>
                            )}
                        </SettingRow>
                    </div>
                );
            case 'instagram':
                return (
                    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar animate-fade-in">
                        <SettingRow label="Developer Key" desc="Meta for Developers Client Key.">
                            <input type="text" value={settings.instagram?.clientKey || ''} onChange={(e) => handleSettingsChange('instagram', { ...settings.instagram, clientKey: e.target.value })} className="input input-bordered input-sm rounded-none w-full font-mono text-xs max-w-md" placeholder="CLIENT_KEY" />
                        </SettingRow>
                        <SettingRow label="Secret Fragment" desc="Meta for Developers Client Secret.">
                            <input type="password" value={settings.instagram?.clientSecret || ''} onChange={(e) => handleSettingsChange('instagram', { ...settings.instagram, clientSecret: e.target.value })} className="input input-bordered input-sm rounded-none w-full font-mono text-xs max-w-md" placeholder="CLIENT_SECRET" />
                        </SettingRow>
                        <SettingRow label="Instagram Link" desc="Authenticate with Instagram for artifact distribution.">
                             <button className="btn btn-sm btn-outline rounded-none font-black text-[10px] tracking-widest uppercase px-6" disabled>UNAVAILABLE IN ALPHA</button>
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
                    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar animate-fade-in">
                        <SettingRow label="Batch Ingestion" desc="Import multiple prompts from a ZIP archive containing .txt files.">
                            <button onClick={() => setIsTxtImportModalOpen(true)} className="btn btn-sm btn-outline rounded-none font-black text-[10px] tracking-widest uppercase px-6">
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
                    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar animate-fade-in">
                        <SettingRow label="Bulk Export" desc="Package all gallery artifacts into a single ZIP archive for backup.">
                            <button onClick={() => createZipAndDownload([], 'gallery_archive.zip')} className="btn btn-sm btn-secondary rounded-none font-black text-[10px] tracking-widest uppercase px-6">
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
    
  return (
    <>
    <section className="flex flex-row bg-base-100 h-full overflow-hidden relative">
        {isWorking && (
            <MaintenanceOverlay progress={maintenanceProgress} message={maintenanceMsg} />
        )}

        <aside className="w-80 flex-shrink-0 bg-base-100 border-r border-base-300 flex flex-col">
            <h1 className="h-16 flex items-center px-6 border-b border-base-300 text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30">System Hub</h1>
            <nav className="flex-grow px-4 py-6 overflow-y-auto custom-scrollbar relative">
                <div className="absolute bg-primary rounded-lg shadow-lg pointer-events-none transition-all duration-300" style={pillStyle} />
                <ul className="menu menu-sm p-0 gap-1 relative z-10">
                   {mainCategories.map(mainCat => (
                       <SetupNavItem 
                            key={mainCat.id} id={mainCat.id} label={mainCat.label} icon={mainCat.icon}
                            isActive={activeSettingsTab === mainCat.id} onClick={() => handleMainTabClick(mainCat.id as ActiveSettingsTab)}
                            registerRef={(el) => { navRefs.current[mainCat.id] = el; }}
                        />
                   ))}
                </ul>
            </nav>
        </aside>

        <main className="flex-grow flex flex-col overflow-hidden bg-base-100">
            <section className="p-10 border-b border-base-300 bg-base-200/20 flex-shrink-0">
                <h1 className="text-2xl lg:text-3xl font-black tracking-tighter uppercase leading-none">{mainCategories.find(c => c.id === activeSettingsTab)?.label}<span className="text-primary">.</span></h1>
                <p className="text-[11px] font-bold text-base-content/30 uppercase tracking-[0.3em] mt-1">{currentSubTab?.description}</p>
            </section>
            {currentSubTabs.length > 0 && (
                <div className="flex-shrink-0 bg-base-100 border-b border-base-300 px-6 py-2 overflow-x-auto no-scrollbar">
                    <div className="tabs tabs-bordered">
                        {currentSubTabs.map(tab => (
                            <button key={tab.id} onClick={() => setActiveSubTab(tab.id)} className={`tab h-10 px-4 font-black uppercase text-[9px] tracking-widest ${activeSubTab === tab.id ? 'tab-active text-primary border-primary' : 'text-base-content/30'}`}>{tab.label}</button>
                        ))}
                    </div>
                </div>
            )}
            <div className="flex-grow overflow-hidden bg-base-100">{renderActiveTabContent()}</div>
            <footer className="border-t border-base-300 flex flex-col bg-base-200/5 p-0 overflow-hidden flex-shrink-0"><button onClick={handleCancel} className="btn flex-1 rounded-none uppercase font-black text-[10px] tracking-widest hover:bg-base-300 border-r border-base-300">Abort</button><button onClick={saveSettings} className="btn btn-primary flex-1 rounded-none uppercase font-black text-[10px] tracking-widest shadow-lg">Confirm</button></footer>
        </main>
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
    </>
  );
};
