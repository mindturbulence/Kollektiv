import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { audioService } from '../services/audioService';
import { motion, AnimatePresence } from 'motion/react';
import { CheckIcon, AlertTriangleIcon, CloseIcon } from './icons';

interface FeedbackToastProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
  type: 'success' | 'error';
  duration?: number;
}

const FeedbackToast: React.FC<FeedbackToastProps> = ({ isOpen, onClose, message, type, duration }) => {
  const effectiveDuration = duration || (type === 'error' ? 5000 : 3000);

  useEffect(() => {
    if (isOpen) {
      if (type === 'success') audioService.playSuccess();
      else audioService.playError();
      
      const timer = setTimeout(() => {
        onClose();
      }, effectiveDuration);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose, effectiveDuration, type]);

  const theme = {
      success: {
          bgColor: 'bg-success/10',
          borderColor: 'border-success/30',
          accentColor: 'bg-success',
          textColor: 'text-success',
          icon: <CheckIcon className="w-4 h-4 text-success" />,
          label: 'SUCCESS'
      },
      error: {
          bgColor: 'bg-error/10',
          borderColor: 'border-error/30',
          accentColor: 'bg-error',
          textColor: 'text-error',
          icon: <AlertTriangleIcon className="w-4 h-4 text-error" />,
          label: 'FAILURE'
      }
  };
  
  const currentTheme = theme[type];
  
  const toastContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
          className="fixed bottom-8 right-8 z-[3000] flex items-center gap-4 pointer-events-auto"
        >
          <div className="relative p-[1px] corner-frame overflow-visible shadow-2xl min-w-[320px] max-w-md">
            <div className={`flex items-stretch h-full w-full overflow-hidden relative z-10 ${currentTheme.bgColor} backdrop-blur-xl border ${currentTheme.borderColor}`}>
              {/* Left Accent Bar */}
              <div className={`w-1.5 h-auto ${currentTheme.accentColor} shrink-0`}></div>
              
              <div className="flex-1 p-4 pr-10">
                <div className="flex items-center gap-2 mb-1">
                  {currentTheme.icon}
                  <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${currentTheme.textColor}`}>
                    {currentTheme.label}.SYS
                  </span>
                </div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-base-content/80 leading-relaxed">
                  {message}
                </p>
              </div>

              {/* Close Button */}
              <button 
                onClick={onClose}
                className="absolute top-2 right-2 p-1 hover:bg-base-content/10 transition-colors rounded-none"
              >
                <CloseIcon className="w-3.5 h-3.5 text-base-content/40" />
              </button>

              {/* Progress bar at bottom */}
              <motion.div 
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: effectiveDuration / 1000, ease: 'linear' }}
                className={`absolute bottom-0 left-[1.5px] right-0 h-[1px] ${currentTheme.accentColor} opacity-50`}
              />
            </div>

            {/* Manual Corner Accents */}
            <div className="absolute -top-[1px] -left-[1px] w-2 h-2 border-t border-l border-primary/20 z-20 pointer-events-none" />
            <div className="absolute -top-[1px] -right-[1px] w-2 h-2 border-t border-r border-primary/20 z-20 pointer-events-none" />
            <div className="absolute -bottom-[1px] -left-[1px] w-2 h-2 border-b border-l border-primary/20 z-20 pointer-events-none" />
            <div className="absolute -bottom-[1px] -right-[1px] w-2 h-2 border-b border-r border-primary/20 z-20 pointer-events-none" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof (window as any).document !== 'undefined' && (window as any).document.body) {
    return createPortal(toastContent, (window as any).document.body);
  }

  return null;
};

export default FeedbackToast;
