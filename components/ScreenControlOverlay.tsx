import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useLiveAssistantContext } from '../contexts/LiveAssistantContext';
import { CursorIcon } from './icons';
import { audioService } from '../services/audioService';

/**
 * Floating overlay that appears when the assistant has permission to
 * control the browser. Shows a clear control indicator with a release
 * button so the user can revoke permission at any time.
 */
export const ScreenControlOverlay: React.FC = () => {
    const { controlEnabled, sharing, revokeControl } = useLiveAssistantContext();
    const show = controlEnabled && sharing;

    if (typeof document === 'undefined') return null;

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0, y: -20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="fixed top-4 right-4 z-[9999]"
                >
                    <div className="relative p-[1px] corner-frame overflow-visible shadow-2xl min-w-[240px] pointer-events-auto">
                        {/* Pulsing border ring */}
                        <div className="absolute -inset-[2px] rounded-none border border-warning/50 animate-pulse pointer-events-none" />

                        <div className="flex items-stretch h-full w-full overflow-hidden relative z-10 bg-base-300/95 backdrop-blur-xl border border-warning/40">
                            {/* Warning accent stripe */}
                            <div className="w-1.5 h-auto bg-warning shrink-0" />

                            <div className="flex-1 flex items-center gap-3 px-4 py-3">
                                <CursorIcon className="w-5 h-5 text-warning shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="text-[11px] font-black uppercase tracking-[0.15em] text-warning">
                                        Assistant Control
                                    </div>
                                    <div className="text-[10px] font-medium uppercase tracking-wider text-base-content/50 mt-0.5">
                                        Active — click to release
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        audioService.playClick();
                                        revokeControl();
                                    }}
                                    className="px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] 
                                               bg-warning/20 text-warning border border-warning/30
                                               hover:bg-warning/30 transition-colors"
                                >
                                    Release
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
