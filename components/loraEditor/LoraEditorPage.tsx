import React, { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { PanelLine, ScanLine, panelVariants, sectionWipeVariants, TerminalText } from '../AnimatedPanels';
import { UploadIcon } from '../icons';

interface LoraEditorPageProps {
    isExiting?: boolean;
}

const LoraEditorPage: React.FC<LoraEditorPageProps> = ({ isExiting = false }) => {
    const [file, setFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleFiles = useCallback((files: FileList | File[]) => {
        const list = Array.from(files);
        const match = list.find(f => f.name.endsWith('.safetensors') || f.name.endsWith('.gguf'));
        if (match) setFile(match);
    }, []);

    return (
        <div className="flex flex-col h-full w-full relative overflow-visible p-0 bg-transparent">
            <motion.div
                variants={panelVariants}
                initial="hidden"
                animate={isExiting ? 'exit' : 'visible'}
                exit="exit"
                className="flex-grow flex flex-col relative p-[3px] corner-frame overflow-visible z-10"
            >
                <PanelLine position="top" delay={0.4} />
                <PanelLine position="bottom" delay={0.5} />
                <PanelLine position="left" delay={0.6} />
                <PanelLine position="right" delay={0.7} />
                <ScanLine delay={3.5} />
                <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
                    <motion.header variants={sectionWipeVariants} custom={1.2} initial="hidden" animate="visible" className="p-6 bg-base-100/10 backdrop-blur-md">
                        <TerminalText text="LORA EDITOR" delay={2.0} className="text-[10px] font-black uppercase text-primary" />
                    </motion.header>
                    <div className="flex-grow p-6 bg-transparent relative flex flex-col overflow-hidden">
                        {!file ? (
                            <div
                                className="w-full h-full flex flex-col items-center justify-center bg-transparent"
                                onDragEnter={() => setIsDragging(true)}
                                onDragOver={(e) => e.preventDefault()}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
                            >
                                <label className={`w-full h-full rounded-none flex flex-col items-center justify-center cursor-pointer transition-all ${isDragging ? 'bg-primary/10' : 'hover:bg-base-200/20'}`}>
                                    <input type="file" accept=".safetensors,.gguf" className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
                                    <UploadIcon className="w-16 h-16 text-base-content/20 mb-6" />
                                    <h2 className="text-2xl font-black uppercase tracking-tighter">DROP LORA FILE</h2>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-base-content/40 mt-2 px-4 text-center">.safetensors or .gguf — drop or click to select</p>
                                </label>
                            </div>
                        ) : (
                            <div className="text-xs font-mono text-base-content/60">{file.name} loaded ({(file.size / 1e6).toFixed(1)} MB)</div>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default LoraEditorPage;
