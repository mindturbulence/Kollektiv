import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, YouTubeIcon, TikTokIcon } from './icons';
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
  const [platform, setPlatform] = useState<'youtube' | 'tiktok'>('youtube');
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [privacy, setPrivacy] = useState<YouTubeMetadata['privacyStatus']>('private');
  const [publishAsShorts, setPublishAsShorts] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPlatform('youtube');
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
    if (platform === 'youtube') {
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
    } else {
        setError("INTEGRATION_LOCKED: TikTok publishing protocol is currently in evaluation.");
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-base-100 rounded-none border border-base-300 shadow-2xl w-full max-w-2xl mx-auto flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <header className="p-8 border-b border-base-300 bg-base-200/20 relative">
            <button onClick={onClose} className="absolute top-6 right-6 btn btn-ghost btn-sm btn-square opacity-40 hover:opacity-100">
                <CloseIcon className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-4 mb-2">
                {platform === 'youtube' ? <YouTubeIcon className="w-8 h-8 text-error" /> : <TikTokIcon className="w-8 h-8 text-primary" />}
                <h3 className="text-3xl font-black tracking-tighter text-base-content leading-none">
                    PUBLISH<span className="text-primary">.</span>
                </h3>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30">External Repository Uplink</p>
        </header>

        <div className="p-8 space-y-8 flex-grow overflow-y-auto custom-scrollbar">
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
              <div className="form-control">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-3">Destination Platform</label>
                <div className="join w-full h-10 bg-base-100 border border-base-300 rounded-none overflow-hidden">
                    <button onClick={() => setPlatform('youtube')} className={`join-item btn btn-ghost h-full flex-1 border-none rounded-none font-black text-[9px] tracking-widest uppercase transition-all ${platform === 'youtube' ? 'bg-primary/10 text-primary' : 'opacity-40 hover:bg-base-200'}`}>YOUTUBE</button>
                    <button onClick={() => setPlatform('tiktok')} className={`join-item btn btn-ghost h-full flex-1 border-l border-base-300 rounded-none font-black text-[9px] tracking-widest uppercase transition-all ${platform === 'tiktok' ? 'bg-primary/10 text-primary' : 'opacity-40 hover:bg-base-200'}`}>TIKTOK</button>
                </div>
              </div>
              <div className="form-control"><label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-3">Transmission ID</label><input type="text" value={title} onChange={e => setTitle(e.target.value)} className="input input-bordered rounded-none font-bold tracking-tight h-10 w-full uppercase" placeholder="ENTER TITLE..." /></div>
              <div className="form-control"><label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-3">Metadata Packet</label><textarea value={description} onChange={e => setDescription(e.target.value)} className="textarea textarea-bordered rounded-none min-h-[120px] font-medium leading-relaxed bg-base-200/20" placeholder="ENTER DESCRIPTION..." /></div>
              {platform === 'youtube' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-3">Signal Visibility</label>
                        <div className="join w-full h-10 bg-base-100 border border-base-300 rounded-none overflow-hidden">
                            <button onClick={() => setPrivacy('public')} className={`join-item btn btn-ghost btn-xs h-full flex-1 border-none rounded-none font-black text-[9px] tracking-widest uppercase transition-all ${privacy === 'public' ? 'bg-primary/10 text-primary' : 'opacity-40 hover:bg-base-200'}`}>PUBLIC</button>
                            <button onClick={() => setPrivacy('unlisted')} className={`join-item btn btn-ghost btn-xs h-full flex-1 border-x border-base-300 rounded-none font-black text-[9px] tracking-widest uppercase transition-all ${privacy === 'unlisted' ? 'bg-primary/10 text-primary' : 'opacity-40 hover:bg-base-200'}`}>UNLISTED</button>
                            <button onClick={() => setPrivacy('private')} className={`join-item btn btn-ghost btn-xs h-full flex-1 border-none rounded-none font-black text-[9px] tracking-widest uppercase transition-all ${privacy === 'private' ? 'bg-primary/10 text-primary' : 'opacity-40 hover:bg-base-200'}`}>PRIVATE</button>
                        </div>
                    </div>
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-3">Protocol Format</label>
                        <div className="join w-full h-10 bg-base-100 border border-base-300 rounded-none overflow-hidden">
                            <button onClick={() => setPublishAsShorts(false)} className={`join-item btn btn-ghost btn-xs h-full flex-1 border-none rounded-none font-black text-[9px] tracking-widest uppercase transition-all ${!publishAsShorts ? 'bg-primary/10 text-primary' : 'opacity-40 hover:bg-base-200'}`}>STANDARD</button>
                            <button onClick={() => setPublishAsShorts(true)} className={`join-item btn btn-ghost btn-xs h-full flex-1 border-l border-base-300 rounded-none font-black text-[9px] tracking-widest uppercase transition-all ${publishAsShorts ? 'bg-primary/10 text-primary' : 'opacity-40 hover:bg-base-200'}`}>SHORTS</button>
                        </div>
                    </div>
                </div>
              )}
              {platform === 'youtube' && publishAsShorts && (<div className="p-4 bg-primary/5 border border-primary/20 flex items-center gap-4 animate-fade-in"><span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span><p className="text-[9px] font-bold text-primary uppercase tracking-widest">Protocol: System will append <span className="font-mono text-white">#Shorts</span> for algorithmic indexing.</p></div>)}
              {error && (<div className="p-4 bg-error/10 border border-error/20 text-error text-[10px] font-black uppercase tracking-widest text-center animate-shake">{error}</div>)}
            </>
          )}
        </div>

        <footer className="border-t border-base-300 flex bg-base-200/5 p-0 overflow-hidden flex-shrink-0">
            <button onClick={onClose} className="btn flex-1 h-16 rounded-none uppercase font-black text-[10px] tracking-widest border-r border-base-300 transition-colors" disabled={isUploading}>Abort Uplink</button>
            <button onClick={handlePublish} className="btn btn-primary flex-1 h-16 rounded-none uppercase font-black text-[10px] tracking-widest shadow-lg transition-colors" disabled={isUploading || !title.trim()}>{isUploading ? 'SYNCING...' : 'INITIATE UPLINK'}</button>
        </footer>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default YouTubePublishModal;