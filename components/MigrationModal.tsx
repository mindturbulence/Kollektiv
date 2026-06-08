import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { audioService } from '../services/audioService';

interface MigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isWorking: boolean;
  progress: number;
  message: string;
}

const MigrationModal: React.FC<MigrationModalProps> = ({ isOpen, onClose, onConfirm, isWorking, progress, message }) => {
  useEffect(() => {
    if (isOpen) {
        audioService.playModalOpen();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isWorking) return; // Prevent closing while working
    audioService.playModalClose();
    onClose();
  };

  const handleConfirm = () => {
    audioService.playClick();
    onConfirm();
  };

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-xl z-[1000] flex items-center justify-center p-4 animate-fade-in"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="migration-title"
    >
      <div
        className="flex flex-col bg-transparent w-full max-w-lg mx-auto relative p-[3px] corner-frame overflow-visible"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-base-100/40 backdrop-blur-xl rounded-none w-full overflow-hidden relative z-10">
          <header className="px-8 py-4 bg-transparent relative flex-shrink-0">
              <h3 id="migration-title" className="text-xl font-black tracking-tighter text-primary leading-none uppercase">MIGRATION<span className="text-base-content/20">.</span></h3>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/40 mt-1.5">LOCAL TO GOOGLE DRIVE</p>
          </header>
          
          <div className="p-8 flex-grow">
              <p className="text-lg font-black text-base-content/70 leading-relaxed uppercase tracking-tight mb-6">
                Are you sure you want to copy all settings, gallery files, and prompts to your Google Drive? Depending on the size of your gallery, this may take a while.
              </p>

              {isWorking && (
                  <div className="w-full flex flex-col gap-2 mt-4 animate-fade-in">
                      <div className="flex justify-between items-center text-xs font-mono text-base-content/60 uppercase tracking-widest">
                          <span>{message}</span>
                          <span>{Math.round(progress)}%</span>
                      </div>
                      <div className="h-2 w-full bg-base-300 rounded overflow-hidden">
                          <div 
                              className="h-full bg-primary transition-all duration-300 ease-out" 
                              style={{ width: `${progress}%` }} 
                          />
                      </div>
                  </div>
              )}
          </div>

          <footer className="h-14 flex items-stretch bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 overflow-hidden flex-shrink-0 panel-footer">
            <button
              onClick={handleClose}
              disabled={isWorking}
              className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider uppercase btn-snake no-glow active:no-glow disabled:opacity-50"
              aria-label="Cancel migration"
            >
              <span/><span/><span/><span/>
              Abort
            </button>
            <button
              onClick={handleConfirm}
              disabled={isWorking}
              className="btn btn-sm btn-primary h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake-primary font-display no-glow active:no-glow disabled:opacity-50"
              aria-label="Start migration"
            >
              <span/><span/><span/><span/>
              Execute
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

  if (typeof (window as any).document !== 'undefined' && (window as any).document.body) {
    return createPortal(modalContent, (window as any).document.body);
  }

  return null;
};

export default MigrationModal;
