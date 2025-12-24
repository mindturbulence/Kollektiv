
import React, { useState } from 'react';
import { fileSystemManager } from '../utils/fileUtils';
import { FolderClosedIcon, AppLogoIcon } from './icons';

interface WelcomeProps {
  onSetupComplete: () => void;
}

const Welcome: React.FC<WelcomeProps> = ({ onSetupComplete }) => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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

  return (
    <div className="w-full h-full flex items-center justify-center p-4 bg-base-200">
        <div className="w-full max-w-lg text-center bg-base-100 p-8 rounded-2xl shadow-2xl border border-base-300">
            <AppLogoIcon className="w-16 h-16 text-primary mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-base-content mb-2">Welcome to Kollektiv Toolbox</h1>
            <p className="text-base-content/70 mb-8">
              Let's set up your creative workspace. Please select a local folder where Kollektiv will save all your prompts, gallery items, and project data.
            </p>
            <div className="space-y-4">
                <button
                  onClick={handleSelectDirectory}
                  disabled={isLoading}
                  className="btn btn-sm btn-primary w-full"
                >
                  {isLoading ? <span className="loading loading-spinner"></span> : <FolderClosedIcon className="w-5 h-5 mr-2" />}
                  Select Data Folder
                </button>
            </div>
            {error && <p className="text-error mt-4 text-sm">{error}</p>}
        </div>
    </div>
  );
};

export default Welcome;
