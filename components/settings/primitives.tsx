import React from 'react';
import { audioService } from '../../services/audioService';

export const SettingRow: React.FC<{ label: string, desc?: string, children: React.ReactNode }> = ({ label, desc, children }) => (
    <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 group hover:bg-base-200/30 transition-all">
        <div className="max-w-md min-w-0">
            <h4 className="text-sm font-black uppercase tracking-widest text-base-content/70 group-hover:text-primary transition-colors">{label}</h4>
            {desc && <p className="text-[10px] font-medium text-base-content/40 mt-1 uppercase leading-relaxed">{desc}</p>}
        </div>
        <div className="flex-shrink-0 w-full md:w-auto">
            {children}
        </div>
    </div>
);

interface SetupNavItemProps {
    label: string;
    icon: React.ReactNode;
    isActive: boolean;
    onClick: () => void;
    registerRef: (el: HTMLAnchorElement | null) => void;
}

export const SetupNavItem: React.FC<SetupNavItemProps> = ({ label, icon, isActive, onClick, registerRef }) => (
    <li>
        <a
            ref={registerRef}
            onClick={() => {
                audioService.playClick();
                onClick();
            }}
            onMouseEnter={() => audioService.playHover()}
            className={`flex items-center p-2.5 text-base font-medium transition-colors cursor-pointer relative z-10 ${
                isActive
                    ? 'text-primary'
                    : 'text-base-content/70 hover:text-base-content'
            }`}
        >
            <div className="mr-3">{icon}</div>
            <span className="uppercase text-[10px] font-black tracking-widest">{label}</span>
        </a>
    </li>
);

export const SettingsGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="mb-6">
        <div className="px-6 py-3 border-b border-base-content/10">
            <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-base-content/30">{title}</h3>
        </div>
        {children}
    </div>
);

interface ProviderTabProps {
    label: string;
    isActive: boolean;
    onClick: () => void;
}

export const ProviderTab: React.FC<ProviderTabProps> = ({ label, isActive, onClick }) => (
    <div
        className={`tab-item ${isActive ? 'tab-item-active' : ''}`}
        onClick={() => { audioService.playClick(); onClick(); }}
    >
        {label}
    </div>
);
