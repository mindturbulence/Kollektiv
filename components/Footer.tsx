
import React, { useMemo } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { fileSystemManager } from '../utils/fileUtils';
import { PlayIcon, TikTokIcon, CpuChipIcon, FolderClosedIcon } from './icons';

interface FooterProps {
  onAboutClick: () => void;
}

const StatusIndicator: React.FC<{ 
    label: string, 
    active: boolean, 
    icon?: React.ReactNode,
    color?: string 
}> = ({ label, active, icon, color = 'bg-success' }) => (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 border border-base-300 transition-all duration-500 ${active ? 'opacity-100' : 'opacity-20 grayscale'}`}>
        {icon && <div className="w-3 h-3 flex items-center justify-center">{icon}</div>}
        <span className="text-[9px] font-mono font-black text-base-content/50 tracking-widest uppercase">{label}</span>
        <span className={`w-1 h-1 rounded-full ${active ? color : 'bg-base-content/20'}`}></span>
    </div>
);

const Footer: React.FC<FooterProps> = ({ onAboutClick }) => {
  const { settings } = useSettings();

  const systemStatus = useMemo(() => {
    const isStorageLinked = fileSystemManager.isDirectorySelected();
    const isGeminiActive = settings.activeLLM === 'gemini' && !!process.env.API_KEY;
    const isOllamaActive = settings.activeLLM === 'ollama';
    const isOllamaCloudActive = settings.activeLLM === 'ollama_cloud' && !!settings.ollamaCloudBaseUrl;
    
    const aiLabel = settings.activeLLM === 'ollama_cloud' ? 'OLLAMA_CL' : settings.activeLLM.toUpperCase();

    return {
        storage: isStorageLinked,
        ai: aiLabel,
        aiActive: isGeminiActive || isOllamaActive || isOllamaCloudActive,
        youtube: !!settings.youtube?.isConnected,
        tiktok: !!settings.tiktok?.isConnected
    };
  }, [settings, fileSystemManager.appDirectoryName]);

  return (
    <footer className="flex-shrink-0 px-6 py-2 bg-base-100 border-t border-base-300 z-10 flex flex-wrap items-center justify-between gap-4 select-none">
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 border-r border-base-300 pr-4">
                <span className="text-[9px] font-mono font-black text-primary tracking-widest uppercase">
                    KOLLEKTIV V2.0
                </span>
            </div>
            
            <div className="flex gap-1">
                <StatusIndicator 
                    label="VAULT" 
                    active={systemStatus.storage} 
                    icon={<FolderClosedIcon className="w-3 h-3" />} 
                />
                <StatusIndicator 
                    label={systemStatus.ai} 
                    active={systemStatus.aiActive} 
                    icon={<CpuChipIcon className="w-3 h-3" />} 
                />
                <StatusIndicator 
                    label="YT" 
                    active={systemStatus.youtube} 
                    icon={<PlayIcon className="w-3 h-3 fill-current" />} 
                />
                <StatusIndicator 
                    label="TT" 
                    active={systemStatus.tiktok} 
                    icon={<TikTokIcon className="w-3 h-3" />} 
                />
            </div>
        </div>

        <div className="flex items-center gap-6">
            <div className="hidden lg:flex items-center gap-4">
                <span className="text-[8px] font-mono font-black text-base-content/20 tracking-widest uppercase">
                    ENCRYPTION: LOCAL_AES
                </span>
                <span className="text-[8px] font-mono font-black text-base-content/20 tracking-widest uppercase">
                    MODE: DECENTRALIZED
                </span>
            </div>
        </div>
    </footer>
  );
};

export default Footer;
