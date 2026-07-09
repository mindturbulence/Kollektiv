import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { audioService } from '../services/audioService';

interface MigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isWorking: boolean;
  progress: number;
  message: string;
  isPaused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  duplicateFile?: string | null;
  onResolveDuplicate?: (choice: 'replace' | 'copy') => void;
  convertingProgress?: number;
  convertingMessage?: string;
  uploadingProgress?: number;
  uploadingMessage?: string;
  phase?: 'converting' | 'uploading' | 'idle' | 'complete';
  syncDirection?: 'push' | 'pull';
}

const MigrationModal: React.FC<MigrationModalProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  isWorking, 
  progress, 
  message: _message,
  isPaused = false,
  onPause,
  onResume,
  duplicateFile = null,
  onResolveDuplicate,
  convertingProgress = 0,
  convertingMessage = '',
  uploadingProgress = 0,
  uploadingMessage = '',
  phase = 'idle',
  syncDirection = 'push'
}) => {
  useEffect(() => {
    if (isOpen) {
        audioService.playModalOpen();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    audioService.playModalClose();
    onClose();
  };

  const handleConfirm = () => {
    audioService.playClick();
    onConfirm();
  };

  const isPush = syncDirection === 'push';

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-xl z-[1000] flex items-center justify-center p-4 animate-fade-in"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="migration-title"
    >
      <div
        className="flex flex-col bg-transparent w-full max-w-lg mx-auto relative p-[3px] corner-frame overflow-visible"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-base-100/40 backdrop-blur-xl rounded-none w-full overflow-hidden relative z-10">
          <header className="px-8 py-4 bg-transparent relative flex-shrink-0">
              <h3 id="migration-title" className="text-xl font-black tracking-tighter text-primary leading-none uppercase">
                {isPush ? 'MIGRATION' : 'PULL SYNC'}
                <span className="text-base-content/20">.</span>
              </h3>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/40 mt-1.5 font-mono">
                {isPush ? 'LOCAL TO GOOGLE DRIVE' : 'GOOGLE DRIVE TO LOCAL'}
              </p>
          </header>
          
          <div className="p-8 flex-grow">
              {!isWorking && (
                  <p className="text-lg font-black text-base-content/70 leading-relaxed uppercase tracking-tight mb-6">
                    {isPush 
                      ? 'Are you sure you want to copy all settings, gallery files, and prompts to your Google Drive? Depending on the size of your gallery, this may take a while.'
                      : 'Are you sure you want to download all settings, gallery files, and prompts from Google Drive to your Local storage? This will sync your local database with Google Drive.'
                    }
                  </p>
              )}

              {/* Duplicate conflict handling UI */}
              {isWorking && duplicateFile ? (
                  <div className="w-full flex flex-col gap-4 animate-fade-in text-left border border-warning/10 p-5 bg-warning/5 rounded-none">
                      <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-warning animate-ping" />
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-warning font-mono">CONFLICT_RESOLVER</span>
                      </div>
                      <span className="text-xs font-bold font-mono text-warning/80 uppercase tracking-wider">Duplicate File Detected:</span>
                      <h4 className="text-xs font-bold font-mono text-base-content/90 truncate bg-black/20 p-3 select-all border border-white/5">
                          {duplicateFile}
                      </h4>
                      <p className="text-[11px] uppercase tracking-normal leading-relaxed text-base-content/50 font-mono">
                          This file already exists in your target Google Drive folder. Please specify the desired resolution:
                      </p>
                      
                      <div className="flex gap-2.5 mt-2">
                          <button
                            onClick={() => onResolveDuplicate?.('replace')}
                            className="flex-1 py-3 px-4 border border-primary/20 bg-primary/15 hover:bg-primary/25 text-primary text-xs font-bold uppercase transition-all font-mono"
                          >
                            Replace Existing
                          </button>
                          <button
                            onClick={() => onResolveDuplicate?.('copy')}
                            className="flex-1 py-3 px-4 border border-secondary/20 bg-secondary/15 hover:bg-secondary/25 text-secondary text-xs font-bold uppercase transition-all font-mono"
                          >
                            Keep Both (Copy)
                          </button>
                      </div>
                  </div>
              ) : (
                  /* Standard Migration Status & Progress Bar */
                  isWorking && (
                      <div className="w-full flex flex-col gap-4.5 mt-4 animate-fade-in text-left">
                          
                          {/* Phase 1: Converting / Prepping Progress */}
                          <div className="flex flex-col gap-2 p-4 border border-white/5 bg-black/10 rounded-none">
                              <div className="flex justify-between items-center text-[10px] font-mono tracking-widest uppercase">
                                  <span className="font-extrabold text-[#00ffa3]">
                                      {isPush ? 'PHASE 1: CONVERTING GALLERY TO JPG' : 'PHASE 1: READING CLOUD MANIFEST'}
                                  </span>
                                  <span className="font-extrabold text-[#00ffa3]">
                                      {phase === 'converting' ? `${Math.round(convertingProgress)}%` : (phase === 'idle' ? '0%' : '100%')}
                                  </span>
                              </div>
                              <p className="text-[10px] text-base-content/50 font-mono truncate h-4">
                                  {phase === 'converting' 
                                    ? convertingMessage 
                                    : (phase === 'idle' 
                                      ? 'Awaiting activation...' 
                                      : (isPush ? 'All gallery images converted to JPG.' : 'Cloud manifest loaded.'))
                                  }
                              </p>
                              <div className="h-1.5 w-full bg-base-300 rounded overflow-hidden">
                                  <div 
                                      className="h-full bg-[#00ffa3] transition-all duration-300 ease-out" 
                                      style={{ 
                                          width: `${phase === 'converting' ? convertingProgress : (phase === 'idle' ? 0 : 100)}%` 
                                      }} 
                                  />
                              </div>
                          </div>

                          {/* Phase 2: Uploading / Downloading Progress */}
                          <div className="flex flex-col gap-2 p-4 border border-white/5 bg-black/10 rounded-none">
                              <div className="flex justify-between items-center text-[10px] font-mono tracking-widest uppercase">
                                  <span className="font-extrabold text-secondary">
                                      {isPush ? 'PHASE 2: UPLOADING TO GOOGLE DRIVE' : 'PHASE 2: DOWNLOADING TO LOCAL'}
                                  </span>
                                  <span className="font-extrabold text-secondary">
                                      {phase === 'uploading' ? `${Math.round(uploadingProgress)}%` : (phase === 'complete' ? '100%' : '0%')}
                                  </span>
                              </div>
                              <p className="text-[10px] text-base-content/50 font-mono truncate h-4">
                                  {phase === 'uploading' 
                                    ? uploadingMessage 
                                    : (phase === 'complete' 
                                      ? 'All files sync\'d successfully.' 
                                      : (isPush ? 'Pending conversion block...' : 'Pending manifest analysis...'))
                                  }
                              </p>
                              <div className="h-1.5 w-full bg-base-300 rounded overflow-hidden">
                                  <div 
                                      className="h-full bg-secondary transition-all duration-300 ease-out" 
                                      style={{ 
                                          width: `${phase === 'uploading' ? uploadingProgress : (phase === 'complete' ? 100 : 0)}%` 
                                      }} 
                                  />
                              </div>
                          </div>

                          {/* Overall Progress Tracker - Displayed Below */}
                          <div className="flex flex-col gap-2.5 p-4 border border-primary/20 bg-primary/5 rounded-none relative overflow-hidden">
                              <div className="absolute top-0 right-0 p-1 bg-primary/20 text-primary text-[8px] font-mono font-bold uppercase tracking-wider">
                                  OVERALL_ENGINE
                              </div>
                              <div className="flex justify-between items-center text-xs font-mono tracking-widest uppercase">
                                  <span className="font-black text-primary">OVERALL PROCESS PROGRESS</span>
                                  <span className="font-black text-primary">{Math.round(progress)}%</span>
                              </div>
                              <div className="h-2.5 w-full bg-base-300 rounded overflow-hidden">
                                  <div 
                                      className="h-full bg-primary transition-all duration-300 ease-out" 
                                      style={{ width: `${progress}%` }} 
                                  />
                              </div>
                              <p className="text-[9px] text-primary/70 font-mono uppercase tracking-wider text-center mt-1">
                                  {phase === 'converting' 
                                    ? (isPush ? 'Converting gallery images first...' : 'Reading manifest from Google Drive...') 
                                    : (phase === 'uploading' 
                                      ? (isPush ? 'Publishing files to Google Drive...' : 'Downloading files to Local Storage...') 
                                      : (isPush ? 'Migration Fully Transmitted.' : 'Google Drive fully sync\'d.'))
                                  }
                              </p>
                          </div>

                          {/* Pause and Resume Buttons */}
                          <div className="flex justify-end gap-2 mt-1">
                              {isPaused ? (
                                  <button
                                      onClick={onResume}
                                      className="px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"
                                  >
                                      <span>▶</span> RESUME_MIGRATION
                                  </button>
                              ) : (
                                  <button
                                      onClick={onPause}
                                      className="px-4 py-1.5 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 text-amber-400 text-[10px] font-mono font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"
                                  >
                                      <span>⏸</span> PAUSE_MIGRATION
                                  </button>
                              )}
                          </div>
                      </div>
                  )
              )}
          </div>

          {/* Contextual Footers */}
          {!isWorking ? (
              <footer className="h-14 flex items-stretch bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 overflow-hidden flex-shrink-0 panel-footer">
                <button
                  onClick={handleClose}
                  className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider uppercase btn-snake no-glow active:no-glow"
                  aria-label="Cancel migration"
                >
                  <span/><span/><span/><span/>
                  Abort
                </button>
                <button
                  onClick={handleConfirm}
                  className="btn btn-sm btn-primary h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake-primary font-display no-glow active:no-glow"
                  aria-label="Start migration"
                >
                  <span/><span/><span/><span/>
                  Execute
                </button>
              </footer>
          ) : (
              <footer className="h-14 flex items-stretch bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 overflow-hidden flex-shrink-0 panel-footer border-t border-white/5 bg-black/10">
                <button
                  onClick={handleClose}
                  className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider text-error/80 bg-error/5 hover:bg-error/15 active:bg-error/25 border border-error/10 uppercase btn-snake group no-glow active:no-glow"
                  aria-label="Cancel and abort migration"
                >
                  <span/><span/><span/><span/>
                  Stop & Abort Migration
                </button>
              </footer>
          )}
        </div>
        {/* Manual Corner Accents */}
        <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
        <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
        <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
        <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
      </div>
    </div>
  );

  if (typeof (window as any).document !== 'undefined' && (window as any).document.body) {
    return createPortal(modalContent, (window as any).document.body);
  }

  return null;
};

export default MigrationModal;
