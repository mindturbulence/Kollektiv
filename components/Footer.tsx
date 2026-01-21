import React from 'react';

interface FooterProps {
  onAboutClick: () => void;
}

const Footer: React.FC<FooterProps> = ({ onAboutClick }) => {
  return (
    <footer className="flex-shrink-0 px-6 py-3 bg-base-100 border-t border-base-300 z-10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
            <span className="text-[9px] font-mono font-black text-base-content/30 tracking-widest uppercase">
                Kollektiv Platform Interface • Version 2.0.0
            </span>
            <div className="hidden md:flex gap-6">
                <span className="text-[9px] font-mono font-black text-base-content/30 tracking-widest uppercase">
                    Encryption: Local Only
                </span>
                <span className="text-[9px] font-mono font-black text-base-content/30 tracking-widest uppercase flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-success"></span> Status: Connected
                </span>
            </div>
        </div>
        <p className="text-[10px] font-bold text-base-content/50 uppercase tracking-[0.2em]">
            Kollektiv Toolbox &copy; 2026 • <a onClick={onAboutClick} className="link link-hover cursor-pointer">mndtrblnc</a>
        </p>
    </footer>
  );
};

export default Footer;