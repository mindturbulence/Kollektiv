
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
          iconBg: 'bg-success-content/20',
          IconComponent: CheckIcon,
          textColor: 'text-success-content'
      },
      error: {
          bgColor: 'bg-error',
          borderColor: 'border-error',
          iconColor: 'text-error-content',
          iconBg: 'bg-error-content/20',
          IconComponent: InformationCircleIcon,
          textColor: 'text-error-content'
      }
  };
  
  const currentTheme = theme[type];
  const { IconComponent } = currentTheme;
  
  const modalContent = (
    <div 
        className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-fade-in" 
        onClick={onClose}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="feedback-message"
    >
      <div 
        className={`relative p-8 rounded-xl shadow-2xl w-full max-w-md mx-auto border ${currentTheme.borderColor} ${currentTheme.bgColor}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center">
            <div className={`mx-auto flex items-center justify-center h-12 w-12 rounded-full ${currentTheme.iconBg}`}>
               <IconComponent className={`h-8 w-8 ${currentTheme.iconColor}`} />
            </div>
            <p id="feedback-message" className={`text-lg font-medium ${currentTheme.textColor} mt-4`}>{message}</p>
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
