import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, YouTubeIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';
import { publishToYouTube, type YouTubeMetadata } from '../services/youtubeService';
import { useSettings } from '../contexts/SettingsContext';

interface YouTubePublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoBlob: Blob;
  initialTitle: string;
  initialDescription: string;
  onSuccess: (videoUrl: string) => void;
}

const YouTubePublishModal: React.FC<YouTubePublishModalProps> = ({
  isOpen, onClose, videoBlob, initialTitle, initialDescription, onSuccess
}) => {
  const { settings } = useSettings();
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [privacy, setPrivacy] = useState<YouTubeMetadata['privacyStatus']>('private');
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(initialTitle);
      setDescription(initialDescription);
      setPrivacy('private');
      setError(null);
      setProgress(0);
      setIsUploading(false);
    }
  }, [isOpen, initialTitle, initialDescription]);

  const handlePublish = async () => {
    if (!settings.youtube?.accessToken) {
      setError("No valid YouTube access token found. Please re-authenticate in Settings.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const result = await publishToYouTube(
        videoBlob,
        { title, description, privacyStatus: privacy },
        settings.youtube.accessToken,
        (p) => setProgress(p)
      );
      onSuccess(result.url);
      onClose();
    } catch (err: any) {
      setError(err.message || "Archive transmission failure.");
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-base-100 rounded-none border border-base-300 shadow-2xl w-full max-w-2xl mx-auto flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <header className="p-8 border-b border-base-300 bg-base-200/20 relative">
            <button onClick={onClose} className="absolute top-6 right-6 btn btn-ghost btn-sm btn-square opacity-40 hover:opacity-100">
                <CloseIcon className="w-6 h-6" />
            </button>
            <h3 className="text-3xl font-black tracking-tighter text-base-content leading-none">
                PUBLISH<span className="text-primary">.</span>
            </h3>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 mt-2">YouTube Archival Transmission</p>
        </header>

        <div className="p-8 space-y-6 flex-grow overflow-y-auto custom-scrollbar">
          {isUploading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-8 animate-fade-in">
              <LoadingSpinner size={64} />
              <div className="w-full max-w-sm space-y-2">
                 <div className="flex justify-between items-end">
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary">Transmitting Bytes</span>
                    <span className="text-sm font-mono font-bold">{Math.round(progress)}%</span>
                 </div>
                 <progress className="progress progress-primary w-full h-1" value={progress} max="100"></progress>
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/40 animate-pulse">Establishing uplink to YouTube servers</p>
            </div>
          ) : (
            <>
              <div className="form-control">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Transmission Title</label>
                <input 
                    type="text" 
                    value={title} 
                    onChange={e => setTitle(e.target.value)} 
                    className="input input-bordered rounded-none font-bold tracking-tight h-10 w-full" 
                    placeholder="Enter video title..." 
                />
              </div>

              <div className="form-control">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Description Metadata</label>
                <textarea 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    className="textarea textarea-bordered rounded-none min-h-[120px] font-medium leading-relaxed" 
                    placeholder="Enter video description..." 
                />
              </div>

              <div className="form-control">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Access Status</label>
                <div className="join w-full">
                  <button onClick={() => setPrivacy('public')} className={`join-item btn btn-xs flex-1 rounded-none font-black text-[9px] tracking-widest ${privacy === 'public' ? 'btn-active' : ''}`}>PUBLIC</button>
                  <button onClick={() => setPrivacy('unlisted')} className={`join-item btn btn-xs flex-1 rounded-none font-black text-[9px] tracking-widest ${privacy === 'unlisted' ? 'btn-active' : ''}`}>UNLISTED</button>
                  <button onClick={() => setPrivacy('private')} className={`join-item btn btn-xs flex-1 rounded-none font-black text-[9px] tracking-widest ${privacy === 'private' ? 'btn-active' : ''}`}>PRIVATE</button>
                </div>
              </div>
              
              {error && (
                <div className="p-4 bg-error/10 border border-error/20 text-error text-[10px] font-black uppercase tracking-widest text-center">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        <footer className="border-t border-base-300 flex bg-base-200/5 p-0 overflow-hidden flex-shrink-0">
            <button onClick={onClose} className="btn flex-1 h-14 rounded-none uppercase font-black text-[10px] tracking-widest border-r border-base-300 transition-colors" disabled={isUploading}>Abort</button>
            <button 
                onClick={handlePublish} 
                className="btn btn-primary flex-1 h-14 rounded-none uppercase font-black text-[10px] tracking-widest shadow-lg transition-colors"
                disabled={isUploading || !title.trim()}
            >
                {isUploading ? 'TRANSMITTING...' : 'START UPLINK'}
            </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default YouTubePublishModal;