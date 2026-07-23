import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { searchCommands, type CommandItem } from '../constants/commandRegistry';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const results = useMemo(() => searchCommands(query), [query]);

  // Clamp selected index on results change
  useEffect(() => {
    if (selectedIndex >= results.length) {
      setSelectedIndex(Math.max(0, results.length - 1));
    }
  }, [results.length, selectedIndex]);

  const execute = useCallback((cmd: CommandItem) => {
    cmd.execute();
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => (i + 1) % Math.max(1, results.length));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => (i - 1 + results.length) % Math.max(1, results.length));
        break;
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        if (results[selectedIndex]) execute(results[selectedIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [results, selectedIndex, execute, onClose]);

  // Auto-scroll selected into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Group results by category for display
  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const cmd of results) {
      const list = map.get(cmd.category) || [];
      list.push(cmd);
      map.set(cmd.category, list);
    }
    return Array.from(map.entries());
  }, [results]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] bg-base-300/30 backdrop-blur-sm"
          onClick={() => onClose()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="w-full max-w-[580px] bg-base-200/95 backdrop-blur-xl border border-base-content/15 shadow-2xl overflow-hidden relative"
            onClick={e => e.stopPropagation()}
            onKeyDown={handleKeyDown}
            role="dialog"
            aria-label="Command palette"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-base-content/10">
              <svg className="w-4 h-4 text-base-content/30 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
                placeholder="Type a command…"
                className="flex-1 bg-transparent text-sm font-mono text-base-content placeholder-base-content/30 outline-none border-none"
                autoComplete="off"
                spellCheck={false}
                role="combobox"
                aria-expanded={isOpen}
                aria-controls="command-palette-listbox"
                aria-autocomplete="list"
                aria-activedescendant={results[selectedIndex] ? `cmd-option-${selectedIndex}` : undefined}
              />
              <kbd className="text-[9px] font-mono uppercase tracking-widest text-base-content/20 border border-base-content/10 px-1.5 py-0.5">⌘K</kbd>
            </div>

            {/* Results */}
            <div ref={listRef} id="command-palette-listbox" role="listbox" className="max-h-[400px] overflow-y-auto custom-scrollbar py-2">
              {grouped.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs font-mono text-base-content/20 uppercase tracking-widest">
                  No matching commands
                </div>
              ) : (
                grouped.map(([category, commands]) => (
                  <div key={category}>
                    <div className="px-5 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-base-content/20">
                      {category}
                    </div>
                    {commands.map((cmd) => {
                      const globalIdx = results.indexOf(cmd);
                      return (
                        <button
                          key={cmd.id}
                          id={`cmd-option-${globalIdx}`}
                          role="option"
                          aria-selected={selectedIndex === globalIdx}
                          data-index={globalIdx}
                          onClick={() => execute(cmd)}
                          onMouseEnter={() => setSelectedIndex(globalIdx)}
                          className={`w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors duration-75 ${
                            selectedIndex === globalIdx
                              ? 'bg-primary/10 text-primary'
                              : 'text-base-content/70 hover:bg-base-content/5'
                          }`}
                        >
                          <span className="flex-1 text-sm font-medium truncate">{cmd.label}</span>
                          {cmd.shortcut && (
                            <kbd className="text-[9px] font-mono text-base-content/20 border border-base-content/10 px-1.5 py-0.5 shrink-0">
                              {cmd.shortcut}
                            </kbd>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center gap-4 px-5 py-2 border-t border-base-content/5 text-[9px] font-mono text-base-content/20">
              <span>↑↓ Navigate</span>
              <span>↵ Execute</span>
              <span>Esc Close</span>
            </div>

            {/* Corner accents */}
            <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/30 z-20 pointer-events-none" />
            <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/30 z-20 pointer-events-none" />
            <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/30 z-20 pointer-events-none" />
            <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/30 z-20 pointer-events-none" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CommandPalette;
