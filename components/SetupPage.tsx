import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { gsap } from 'gsap';
import type { LLMSettings, ActiveSettingsTab, PromptCategory, YouTubeConnection, GoogleIdentityConnection, SpotifyConnection } from '../types';
import { testOllamaConnection, type OllamaTestResult } from '../services/llmService';
import { testLlamaCppConnection, type LlamaCppTestResult } from '../services/llamacppService';
import { fileSystemManager } from '../utils/fileUtils';
import { useSettings } from '../contexts/SettingsContext';
import { loadPromptCategories } from '../utils/promptStorage';
import { resetAllSettings, loadLLMSettings } from '../utils/settingsStorage';
import ConfirmationModal from './ConfirmationModal';
import MigrationModal from './MigrationModal';

import FeedbackToast from './FeedbackToast';
import { audioService } from '../services/audioService';
import { appEventBus } from '../utils/eventBus';
import { PromptTxtImportModal } from './PromptTxtImportModal';

import { SetupNavItem } from './settings/primitives';
import { subMenuConfig, mainCategories } from './settings/config';
import AppSection from './settings/AppSection';
import AppearanceSection from './settings/AppearanceSection';
import IntegrationsSection from './settings/IntegrationsSection';
import PromptsSection from './settings/PromptsSection';
import GallerySection from './settings/GallerySection';


interface SetupPageProps {
    activeSettingsTab: ActiveSettingsTab;
    setActiveSettingsTab: (tab: ActiveSettingsTab) => void;
    activeSubTab: string;
    setActiveSubTab: (subTab: string) => void;
    showGlobalFeedback: (message: string, isError?: boolean) => void;
    isExiting?: boolean;
}

const MaintenanceOverlay: React.FC<{ progress: number, message: string }> = ({ progress, message }) => {
    const textWrapperRef = useRef<HTMLDivElement>(null);
    const { settings } = useSettings();

    useLayoutEffect(() => {
        if (!textWrapperRef.current) return;
        gsap.fromTo(textWrapperRef.current,
            { yPercent: 100, autoAlpha: 0 },
            { yPercent: 0, autoAlpha: 1, duration: 1.2, ease: "expo.out" }
        );
    }, []);

    useEffect(() => {
        if (progress >= 100 && textWrapperRef.current) {
            gsap.to(textWrapperRef.current, {
                y: -80, autoAlpha: 0, duration: 0.8, ease: "expo.inOut", delay: 0.2
            });
        }
    }, [progress]);

    return (
        <div className="fixed inset-0 bg-base-100 z-[500] flex flex-col items-center justify-center overflow-hidden select-none">
            <div className="absolute inset-0 bg-grid-texture opacity-[0.03] pointer-events-none"></div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                <span
                    className={`text-[25vw] font-black opacity-[0.03] leading-none select-none transition-all duration-500 ease-out ${settings.darkTheme === 'pipboy' ? 'font-monofonto' : 'font-logo'}`}
                    style={{ transform: `translateY(${(100 - progress) * 0.2}px)` }}
                >
                    {Math.round(progress).toString().padStart(2, '0')}
                </span>
            </div>
            <div className="relative z-10 flex flex-col items-center">
                <div className="overflow-hidden mb-6 px-4">
                    <h1 ref={textWrapperRef} className={`grid grid-cols-1 grid-rows-1 text-2xl md:text-4xl font-black tracking-tighter uppercase select-none items-center ${settings.darkTheme === 'pipboy' ? 'font-monofonto' : 'font-sf-mono'}`}>
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
                        <p className="text-[10px] font-mono font-bold uppercase tracking-[0.5em] text-center text-base-content/40">{message || 'DIAGNOSTIC_ACTIVE'}</p>
                        <div className="w-32 h-[1px] bg-base-content/10 relative overflow-hidden">
                            <div className="absolute inset-y-0 left-0 bg-primary transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-primary/60">{Math.round(progress)}%</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const SetupPage: React.FC<SetupPageProps> = ({
    activeSettingsTab, setActiveSettingsTab, activeSubTab, setActiveSubTab, showGlobalFeedback, isExiting = false
}) => {
    const { settings: globalSettings, updateSettings, availableOllamaModels, availableOllamaCloudModels, availableLlamaCppModels, refreshOllamaModels } = useSettings();
    const [settings, setSettings] = useState<LLMSettings>(globalSettings);
    const [modalFeedback, setModalFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const [isTestingOllama, setIsTestingOllama] = useState(false);
    const [ollamaTestResult, setOllamaTestResult] = useState<OllamaTestResult | null>(null);
    const [isTestingLlamaCpp, setIsTestingLlamaCpp] = useState(false);
    const [llamacppTestResult, setLlamaCppTestResult] = useState<LlamaCppTestResult | null>(null);

    const [isSyncing, setIsSyncing] = useState(false);
    const [isWorking, setIsWorking] = useState(false);
    const [maintenanceProgress, setMaintenanceProgress] = useState(0);
    const [maintenanceMsg, setMaintenanceMsg] = useState("");

    const [resetTarget, setResetTarget] = useState<'all' | null>(null);
    const [isRestartModalOpen, setIsRestartModalOpen] = useState(false);
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    const [isTxtImportModalOpen, setIsTxtImportModalOpen] = useState(false);
    const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);
    const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
    const [promptCategories, setPromptCategories] = useState<PromptCategory[]>([]);

    const [migrationDirection, setMigrationDirection] = useState<'push' | 'pull'>('push');
    const [isMigrationPaused, setIsMigrationPaused] = useState(false);
    const [migrationPhase, setMigrationPhase] = useState<'idle' | 'converting' | 'uploading' | 'complete'>('idle');
    const [convertingProgress, setConvertingProgress] = useState(0);
    const [convertingMsg, setConvertingMsg] = useState("");
    const [uploadingProgress, setUploadingProgress] = useState(0);
    const [uploadingMsg, setUploadingMsg] = useState("");
    const [duplicateFile, setDuplicateFile] = useState<string | null>(null);
    const duplicateResolverRef = useRef<((choice: 'replace' | 'copy') => void) | null>(null);

    const navRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
    const tokenClientRef = useRef<any>(null);
    const lastClientIdRef = useRef<string | null>(null);
    const authModeRef = useRef<'youtube' | 'google' | 'spotify'>('google');
    const authTimeoutRef = useRef<number | null>(null);
    const navScrollRef = useRef<HTMLDivElement>(null);
    const mainScrollRef = useRef<HTMLDivElement>(null);
    // Pre-computed PKCE params so window.open is called synchronously (avoids popup blockers)
    const spotifyPkceRef = useRef<{ verifier: string; challenge: string } | null>(null);

    const playSuccessChime = useCallback(() => { audioService.playSuccess(); }, []);

    const handleAuthResponse = useCallback(async (accessToken: string, mode: 'youtube' | 'google' | 'spotify', expiresIn?: number) => {
        if (authTimeoutRef.current) { window.clearTimeout(authTimeoutRef.current); authTimeoutRef.current = null; }
        try {
            if (mode === 'youtube') {
                const response = await fetch('/google-api/youtube/v3/channels?part=snippet,statistics&mine=true', {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (!response.ok) throw new Error("YouTube metadata acquisition failed.");
                const data = await response.json();
                if (data.items && data.items.length > 0) {
                    const channel = data.items[0];
                    const updatedYouTube: YouTubeConnection = {
                        ...settings.youtube, isConnected: true, channelName: channel.snippet.title,
                        accessToken: accessToken, subscriberCount: channel.statistics.subscriberCount,
                        videoCount: parseInt(channel.statistics.videoCount),
                        thumbnailUrl: channel.snippet.thumbnails.default.url, connectedAt: Date.now()
                    };
                    const updatedSettings = { ...settings, youtube: updatedYouTube };
                    setSettings(updatedSettings); updateSettings(updatedSettings); playSuccessChime();
                    showGlobalFeedback(`YouTube Linked: ${channel.snippet.title}`);
                }
                } else if (mode === 'spotify') {
                const response = await fetch('https://api.spotify.com/v1/me', {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (!response.ok) throw new Error("Spotify profile fetch failed.");
                const user = await response.json();
                const updatedSpotify: SpotifyConnection = {
                    ...settings.spotify,
                    isConnected: true,
                    displayName: user.display_name,
                    email: user.email,
                    accessToken: accessToken,
                    refreshToken: localStorage.getItem('spotify_refresh_token') || undefined,
                    expiresAt: parseInt(localStorage.getItem('spotify_expires_at') || '0') || undefined,
                    connectedAt: Date.now(),
                };
                const updatedSettings = { ...settings, spotify: updatedSpotify };
                setSettings(updatedSettings); updateSettings(updatedSettings); playSuccessChime();
                showGlobalFeedback(`Spotify Linked: ${user.display_name}`);
            } else {
                const response = await fetch('/google-api/oauth2/v3/userinfo', {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (!response.ok) throw new Error("Cloud Identity fetch failed.");
                const user = await response.json();
                const updatedGoogle: GoogleIdentityConnection = {
                    isConnected: true, email: user.email, name: user.name, picture: user.picture,
                    accessToken: accessToken,
                    expiresAt: Date.now() + (typeof expiresIn === 'number' ? expiresIn : 3600) * 1000,
                    connectedAt: Date.now()
                };
                const updatedSettings = { ...settings, googleIdentity: updatedGoogle };
                setSettings(updatedSettings); updateSettings(updatedSettings);
                showGlobalFeedback(`Uplink confirmed. Scanning Google Drive for 'Kollektiv' folder...`);
                fileSystemManager.accessToken = accessToken;
                const folder = await fileSystemManager.scanForKollektivFolder().catch(() => null);
                if (folder) {
                    const finalSettings = { ...updatedSettings, driveFolderId: folder.id, driveFolderName: folder.name };
                    setSettings(finalSettings); updateSettings(finalSettings);
                    showGlobalFeedback(`Uplink confirmed & standby Google Drive configured for ${user.email}`);
                } else { setIsCreateFolderModalOpen(true); }
                playSuccessChime();
            }
        } catch (error: any) {
            console.error("Auth Fetch Error:", error);
            showGlobalFeedback(`Integration Error: ${error.message}`, true);
        } finally { setIsWorking(false); setMaintenanceMsg(""); setMaintenanceProgress(0); }
    }, [settings, updateSettings, showGlobalFeedback, playSuccessChime]);

    const initGsi = useCallback((clientId: string) => {
        if (lastClientIdRef.current === clientId && tokenClientRef.current) return;
        try {
            if ((window as any).google?.accounts?.oauth2) {
                tokenClientRef.current = (window as any).google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/gmail.modify openid',
                    callback: (response: any) => {
                        if (authTimeoutRef.current) { window.clearTimeout(authTimeoutRef.current); authTimeoutRef.current = null; }
                        if (response.error) { setIsWorking(false); setMaintenanceMsg(""); setMaintenanceProgress(0); if (response.error !== 'popup_closed') showGlobalFeedback(`Authentication failed: ${response.error}`, true); return; }
                        if (response.access_token) handleAuthResponse(response.access_token, authModeRef.current, response.expires_in);
                        else { setIsWorking(false); setMaintenanceMsg(""); }
                    },
                });
                // Expose globally so assistant tools can trigger silent token refresh
                (window as any).__GOOGLE_TOKEN_CLIENT = tokenClientRef.current;
                lastClientIdRef.current = clientId;
            }
        } catch (e) { console.error("GSI Client Init Error:", e); tokenClientRef.current = null; }
    }, [handleAuthResponse, showGlobalFeedback]);

    useEffect(() => {
        const clientId = settings.youtube?.customClientId || process.env.YOUTUBE_CLIENT_ID;
        if (!clientId || clientId.includes('PLACEHOLDER')) return;
        const checkGsi = () => { if ((window as any).google?.accounts?.oauth2) initGsi(clientId); else setTimeout(checkGsi, 500); };
        checkGsi();
        return () => { if (authTimeoutRef.current) window.clearTimeout(authTimeoutRef.current); }
    }, [settings.youtube?.customClientId, initGsi]);

    // Silent token refresh for Google Identity (triggered by other components
    // when they detect the token is expired but isConnected is still true).
    useEffect(() => {
        const doRefresh = () => {
            const clientId = settings.youtube?.customClientId || settings.googleApiKey || process.env.YOUTUBE_CLIENT_ID;
            if (!clientId || clientId.includes('PLACEHOLDER')) return;
            // Re-init if client id changed or token client not available
            if (!tokenClientRef.current || lastClientIdRef.current !== clientId) {
                initGsi(clientId);
            }
            if (!tokenClientRef.current) return;
            try {
                tokenClientRef.current.requestAccessToken({ prompt: '' });
            } catch (e) {
                console.warn('Silent token refresh failed:', e);
            }
        };
        return appEventBus.on('googleTokenRefreshRequested', doRefresh);
    }, [settings.youtube?.customClientId, settings.googleApiKey, initGsi]);

    // PKCE helpers for Spotify OAuth
    const generateCodeVerifier = useCallback((): string => {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return btoa(String.fromCharCode(...array))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }, []);

    const generateCodeChallenge = useCallback(async (codeVerifier: string): Promise<string> => {
        const encoder = new TextEncoder();
        const data = encoder.encode(codeVerifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode(...new Uint8Array(digest)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }, []);

    // Pre-compute PKCE params for Spotify so window.open is synchronous (avoids popup blockers)
    useEffect(() => {
        const clientId = settings.spotify?.customClientId || process.env.SPOTIFY_CLIENT_ID || '';
        if (!clientId || clientId.includes('PLACEHOLDER')) { spotifyPkceRef.current = null; return; }
        const verifier = generateCodeVerifier();
        generateCodeChallenge(verifier).then(challenge => {
            spotifyPkceRef.current = { verifier, challenge };
        });
    }, [settings.spotify?.customClientId, generateCodeVerifier, generateCodeChallenge]);

    const handleAuthConnect = async (mode: 'youtube' | 'google' | 'spotify') => {
        if (mode === 'spotify') {
            const clientId = settings.spotify?.customClientId || process.env.SPOTIFY_CLIENT_ID || '';
            if (!clientId || clientId.includes('PLACEHOLDER')) { showGlobalFeedback("Configuration Error: Missing Spotify Client ID in Settings.", true); return; }
            // Use pre-computed PKCE params so window.open is synchronous (avoids popup blockers)
            const pkce = spotifyPkceRef.current;
            if (!pkce) {
                showGlobalFeedback("Preparing authentication… try again in a moment.", false);
                return;
            }
            localStorage.setItem('spotify_code_verifier_temp', pkce.verifier);
            localStorage.setItem('spotify_client_id_temp', clientId);
            const redirectUri = `${window.location.origin}/auth/spotify/callback`;
            const scope = 'user-read-private user-read-email playlist-read-private playlist-read-collaborative user-library-read streaming user-read-playback-state user-modify-playback-state';
            const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&code_challenge_method=S256&code_challenge=${pkce.challenge}&show_dialog=true`;
            window.open(authUrl, 'spotify-auth', 'width=600,height=800,popup=yes');
            return;
        }
        const clientId = settings.youtube?.customClientId || process.env.YOUTUBE_CLIENT_ID;
        if (!clientId || clientId.includes('PLACEHOLDER')) { showGlobalFeedback("Configuration Error: Missing Google Client ID in Settings.", true); return; }
        authModeRef.current = mode;
        if (!tokenClientRef.current) initGsi(clientId);
        if (!tokenClientRef.current) { showGlobalFeedback("System Error: Google Auth library failed to load.", true); return; }
        setIsWorking(false);
        try { tokenClientRef.current.requestAccessToken({ prompt: 'consent' }); }
        catch (e) { if (authTimeoutRef.current) window.clearTimeout(authTimeoutRef.current); showGlobalFeedback("Popup blocked or init error.", true); }
    };

    const handleGoogleDisconnect = () => {
        const updatedGoogle: GoogleIdentityConnection = { isConnected: false };
        const updatedSettings = { ...settings, googleIdentity: updatedGoogle };
        setSettings(updatedSettings); updateSettings(updatedSettings);
        showGlobalFeedback('Cloud Identity revoked.');
    };

    const handleSpotifyDisconnect = () => {
        const updatedSpotify: SpotifyConnection = { isConnected: false };
        const updatedSettings = { ...settings, spotify: updatedSpotify };
        setSettings(updatedSettings); updateSettings(updatedSettings);
        // Clear localStorage
        if (typeof window !== 'undefined') {
            localStorage.removeItem('spotify_access_token');
            localStorage.removeItem('spotify_refresh_token');
            localStorage.removeItem('spotify_expires_at');
            localStorage.removeItem('spotify_just_connected');
            localStorage.removeItem('spotify_code_verifier_temp');
            localStorage.removeItem('spotify_client_id_temp');
        }
        showGlobalFeedback('Spotify disconnected.');
    };

    useEffect(() => { setSettings(globalSettings); }, [globalSettings]);

    // Detect Spotify tokens written to localStorage by the popup callback.
    // Uses both a storage event (fires when popup writes to localStorage)
    // and a fallback interval to cover any missed events.
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const tryConnect = () => {
            const justConnected = localStorage.getItem('spotify_just_connected');
            if (!justConnected) return;

            const accessToken = localStorage.getItem('spotify_access_token');
            const expiresAt = parseInt(localStorage.getItem('spotify_expires_at') || '0', 10);

            if (!accessToken || expiresAt <= Date.now()) return;

            // Consume the flag so we don't re-process
            localStorage.removeItem('spotify_just_connected');

            fetch('https://api.spotify.com/v1/me', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            })
            .then(async res => {
                if (!res.ok) {
                    const body = await res.text();
                    throw new Error(`Spotify API ${res.status}: ${body.slice(0, 200)}`);
                }
                return res.json();
            })
            .then(user => {
                const refreshToken = localStorage.getItem('spotify_refresh_token') || undefined;
                const updatedSpotify: SpotifyConnection = {
                    ...settings.spotify,
                    isConnected: true,
                    displayName: user.display_name,
                    email: user.email,
                    accessToken,
                    refreshToken,
                    expiresAt,
                    connectedAt: Date.now(),
                };
                const updatedSettings = { ...settings, spotify: updatedSpotify };
                setSettings(updatedSettings);
                updateSettings(updatedSettings);
                showGlobalFeedback(`Spotify Linked: ${user.display_name}`);
            })
            .catch(err => {
                console.error('Spotify profile fetch error:', err);
                showGlobalFeedback(`Spotify linked but profile fetch failed: ${err.message}`, true);
                const updatedSpotify: SpotifyConnection = {
                    ...settings.spotify,
                    isConnected: true,
                    accessToken,
                    expiresAt,
                    connectedAt: Date.now(),
                };
                const updatedSettings = { ...settings, spotify: updatedSpotify };
                setSettings(updatedSettings);
                updateSettings(updatedSettings);
            });
        };

        // Check immediately in case tokens are already there
        tryConnect();

        // Listen for storage events from the popup
        const onStorage = (e: StorageEvent) => {
            if (e.key === 'spotify_just_connected' || e.key === 'spotify_access_token') {
                tryConnect();
            }
        };
        window.addEventListener('storage', onStorage);

        // Poll every 2s as a fallback (storage event can be missed in some browsers)
        const interval = setInterval(tryConnect, 2000);

        return () => {
            window.removeEventListener('storage', onStorage);
            clearInterval(interval);
        };
    }, [settings, updateSettings, showGlobalFeedback]);

    useEffect(() => {
        const subTabs = subMenuConfig[activeSettingsTab] || [];
        if (!subTabs.some(st => st.id === activeSubTab)) setActiveSubTab(subTabs[0]?.id || '');
        if (activeSettingsTab === 'prompt') loadPromptCategories().then(setPromptCategories);
    }, [activeSettingsTab, activeSubTab, setActiveSubTab]);

    const handleSettingsChange = useCallback((field: keyof LLMSettings, value: any) => {
        const updated = { ...settings, [field]: value };
        setSettings(updated);
        if (['youtube', 'googleIdentity', 'spotify', 'dashboardImageUrl', 'dashboardVideoUrl', 'darkTheme', 'mcpServers', 'googleApiKey', 'storageProvider', 'driveFolderId', 'driveFolderName'].includes(field)) updateSettings(updated);
        if (field === 'fontSize' && typeof window !== 'undefined') (window as any).document.documentElement.style.fontSize = `${value}px`;
        // Sync Google API key to window for assistant tools (read from googleApiKey, fallback to youtube.customApiKey)
        if (typeof window !== 'undefined') {
            if (field === 'googleApiKey' && value) {
                (window as any).__YOUTUBE_API_KEY = value;
            } else if (field === 'youtube' && value?.customApiKey) {
                (window as any).__YOUTUBE_API_KEY = value.customApiKey;
            }
        }
    }, [settings, updateSettings]);

    const handleMultipleSettingsChange = useCallback((updates: Partial<LLMSettings>) => {
        const updated = { ...settings, ...updates };
        setSettings(updated);
        if ('dashboardBackgroundType' in updates || 'isDashboardVideoEnabled' in updates) updateSettings(updated);
    }, [settings, updateSettings]);

    const saveSettings = () => { updateSettings(settings); showGlobalFeedback('Settings synchronized with vault.'); };
    const handleCancel = () => { setSettings(globalSettings); showGlobalFeedback('Changes abandoned.'); };

    const handleTestOllamaConnection = async (isCloud: boolean = false) => {
        setIsTestingOllama(true); setOllamaTestResult(null);
        try {
            const url = isCloud ? settings.ollamaCloudBaseUrl : settings.ollamaBaseUrl;
            const result = await testOllamaConnection(url);
            setOllamaTestResult(result);
            if (result.success) refreshOllamaModels();
        } catch (e) { setOllamaTestResult({ success: false, message: "CRITICAL PING FAILURE" }); }
        setIsTestingOllama(false);
    };

    const handleTestLlamaCppConnection = async () => {
        setIsTestingLlamaCpp(true); setLlamaCppTestResult(null);
        try {
            const url = settings.llamacppBaseUrl || 'http://localhost:8080';
            const apiKey = settings.llamacppApiKey;
            const result = await testLlamaCppConnection(url, apiKey);
            setLlamaCppTestResult(result);
            if (result.success) { refreshOllamaModels(); showGlobalFeedback("Llama.cpp connection established (200 OK)", false); }
            else { showGlobalFeedback(`Llama.cpp connection failed: ${result.message}`, true); }
        } catch (e: any) { setLlamaCppTestResult({ success: false, message: "CRITICAL PING FAILURE" }); showGlobalFeedback(`Llama.cpp ping error: ${e.message || e}`, true); }
        setIsTestingLlamaCpp(false);
    };

    const handleConfirmReset = async () => {
        setIsResetModalOpen(false);
        if (resetTarget === 'all') {
            setIsWorking(true); setMaintenanceMsg("WIPING LOCAL DATA..."); setMaintenanceProgress(50);
            try { await resetAllSettings(); window.location.reload(); }
            catch (error: any) { showGlobalFeedback(`Reset Failure: ${error.message}`, true); }
            finally { setIsWorking(false); }
        }
    };

    const handleConfirmMigration = async () => {
        setIsWorking(true); setMaintenanceProgress(0); setMaintenanceMsg("MIGRATING_TO_DRIVE...");
        setIsMigrationPaused(false); setDuplicateFile(null); setMigrationPhase('converting');
        setConvertingProgress(0); setConvertingMsg("Initializing digital assets conversion...");
        setUploadingProgress(0); setUploadingMsg("");
        fileSystemManager.isMigrationPaused = false;
        try {
            await fileSystemManager.migrateLocalToDrive(
                (msg, progress, extra) => {
                    setMaintenanceMsg(msg);
                    if (progress !== undefined) setMaintenanceProgress(progress);
                    if (extra) {
                        if (extra.phase) setMigrationPhase(extra.phase);
                        if (extra.convertingProgress !== undefined) setConvertingProgress(extra.convertingProgress);
                        if (extra.convertingMsg !== undefined) setConvertingMsg(extra.convertingMsg);
                        if (extra.uploadingProgress !== undefined) setUploadingProgress(extra.uploadingProgress);
                        if (extra.uploadingMsg !== undefined) setUploadingMsg(extra.uploadingMsg);
                    }
                },
                async (fileName) => {
                    const choice = await new Promise<'replace' | 'copy'>((resolve) => { setDuplicateFile(fileName); duplicateResolverRef.current = resolve; });
                    setDuplicateFile(null); duplicateResolverRef.current = null; return choice;
                }
            );
            setMaintenanceProgress(100); setMigrationPhase('complete');
            showGlobalFeedback("Migration completed. You can now switch to Google Drive storage.");
            setIsMigrationModalOpen(false);
        } catch (e: any) {
            console.error("Migration Error:", e); setMigrationPhase('idle');
            if (e?.message === "Migration aborted by user.") showGlobalFeedback("Migration cancelled.");
            else showGlobalFeedback(`Migration Error: ${e.message}`, true);
        } finally {
            setIsWorking(false); setMaintenanceProgress(0); setMaintenanceMsg("");
            setDuplicateFile(null); setIsMigrationPaused(false);
        }
    };

    const handleConfirmPullMigration = async () => {
        setIsWorking(true); setMaintenanceProgress(0); setMaintenanceMsg("SYNCING_FROM_DRIVE...");
        setIsMigrationPaused(false); setDuplicateFile(null); setMigrationPhase('converting');
        setConvertingProgress(0); setConvertingMsg("Retrieving Google Drive catalog manifest...");
        setUploadingProgress(0); setUploadingMsg("");
        fileSystemManager.isMigrationPaused = false;
        try {
            await fileSystemManager.syncDriveToLocal((msg, progress) => {
                setMaintenanceMsg(msg);
                if (progress !== undefined) {
                    setMaintenanceProgress(progress);
                    if (progress < 10) { setMigrationPhase('converting'); setConvertingProgress(progress * 10); setConvertingMsg(msg); }
                    else { setMigrationPhase('uploading'); setUploadingProgress(progress); setUploadingMsg(msg); }
                }
            });
            setMaintenanceProgress(100); setMigrationPhase('complete');
            showGlobalFeedback("Pull Sync completed! Your local vault is now fully synchronized with Google Drive.");
            setIsMigrationModalOpen(false);
            const updated = loadLLMSettings(); setSettings(updated);
        } catch (e: any) {
            console.error("Pull Sync Error:", e); setMigrationPhase('idle');
            if (e?.message === "Migration aborted by user.") showGlobalFeedback("Pull sync cancelled.");
            else showGlobalFeedback(`Pull Sync Error: ${e.message}`, true);
        } finally {
            setIsWorking(false); setMaintenanceProgress(0); setMaintenanceMsg("");
            setDuplicateFile(null); setIsMigrationPaused(false);
        }
    };

    const handleMainTabClick = (tab: ActiveSettingsTab) => { audioService.playClick(); setActiveSettingsTab(tab); };

    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
    const siblingOrigin = useMemo(() => {
        if (!currentOrigin || currentOrigin === 'unknown') return '';
        if (currentOrigin.includes('ais-dev-')) return currentOrigin.replace('ais-dev-', 'ais-pre-');
        if (currentOrigin.includes('ais-pre-')) return currentOrigin.replace('ais-pre-', 'ais-dev-');
        return '';
    }, [currentOrigin]);

    const localModelOptions = useMemo(() => availableOllamaModels.map(m => ({ label: m, value: m })), [availableOllamaModels]);
    const cloudModelOptions = useMemo(() => availableOllamaCloudModels.map(m => ({ label: m, value: m })), [availableOllamaCloudModels]);
    const llamacppModelOptions = useMemo(() => (availableLlamaCppModels.length > 0 ? availableLlamaCppModels : ['default']).map(m => ({ label: m, value: m })), [availableLlamaCppModels]);

    const currentSubTabs = subMenuConfig[activeSettingsTab] || [];

    const renderActiveTabContent = () => {
        let content: React.ReactNode = null;
        switch (activeSettingsTab) {
            case 'app':
                content = (
                    <AppSection
                        activeSubTab={activeSubTab}
                        settings={settings}
                        handleSettingsChange={handleSettingsChange}
                        showGlobalFeedback={showGlobalFeedback}
                        setActiveSubTab={setActiveSubTab}
                        handleAuthConnect={handleAuthConnect}
                        handleGoogleDisconnect={handleGoogleDisconnect}
                        handleSpotifyDisconnect={handleSpotifyDisconnect}
                        isSyncing={isSyncing}
                        setIsSyncing={setIsSyncing}
                        isWorking={isWorking}
                        setIsWorking={setIsWorking}
                        setMaintenanceProgress={setMaintenanceProgress}
                        setMaintenanceMsg={setMaintenanceMsg}
                        onOpenRestartModal={() => setIsRestartModalOpen(true)}
                        onOpenResetModal={(target) => { setResetTarget(target); setIsResetModalOpen(true); }}
                        onOpenMigrationModal={(direction) => { setMigrationDirection(direction); setIsMigrationModalOpen(true); }}
                    />
                );
                break;
            case 'appearance':
                content = (
                    <AppearanceSection
                        activeSubTab={activeSubTab}
                        settings={settings}
                        handleSettingsChange={handleSettingsChange}
                        handleMultipleSettingsChange={handleMultipleSettingsChange}
                    />
                );
                break;
            case 'integrations':
                content = (
                    <IntegrationsSection
                        activeSubTab={activeSubTab}
                        settings={settings}
                        handleSettingsChange={handleSettingsChange}
                        handleAuthConnect={handleAuthConnect}
                        handleGoogleDisconnect={handleGoogleDisconnect}
                        handleSpotifyDisconnect={handleSpotifyDisconnect}
                        isTestingOllama={isTestingOllama}
                        ollamaTestResult={ollamaTestResult}
                        isTestingLlamaCpp={isTestingLlamaCpp}
                        llamacppTestResult={llamacppTestResult}
                        handleTestOllamaConnection={handleTestOllamaConnection}
                        handleTestLlamaCppConnection={handleTestLlamaCppConnection}
                        localModelOptions={localModelOptions}
                        cloudModelOptions={cloudModelOptions}
                        llamacppModelOptions={llamacppModelOptions}
                        currentOrigin={currentOrigin}
                        siblingOrigin={siblingOrigin}
                    />
                );
                break;
            case 'prompt':
                content = <PromptsSection activeSubTab={activeSubTab} onOpenTxtImportModal={() => setIsTxtImportModalOpen(true)} />;
                break;
            case 'gallery':
                content = (
                    <GallerySection
                        activeSubTab={activeSubTab}
                        settings={settings}
                        handleSettingsChange={handleSettingsChange}
                    />
                );
                break;
        }
        return (
            <div className="flex-grow overflow-y-auto custom-scrollbar px-6 pb-6">
                {content}
            </div>
        );
    };

    const panelVariants = {
        hidden: { clipPath: 'inset(100% 0 0 0)', opacity: 0 },
        visible: (custom: number) => ({
            clipPath: 'inset(0% 0 0 0)', opacity: 1,
            transition: { duration: 1.0, ease: [0.16, 1, 0.3, 1] as any, delay: typeof custom === 'number' ? custom : 0 }
        }),
        exit: { clipPath: 'inset(100% 0 0 0)', opacity: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as any } }
    };

    return (
        <>
            <motion.section
                variants={panelVariants}
                initial="hidden"
                animate={isExiting ? "exit" : "visible"}
                custom={0.4}
                className="w-full h-full"
            >
                <div className="w-full h-full bg-base-200/30 backdrop-blur-sm border border-white/5 shadow-2xl grid grid-cols-1 lg:grid-cols-[280px_1fr] overflow-hidden relative">
                    {/* Left Sidebar - System Hub */}
                    <aside className="hidden lg:flex flex-col bg-base-100/30 border-r border-white/5 overflow-hidden">
                        <div className="h-16 flex items-center px-6 border-b border-white/5 flex-shrink-0">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/30">SYSTEM HUB</h2>
                        </div>
                        <div ref={navScrollRef} className="flex-grow overflow-y-auto custom-scrollbar px-4 py-4">
                            <ul className="space-y-1">
                                {mainCategories.map(cat => (
                                    <SetupNavItem
                                        key={cat.id}
                                        label={cat.label}
                                        icon={cat.icon}
                                        isActive={activeSettingsTab === cat.id}
                                        onClick={() => handleMainTabClick(cat.id)}
                                        registerRef={(el) => { navRefs.current[cat.id] = el; }}
                                    />
                                ))}
                            </ul>
                        </div>
                    </aside>

                    {/* Main Content */}
                    <main ref={mainScrollRef} className="flex flex-col h-full overflow-hidden">
                        {/* Category fallback for viewports below the lg sidebar breakpoint — the
                            System Hub sidebar is hidden there, so this is the only way to switch
                            categories without it. */}
                        <div className="lg:hidden flex items-center gap-1.5 border-b border-white/5 px-4 py-2 flex-shrink-0 overflow-x-auto custom-scrollbar">
                            {mainCategories.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => handleMainTabClick(cat.id)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-colors border ${activeSettingsTab === cat.id ? 'bg-primary/10 text-primary border-primary/30' : 'text-base-content/40 border-transparent hover:text-base-content/70'}`}
                                >
                                    {cat.icon}
                                    {cat.label}
                                </button>
                            ))}
                        </div>
                        <div className="h-16 flex items-center border-b border-white/5 px-6 flex-shrink-0 overflow-x-auto custom-scrollbar">
                            <div className="flex gap-4">
                                {currentSubTabs.map(sub => (
                                    <button
                                        key={sub.id}
                                        onClick={() => { audioService.playClick(); setActiveSubTab(sub.id); }}
                                        className={`flex items-center gap-2 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeSubTab === sub.id ? 'border-primary text-primary' : 'border-transparent text-base-content/30 hover:text-base-content/60'}`}
                                    >
                                        {sub.icon}
                                        {sub.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {renderActiveTabContent()}

                        <footer className="flex flex-row h-14 items-stretch p-1.5 gap-1.5 flex-shrink-0 panel-footer">
                            <button onClick={() => { audioService.playClick(); handleCancel(); }} className="form-btn flex-1">Abort</button>
                            <button onClick={() => { audioService.playClick(); saveSettings(); }} className="form-btn form-btn-primary flex-1 shadow-lg">Confirm</button>
                        </footer>
                    </main>
                </div>
            </motion.section>

            {/* Modals */}
            {modalFeedback && <FeedbackToast isOpen={!!modalFeedback} onClose={() => setModalFeedback(null)} message={modalFeedback.message} type={modalFeedback.type} />}
            <ConfirmationModal isOpen={isRestartModalOpen} onClose={() => setIsRestartModalOpen(false)} onConfirm={() => window.location.reload()} title="RELOAD REQUEST" message="Purge neuronal state and restart interface?" btnClassName="btn-warning" />
            <ConfirmationModal isOpen={isResetModalOpen} onClose={() => setIsResetModalOpen(false)} onConfirm={handleConfirmReset} title="VAULT RESET" message="Permanently erase all local artifacts and configuration?" />
            <PromptTxtImportModal isOpen={isTxtImportModalOpen} onClose={() => setIsTxtImportModalOpen(false)} onImport={() => {}} categories={promptCategories} />
            <ConfirmationModal isOpen={isCreateFolderModalOpen} onClose={() => { setIsCreateFolderModalOpen(false); showGlobalFeedback("Google Drive standby configured without custom folder."); }} onConfirm={async () => {
                setIsCreateFolderModalOpen(false); setIsWorking(true); setMaintenanceMsg("CREATING_FOLDER_ON_DRIVE...");
                try {
                    const folderId = await fileSystemManager.createKollektivFolder();
                    const updatedSettings = { ...settings, driveFolderId: folderId, driveFolderName: "Google Drive (Kollektiv)" };
                    setSettings(updatedSettings); updateSettings(updatedSettings);
                    showGlobalFeedback(`Google Drive folder created. Vault connected.`);
                } catch (e: any) { showGlobalFeedback(`Folder creation failed: ${e.message}`, true); }
                finally { setIsWorking(false); setMaintenanceMsg(""); }
            }} title="CREATE FOLDER" message="No 'Kollektiv' folder found in Google Drive. Would you like to create one?" />
            <MigrationModal
                isOpen={isMigrationModalOpen}
                onClose={() => {
                    fileSystemManager.isMigrationAborted = true;
                    fileSystemManager.isMigrationPaused = false;
                    if (duplicateResolverRef.current) duplicateResolverRef.current('replace');
                    setIsMigrationPaused(false); setDuplicateFile(null); setIsMigrationModalOpen(false);
                }}
                onConfirm={migrationDirection === 'push' ? handleConfirmMigration : handleConfirmPullMigration}
                isWorking={isWorking}
                progress={maintenanceProgress}
                message={maintenanceMsg}
                isPaused={isMigrationPaused}
                duplicateFile={duplicateFile}
                onResolveDuplicate={(choice: 'replace' | 'copy') => {
                    audioService.playClick();
                    if (duplicateResolverRef.current) duplicateResolverRef.current(choice);
                }}
                onPause={() => { audioService.playClick(); fileSystemManager.isMigrationPaused = true; setIsMigrationPaused(true); }}
                onResume={() => { audioService.playClick(); fileSystemManager.isMigrationPaused = false; setIsMigrationPaused(false); }}
                syncDirection={migrationDirection}
                phase={migrationPhase}
                convertingProgress={convertingProgress}
                convertingMessage={convertingMsg}
                uploadingProgress={uploadingProgress}
                uploadingMessage={uploadingMsg}
            />
            {isWorking && !isMigrationModalOpen && <MaintenanceOverlay progress={maintenanceProgress} message={maintenanceMsg} />}
        </>
    );
};
