import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon, SearchIcon, CloseIcon } from './icons';
import { audioService } from '../services/audioService';

export interface AutocompleteOption {
  label: string;
  value: string;
  description?: string;
}

interface AutocompleteSelectProps {
  options: AutocompleteOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  fontClass?: string;
}

const AutocompleteSelect: React.FC<AutocompleteSelectProps> = ({ 
  options, 
  value, 
  onChange, 
  placeholder, 
  className = "",
  fontClass = "font-rajdhani"
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLUListElement>(null);

  const selectedOption = useMemo(() => 
    options.find(opt => opt.value === value), 
  [options, value]);

  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    const lowerQuery = searchQuery.toLowerCase();
    return options.filter(option =>
      option.label.toLowerCase().includes(lowerQuery) || 
      (option.description && option.description.toLowerCase().includes(lowerQuery))
    );
  }, [searchQuery, options]);

  const updatePosition = () => {
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom,
        left: rect.left,
        width: rect.width
      });
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isInsideWrapper = wrapperRef.current && wrapperRef.current.contains(target);
      const isInsideDropdown = dropdownRef.current && dropdownRef.current.contains(target);
      
      if (!isInsideWrapper && !isInsideDropdown) {
        setIsDropdownOpen(false);
        setSearchQuery('');
      }
    };

    if (isDropdownOpen) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isDropdownOpen]);

  const handleToggle = () => {
    setIsDropdownOpen(!isDropdownOpen);
    if (!isDropdownOpen) {
      setSearchQuery('');
    }
  };

  const handleOptionClick = (optionValue: string) => {
    onChange(optionValue);
    setIsDropdownOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchQuery('');
    setIsDropdownOpen(false);
  };

  const dropdownMenu = isDropdownOpen ? (
    <div 
      ref={dropdownRef}
      className="fixed z-[12000] mt-1 bg-base-100 border border-base-300 shadow-2xl rounded-none flex flex-col overflow-hidden animate-fade-in"
      style={{ 
        top: `${dropdownPos.top}px`, 
        left: `${dropdownPos.left}px`, 
        width: `${dropdownPos.width}px` 
      }}
    >
      <div className="p-2 border-b border-base-300 bg-base-100 flex items-center gap-2">
        <SearchIcon className="w-3.5 h-3.5 opacity-30" />
        <input
          autoFocus
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter list..."
          className="form-input w-full border-none bg-transparent"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <ul ref={scrollerRef} className="max-h-60 overflow-y-auto p-1">
        {filteredOptions.length > 0 ? (
          filteredOptions.map(option => (
            <li key={option.value}>
              <button
                type="button"
                onClick={() => handleOptionClick(option.value)}
                onMouseEnter={() => audioService.playHover()}
                className={`w-full text-left px-3 py-2 text-xs font-bold ${fontClass} transition-colors flex flex-col gap-0.5 ${value === option.value ? 'text-primary' : 'text-base-content/70 hover:text-base-content'}`}
              >
                <span>{option.label}</span>
                {option.description && (
                  <span className={`text-[11px] opacity-60 ${fontClass} tracking-normal leading-tight ${value === option.value ? 'opacity-90' : ''}`}>
                    {option.description}
                  </span>
                )}
              </button>
            </li>
          ))
        ) : (
          <li className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-base-content/30 text-center">
            No matches found
          </li>
        )}
      </ul>
    </div>
  ) : null;

  return (
    <div className={`relative w-full ${isDropdownOpen ? 'z-[9999]' : 'z-10'} ${className}`} ref={wrapperRef}>
      <div 
        onClick={handleToggle}
        onMouseEnter={() => audioService.playHover()}
        className={`form-select flex items-center justify-between cursor-pointer hover:border-primary ${fontClass}`}
      >
        <span className={`truncate ${!selectedOption ? 'text-base-content/30' : 'text-base-content'}`}>
          {selectedOption ? selectedOption.label : placeholder || 'Select option...'}
        </span>
        <div className="flex items-center gap-1.5 ml-2">
            {value && (
                <button 
                    onClick={handleClear}
                    className="form-btn autocomplete-clear-btn p-1 -mr-1 hover:text-error opacity-20 hover:opacity-100 transition-all border-none bg-transparent h-auto w-auto min-h-0"
                    title="Clear Selection"
                >
                    <CloseIcon className="w-3.5 h-3.5" />
                </button>
            )}
            <ChevronDownIcon className={`w-4 h-4 text-base-content/40 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isDropdownOpen && createPortal(dropdownMenu, document.body)}
    </div>
  );
};

export default AutocompleteSelect;
