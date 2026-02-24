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
    <div className="w-full h-full flex items-center justify-center p-4 bg-base-200">
        <div className="w-full max-w-lg text-center bg-base-100 p-10 rounded-2xl shadow-2xl border border-base-300 animate-fade-in">
            <AppLogoIcon className="w-20 h-20 text-primary mx-auto mb-6" />
            <h1 className="text-4xl font-black tracking-tighter text-base-content mb-4">SETUP STORAGE<span className="text-primary">.</span></h1>
            
            <p className="text-base font-bold text-base-content/60 mb-10 uppercase tracking-tight leading-relaxed">
              Select a local folder on your computer to save your images, prompts, and templates.
            </p>

            <div className="space-y-4">
                {hasExistingHandle ? (
                    <div className="space-y-6">
                        <div className="p-4 bg-base-200/50 border border-base-300 rounded-lg text-left">
                            <span className="text-[10px] font-black uppercase tracking-widest text-primary/60 block mb-1">Previous Folder</span>
                            <span className="text-sm font-mono font-bold truncate block">{existingDirName || 'Unknown Folder'}</span>
                        </div>
                        <button
                          onClick={handleReconnect}
                          disabled={isLoading}
                          className="btn btn-primary w-full rounded-none font-black text-xs tracking-widest"
                        >
                          {isLoading ? <span className="loading loading-spinner"></span> : <RefreshIcon className="w-5 h-5 mr-2" />}
                          RECONNECT TO FOLDER
                        </button>
                        <div className="divider text-[10px] font-black opacity-30">OR</div>
                        <button
                          onClick={handleSelectDirectory}
                          disabled={isLoading}
                          className="btn btn-ghost btn-sm w-full rounded-none font-bold text-[10px] tracking-widest opacity-60 hover:opacity-100"
                        >
                          CHOOSE NEW FOLDER
                        </button>
                    </div>
                ) : (
                    <button
                      onClick={handleSelectDirectory}
                      disabled={isLoading}
                      className="btn btn-primary w-full rounded-none font-black text-xs tracking-widest"
                    >
                      {isLoading ? <span className="loading loading-spinner"></span> : <FolderClosedIcon className="w-5 h-5 mr-2" />}
                      SELECT STORAGE FOLDER
                    </button>
                )}
            </div>
            
            {error && (
                <div className="mt-8 p-4 bg-error/10 border border-error/20 rounded-lg">
                    <p className="text-error font-bold text-xs uppercase tracking-widest">{error}</p>
                </div>
            )}
        </div>
    </div>
  );
};

export default Welcome;