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
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-title"
    >
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirmation-title" className="text-xl font-bold text-error">{title}</h3>
        <p className="py-4 text-base-content/80">{message}</p>
        <div className="modal-action">
          <button
            onClick={onClose}
            className="btn btn-neutral btn-sm"
            aria-label="Cancel action"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`btn btn-sm ${btnClassName}`}
            aria-label="Confirm action"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof (window as any).document !== 'undefined' && (window as any).document.body) {
    return createPortal(modalContent, (window as any).document.body);
  }

  return null;
};

export default ConfirmationModal;