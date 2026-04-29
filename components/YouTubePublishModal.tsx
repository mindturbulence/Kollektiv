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
  const [publishAsShorts, setPublishAsShorts] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(initialTitle);
      setDescription(initialDescription);
      setPrivacy('private');
      setPublishAsShorts(false);
      setError(null);
      setProgress(0);
      setIsUploading(false);
    }
  }, [isOpen, initialTitle, initialDescription]);

  const handlePublish = async () => {
    if (!settings.youtube?.accessToken) {
        setError("AUTHENTICATION_NULL: Please re-link channel in Settings.");
        return;
    }
    setIsUploading(true);
    setError(null);
    let finalDescription = description.trim();
    if (publishAsShorts && !finalDescription.toLowerCase().includes('#shorts')) {
        finalDescription = `${finalDescription}\n\n#Shorts`;
    }
    try {
        const result = await publishToYouTube(
            videoBlob,
            { title, description: finalDescription, privacyStatus: privacy },
            settings.youtube.accessToken,
            (p) => setProgress(p)
        );
        onSuccess(result.url);
        onClose();
    } catch (err: any) {
        setError(`TRANSMISSION_ERROR: ${err.message || "Unknown Failure"}`);
        setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl z-[1000] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-2xl mx-auto flex flex-col max-h-[90vh] relative p-[3px] corner-frame overflow-visible shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="bg-base-100/40 backdrop-blur-xl rounded-none w-full flex flex-col overflow-hidden relative z-10">
          <header className="px-8 py-4 panel-header bg-transparent relative flex-shrink-0 flex items-center justify-between">
              <div className="flex flex-col">
                  <div className="flex items-center gap-3">
                      <YouTubeIcon className="w-6 h-6 text-error" />
                      <h3 className="text-xl font-black tracking-tighter text-base-content leading-none">
                          PUBLISH<span className="text-primary">.</span>
                      </h3>
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 mt-1.5">External Repository Uplink</p>
              </div>
              <button onClick={onClose} className="p-2 text-error/30 hover:text-error transition-all hover:scale-110">
                  <CloseIcon className="w-5 h-5" />
              </button>
          </header>

        <div className="p-8 space-y-8 flex-grow overflow-y-auto">
          {isUploading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-8 animate-fade-in">
              <LoadingSpinner size={64} />
              <div className="w-full max-w-sm space-y-3">
                 <div className="flex justify-between items-end"><span className="text-[10px] font-black uppercase tracking-widest text-primary">Transmitting Payload</span><span className="text-sm font-mono font-bold">{Math.round(progress)}%</span></div>
                 <progress className="progress progress-primary w-full h-1" value={progress} max="100"></progress>
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/40 animate-pulse">DO NOT INTERRUPT SIGNAL</p>
            </div>
          ) : (
            <>
              <div className="form-control"><label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-3">Transmission ID</label><input type="text" value={title} onChange={e => setTitle(e.target.value)} className="form-input w-full uppercase" placeholder="ENTER TITLE..." /></div>
              <div className="form-control"><label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-3">Metadata Packet</label><textarea value={description} onChange={e => setDescription(e.target.value)} className="form-textarea w-full min-h-[120px]" placeholder="ENTER DESCRIPTION..." /></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                  <div className="form-control">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-3">Signal Visibility</label>
                      <div className="form-tab-group">
                          <button onClick={() => setPrivacy('public')} className={`form-tab-item ${privacy === 'public' ? 'active' : ''}`}>PUBLIC</button>
                          <button onClick={() => setPrivacy('unlisted')} className={`form-tab-item border-x border-base-300 ${privacy === 'unlisted' ? 'active' : ''}`}>UNLISTED</button>
                          <button onClick={() => setPrivacy('private')} className={`form-tab-item ${privacy === 'private' ? 'active' : ''}`}>PRIVATE</button>
                      </div>
                  </div>
                  <div className="form-control">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-3">Protocol Format</label>
                      <div className="form-tab-group">
                          <button onClick={() => setPublishAsShorts(false)} className={`form-tab-item ${!publishAsShorts ? 'active' : ''}`}>STANDARD</button>
                          <button onClick={() => setPublishAsShorts(true)} className={`form-tab-item border-l border-base-300 ${publishAsShorts ? 'active' : ''}`}>REEL</button>
                      </div>
                  </div>
              </div>
              {publishAsShorts && (<div className="p-4 bg-primary/5 border border-primary/20 flex items-center gap-4 animate-fade-in"><span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span><p className="text-[9px] font-bold text-primary uppercase tracking-widest">Protocol: System will append <span className="font-mono text-white">#Shorts</span> for algorithmic indexing.</p></div>)}
              {error && (<div className="p-4 bg-error/10 border border-error/20 text-error text-[10px] font-black uppercase tracking-widest text-center animate-shake">{error}</div>)}
            </>
          )}
        </div>

        <footer className="h-14 flex items-stretch bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 overflow-hidden flex-shrink-0 panel-footer">
            <button onClick={onClose} className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider uppercase btn-snake" disabled={isUploading}>
                <span/><span/><span/><span/>
                ABORT
            </button>
            <button onClick={handlePublish} className="btn btn-sm btn-primary h-full flex-1 rounded-none tracking-wider uppercase btn-snake-primary" disabled={isUploading || !title.trim()}>
                <span/><span/><span/><span/>
                {isUploading ? 'SYNCING...' : 'INITIATE UPLINK'}
            </button>
        </footer>
        </div>
        {/* Manual Corner Accents */}
        <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
        <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
        <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
        <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default YouTubePublishModal;