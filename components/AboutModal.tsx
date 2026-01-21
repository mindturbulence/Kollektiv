import React from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, AppLogoIcon } from './icons';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-base-100 rounded-none shadow-2xl w-full max-w-2xl mx-auto border border-base-300 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="p-10 border-b border-base-300 bg-base-200/10 relative">
          <button onClick={onClose} className="absolute top-6 right-6 btn btn-ghost btn-sm btn-square opacity-40 hover:opacity-100" aria-label="Close modal">
            <CloseIcon className="w-6 h-6" />
          </button>
          <div className="flex items-end gap-6 mb-8">
            <AppLogoIcon className="w-16 h-16 text-primary" />
            <h3 className="text-3xl lg:text-4xl font-black tracking-tighter text-base-content leading-none">
              ABOUT<span className="text-primary">.</span>
            </h3>
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30">Version 2.0.0</span>
        </header>
        
        <div className="p-10 space-y-8">
            <p className="text-lg font-bold text-base-content/70 leading-tight">
              Kollektiv is a high-performance utility for prompt engineering, image management, and creative workflows.
            </p>
            
            <div className="grid grid-cols-2 gap-px bg-base-300 border border-base-300">
                <div className="p-6 bg-base-100 flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">Developer</span>
                    <span className="text-xl font-bold tracking-tight">mndtrblnc</span>
                </div>
                <div className="p-6 bg-base-100 flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">Data Storage</span>
                    <span className="text-xl font-bold tracking-tight">Local Folders Only</span>
                </div>
            </div>

            <div className="space-y-4">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/30">Links</span>
                <div className="flex flex-wrap gap-4">
                    <a href="https://civitai.com/user/mndtrblnc" target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm rounded-none border-base-300 uppercase font-black text-[10px] tracking-widest">Civitai</a>
                    <a href="https://tensor.art/u/678345605994702141" target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm rounded-none border-base-300 uppercase font-black text-[10px] tracking-widest">Tensor.Art</a>
                    <a href="https://ko-fi.com/mindturbulence" target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm rounded-none uppercase font-black text-[10px] tracking-widest">Support on Ko-fi</a>
                </div>
            </div>
        </div>
      </div>
    </div>
  );

  if (typeof (window as any).document !== 'undefined' && (window as any).document.body) {
    return createPortal(modalContent, (window as any).document.body);
  }
  return null;
};

export default AboutModal;