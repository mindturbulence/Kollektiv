import React, { useRef } from 'react';
import { CloseIcon } from './icons';

export const PropertyCard: React.FC<{
    label: string;
    value: string;
    onClear: () => void;
    onClick: () => void;
    active: boolean;
}> = ({ label, value, onClear, onClick, active }) => (
    <div
        onClick={onClick}
        className={`group relative p-4 transition-all duration-300 cursor-pointer select-none flex flex-col justify-center min-h-[5rem] last:border-b-0 border-b border-base-content/5 ${active ? 'bg-primary/5' : 'hover:bg-base-content/5'}`}
    >
        <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className={`text-xs font-black uppercase tracking-[0.2em] ${active ? 'text-primary' : 'text-base-content/30'}`}>{label}</span>
            {value && (
                <button
                    onClick={(e) => { e.stopPropagation(); onClear(); }}
                    className={`btn btn-ghost btn-xs btn-square h-5 w-5 min-h-0 opacity-0 group-hover:opacity-100 transition-opacity ${active ? 'text-primary' : 'text-base-content/20 hover:text-error'}`}
                >
                    <CloseIcon className="w-4 h-4" />
                </button>
            )}
        </div>
        <span className={`text-base font-bold font-nunito leading-tight break-words first-letter:uppercase tracking-tight ${active ? 'text-primary' : 'text-base-content'}`}>
            {value || 'Default'}
        </span>
    </div>
);

export const ReferenceSlot: React.FC<{
    url: string | null;
    onUpload: (b64: string) => void;
    onRemove: () => void;
    index: number;
}> = ({ url, onUpload, onRemove, index }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') onUpload(reader.result);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    return (
        <div
            onClick={() => !url && inputRef.current?.click()}
            className={`relative flex items-center justify-center border border-dashed rounded-none cursor-pointer overflow-hidden group transition-all min-h-[60px] ${url ? 'border-base-content/20' : 'border-base-content/10 hover:border-base-content/30 hover:bg-base-content/5'}`}
        >
            {url ? (
                <>
                    <img src={url} alt={`reference ${index + 1}`} className="w-full h-full object-cover absolute inset-0" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button onClick={onRemove} className="btn btn-ghost btn-xs text-error rounded-none">REMOVE</button>
                    </div>
                </>
            ) : (
                <span className="text-[9px] font-black uppercase tracking-widest text-base-content/20">SLOT {index + 1}</span>
            )}
            <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        </div>
    );
};
