import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { audioService } from '../services/audioService';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  btnClassName?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, onClose, onConfirm, title, message, btnClassName = 'btn-error' }) => {
  useEffect(() => {
    if (isOpen) {
        audioService.playModalOpen();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
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
      aria-labelledby="confirmation-title"
    >
      <div
        className="flex flex-col bg-transparent w-full max-w-lg mx-auto relative p-[3px] corner-frame overflow-visible"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-base-100/40 backdrop-blur-xl rounded-none w-full overflow-hidden relative z-10">
          <header className="px-8 py-4 bg-transparent relative flex-shrink-0">
              <h3 id="confirmation-title" className="text-xl font-black tracking-tighter text-error leading-none uppercase">CONFIRM<span className="text-base-content/20">.</span></h3>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/40 mt-1.5">{title}</p>
          </header>
          
          <div className="p-8 flex-grow">
              <p className="text-lg font-black text-base-content/70 leading-relaxed uppercase tracking-tight">{message}</p>
          </div>

          <footer className="h-14 flex items-stretch bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 overflow-hidden flex-shrink-0 border-t border-base-content/5">
            <button
              onClick={handleClose}
              className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake font-display"
              aria-label="Cancel action"
            >
              <span/><span/><span/><span/>
              Abort
            </button>
            <button
              onClick={handleConfirm}
              className={`btn btn-sm ${btnClassName === 'btn-error' ? 'btn-error' : 'btn-primary'} h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase ${btnClassName === 'btn-error' ? 'btn-snake-error' : 'btn-snake-primary'} font-display`}
              aria-label="Confirm action"
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

export default ConfirmationModal;