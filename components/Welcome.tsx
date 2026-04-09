import React, { useState, useEffect } from 'react';
import { fileSystemManager } from '../utils/fileUtils';
import { getHandle } from '../utils/db';
import { FolderClosedIcon, AppLogoIcon, RefreshIcon } from './icons';

interface WelcomeProps {
  onSetupComplete: () => void;
}

const Welcome: React.FC<WelcomeProps> = ({ onSetupComplete }) => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasExistingHandle, setHasExistingHandle] = useState(false);
  const [existingDirName, setExistingDirName] = useState<string | null>(null);

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
    setError(null);
    setIsLoading(true);
    try {
      const handle = await fileSystemManager.selectAndSetAppDataDirectory();
      if (handle) {
        onSetupComplete();
      } else {
        setIsLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred.');
      setIsLoading(false);
    }
  };

  const handleReconnect = async () => {
      setError(null);
      setIsLoading(true);
      try {
          const success = await fileSystemManager.requestExistingPermission();
          if (success) {
              onSetupComplete();
          } else {
              setError("Permission denied. Please click 'Reconnect' and grant access to your chosen folder.");
              setIsLoading(false);
          }
      } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to reconnect.');
          setIsLoading(false);
      }
  };

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
                <h1 className="text-4xl font-black tracking-tighter text-base-content mb-4 uppercase font-logo">STORAGE_INIT<span className="text-primary italic">.</span></h1>
                
                <p className="text-[10px] font-black text-base-content/40 mb-10 uppercase tracking-[0.3em] leading-relaxed">
                  Establish local vault connection to synchronize neural templates and visual assets.
                </p>

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
                              className="btn btn-primary w-full rounded-none font-black text-xs tracking-[0.3em] h-14"
                            >
                              {isLoading ? <span className="loading loading-spinner"></span> : <RefreshIcon className="w-5 h-5 mr-2" />}
                              RECONNECT_VAULT
                            </button>
                            <div className="divider text-[10px] font-black opacity-10">OR</div>
                            <button
                              onClick={handleSelectDirectory}
                              disabled={isLoading}
                              className="btn btn-ghost btn-sm w-full rounded-none font-black text-[9px] tracking-[0.4em] opacity-40 hover:opacity-100 uppercase"
                            >
                              CHOOSE_NEW_DIRECTORY
                            </button>
                        </div>
                    ) : (
                        <button
                          onClick={handleSelectDirectory}
                          disabled={isLoading}
                          className="btn btn-primary w-full rounded-none font-black text-xs tracking-[0.3em] h-14"
                        >
                          {isLoading ? <span className="loading loading-spinner"></span> : <FolderClosedIcon className="w-5 h-5 mr-2" />}
                          SELECT_VAULT_FOLDER
                        </button>
                    )}
                </div>
                
                {error && (
                    <div className="mt-8 p-4 bg-error/5 border border-error/20 rounded-none">
                        <p className="text-error font-black text-[10px] uppercase tracking-widest">{error}</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default Welcome;