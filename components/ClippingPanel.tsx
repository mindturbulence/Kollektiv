import React, { useRef, useEffect, useState, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import type { Idea } from '../types';
import type { AssistantNote } from '../utils/notesStorage';
import { loadNotes, addNote, updateNote, deleteNote, clearNotes } from '../utils/notesStorage';
import { appEventBus } from '../utils/eventBus';
import { fileSystemManager } from '../utils/fileUtils';
import { CloseIcon, DeleteIcon, SparklesIcon, BookmarkIcon, RefreshIcon, PlusIcon, ArchiveIcon, CopyIcon, EditIcon, NoteIcon } from './icons';
import { audioService } from '../services/audioService';

interface ClippingPanelProps {
    isOpen: boolean;
    onClose: () => void;
    clippedIdeas: Idea[];
    onRemoveIdea: (id: string) => void;
    onClearAll: () => void;
    onInsertIdea: (prompt: string) => void;
    onRefineIdea: (prompt: string) => void;
    onAddIdea: (idea: Idea) => void;
    onSaveToLibrary: (idea: Idea) => void;
}

type PanelTab = 'clips' | 'notes' | 'files';

const downloadBlob = (blob: Blob, filename: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
};

// ─── Manual Clip Modal ────────────────────────────────────────────

const ManualClipModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onAdd: (title: string, text: string) => void;
}> = ({ isOpen, onClose, onAdd }) => {
    const [title, setTitle] = useState('');
    const [text, setText] = useState('');

    useEffect(() => {
        if (isOpen) {
            setTitle('');
            setText('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (!text.trim()) return;
        onAdd(title, text);
        onClose();
    };

    const modalContent = (
        <div className="fixed inset-0 bg-black/80 z-[1000] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="flex flex-col bg-transparent w-full max-w-lg mx-auto relative p-[3px] corner-frame overflow-visible" onClick={e => e.stopPropagation()}>
                <div className="bg-base-100/40 backdrop-blur-xl rounded-none w-full flex flex-col overflow-hidden relative z-10">
                    <header className="p-8 border-b border-base-300 bg-base-200/20 relative">
                        <button onClick={() => { audioService.playClick(); onClose(); }} className="absolute top-6 right-6 form-btn h-8 w-8 opacity-40 hover:opacity-100">
                            <CloseIcon className="w-6 h-6" />
                        </button>
                        <h3 className="text-3xl font-black tracking-tighter text-base-content leading-none">
                            NEW CLIP<span className="text-primary">.</span>
                        </h3>
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 mt-2">Manual Archival Record</p>
                    </header>

                    <div className="p-8 space-y-6">
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Entry Identity</label>
                            <input
                                type="text"
                                placeholder="TITLE..."
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                className="form-input w-full"
                                autoFocus
                            />
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Prompt Token Data</label>
                            <textarea
                                placeholder="TOKEN STREAM..."
                                value={text}
                                onChange={e => setText(e.target.value)}
                                className="form-textarea w-full min-h-[120px]"
                            />
                        </div>
                    </div>

                    <footer className="border-t border-base-300 flex bg-transparent p-0 overflow-hidden">
                        <button onClick={() => { audioService.playClick(); onClose(); }} className="form-btn flex-1 h-14 rounded-none border-r border-base-300">Abort</button>
                        <button
                            onClick={() => { audioService.playClick(); handleConfirm(); }}
                            disabled={!text.trim()}
                            className="form-btn form-btn-primary flex-1 h-14 rounded-none"
                        >
                            Store Token
                        </button>
                    </footer>
                </div>
                <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
            </div>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};

// ─── Clipped Idea Item ────────────────────────────────────────────

const ClippedIdeaItem: React.FC<{
    idea: Idea;
    index: number;
    onRemove: (id: string) => void;
    onInsert: (prompt: string) => void;
    onRefine: (prompt: string) => void;
    onSave: (idea: Idea) => void;
}> = ({ idea, index, onRemove, onInsert, onRefine, onSave }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        audioService.playClick();
        if (typeof window !== 'undefined' && (window as any).navigator?.clipboard) {
          (window as any).navigator.clipboard.writeText(idea.prompt)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
            .catch((err: any) => {
              console.error('Failed to copy text: ', err);
            });
        }
      }, [idea.prompt]);

    const displayNum = String(index + 1).padStart(2, '0');

    return (
        <div className="flex flex-col group bg-transparent transition-all duration-700 hover:bg-primary/5 w-full overflow-hidden select-none h-fit border-b border-base-300/10 relative">
            <div className="flex flex-col w-full h-full p-4 md:p-6">
                <div className="mb-4">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-3xl font-black text-base-content flex-shrink-0 font-mono leading-none tracking-tighter tabular-nums opacity-20">
                                {displayNum}
                            </span>
                            <div className="flex flex-col min-w-0 border-l border-base-300/30 pl-3">
                                <span className="text-[9px] font-black uppercase tracking-[0.4em] text-primary/60 mb-1 leading-none">
                                    {idea.lens}
                                </span>
                                <h2 className="font-black text-sm text-base-content truncate uppercase tracking-tight font-logo leading-tight" title={idea.title}>
                                    {idea.title}
                                </h2>
                            </div>
                        </div>
                        <button
                            onClick={() => { audioService.playClick(); onRemove(idea.id); }}
                            className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 -content/20 hover:text-error transition-colors btn-snake ml-4"
                            title="Remove clip"
                        >
                            <span/><span/><span/><span/>
                            <DeleteIcon className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="flex-grow mb-4">
                    <p className="text-sm font-medium leading-relaxed text-base-content/70 italic line-clamp-3" title={idea.prompt}>
                        "{idea.prompt}"
                    </p>
                </div>

                <div className="flex justify-between items-center mt-2 pt-4 border-t border-base-300/10">
                    <button
                        onClick={handleCopy}
                        className="uppercase tracking-widest -content/30 hover:text-primary transition-all flex items-center gap-1.5 group/btn"
                    >
                        <CopyIcon className="w-3 h-3 opacity-40 group-hover/btn:opacity-100" />
                        {copied ? 'COPIED' : 'COPY'}
                    </button>
                    <button
                        onClick={() => { audioService.playClick(); onInsert(idea.prompt); }}
                        className="uppercase tracking-widest -content/30 hover:text-primary transition-all flex items-center gap-1.5 group/btn"
                    >
                        <RefreshIcon className="w-3 h-3 opacity-40 group-hover/btn:opacity-100" />
                        CRAFT
                    </button>
                     <button
                        onClick={() => { audioService.playClick(); onRefine(idea.prompt); }}
                        className="uppercase tracking-widest -content/30 hover:text-primary transition-all flex items-center gap-1.5 group/btn"
                    >
                        <SparklesIcon className="w-3 h-3 opacity-40 group-hover/btn:opacity-100" />
                        REFINE
                    </button>
                    <button
                        onClick={() => { audioService.playClick(); onSave(idea); }}
                        className="uppercase tracking-widest -content/30 hover:text-primary transition-all flex items-center gap-1.5 group/btn"
                    >
                        <ArchiveIcon className="w-3 h-3 opacity-40 group-hover/btn:opacity-100" />
                        SAVE
                    </button>
                </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
    );
};

// ─── Note Item ────────────────────────────────────────────────────

const NoteItem: React.FC<{ note: AssistantNote; index: number }> = ({ note, index }) => {
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(note.title);
    const [content, setContent] = useState(note.content);
    const [copied, setCopied] = useState(false);

    useEffect(() => { setTitle(note.title); setContent(note.content); }, [note.title, note.content]);

    const handleCopy = useCallback(() => {
        audioService.playClick();
        navigator.clipboard?.writeText(note.content).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => {});
    }, [note.content]);

    const handleDownload = useCallback(() => {
        audioService.playClick();
        const safe = note.title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'note';
        downloadBlob(new Blob([note.content], { type: 'text/markdown' }), `${safe}.md`);
    }, [note.title, note.content]);

    const handleSave = () => {
        updateNote(note.id, { title: title.trim() || note.title, content });
        setEditing(false);
    };

    return (
        <div className="flex flex-col group bg-transparent transition-all duration-700 hover:bg-primary/5 w-full overflow-hidden select-none border-b border-base-300/10 relative">
            <div className="flex flex-col w-full p-4 md:p-6">
                <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-3xl font-black text-base-content flex-shrink-0 font-mono leading-none tracking-tighter tabular-nums opacity-20">
                            {String(index + 1).padStart(2, '0')}
                        </span>
                        <div className="flex flex-col min-w-0 border-l border-base-300/30 pl-3">
                            <span className="text-[9px] font-black uppercase tracking-[0.4em] text-primary/60 mb-1 leading-none">
                                {note.source === 'assistant' ? 'Assistant' : 'Manual'} · {new Date(note.updatedAt).toLocaleDateString()}
                            </span>
                            {editing ? (
                                <input value={title} onChange={e => setTitle(e.target.value)} className="form-input h-7 text-sm w-full" />
                            ) : (
                                <h2 className="font-black text-sm text-base-content truncate uppercase tracking-tight font-logo leading-tight" title={note.title}>
                                    {note.title}
                                </h2>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => { audioService.playClick(); deleteNote(note.id); }}
                        className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 hover:text-error transition-colors btn-snake ml-4"
                        title="Delete note"
                    >
                        <span /><span /><span /><span />
                        <DeleteIcon className="w-4 h-4" />
                    </button>
                </div>

                {editing ? (
                    <textarea value={content} onChange={e => setContent(e.target.value)} className="form-textarea w-full min-h-[120px] text-sm mb-3" />
                ) : (
                    <p className="text-sm font-medium leading-relaxed text-base-content/70 whitespace-pre-wrap mb-3">{note.content}</p>
                )}

                <div className="flex justify-between items-center pt-3 border-t border-base-300/10 text-[10px] font-black">
                    <button onClick={handleCopy} className="uppercase tracking-widest hover:text-primary transition-all flex items-center gap-1.5 group/btn">
                        <CopyIcon className="w-3 h-3 opacity-40 group-hover/btn:opacity-100" />
                        {copied ? 'COPIED' : 'COPY'}
                    </button>
                    <button onClick={handleDownload} className="uppercase tracking-widest hover:text-primary transition-all flex items-center gap-1.5 group/btn">
                        <ArchiveIcon className="w-3 h-3 opacity-40 group-hover/btn:opacity-100" />
                        DOWNLOAD
                    </button>
                    {editing ? (
                        <div className="flex gap-4">
                            <button onClick={() => { audioService.playClick(); setEditing(false); setTitle(note.title); setContent(note.content); }} className="uppercase tracking-widest opacity-40 hover:opacity-100">Cancel</button>
                            <button onClick={() => { audioService.playClick(); handleSave(); }} className="uppercase tracking-widest text-primary">Save</button>
                        </div>
                    ) : (
                        <button onClick={() => { audioService.playClick(); setEditing(true); }} className="uppercase tracking-widest hover:text-primary transition-all flex items-center gap-1.5 group/btn">
                            <EditIcon className="w-3 h-3 opacity-40 group-hover/btn:opacity-100" />
                            REVISE
                        </button>
                    )}
                </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
    );
};

// ─── Panel ────────────────────────────────────────────────────────

const ClippingPanel: React.FC<ClippingPanelProps> = ({
    isOpen,
    onClose,
    clippedIdeas,
    onRemoveIdea,
    onClearAll,
    onInsertIdea,
    onRefineIdea,
    onAddIdea,
    onSaveToLibrary,
}) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [tab, setTab] = useState<PanelTab>('clips');

    // Notes state
    const [notes, setNotes] = useState<AssistantNote[]>(() => loadNotes());

    // Files state
    const [files, setFiles] = useState<string[]>([]);

    useEffect(() => appEventBus.on('notesChanged', (n: AssistantNote[]) => setNotes(n)), []);

    const refreshFiles = useCallback(async () => {
        if (!fileSystemManager.isDirectorySelected()) { setFiles([]); return; }
        try {
            const names: string[] = [];
            for await (const handle of fileSystemManager.listDirectoryContents('assistant')) {
                if (handle.kind === 'file') names.push(handle.name);
            }
            setFiles(names.sort());
        } catch {
            setFiles([]);
        }
    }, []);

    useEffect(() => appEventBus.on('assistantFilesChanged', () => { void refreshFiles(); }), [refreshFiles]);

    useEffect(() => {
        if (isOpen) {
            setNotes(loadNotes());
            void refreshFiles();
        }
    }, [isOpen, refreshFiles]);

    // GSAP Animation for the panel
    useLayoutEffect(() => {
        if (!panelRef.current) return;

        if (isOpen) {
            audioService.playPanelSlideIn();
            gsap.killTweensOf(panelRef.current);
            gsap.to(panelRef.current, {
                x: 0,
                duration: 1.2,
                ease: "elastic.out(1, 0.75)",
                visibility: 'visible',
                pointerEvents: 'auto',
                opacity: 1
            });
        } else {
            audioService.playPanelSlideOut();
            gsap.killTweensOf(panelRef.current);
            gsap.to(panelRef.current, {
                x: '100%',
                duration: 0.8,
                ease: "elastic.in(1, 0.75)",
                pointerEvents: 'none',
                opacity: 0,
                onComplete: () => {
                    if (panelRef.current && !isOpen) {
                        panelRef.current.style.visibility = 'hidden';
                    }
                }
            });
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (panelRef.current && !(panelRef.current as any).contains(event.target as any)) {
                onClose();
            }
        };

        if (isOpen && typeof (window as any).document !== 'undefined') {
            (window as any).document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            if (typeof (window as any).document !== 'undefined') {
                (window as any).document.removeEventListener('mousedown', handleClickOutside);
            }
        };
    }, [isOpen, onClose]);

    const handleAddManual = (title: string, text: string) => {
        const newIdea: Idea = {
            id: `manual-${Date.now()}`,
            lens: 'Manual',
            title: title.trim() || 'Untitled Manual Entry',
            prompt: text.trim(),
            source: 'User'
        };
        onAddIdea(newIdea);
    };

    const handleDownloadFile = useCallback(async (name: string) => {
        audioService.playClick();
        const blob = await fileSystemManager.getFileAsBlob(`assistant/${name}`);
        if (blob) downloadBlob(blob, name);
    }, []);

    const handleDeleteFile = useCallback(async (name: string) => {
        audioService.playClick();
        await fileSystemManager.deleteFile(`assistant/${name}`);
        void refreshFiles();
    }, [refreshFiles]);

    return (
        <>
            <div
                ref={panelRef}
                className="absolute top-0 right-0 bottom-0 w-full md:w-[480px] bg-transparent z-[50] translate-x-full pointer-events-none"
                style={{ visibility: 'hidden' }}
                aria-hidden={!isOpen}
            >
                <div className="w-full h-full relative corner-frame overflow-visible flex flex-col pointer-events-auto">
                    <div className="bg-base-100/60 backdrop-blur-3xl rounded-none w-[calc(100%-6px)] h-[calc(100%-6px)] m-[3px] flex flex-col overflow-hidden relative z-10">
                        {/* Header */}
                        <div className="flex justify-between items-center h-16 px-6 bg-base-100/20 flex-shrink-0 border-b border-base-300/10 relative">
                            <div className="flex items-center gap-3">
                                {tab === 'clips' ? (
                                    <BookmarkIcon className="w-5 h-5 text-primary" />
                                ) : (
                                    <NoteIcon className="w-5 h-5 text-primary" />
                                )}
                                <div className="flex gap-0">
                                    <button
                                        onClick={() => { audioService.playClick(); setTab('clips'); }}
                                        className={`px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] font-logo border border-base-300/30 ${tab === 'clips' ? 'bg-primary/20 text-primary' : 'opacity-50 hover:opacity-100'}`}
                                    >
                                        Clips [{clippedIdeas.length}]
                                    </button>
                                    <button
                                        onClick={() => { audioService.playClick(); setTab('notes'); }}
                                        className={`px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] font-logo border border-base-300/30 border-l-0 ${tab === 'notes' ? 'bg-primary/20 text-primary' : 'opacity-50 hover:opacity-100'}`}
                                    >
                                        Notes [{notes.length}]
                                    </button>
                                    <button
                                        onClick={() => { audioService.playClick(); setTab('files'); }}
                                        className={`px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] font-logo border border-base-300/30 border-l-0 ${tab === 'files' ? 'bg-primary/20 text-primary' : 'opacity-50 hover:opacity-100'}`}
                                    >
                                        Files [{files.length}]
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {tab === 'clips' && (
                                    <button
                                        onClick={() => { audioService.playClick(); setIsModalOpen(true); }}
                                        className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100 hover:text-primary transition-all btn-snake"
                                        title="Manual Entry"
                                    >
                                        <span/><span/><span/><span/>
                                        <PlusIcon className="w-5 h-5" />
                                    </button>
                                )}
                                {tab === 'notes' && (
                                    <button
                                        onClick={() => { audioService.playClick(); addNote('', 'New note — click REVISE to edit.', 'user'); }}
                                        className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100 hover:text-primary transition-all btn-snake"
                                        title="New note"
                                    >
                                        <span /><span /><span /><span />
                                        <PlusIcon className="w-5 h-5" />
                                    </button>
                                )}
                                {tab === 'clips' && clippedIdeas.length > 0 && (
                                    <button
                                        onClick={() => { audioService.playClick(); onClearAll(); }}
                                        className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100 hover:text-error transition-all btn-snake"
                                        title="Purge All Clips"
                                    >
                                        <span/><span/><span/><span/>
                                        <DeleteIcon className="w-5 h-5" />
                                    </button>
                                )}
                                {tab === 'notes' && notes.length > 0 && (
                                    <button
                                        onClick={() => { audioService.playClick(); clearNotes(); }}
                                        className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100 hover:text-error transition-all btn-snake"
                                        title="Delete all notes"
                                    >
                                        <span /><span /><span /><span />
                                        <DeleteIcon className="w-5 h-5" />
                                    </button>
                                )}
                                <button onClick={() => { audioService.playClick(); onClose(); }} className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100 btn-snake" aria-label="Close panel">
                                    <span/><span/><span/><span/>
                                    <CloseIcon className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                        </div>

                        {/* Body */}
                        <div ref={scrollRef} className="flex-grow p-0 overflow-y-auto relative scrollbar-thin">
                            {tab === 'clips' && (
                                clippedIdeas.length > 0 ? (
                                    <div className="flex flex-col divide-y divide-base-300/10">
                                        {clippedIdeas.map((idea, index) => (
                                            <ClippedIdeaItem
                                                key={idea.id}
                                                idea={idea}
                                                index={index}
                                                onRemove={onRemoveIdea}
                                                onInsert={onInsertIdea}
                                                onRefine={onRefineIdea}
                                                onSave={onSaveToLibrary}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center opacity-10 py-12">
                                        <BookmarkIcon className="w-16 h-16 mb-6" />
                                        <p className="text-xl font-black uppercase tracking-widest leading-none">Archives Empty</p>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] mt-4">Clip tokens from the library or add manually</p>
                                    </div>
                                )
                            )}

                            {tab === 'notes' && (
                                notes.length > 0 ? (
                                    <div className="flex flex-col divide-y divide-base-300/10">
                                        {notes.map((note, index) => (
                                            <NoteItem key={note.id} note={note} index={index} />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center opacity-10 py-12">
                                        <NoteIcon className="w-16 h-16 mb-6" />
                                        <p className="text-xl font-black uppercase tracking-widest leading-none">No Notes Yet</p>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] mt-4">Ask the assistant to take a note, or add one manually</p>
                                    </div>
                                )
                            )}

                            {tab === 'files' && (
                                files.length > 0 ? (
                                    <div className="flex flex-col divide-y divide-base-300/10">
                                        {files.map((name, index) => (
                                            <div key={name} className="flex items-center justify-between p-4 md:px-6 group hover:bg-primary/5 transition-colors">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <span className="text-2xl font-black font-mono leading-none tabular-nums opacity-20">{String(index + 1).padStart(2, '0')}</span>
                                                    <span className="text-sm font-mono truncate" title={`assistant/${name}`}>{name}</span>
                                                </div>
                                                <div className="flex items-center gap-4 text-[10px] font-black flex-shrink-0 ml-4">
                                                    <button onClick={() => { void handleDownloadFile(name); }} className="uppercase tracking-widest hover:text-primary transition-all flex items-center gap-1.5">
                                                        <ArchiveIcon className="w-3 h-3 opacity-40" />
                                                        DOWNLOAD
                                                    </button>
                                                    <button onClick={() => { void handleDeleteFile(name); }} className="uppercase tracking-widest hover:text-error transition-all flex items-center gap-1.5">
                                                        <DeleteIcon className="w-3 h-3 opacity-40" />
                                                        DELETE
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center opacity-10 py-12">
                                        <ArchiveIcon className="w-16 h-16 mb-6" />
                                        <p className="text-xl font-black uppercase tracking-widest leading-none">No Files Yet</p>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] mt-4">Ask the assistant to save a file — it lands in the vault's assistant folder</p>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                    <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                    <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                    <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                    <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
                </div>
            </div>

            <ManualClipModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onAdd={handleAddManual}
            />
        </>
    );
}

export default ClippingPanel;
