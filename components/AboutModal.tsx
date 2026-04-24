import React from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, AppLogoIcon } from './icons';
import { motion, AnimatePresence } from 'framer-motion';
import { audioService } from '../services/audioService';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ backdropFilter: 'blur(0px)', opacity: 0 }}
            animate={{ backdropFilter: 'blur(20px)', opacity: 1 }}
            exit={{ backdropFilter: 'blur(0px)', opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            className="fixed inset-0 bg-black/20 z-[1000] flex items-center justify-center p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              className="flex flex-col bg-transparent w-full max-w-2xl mx-auto relative p-[3px] corner-frame overflow-visible"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-base-100/40 backdrop-blur-xl rounded-none w-full overflow-hidden relative z-10">
                <header className="px-8 py-4 panel-header bg-transparent relative flex-shrink-0 flex items-center justify-between">
                  <div className="flex flex-col">
                      <div className="flex items-center gap-3">
                          <AppLogoIcon className="w-8 h-8 text-primary" />
                          <h3 className="text-xl font-black tracking-tighter text-base-content leading-none">
                            ABOUT<span className="text-primary">.</span>
                          </h3>
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 mt-1.5">Version 2.5.0</p>
                  </div>
                  <button onClick={onClose} className="p-2 text-error/30 hover:text-error transition-all hover:scale-110" aria-label="Close modal">
                    <CloseIcon className="w-5 h-5" />
                  </button>
                </header>
                
                <div className="p-10 space-y-8">
                    <p className="text-lg font-bold text-base-content/70 leading-tight">
                      Kollektiv is a high-performance utility for prompt engineering, image management, and creative workflows.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-px bg-transparent border-base-300">
                        <div className="p-6 bg-transparent flex flex-col gap-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">Developer</span>
                            <span className="text-xl font-bold tracking-tight">mndtrblnc</span>
                        </div>
                        <div className="p-6 bg-transparent flex flex-col gap-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">Data Storage</span>
                            <span className="text-xl font-bold tracking-tight">Local Folders Only</span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/30">Links</span>
                        <div className="flex flex-wrap gap-4">
                            <a href="https://civitai.com/user/mndtrblnc" target="_blank" rel="noopener noreferrer" onMouseEnter={() => audioService.playHover()} className="form-btn h-8 px-4">Civitai</a>
                            <a href="https://tensor.art/u/678345605994702141" target="_blank" rel="noopener noreferrer" onMouseEnter={() => audioService.playHover()} className="form-btn h-8 px-4">Tensor.Art</a>
                            <a href="https://ko-fi.com/mindturbulence" target="_blank" rel="noopener noreferrer" onMouseEnter={() => audioService.playHover()} className="form-btn form-btn-primary h-8 px-4">Support on Ko-fi</a>
                        </div>
                    </div>
                </div>
              </div>
              {/* Manual Corner Accents */}
              <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
              <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
              <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
              <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (typeof (window as any).document !== 'undefined' && (window as any).document.body) {
    return createPortal(modalContent, (window as any).document.body);
  }
  return null;
};

export default AboutModal;