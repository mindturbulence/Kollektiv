
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CloseIcon, CopyIcon, DownloadIcon, BracesIcon } from './icons';

interface JSONBreakdownModalProps {
    isOpen: boolean;
    onClose: () => void;
    jsonData: any;
    onDownload: () => void;
    onCopy: () => void;
    jsonCopied: boolean;
}

const JSONBreakdownModal: React.FC<JSONBreakdownModalProps> = ({
    isOpen,
    onClose,
    jsonData,
    onDownload,
    onCopy,
    jsonCopied
}) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[2000] flex items-center justify-center p-4 md:p-8 overflow-hidden"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="bg-transparent w-full max-w-2xl relative p-[3px] corner-frame"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="bg-base-100/90 backdrop-blur-2xl rounded-none w-full h-[600px] max-h-[85vh] flex flex-col overflow-hidden relative z-10 border border-primary/10 shadow-3xl">
                            <header className="px-8 py-6 border-b border-base-content/5 flex items-center justify-between bg-base-100/20">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                        <BracesIcon className="w-4 h-4" />
                                    </div>
                                    <div className="flex flex-col">
                                        <h3 className="text-xl font-black tracking-tighter text-base-content leading-none uppercase italic">DATA ANATOMY<span className="text-primary">.</span></h3>
                                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 mt-1.5">Processed Breakdown Structure</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={onClose}
                                    className="p-2 text-base-content/30 hover:text-primary transition-all hover:scale-110"
                                >
                                    <CloseIcon className="w-5 h-5" />
                                </button>
                            </header>

                            <div className="p-8 flex-1 overflow-hidden min-h-0">
                                <div className="bg-black/20 rounded-none border border-primary/10 p-6 relative group h-full flex flex-col">
                                    <pre className="text-[12px] font-mono text-primary/80 leading-relaxed overflow-y-auto custom-scrollbar whitespace-pre-wrap selection:bg-primary/20 flex-1">
                                        {JSON.stringify(jsonData, null, 4)}
                                    </pre>
                                    
                                    {/* Sub-Corner Accents */}
                                    <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary/20" />
                                    <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-primary/20" />
                                    <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-primary/20" />
                                    <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-primary/20" />
                                </div>
                            </div>

                            <footer className="h-14 flex items-stretch bg-base-100/40 backdrop-blur-md p-1.5 gap-1.5 border-t border-base-content/5">
                                <button 
                                    onClick={onCopy}
                                    className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-black text-[11px] tracking-[0.2em] uppercase btn-snake group"
                                >
                                    <span/><span/><span/><span/>
                                    <CopyIcon className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
                                    {jsonCopied ? 'COPIED' : 'COPY RAW'}
                                </button>
                                <button 
                                    onClick={onDownload}
                                    className="btn btn-sm btn-primary h-full flex-1 rounded-none font-black text-[11px] tracking-[0.2em] uppercase btn-snake-primary group"
                                >
                                    <span/><span/><span/><span/>
                                    <DownloadIcon className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
                                    DOWNLOAD JSON
                                </button>
                            </footer>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default JSONBreakdownModal;
