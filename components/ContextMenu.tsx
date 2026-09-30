/**
 * Context Menu — portal-based, keyboard-navigable context menu component.
 *
 * Features:
 * - Portal to document.body with z-toast (above overlays, below system)
 * - Arrow key navigation, Enter/Space to select, Escape to close
 * - Home/End jump, type-ahead character search
 * - Click-outside closes
 * - Viewport edge re-anchoring (flips when near bottom/right)
 * - Submenu support via nested items
 * - Separator and disabled item support
 * - Danger styling for destructive actions
 */
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

// ── Types ─────────────────────────────────────────────────────────────

export type MenuItem =
  | { kind: 'action'; label: string; icon?: React.ReactNode; shortcut?: string;
      disabled?: boolean; danger?: boolean; onSelect: () => void }
  | { kind: 'separator' }
  | { kind: 'submenu'; label: string; icon?: React.ReactNode; children: MenuItem[] };

export interface ContextMenuProps {
  items: MenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────

const ContextMenu: React.FC<ContextMenuProps> = ({ items, x, y, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x, y });
  const [submenu, setSubmenu] = useState<{ items: MenuItem[]; x: number; y: number } | null>(null);

  // Actionable (non-separator) items for keyboard navigation.
  const actionItems = items.filter((it): it is Exclude<MenuItem, { kind: 'separator' }> => it.kind !== 'separator');

  // ── Viewport re-anchoring ──
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    // Wait one frame for the DOM to render so we get real dimensions.
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let nx = x;
      let ny = y;
      if (x + rect.width > vw - 8) nx = Math.max(8, vw - rect.width - 8);
      if (y + rect.height > vh - 8) ny = Math.max(8, vh - rect.height - 8);
      if (nx !== x || ny !== y) setPos({ x: nx, y: ny });
    });
  // Only reposition when the menu opens (x/y identity).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Click-outside ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    // Use capture + slight delay so the contextmenu event that opened us
    // doesn't immediately trigger a close.
    const timer = setTimeout(() => document.addEventListener('mousedown', handler, true), 0);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler, true); };
  }, [onClose]);

  // ── Submenu ──
  const openSubmenu = useCallback((item: MenuItem & { kind: 'submenu' }) => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setSubmenu({ items: item.children, x: rect.right - 2, y: pos.y });
  }, [pos.y]);

  // ── Keyboard navigation ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusIdx(i => (i + 1) % actionItems.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusIdx(i => (i - 1 + actionItems.length) % actionItems.length);
        break;
      case 'Home':
        e.preventDefault();
        setFocusIdx(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusIdx(actionItems.length - 1);
        break;
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const item = actionItems[focusIdx];
        if (item && item.kind === 'action' && !item.disabled) {
          item.onSelect();
          onClose();
        } else if (item && item.kind === 'submenu') {
          openSubmenu(item);
        }
        break;
      }
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'ArrowRight': {
        const item = actionItems[focusIdx];
        if (item && item.kind === 'submenu') {
          e.preventDefault();
          openSubmenu(item);
        }
        break;
      }
      default:
        // Type-ahead: jump to first item starting with the pressed character.
        if (e.key.length === 1) {
          const ch = e.key.toLowerCase();
          const idx = actionItems.findIndex((it, i) => i > focusIdx && it.label.toLowerCase().startsWith(ch));
          const wrap = idx >= 0 ? idx : actionItems.findIndex(it => it.label.toLowerCase().startsWith(ch));
          if (wrap >= 0) setFocusIdx(wrap);
        }
    }
  }, [actionItems, focusIdx, onClose, openSubmenu]);

  // ── Focus management ──
  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  // Map focusIdx (index into actionItems) back to the real DOM index.
  let actionCounter = -1;

  const content = (
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="fixed min-w-[200px] max-w-[320px] py-1 bg-base-300/95 backdrop-blur-xl border border-base-content/10 rounded shadow-2xl outline-none z-toast"
      style={{ left: pos.x, top: pos.y }}
    >
      {items.map((item, i) => {
        if (item.kind === 'separator') {
          return <div key={`sep-${i}`} className="my-1 h-px bg-base-content/10" role="separator" />;
        }
        actionCounter++;
        const isFocused = actionCounter === focusIdx;
        const isAction = item.kind === 'action';
        const isSubmenu = item.kind === 'submenu';
        const disabled = isAction && item.disabled;
        const danger = isAction && item.danger;

        return (
          <div
            key={`${item.label}-${i}`}
            role="menuitem"
            aria-disabled={disabled || undefined}
            data-focused={isFocused || undefined}
            className={[
              'flex items-center gap-2 px-3 py-1.5 text-xs font-mono uppercase cursor-pointer select-none transition-colors',
              disabled ? 'opacity-40 cursor-not-allowed' : '',
              isFocused && !disabled ? 'bg-primary/15 text-primary' : '',
              danger && !disabled && !isFocused ? 'text-error' : '',
              danger && isFocused && !disabled ? 'bg-error/15 text-error' : '',
              !danger && !isFocused && !disabled ? 'text-base-content/80 hover:bg-base-200/60 hover:text-base-content' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => {
              if (disabled) return;
              if (isAction) { item.onSelect(); onClose(); }
              if (isSubmenu) openSubmenu(item);
            }}
            onMouseEnter={() => {
              if (!disabled) setFocusIdx(actionCounter);
              if (isSubmenu) openSubmenu(item);
            }}
            onMouseLeave={() => {
              if (isSubmenu) setSubmenu(null);
            }}
          >
            {item.icon && <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">{item.icon}</span>}
            <span className="flex-grow truncate">{item.label}</span>
            {isAction && item.shortcut && (
              <span className="text-2xs text-base-content/40 flex-shrink-0 ml-4">{item.shortcut}</span>
            )}
            {isSubmenu && (
              <span className="text-base-content/40 ml-auto flex-shrink-0">▸</span>
            )}
          </div>
        );
      })}
    </div>
  );

  if (typeof document === 'undefined' || !document.body) return null;

  return createPortal(
    <>
      {content}
      {submenu && (
        <ContextMenu
          items={submenu.items}
          x={submenu.x}
          y={submenu.y}
          onClose={() => setSubmenu(null)}
        />
      )}
    </>,
    document.body,
  );
};

export default ContextMenu;
