import React from 'react';
import { createPortal } from 'react-dom';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  btnClassName?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, onClose, onConfirm, title, message, btnClassName = 'btn-error' }) => {
  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/90 z-[1000] flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-title"
    >
      <div
        className="bg-base-100 rounded-none border border-base-300 shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-8 border-b border-base-300 bg-base-200/20">
            <h3 id="confirmation-title" className="text-2xl font-black tracking-tighter text-error leading-none">CONFIRM<span className="text-base-content/20">.</span></h3>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/40 mt-2">{title}</p>
        </header>
        
        <div className="p-8">
            <p className="text-base font-bold text-base-content/70 leading-relaxed uppercase tracking-tight">{message}</p>
        </div>

        <footer className="border-t border-base-300 flex bg-base-200/5 p-0 overflow-hidden">
          <button
            onClick={onClose}
            className="btn flex-1 rounded-none uppercase font-black text-[10px] tracking-widest border-r border-base-300 transition-colors"
            aria-label="Cancel action"
          >
            Abort
          </button>
          <button
            onClick={onConfirm}
            className={`btn ${btnClassName} flex-1 rounded-none uppercase font-black text-[10px] tracking-widest text-white transition-colors shadow-lg`}
            aria-label="Confirm action"
          >
            Execute
          </button>
        </footer>
      </div>
    </div>
  );

  if (typeof (window as any).document !== 'undefined' && (window as any).document.body) {
    return createPortal(modalContent, (window as any).document.body);
  }

  return null;
};

export default ConfirmationModal;