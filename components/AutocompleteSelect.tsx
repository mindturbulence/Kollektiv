import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDownIcon, SearchIcon } from './icons';

export interface AutocompleteOption {
  label: string;
  value: string;
}

interface AutocompleteSelectProps {
  options: AutocompleteOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const AutocompleteSelect: React.FC<AutocompleteSelectProps> = ({ options, value, onChange, placeholder, className = "" }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(() => 
    options.find(opt => opt.value === value), 
  [options, value]);

  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    const lowerQuery = searchQuery.toLowerCase();
    return options.filter(option =>
      option.label.toLowerCase().includes(lowerQuery)
    );
  }, [searchQuery, options]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  return (
    <div className={`relative w-full ${className}`} ref={wrapperRef}>
      <div 
        onClick={handleToggle}
        className="flex items-center justify-between px-3 py-2 bg-base-100 border border-base-300 rounded-none cursor-pointer hover:border-primary transition-colors h-10"
      >
        <span className={`text-sm font-bold truncate uppercase tracking-tight ${!selectedOption ? 'text-base-content/30' : 'text-base-content'}`}>
          {selectedOption ? selectedOption.label : placeholder || 'Select option...'}
        </span>
        <ChevronDownIcon className={`w-4 h-4 text-base-content/40 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
      </div>

      {isDropdownOpen && (
        <div className="absolute z-[100] w-full mt-1 bg-base-200 border border-base-300 shadow-2xl rounded-none flex flex-col overflow-hidden animate-fade-in">
          <div className="p-2 border-b border-base-300 bg-base-100 flex items-center gap-2">
            <SearchIcon className="w-3.5 h-3.5 opacity-30" />
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter list..."
              className="bg-transparent border-none outline-none text-xs font-bold uppercase tracking-widest w-full py-1"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <ul className="max-h-60 overflow-y-auto custom-scrollbar p-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(option => (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => handleOptionClick(option.value)}
                    className={`w-full text-left px-3 py-2.5 text-xs font-bold uppercase tracking-tight hover:bg-primary hover:text-primary-content transition-colors ${value === option.value ? 'bg-primary/10 text-primary' : ''}`}
                  >
                    {option.label}
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
      )}
    </div>
  );
};

export default AutocompleteSelect;