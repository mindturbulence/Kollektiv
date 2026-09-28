import React, { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { CloseIcon } from './icons';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Extra classes for the panel. */
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_CLASS = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl' } as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Shared dialog shell: portal, backdrop, labelled header, Escape, focus trap
 *  and restore, fade/scale exit. Keyboard handling lives on the dialog itself
 *  (not document) so a modal stacked on another only traps its own focus. */
const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, className = '', size = 'md' }) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    e.stopPropagation();
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  const content = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-xl z-modal flex items-center justify-center p-4"
          // Target check so a drag that starts inside the panel doesn't close it.
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
          onKeyDown={handleKeyDown}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={`bg-base-100/95 backdrop-blur-xl w-full ${SIZE_CLASS[size]} rounded-none border border-base-content/10 overflow-hidden outline-none ${className}`}
          >
            <header className="panel-header h-9 px-4">
              <h3 id={titleId} className="self-center text-xs font-display uppercase tracking-widest text-base-content/80">
                {title}
              </h3>
              <div className="flex-1" />
              <button type="button" className="self-center p-1 text-base-content/60 hover:text-base-content" onClick={onClose} aria-label="Close">
                <CloseIcon className="w-4 h-4" />
              </button>
            </header>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof window !== 'undefined' && window.document?.body) {
    return createPortal(content, window.document.body);
  }
  return null;
};

export default Modal;
