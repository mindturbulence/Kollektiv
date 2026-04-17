import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

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
        className="fixed inset-0 bg-black/40 backdrop-blur-xl z-[2000] flex items-center justify-center p-4 animate-fade-in" 
        onClick={onClose}
        role="alertdialog"
        aria-modal="true"
    >
      <div 
        className="bg-base-100/40 backdrop-blur-xl rounded-none w-full max-w-md relative p-[3px] corner-frame overflow-visible shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-transparent">
          <div className={`h-1.5 w-full ${currentTheme.bgColor}`}></div>
          <div className="p-6">
              <h3 className={`text-3xl font-black tracking-tighter ${isError ? 'text-error' : 'text-success'} leading-none mb-4 uppercase`}>
                  {currentTheme.headerText}
              </h3>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-base-content/60 leading-relaxed uppercase tracking-tight">
                  {message}
              </p>
          </div>
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

export default FeedbackModal;