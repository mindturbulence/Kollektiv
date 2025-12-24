import React, { useState, useEffect, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import useLocalStorage from '../utils/useLocalStorage';
import { fileSystemManager } from '../utils/fileUtils';
import { verifyAndRepairFiles } from '../utils/integrity';
import type { ActiveTab, Idea, ActiveSettingsTab } from '../types';

// Layout & Global Components
import Sidebar from './Sidebar';
import Header from './Header';
import Welcome from './Welcome';
import AboutModal from './AboutModal';
import ClippingPanel from './ClippingPanel';
import FeedbackModal from './FeedbackModal';
import Footer from './Footer';

// Page Components
import Dashboard from './Dashboard';
import PromptsPage from './PromptsPage';
import SavedPrompts from './SavedPrompts';
import ImageGallery from './ImageGallery';
import Cheatsheet from './Cheatsheet';
import ArtstyleCheatsheet from './ArtstyleCheatsheet';
import ArtistCheatsheet from './ArtistCheatsheet';
import { SetupPage } from './SetupPage';
import ImageCompare from './ImageCompare';
import { ColorPaletteExtractor } from './ColorPaletteExtractor';
import ComposerPage from './ComposerPage';
import ImageResizer from './ImageResizer';
import { VideoToFrames } from './VideoToFrames';
import { useAuth } from '../contexts/AuthContext';

type PromptsPageState = { prompt?: string, artStyle?: string, artist?: string, view?: 'enhancer' | 'composer' | 'create', id?: string } | null;

const InitialLoader: React.FC = () => (
    <div id="initial-loader">
      <div className="loader-spinner"></div>
      <p id="loading-status" className="mt-4 text-sm">Bootstrapping application...</p>
      <div id="loading-progress-container" className="w-64 h-2 bg-base-content/10 rounded-full mt-4 overflow-hidden" style={{ display: 'none' }}>
        <div id="loading-progress-bar" className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: '0%' }}></div>
      </div>
    </div>
);

const App: React.FC = () => {
    // --- App Initialization State ---
    const [isInitialized, setIsInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [showWelcome, setShowWelcome] = useState(false);

    // --- Global Contexts ---
    const { settings } = useSettings();
    const auth = useAuth();

    // --- UI & Navigation State ---
    const [activeTab, setActiveTab] = useLocalStorage<ActiveTab>('activeTab', 'dashboard');
    const [isPinned, setIsPinned] = useLocalStorage('sidebarPinned', true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(isPinned);
    const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
    const [isClippingPanelOpen, setIsClippingPanelOpen] = useState(false);
    const [collapsedPanels, setCollapsedPanels] = useLocalStorage<Record<string, boolean>>('collapsedPanels', {});
    const [globalFeedback, setGlobalFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // --- Page-specific State ---
    const [promptsPageState, setPromptsPageState] = useState<PromptsPageState>(null);
    const [activeSettingsTab, setActiveSettingsTab] = useLocalStorage<ActiveSettingsTab>('activeSettingsTab', 'app');
    const [activeSettingsSubTab, setActiveSettingsSubTabSetter] = useLocalStorage<string>('activeSettingsSubTab', 'general');

    // --- Data State ---
    const [clippedIdeas, setClippedIdeas] = useLocalStorage<Idea[]>('clippedIdeas', []);

    // --- App Initialization Effect ---
    const initializeApp = useCallback(async () => {
        setIsLoading(true);

        const onProgress = (message: string, progress?: number) => {
             if (typeof (window as any).document === 'undefined') return;

             const statusEl = (window as any).document.getElementById('loading-status');
             if (statusEl) {
                (statusEl as any).textContent = message;
             }
             
             const progressContainer = (window as any).document.getElementById('loading-progress-container');
             const progressBar = (window as any).document.getElementById('loading-progress-bar');
             if (progressContainer && progressBar) {
                if (progress !== undefined) {
                    (progressContainer as any).style.display = 'block';
                    (progressBar as any).style.width = `${progress * 100}%`;
                } else {
                    (progressContainer as any).style.display = 'none';
                }
            }
        };
        
        onProgress('Initializing local file system...');
        
        const hasHandle = await fileSystemManager.initialize(settings, auth);
        if (!hasHandle) {
            setShowWelcome(true);
            setIsLoading(false);
            return;
        }

        setShowWelcome(false);
        const repairSuccess = await verifyAndRepairFiles(onProgress, settings);
        if (!repairSuccess) {
            console.error("File integrity check failed. Some features might not work.");
        }

        setIsInitialized(true);
        setIsLoading(false);
        
    }, [settings, auth]);

    useEffect(() => {
        initializeApp();
    }, [initializeApp]);
    
    // --- UI Effects ---
    useEffect(() => {
        const isLg = typeof window !== 'undefined' && (window as any).innerWidth >= 1024;
        if (isPinned && isLg) {
            setIsSidebarOpen(true);
        } else if (!isLg) {
            setIsSidebarOpen(false); // Auto-close on smaller screens
        }
    }, [isPinned]);

    useEffect(() => {
        if (typeof (window as any).document === 'undefined') return;
        const currentTheme = settings.activeThemeMode === 'light' ? settings.lightTheme : settings.darkTheme;
        (window as any).document.documentElement.setAttribute('data-theme', currentTheme);
        (window as any).document.documentElement.style.fontSize = `${settings.fontSize}px`;
    }, [settings.activeThemeMode, settings.lightTheme, settings.darkTheme, settings.fontSize]);

    // Ensure component availability matches feature settings
    const { features } = settings;
    useEffect(() => {
        let isTabAllowed = true;
        switch (activeTab) {
            case 'prompt':
                isTabAllowed = features.isPromptLibraryEnabled;
                break;
            case 'gallery':
                isTabAllowed = features.isGalleryEnabled;
                break;
            case 'cheatsheet':
            case 'artstyles':
            case 'artists':
                isTabAllowed = features.isCheatsheetsEnabled;
                break;
            case 'composer':
            case 'image_compare':
            case 'color_palette_extractor':
            case 'resizer':
            case 'video_to_frames':
                isTabAllowed = features.isToolsEnabled;
                break;
            // 'dashboard', 'prompts' (the builder), and 'settings' are always allowed.
        }
        
        if (!isTabAllowed) {
            setActiveTab('dashboard');
        }
    }, [activeTab, features, setActiveTab]);

    // --- Handlers ---
    const handleMenuClick = () => {
        const isLg = typeof window !== 'undefined' && (window as any).innerWidth >= 1024;
        if (isLg && isPinned) {
            setIsPinned(false);
        }
        setIsSidebarOpen(p => !p);
    };

    const handleNavigate = (tab: ActiveTab) => {
        setActiveTab(tab);
        const isLg = typeof window !== 'undefined' && (window as any).innerWidth >= 1024;
        if (!isPinned && !isLg) {
            setIsSidebarOpen(false);
        }
    };
    
    const showGlobalFeedback = useCallback((message: string, isError = false) => {
        setGlobalFeedback({ message, type: isError ? 'error' : 'success' });
    }, []);

    const handleSendToPromptsPage = useCallback((state: PromptsPageState) => {
        setPromptsPageState(state);
        handleNavigate('prompts');
        showGlobalFeedback('Sent to Prompt Builder!');
    }, [showGlobalFeedback]);

    // --- Clipping Panel Handlers ---
    const handleClipIdea = (idea: Idea) => {
        setClippedIdeas(prev => [idea, ...prev]);
        showGlobalFeedback(`Clipped "${idea.title}"`);
    };

    const handleRemoveIdea = (id: string) => setClippedIdeas(prev => prev.filter(idea => idea.id !== id));
    const handleClearAllIdeas = () => setClippedIdeas([]);
    const handleInsertIdea = (prompt: string) => {
        handleSendToPromptsPage({ prompt, view: 'composer', id: `clip-${Date.now()}` });
        setIsClippingPanelOpen(false);
    };
    const handleRefineIdea = (prompt: string) => {
        handleSendToPromptsPage({ prompt, view: 'enhancer' });
        setIsClippingPanelOpen(false);
    };

    // --- Render Logic ---
    const renderContent = () => {
        const categoryPanelProps = {
            isCategoryPanelCollapsed: !!collapsedPanels[activeTab],
            onToggleCategoryPanel: () => setCollapsedPanels(p => ({ ...p, [activeTab]: !p[activeTab] })),
        };

        switch (activeTab) {
            case 'dashboard':
                return <Dashboard onNavigate={handleNavigate} />;
            case 'prompts':
                return <PromptsPage onClipIdea={handleClipIdea} initialState={promptsPageState} onStateHandled={() => setPromptsPageState(null)} showGlobalFeedback={showGlobalFeedback} />;
            case 'prompt':
                return <SavedPrompts {...categoryPanelProps} onSendToEnhancer={(prompt) => handleSendToPromptsPage({ prompt, view: 'enhancer' })} showGlobalFeedback={showGlobalFeedback} onClipIdea={handleClipIdea} />;
            case 'gallery':
                return <ImageGallery {...categoryPanelProps} isSidebarPinned={isPinned && isSidebarOpen} showGlobalFeedback={showGlobalFeedback} />;
            case 'cheatsheet':
                return <Cheatsheet {...categoryPanelProps} isSidebarPinned={isPinned && isSidebarOpen} />;
            case 'artstyles':
                return <ArtstyleCheatsheet {...categoryPanelProps} isSidebarPinned={isPinned && isSidebarOpen} onSendToPromptsPage={(state) => handleSendToPromptsPage({ ...state, view: 'enhancer' })} />;
            case 'artists':
                return <ArtistCheatsheet {...categoryPanelProps} isSidebarPinned={isPinned && isSidebarOpen} onSendToPromptsPage={(state) => handleSendToPromptsPage({ ...state, view: 'enhancer' })} />;
            case 'settings':
                return <SetupPage activeSettingsTab={activeSettingsTab} setActiveSettingsTab={setActiveSettingsTab} activeSubTab={activeSettingsSubTab} setActiveSubTab={setActiveSettingsSubTabSetter} showGlobalFeedback={showGlobalFeedback} />;
            case 'composer':
                return <ComposerPage />;
            case 'image_compare':
                return <ImageCompare />;
            case 'color_palette_extractor':
                return <ColorPaletteExtractor onClipIdea={handleClipIdea} />;
            case 'resizer':
                return <ImageResizer />;
            case 'video_to_frames':
                return <VideoToFrames />;
            default:
                return <Dashboard onNavigate={handleNavigate} />;
        }
    };
    
    if (isLoading) {
        return <InitialLoader />;
    }

    if (showWelcome) {
        return <Welcome onSetupComplete={initializeApp} />;
    }

    if (!isInitialized) {
        // This case handles if initialization fails for a reason other than needing the welcome screen.
        return <div className="p-8 text-center text-error">Fatal Error: Application could not be initialized. Please check console for details.</div>;
    }

    return (
        <div className="h-full bg-base-300">
            <Sidebar
                activeTab={activeTab}
                onNavigate={handleNavigate}
                isSidebarOpen={isSidebarOpen}
                isPinned={isPinned}
                setIsPinned={setIsPinned}
                onAboutClick={() => setIsAboutModalOpen(true)}
            />
            {isSidebarOpen && !isPinned && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/50 z-30" />}

            <div className={`flex flex-col h-full transition-colors duration-300 ease-in-out ${isSidebarOpen && isPinned ? 'lg:ml-64' : ''}`}>
                <Header
                    onMenuClick={handleMenuClick}
                    activeTab={activeTab}
                    clippedIdeasCount={clippedIdeas.length}
                    onToggleClippingPanel={() => setIsClippingPanelOpen(p => !p)}
                />
                <main className={`flex-grow ${activeTab === 'dashboard' ? 'overflow-y-auto' : 'overflow-hidden'}`}>
                    {renderContent()}
                </main>
                <Footer onAboutClick={() => setIsAboutModalOpen(true)} />
            </div>
            
            <ClippingPanel 
                isOpen={isClippingPanelOpen}
                onClose={() => setIsClippingPanelOpen(false)}
                clippedIdeas={clippedIdeas}
                onRemoveIdea={handleRemoveIdea}
                onClearAll={handleClearAllIdeas}
                onInsertIdea={handleInsertIdea}
                onRefineIdea={handleRefineIdea}
            />
            
            <AboutModal isOpen={isAboutModalOpen} onClose={() => setIsAboutModalOpen(false)} />
            
            {globalFeedback && (
                <FeedbackModal
                    isOpen={!!globalFeedback}
                    onClose={() => setGlobalFeedback(null)}
                    message={globalFeedback.message}
                    type={globalFeedback.type}
                />
            )}
        </div>
    );
};

export default App;