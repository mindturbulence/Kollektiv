import React, { useRef, useEffect, useState, useCallback, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { loadNotes, addNote, updateNote, deleteNote, clearNotes, AssistantNote } from '../utils/notesStorage';
import { appEventBus } from '../utils/eventBus';
import { fileSystemManager } from '../utils/fileUtils';
import { CloseIcon, DeleteIcon, PlusIcon, CopyIcon, EditIcon, NoteIcon, ArchiveIcon } from './icons';
import { audioService } from '../services/audioService';

interface NotesPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const downloadBlob = (blob: Blob, filename: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
};

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

const NotesPanel: React.FC<NotesPanelProps> = ({ isOpen, onClose }) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const [tab, setTab] = useState<'notes' | 'files'>('notes');
    const [notes, setNotes] = useState<AssistantNote[]>(() => loadNotes());
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
            setFiles([]); // folder does not exist yet — nothing saved
        }
    }, []);

    useEffect(() => appEventBus.on('assistantFilesChanged', () => { void refreshFiles(); }), [refreshFiles]);
    useEffect(() => {
        if (isOpen) {
            setNotes(loadNotes());
            void refreshFiles();
        }
    }, [isOpen, refreshFiles]);

    useLayoutEffect(() => {
        if (!panelRef.current) return;
        gsap.killTweensOf(panelRef.current);
        if (isOpen) {
            audioService.playPanelSlideIn();
            gsap.to(panelRef.current, { x: 0, duration: 1.2, ease: 'elastic.out(1, 0.75)', visibility: 'visible', pointerEvents: 'auto', opacity: 1 });
        } else {
            audioService.playPanelSlideOut();
            gsap.to(panelRef.current, {
                x: '100%', duration: 0.8, ease: 'elastic.in(1, 0.75)', pointerEvents: 'none', opacity: 0,
                onComplete: () => { if (panelRef.current && !isOpen) panelRef.current.style.visibility = 'hidden'; },
            });
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(event.target as Node)) onClose();
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

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
        <div
            ref={panelRef}
            className="absolute top-0 right-0 bottom-0 w-full md:w-[480px] bg-transparent z-[50] translate-x-full pointer-events-none"
            style={{ visibility: 'hidden' }}
            aria-hidden={!isOpen}
        >
            <div className="w-full h-full relative corner-frame overflow-visible flex flex-col pointer-events-auto">
                <div className="bg-base-100/60 backdrop-blur-3xl rounded-none w-[calc(100%-6px)] h-[calc(100%-6px)] m-[3px] flex flex-col overflow-hidden relative z-10">
                    <div className="flex justify-between items-center h-16 px-6 bg-base-100/20 flex-shrink-0 border-b border-base-300/10 relative">
                        <div className="flex items-center gap-3">
                            <NoteIcon className="w-5 h-5 text-primary" />
                            <div className="flex gap-0">
                                <button
                                    onClick={() => { audioService.playClick(); setTab('notes'); }}
                                    className={`px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] font-logo border border-base-300/30 ${tab === 'notes' ? 'bg-primary/20 text-primary' : 'opacity-50 hover:opacity-100'}`}
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
                            <button onClick={() => { audioService.playClick(); onClose(); }} className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100 btn-snake" aria-label="Close notes panel">
                                <span /><span /><span /><span />
                                <CloseIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                    </div>

                    <div className="flex-grow p-0 overflow-y-auto relative scrollbar-thin">
                        {tab === 'notes' && (notes.length > 0 ? (
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
                        ))}
                        {tab === 'files' && (files.length > 0 ? (
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
                        ))}
                    </div>
                </div>
                <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
            </div>
        </div>
    );
};

export default NotesPanel;
