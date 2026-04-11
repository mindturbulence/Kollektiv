
import React from 'react';

interface FooterProps {
}

const Footer: React.FC<FooterProps> = () => {
    return (
        <footer className="flex-shrink-0 px-10 py-2 bg-transparent z-[700] flex flex-row items-center justify-between select-none whitespace-nowrap relative pointer-events-auto">
            {/* Background Technical Noise */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]"></div>

            <div className="flex items-center h-full gap-4 bg-transparent relative z-[710] pointer-events-auto">
                {/* Content removed as requested */}
            </div>

            <div className="flex flex-row items-center h-full gap-6">
                {/* Content removed as requested */}
            </div>
        </footer>
    );
};

export default Footer;
