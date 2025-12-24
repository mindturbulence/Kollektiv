
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
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-base-100 rounded-lg shadow-2xl p-6 sm:p-8 w-full max-w-md mx-auto border border-base-300" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-4">
            <AppLogoIcon className="w-10 h-10 text-primary" />
            <div>
              <h3 className="text-2xl font-bold text-base-content">Kollektiv - Toolbox</h3>
              <p className="text-sm text-base-content/70">Version 1.0.0</p>
            </div>
          </div>
          <button onClick={onClose} className="text-base-content/70 hover:text-base-content" aria-label="Close modal">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>
        
        <div className="text-base-content/90 space-y-4 mt-6">
            <p>Kollektiv is your all-in-one creative suite for generative AI. It's designed to streamline your entire workflow by helping you craft, refine, and manage prompts, organize your generated art in a gallery, and providing a collection of essential tools to perfect your creations.</p>
            
            <div className="space-y-4 pt-4 border-t border-base-300">
                <div>
                    <p className="text-sm">
                        <span className="font-semibold text-base-content">Created by:</span> mndtrblnc.
                    </p>
                </div>
                <div>
                    <p className="text-sm font-semibold text-base-content mb-1">Visit My AI Models & Resources:</p>
                    <ul className="text-sm space-y-1">
                        <li><a href="https://civitai.com/user/mndtrblnc" target="_blank" rel="noopener noreferrer" className="link link-primary">Civitai Profile</a></li>
                        <li><a href="https://tensor.art/u/678345605994702141" target="_blank" rel="noopener noreferrer" className="link link-primary">Tensor.Art Profile</a></li>
                    </ul>
                </div>
                <div>
                    <p className="text-sm text-base-content">
                        If you find this tool helpful, please consider supporting my work. Your contribution helps in the continuous development of creative tools for the community.
                    </p>
                    <a href="https://ko-fi.com/mindturbulence" target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-secondary mt-4 w-full">
                        Support me on Ko-fi
                    </a>
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