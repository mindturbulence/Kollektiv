import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, InformationCircleIcon } from './icons';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
  type: 'success' | 'error';
  duration?: number;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, message, type, duration }) => {
  const effectiveDuration = duration || (type === 'error' ? 5000 : 3000);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, effectiveDuration);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose, effectiveDuration]);

  if (!isOpen) return null;

  const isError = type === 'error';
  
  const theme = {
      success: {
          bgColor: 'bg-success',
          borderColor: 'border-success',
          iconColor: 'text-success-content',
          headerText: 'SUCCESS.'
      },
      error: {
          bgColor: 'bg-error',
          borderColor: 'border-error',
          iconColor: 'text-error-content',
          headerText: 'ERROR.'
      }
  };
  
  const currentTheme = theme[type];
  
  const modalContent = (
    <div 
        className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4 animate-fade-in" 
        onClick={onClose}
        role="alertdialog"
        aria-modal="true"
    >
      <div 
        className="bg-base-100 rounded-none border border-base-300 shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`h-1.5 w-full ${currentTheme.bgColor}`}></div>
        <div className="p-8">
            <h3 className={`text-4xl font-black tracking-tighter ${isError ? 'text-error' : 'text-success'} leading-none mb-4`}>
                {currentTheme.headerText}
            </h3>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-base-content/60 leading-relaxed">
                {message}
            </p>
        </div>
      </div>
    </div>
  );

  if (typeof (window as any).document !== 'undefined' && (window as any).document.body) {
    return createPortal(modalContent, (window as any).document.body);
  }

  return null;
};

export default FeedbackModal;