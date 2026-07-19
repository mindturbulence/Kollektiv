import React, { useState, useEffect } from 'react';
import { fileSystemManager } from '../utils/fileUtils';
import { getHandle } from '../utils/db';
import { FolderClosedIcon, AppLogoIcon, RefreshIcon } from './icons';
import { audioService } from '../services/audioService';
import { useSettings } from '../contexts/SettingsContext';
import { isGoogleAuthValid, buildGoogleIdentity, trySilentRefreshWithWait } from '../utils/googleAuth';

interface WelcomeProps {
  onSetupComplete: (customSettings?: any) => void;
}

const Welcome: React.FC<WelcomeProps> = ({ onSetupComplete }) => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasExistingHandle, setHasExistingHandle] = useState(false);
  const [existingDirName, setExistingDirName] = useState<string | null>(null);
  const { settings, updateSettings } = useSettings();

  useEffect(() => {
    const checkHandle = async () => {
        try {
            const handle = await getHandle<FileSystemDirectoryHandle>('app-data-dir');
            if (handle && typeof handle.name === 'string') {
                setHasExistingHandle(true);
                setExistingDirName(handle.name);
            }
        } catch (e) {
            console.warn("Failed to check existing storage handle:", e);
        }
    };
    checkHandle();
  }, []);

  const handleSelectDirectory = async () => {
    audioService.playClick();
    setError(null);
    setIsLoading(true);
    try {
      const handle = await fileSystemManager.selectAndSetAppDataDirectory();
      if (handle) {
        onSetupComplete({ ...settings, storageProvider: 'local' as const });
      } else {
        setIsLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred.');
      setIsLoading(false);
    }
  };

  const handleReconnect = async () => {
      audioService.playClick();
      setError(null);
      setIsLoading(true);
      try {
          const success = await fileSystemManager.requestExistingPermission();
          if (success) {
              onSetupComplete({ ...settings, storageProvider: 'local' as const });
          } else {
              setError("Permission denied. Please click 'Reconnect' and grant access to your chosen folder.");
              setIsLoading(false);
          }
      } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to reconnect.');
          setIsLoading(false);
      }
  };

  const handleGoogleDriveSignIn = () => {
    audioService.playClick();
    setError(null);
    setIsLoading(true);
    
    const clientId = settings.youtube?.customClientId || process.env.YOUTUBE_CLIENT_ID;
    if (!clientId || clientId.includes('PLACEHOLDER')) {
        setError("Configuration Error: Missing Google Client ID. Please configure it in Settings or provide YOUTUBE_CLIENT_ID.");
        setIsLoading(false);
        return;
    }

    try {
        if ((window as any).google?.accounts?.oauth2) {
            const client = (window as any).google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/gmail.modify openid',
                callback: async (response: any) => {
                    if (response.error) {
                        setIsLoading(false);
                        if (response.error !== 'popup_closed') {
                            setError(`Authentication failed: ${response.error}`);
                        }
                        return;
                    }

                    if (response.access_token) {
                        try {
                            const userInfoRes = await fetch('/google-api/oauth2/v3/userinfo', {
                                headers: { 'Authorization': `Bearer ${response.access_token}` }
                            });
                            if (!userInfoRes.ok) throw new Error("Cloud Identity fetch failed.");
                            const user = await userInfoRes.json();
                            
                            const updatedGoogle = buildGoogleIdentity(
                                { access_token: response.access_token, expires_in: response.expires_in },
                                { email: user.email, name: user.name, picture: user.picture }
                            );
                            
                            const updatedSettings = { 
                                ...settings, 
                                storageProvider: 'drive' as const,
                                googleIdentity: updatedGoogle 
                            };
                            updateSettings(updatedSettings);
                            
                            const success = await fileSystemManager.initialize(updatedSettings, {} as any);
                            if (success) {
                                audioService.playAppStart();
                                const folderId = (fileSystemManager as any).rootFolderId;
                                const finalSettings = {
                                    ...updatedSettings,
                                    driveFolderId: folderId || '',
                                    driveFolderName: (fileSystemManager as any).appDirectoryName || ''
                                };
                                updateSettings(finalSettings);
                                onSetupComplete(finalSettings);
                            } else {
                                const detailedMsg = (fileSystemManager as any).lastError || "Please verify Google Drive permissions.";
                                setError(`Failed to initialize Google Drive: ${detailedMsg}`);
                                setIsLoading(false);
                            }
                        } catch (err: any) {
                            setError(`Failed to read user profile or initialize drive: ${err.message}`);
                            setIsLoading(false);
                        }
                    } else {
                        setIsLoading(false);
                    }
                }
            });
            client.requestAccessToken({ prompt: 'consent' });
        } else {
            setError("Google Identity system has not finished loading. Please wait a moment and try again.");
            setIsLoading(false);
        }
    } catch (e: any) {
        setError(`Failed to start Google authentication: ${e.message}`);
        setIsLoading(false);
    }
  };
 
  const handleActivateDriveDirectly = async () => {
      audioService.playClick();
      setError(null);
      setIsLoading(true);

      let activeSettings = settings;
      if (!isGoogleAuthValid(settings.googleIdentity)) {
          if (settings.googleIdentity?.isConnected) {
              const refreshed = await trySilentRefreshWithWait(settings.googleIdentity);
              if (!refreshed) {
                  handleGoogleDriveSignIn();
                  return;
              }
              activeSettings = {
                  ...settings,
                  googleIdentity: { ...settings.googleIdentity, accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt },
              };
          } else {
              handleGoogleDriveSignIn();
              return;
          }
      }

      try {
          const success = await fileSystemManager.initialize(activeSettings, {} as any);
          if (success) {
              const folderId = (fileSystemManager as any).rootFolderId;
              const finalSettings = {
                  ...activeSettings,
                  driveFolderId: folderId || '',
                  driveFolderName: (fileSystemManager as any).appDirectoryName || ''
              };
              updateSettings(finalSettings);
              onSetupComplete(finalSettings);
          } else {
              handleGoogleDriveSignIn();
          }
      } catch (e) {
          handleGoogleDriveSignIn();
      }
  };

  const currentProvider = settings.storageProvider || 'local';

  return (
    <div className="w-full h-full flex items-center justify-center p-4 bg-transparent relative overflow-hidden">
        {/* Technical Scanline Effect */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]"></div>
        
        <div className="w-full max-w-lg text-center bg-transparent p-10 rounded-none border border-primary/20 animate-fade-in relative overflow-hidden">
            {/* Technical Corner Accents */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-primary/40"></div>
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-primary/40"></div>
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-primary/40"></div>
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-primary/40"></div>
            
            <div className="relative z-10">
                <AppLogoIcon className="w-20 h-20 text-primary mx-auto mb-6 drop-shadow-[0_0_15px_rgba(var(--p),0.5)]" />
                <h1 className="text-4xl font-black tracking-tighter text-base-content mb-4 uppercase font-sf-mono">STORAGE_INIT<span className="text-primary italic">.</span></h1>
                
                <p className="text-[10px] font-black text-base-content/40 mb-8 uppercase tracking-[0.3em] leading-relaxed">
                  Establish local vault connection or cloud sync to synchronize neural templates and visual assets.
                </p>

                {/* Engine Selector */}
                <div className="flex justify-center space-x-2 mb-8">
                    <button
                        onClick={async () => {
                            audioService.playClick();
                            const updatedSettings = { ...settings, storageProvider: 'local' as const };
                            updateSettings(updatedSettings);
                            await fileSystemManager.initialize(updatedSettings, {} as any);
                            setError(null);
                        }}
                        className={`px-4 py-2 text-[10px] font-mono font-bold tracking-widest transition-all rounded-none border ${
                            currentProvider === 'local'
                                ? 'border-primary/40 bg-primary/10 text-primary'
                                : 'border-white/10 hover:border-white/20 text-base-content/40'
                        }`}
                    >
                        LOCAL_SANDBOX
                    </button>
                    <button
                        onClick={async () => {
                            audioService.playClick();
                            const updatedSettings = { ...settings, storageProvider: 'drive' as const };
                            updateSettings(updatedSettings);
                            await fileSystemManager.initialize(updatedSettings, {} as any);
                            setError(null);
                        }}
                        className={`px-4 py-2 text-[10px] font-mono font-bold tracking-widest transition-all rounded-none border ${
                            currentProvider === 'drive'
                                ? 'border-primary/40 bg-primary/10 text-primary'
                                : 'border-white/10 hover:border-white/20 text-base-content/40'
                        }`}
                    >
                        GOOGLE_DRIVE_CLOUD
                    </button>
                </div>

                <div className="space-y-4">
                    {currentProvider === 'drive' ? (
                        <div className="space-y-6">
                             {settings.googleIdentity?.isConnected ? (
                                <div className="space-y-4">
                                    <div className="p-4 bg-transparent border border-primary/10 rounded-none text-left relative overflow-hidden">
                                        <div className="absolute top-0 right-0 px-2 py-0.5 bg-primary/10 text-[8px] font-black tracking-widest text-primary uppercase font-mono">Authenticated</div>
                                        <span className="text-[9px] font-black uppercase tracking-widest text-base-content/30 block mb-1">Google Identity</span>
                                        <span className="text-xs font-mono font-bold truncate block text-primary/80">{settings.googleIdentity.email}</span>
                                    </div>
                                    <button
                                      onClick={handleActivateDriveDirectly}
                                      disabled={isLoading}
                                      className="form-btn form-btn-primary w-full h-14 uppercase"
                                    >
                                      {isLoading ? <span className="loading loading-spinner"></span> : <RefreshIcon className="w-5 h-5 mr-2" />}
                                      CONNECT_DRIVE_CLOUD
                                    </button>
                                </div>
                            ) : (
                                <button
                                  onClick={handleGoogleDriveSignIn}
                                  disabled={isLoading}
                                  className="form-btn form-btn-primary w-full h-14"
                                >
                                  {isLoading ? <span className="loading loading-spinner"></span> : <FolderClosedIcon className="w-5 h-5 mr-2" />}
                                  OAUTH_SECURE_LINK
                                </button>
                            )}

                            {/* ADVANCED CLOUD CONFIGURATION TROUBLESHOOTING */}
                            <div className="p-4 bg-accent/5 border border-accent/20 rounded-none text-left space-y-3 mt-4">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-accent">OAuth / Origin Troubleshooting</h4>
                                <p className="text-[10px] font-bold text-base-content/60 leading-normal uppercase">
                                    If you get <code className="text-accent bg-black/30 px-1 py-0.5 font-mono">400: origin_mismatch</code>, add this exact URL as your <strong>Authorized JavaScript origin</strong> in Google Cloud Console:
                                </p>
                                <div className="flex items-center gap-2">
                                    <code className="text-[9px] font-mono bg-black/40 px-2 py-1 select-all break-all text-accent w-full block">{window.location.origin}</code>
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard.writeText(window.location.origin);
                                            setError("ORIGIN COPIED TO CLIPBOARD");
                                            setTimeout(() => setError(null), 3000);
                                        }}
                                        className="px-2.5 py-1 text-[8px] font-mono border border-accent/30 text-accent hover:bg-accent/10 whitespace-nowrap active:scale-95"
                                    >
                                        COPY
                                    </button>
                                </div>
                                <p className="text-[8px] font-bold text-base-content/40 leading-normal uppercase">
                                    Then, generate your own custom OAuth Client ID in your Google Cloud Console, and input it below to link your custom project:
                                </p>
                                <div className="space-y-1.5">
                                    <label className="text-[8px] font-black uppercase tracking-wider text-base-content/50 block">Custom Client ID</label>
                                    <input 
                                        type="text" 
                                        value={settings.youtube?.customClientId || ''} 
                                        onChange={(e) => {
                                            const updated = {
                                                ...settings,
                                                youtube: {
                                                    ...(settings.youtube || { isConnected: false }),
                                                    customClientId: e.target.value
                                                }
                                            };
                                            updateSettings(updated as any);
                                        }} 
                                        placeholder="407408718192-example.apps.googleusercontent.com" 
                                        className="w-full text-[10px] font-mono bg-black/40 border border-primary/20 p-2 text-base-content placeholder-base-content/25 focus:outline-none focus:border-primary/50"
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {hasExistingHandle ? (
                                <div className="space-y-6">
                                    <div className="p-4 bg-transparent border border-primary/10 rounded-none text-left relative overflow-hidden">
                                        <div className="absolute top-0 right-0 px-2 py-0.5 bg-primary/10 text-[8px] font-black tracking-widest text-primary uppercase">Cached_Path</div>
                                        <span className="text-[9px] font-black uppercase tracking-widest text-base-content/30 block mb-1">Previous Folder</span>
                                        <span className="text-xs font-mono font-bold truncate block text-primary/80">{existingDirName || 'Unknown Folder'}</span>
                                    </div>
                                    <button
                                      onClick={handleReconnect}
                                      disabled={isLoading}
                                      className="form-btn form-btn-primary w-full h-14"
                                    >
                                      {isLoading ? <span className="loading loading-spinner"></span> : <RefreshIcon className="w-5 h-5 mr-2" />}
                                      RECONNECT_VAULT
                                    </button>
                                    <div className="divider text-[10px] font-black opacity-10 font-mono">OR</div>
                                    <button
                                      onClick={handleSelectDirectory}
                                      disabled={isLoading}
                                      className="form-btn w-full h-10 opacity-40 hover:opacity-100"
                                    >
                                      CHOOSE_NEW_DIRECTORY
                                    </button>
                                </div>
                            ) : (
                                <button
                                  onClick={handleSelectDirectory}
                                  disabled={isLoading}
                                  className="form-btn form-btn-primary w-full h-14"
                                >
                                  {isLoading ? <span className="loading loading-spinner"></span> : <FolderClosedIcon className="w-5 h-5 mr-2" />}
                                  SELECT_VAULT_FOLDER
                                </button>
                            )}
                        </div>
                    )}
                </div>
                
                {error && (
                    <div className="mt-8 p-4 bg-error/5 border border-error/20 rounded-none">
                        <p className="text-error font-black text-[10px] uppercase tracking-widest leading-relaxed font-mono">{error}</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default Welcome;