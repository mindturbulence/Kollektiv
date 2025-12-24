
import React, { useState, useEffect, useRef, useMemo } from 'react';

interface AutocompleteSelectProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const AutocompleteSelect: React.FC<AutocompleteSelectProps> = ({ options, value, onChange, placeholder }) => {
  const [inputValue, setInputValue] = useState(value || '');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  const filteredOptions = useMemo(() => {
    if (!inputValue) {
      return options;
    }
    const lowerInputValue = inputValue.toLowerCase();
    return options.filter(option =>
      option.toLowerCase().includes(lowerInputValue)
    );
  }, [inputValue, options]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !(wrapperRef.current as any).contains(event.target as any)) {
        setIsDropdownOpen(false);
        if (!options.includes(inputValue) && inputValue !== '') {
             setInputValue(value || '');
        }
      }
    };

    if (typeof window !== 'undefined' && (window as any).document) {
        (window as any).document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
        if (typeof window !== 'undefined' && (window as any).document) {
            (window as any).document.removeEventListener('mousedown', handleClickOutside);
        }
    };
  }, [wrapperRef, value, inputValue, options]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue((e.currentTarget as any).value);
    if (!isDropdownOpen) {
      setIsDropdownOpen(true);
    }
  };

  const handleOptionClick = (option: string) => {
    onChange(option);
    setInputValue(option);
    setIsDropdownOpen(false);
  };
  
  const handleInputFocus = () => {
      setIsDropdownOpen(true);
  };
  
  const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange('');
      setInputValue('');
      setIsDropdownOpen(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="join w-full">
        <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            placeholder={placeholder || 'Select...'}
            className="input input-sm input-bordered join-item w-full"
        />
         {value && (
            <button
                onClick={handleClear}
                className="btn btn-sm btn-ghost join-item"
                title="Clear selection"
            >
                ✕
            </button>
        )}
      </div>
      {isDropdownOpen && (
        <ul className="absolute z-10 w-full mt-1 bg-base-200 shadow-lg rounded-box max-h-60 overflow-y-auto">
          {filteredOptions.length > 0 ? (
            filteredOptions.map(option => (
              <li key={option}>
                <a
                  onClick={() => handleOptionClick(option)}
                  className={`block px-4 py-2 text-sm hover:bg-base-300 cursor-pointer ${value === option ? 'bg-primary text-primary-content' : ''}`}
                >
                  {option}
                </a>
              </li>
            ))
          ) : (
            <li className="px-4 py-2 text-sm text-base-content/60">No options found</li>
          )}
        </ul>
      )}
    </div>
  );
};

export default AutocompleteSelect;