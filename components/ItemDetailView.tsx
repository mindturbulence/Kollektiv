import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { GalleryItem, GalleryCategory } from '../types';
import { ChevronLeftIcon, EditIcon, DeleteIcon, CheckIcon, ThumbTackIcon, ChevronRightIcon, CloseIcon, PhotoIcon, UploadIcon, ChevronDownIcon, PlayIcon, SparklesIcon, LinkIcon } from './icons';
import FullscreenViewer from './FullscreenViewer';
import { fileSystemManager, extractPositivePrompt, fileToBase64 } from '../utils/fileUtils';
import { useSettings } from '../contexts/SettingsContext';
import { GoogleGenAI } from '@google/genai';
import LoadingSpinner from './LoadingSpinner';

interface ItemDetailViewProps {
  items: GalleryItem[];
  currentIndex: number;
  isPinned: boolean;
  categories: GalleryCategory[];
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<GalleryItem>) => void;
  onDelete: (item: GalleryItem) => void;
  onTogglePin: (id: string) => void;
  onNavigate: (index: number) => void;
  showGlobalFeedback: (message: string, isError?: boolean) => void;
}

const InfoRow: React.FC<{ label: string, children: React.ReactNode }> = ({ label, children }) => (
    <div>
        <h4 className="text-[10px] font-black text-base-content/40 uppercase tracking-widest mb-1">{label}</h4>
        {children}
    </div>
);

const Thumbnail: React.FC<{ url: string; type: 'image' | 'video', onClick: () => void, isActive: boolean }> = ({ url, type, onClick, isActive }) => {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);

    useEffect(() => {
        let objectUrl: string | null = null;
        const loadMedia = async () => {
            if (url.startsWith('data:')) {
                setBlobUrl(url);
                return;
            }
            const blob = await fileSystemManager.getFileAsBlob(url);
            if (blob) {
                objectUrl = URL.createObjectURL(blob);
                setBlobUrl(objectUrl);
            }
        };
        loadMedia();
        return () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [url]);

    if (!blobUrl) {
        return <div className={`relative group aspect-square rounded-none overflow-hidden bg-base-200 animate-pulse`}></div>;
    }

    return (
        <button
            onClick={onClick}
            className={`relative group aspect-square rounded-none overflow-hidden transition-all duration-200 focus:outline-none ring-2 ${isActive ? 'ring-primary' : 'ring-transparent hover:ring-primary/70'}`}
            aria-label={`View sample`}
        >
            {type === 'video' ? (
                <video src={blobUrl} className="w-full h-full object-cover bg-base-200 pointer-events-none" />
            ) : (
                <img src={blobUrl} alt={`Thumbnail`} className="w-full h-full object-cover bg-base-200 pointer-events-none" />
            )}
            {isActive && (
                <div className="absolute inset-0 bg-primary/20 border border-primary"></div>
            )}
        </button>
    );
};

const Media: React.FC<{
    url: string | null;
    type: 'image' | 'video';
    title: string;
    onClick: (e: React.MouseEvent) => void;
}> = React.memo(({ url, type, title, onClick }) => {
    const [displayUrl, setDisplayUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const objectUrlRef = useRef<string|null>(null);

    useEffect(() => {
        const loadMedia = async () => {
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
                objectUrlRef.current = null;
            }
            
            if (!url) { setIsLoading(false); setHasError(true); return; }

            setIsLoading(true);
            setHasError(false);
            
            if (url.startsWith('data:') || url.startsWith('http') || url.startsWith('blob:')) {
                setDisplayUrl(url);
                setIsLoading(false);
                return;
            }

            try {
                const blob = await fileSystemManager.getFileAsBlob(url);
                if (blob) {
                    const newUrl = URL.createObjectURL(blob);
                    objectUrlRef.current = newUrl;
                    setDisplayUrl(newUrl);
                } else {
                    setHasError(true);
                }
            } catch {
                 setHasError(true);
            } finally {
                 setIsLoading(false);
            }
        };

        loadMedia();
    }, [url]);

    useEffect(() => {
        return () => {
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
            }
        }
    }, []);

    if (isLoading) {
        return <div className="w-full h-full flex items-center justify-center bg-base-200"><LoadingSpinner size={48} /></div>;
    }
    if (hasError || !displayUrl) {
        return <div className="text-center opacity-20"><PhotoIcon className="w-24 h-24 mx-auto"/><p className="mt-2 text-xs font-black uppercase">Loading Error</p></div>;
    }

    return type === 'video' ? (
        <video src={displayUrl} controls autoPlay loop onClick={onClick} className="max-w-full max-h-full object-contain shadow-2xl" />
    ) : (
        <img src={displayUrl} alt={title} onClick={onClick} className="max-w-full max-h-full object-contain shadow-2xl cursor-pointer" />
    );
});

const YoutubePublishModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    videoItem: GalleryItem;
    onPublished: (url: string) => void;
    showGlobalFeedback: (message: string, isError?: boolean) => void;
}> = ({ isOpen, onClose, videoItem, onPublished, showGlobalFeedback }) => {
    const { settings } = useSettings();
    const [title, setTitle] = useState(videoItem.title);
    const [description, setDescription] = useState('');
    const [isShorts, setIsShorts] = useState(true);
    const [privacy, setPrivacy] = useState<'public' | 'private' | 'unlisted'>('private');
    const [isPublishing, setIsPublishing] = useState(false);
    const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);

    useEffect(() => {
      if (isOpen) {
        setTitle(videoItem.title);
        setDescription('');
      }
    }, [isOpen, videoItem]);

    const handleGenerateDescription = async () => {
        if (!process.env.API_KEY) {
            showGlobalFeedback("System intelligence offline.", true);
            return;
        }
        setIsGeneratingDesc(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `Generate a high-conversion YouTube ${isShorts ? 'Shorts' : 'video'} description for this artifact: ${videoItem.prompt || videoItem.title}. Include relevant hashtags. Use concise, technical, and artistic language. Plain text only.`,
            });
            setDescription(response.text || '');
        } catch (error) {
            showGlobalFeedback("AI description generation failure.", true);
        } finally {
            setIsGeneratingDesc(false);
        }
    };

    const handlePublish = async () => {
        const accessToken = settings.youtube?.accessToken;
        if (!accessToken) {
            showGlobalFeedback("Authorization missing. Cycle access in Settings.", true);
            return;
        }

        setIsPublishing(true);
        try {
            const videoBlob = await fileSystemManager.getFileAsBlob(videoItem.urls[0]);
            if (!videoBlob) throw new Error("Source artifact missing from vault.");

            const metadata = {
                snippet: {
                    title: title,
                    description: description,
                    categoryId: '22', // People & Blogs
                },
                status: {
                    privacyStatus: privacy,
                    selfDeclaredMadeForKids: false,
                }
            };

            const boundary = '-------314159265358979323846';
            const delimiter = "\r\n--" + boundary + "\r\n";
            const close_delim = "\r\n--" + boundary + "--";

            const reader = new FileReader();
            reader.readAsArrayBuffer(videoBlob);
            
            await new Promise((resolve, reject) => {
                reader.onload = async () => {
                    try {
                        const encoder = new TextEncoder();
                        const header = encoder.encode(delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + delimiter);
                        const mime = encoder.encode('Content-Type: ' + videoBlob.type + '\r\n\r\n');
                        const data = new Uint8Array(reader.result as ArrayBuffer);
                        const footer = encoder.encode(close_delim);

                        const body = new Blob([header, mime, data, footer], { type: `multipart/related; boundary=${boundary}` });

                        const response = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                            },
                            body: body
                        });

                        const result = await response.json();
                        if (result.error) {
                          if (result.error.code === 401) {
                            throw new Error("Token expired. Refresh integration in Settings.");
                          }
                          throw new Error(result.error.message);
                        }

                        const videoUrl = `https://www.youtube.com/watch?v=${result.id}`;
                        showGlobalFeedback(`Artifact successfully archived on YouTube!`);
                        onPublished(videoUrl);
                        onClose();
                        resolve(null);
                    } catch (e) {
                        reject(e);
                    }
                };
                reader.onerror = () => reject(new Error("Local file stream disrupted."));
            });

        } catch (error: any) {
            showGlobalFeedback(`Archival failure: ${error.message}`, true);
        } finally {
            setIsPublishing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-base-100 rounded-none border border-base-300 shadow-2xl w-full max-w-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <header className="p-8 border-b border-base-300 bg-base-200/20 relative">
                    <button onClick={onClose} className="absolute top-6 right-6 btn btn-ghost btn-sm btn-square opacity-40 hover:opacity-100">
                        <CloseIcon className="w-6 h-6" />
                    </button>
                    <h3 className="text-2xl font-black tracking-tighter text-base-content leading-none uppercase">PUBLISH ARTIFACT</h3>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/40 mt-2">ACCOUNT: {settings.youtube?.channelName}</p>
                </header>

                <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40 mb-2">Video Identity</label>
                        <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="input input-bordered rounded-none font-bold tracking-tight uppercase" />
                    </div>

                    <div className="form-control">
                        <div className="flex justify-between items-end mb-2">
                             <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40">Descriptive Metadata</label>
                             <button onClick={handleGenerateDescription} disabled={isGeneratingDesc} className="btn btn-xs btn-ghost text-primary font-black uppercase tracking-widest rounded-none">
                                {isGeneratingDesc ? <LoadingSpinner size={16} /> : <SparklesIcon className="w-3.5 h-3.5 mr-1.5"/>}
                                AI ARCHIVE
                             </button>
                        </div>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} className="textarea textarea-bordered rounded-none font-medium h-32 leading-relaxed text-sm" placeholder="Provide context for the archive..."></textarea>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40 mb-2">Artifact Format</label>
                            <div className="join w-full">
                                <button onClick={() => setIsShorts(true)} className={`join-item btn btn-xs flex-1 rounded-none font-black text-[9px] ${isShorts ? 'btn-primary' : ''}`}>SHORTS</button>
                                <button onClick={() => setIsShorts(false)} className={`join-item btn btn-xs flex-1 rounded-none font-black text-[9px] ${!isShorts ? 'btn-primary' : ''}`}>STANDARD</button>
                            </div>
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40 mb-2">Visibility State</label>
                            <select value={privacy} onChange={e => setPrivacy(e.target.value as any)} className="select select-bordered select-sm rounded-none font-bold uppercase text-[10px] tracking-widest">
                                <option value="private">PRIVATE</option>
                                <option value="unlisted">UNLISTED</option>
                                <option value="public">PUBLIC</option>
                            </select>
                        </div>
                    </div>
                </div>

                <footer className="border-t border-base-300 flex bg-base-200/5 p-0 overflow-hidden flex-shrink-0">
                    <button onClick={onClose} disabled={isPublishing} className="btn flex-1 rounded-none uppercase font-black text-[10px] tracking-widest border-r border-base-300 transition-colors">Abort</button>
                    <button onClick={handlePublish} disabled={isPublishing || !title.trim()} className="btn btn-primary flex-1 rounded-none uppercase font-black text-[10px] tracking-widest shadow-lg transition-colors">
                        {isPublishing ? 'STREAMING...' : 'CONFIRM PUBLISH'}
                    </button>
                </footer>
            </div>
        </div>
    );
};


const ItemDetailView: React.FC<ItemDetailViewProps> = ({ items, currentIndex, isPinned, categories, onClose, onUpdate, onDelete, onTogglePin, onNavigate, showGlobalFeedback }) => {
  const item = useMemo(() => items[currentIndex], [items, currentIndex]);
  const { settings } = useSettings();
  
  const [isEditing, setIsEditing] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isYoutubeModalOpen, setIsYoutubeModalOpen] = useState(false);

  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes || '');
  const [prompt, setPrompt] = useState(item.prompt || '');
  const [categoryId, setCategoryId] = useState(item.categoryId || '');
  const [tags, setTags] = useState<string[]>(item.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>(item.urls || []);
  const newFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (item) {
        setTitle(item.title);
        setNotes(item.notes || '');
        setPrompt(item.prompt || '');
        setCategoryId(item.categoryId || '');
        setTags(item.tags || []);
        setImageUrls(item.urls || []);
        setActiveImageIndex(0);
        setIsEditing(false);
    }
  }, [item]);
  
  const displayPrompt = useMemo(() => {
    const rawPrompt = (item.prompt || '').trim();
    if (!rawPrompt) return 'No prompt archived.';

    try {
        const parsed = JSON.parse(rawPrompt);
        if (parsed && typeof parsed === 'object') {
            if (typeof parsed.prompt === 'string' && parsed.prompt.trim()) return parsed.prompt.trim();
            if (Array.isArray(parsed.all_prompts) && typeof parsed.all_prompts[0] === 'string' && parsed.all_prompts[0].trim()) return parsed.all_prompts[0].trim();
        }
    } catch (e) {}
    
    const parameterKeywords = ['Negative prompt:', 'Steps:', 'Sampler:', 'CFG scale:', 'Seed:'];
    let firstParamIndex = -1;
    for (const keyword of parameterKeywords) {
        const regex = new RegExp(`^\\s*${keyword.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1")}`, 'im');
        const match = rawPrompt.match(regex);
        if (match && typeof match.index === 'number') {
            if (firstParamIndex === -1 || match.index < firstParamIndex) firstParamIndex = match.index;
        }
    }
    if (firstParamIndex > 0) { 
        const positivePrompt = rawPrompt.substring(0, firstParamIndex).trim();
        if (positivePrompt) return positivePrompt;
    }
    return rawPrompt;
  }, [item.prompt]);

  const handlePostNavigation = useCallback((direction: 'next' | 'prev') => {
    const newIndex = direction === 'next'
      ? (currentIndex + 1) % items.length
      : (currentIndex - 1 + items.length) % items.length;
    onNavigate(newIndex);
  }, [currentIndex, items.length, onNavigate]);

  const handleImageNavigation = useCallback((direction: 'next' | 'prev') => {
    const newIndex = direction === 'next'
        ? (activeImageIndex + 1) % imageUrls.length
        : (activeImageIndex - 1 + imageUrls.length) % imageUrls.length;
    setActiveImageIndex(newIndex);
  }, [activeImageIndex, imageUrls.length]);


  useEffect(() => {
    if (isViewerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e as any).key === 'Escape') onClose();
        const target = e.target as HTMLElement;
        if (target && ['TEXTAREA', 'INPUT'].includes((target as any).tagName)) return;
        if ((e as any).key === 'ArrowRight') handleImageNavigation('next');
        if ((e as any).key === 'ArrowLeft') handleImageNavigation('prev');
    };
    if(typeof window !== 'undefined') {
        (window as any).document.addEventListener('keydown', handleKeyDown);
        return () => (window as any).document.removeEventListener('keydown', handleKeyDown);
    }
  }, [onClose, isViewerOpen, handleImageNavigation]);

  const handleSave = () => {
    onUpdate(item.id, { title, notes, prompt, categoryId: categoryId || undefined, tags, urls: imageUrls });
    setIsEditing(false);
  };
  
  const handleCancel = () => {
      setTitle(item.title);
      setNotes(item.notes || '');
      setPrompt(item.prompt || '');
      setCategoryId(item.categoryId || '');
      setTags(item.tags || []);
      setImageUrls(item.urls || []);
      setIsEditing(false);
  };
  
  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const newTag = tagInput.trim();
        if (newTag && !tags.includes(newTag)) setTags([...tags, newTag]);
        setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => setTags(tags.filter(tag => tag !== tagToRemove));
  const handleRemoveImage = (index: number) => setImageUrls(prev => prev.filter((_, i) => i !== index));

  const handleAddImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = (e.currentTarget as any).files;
    if (!files) return;
    const filesArray = Array.from(files);
    const base64Urls = await Promise.all(filesArray.map(file => fileToBase64(file as Blob)));
    setImageUrls(prev => [...prev, ...base64Urls]);
  };
  
  const handleMetadataExtract = async (index: number) => {
      const url = imageUrls[index];
      try {
          const blob = url.startsWith('data:') 
              ? await (await fetch(url)).blob()
              : await fileSystemManager.getFileAsBlob(url);
          if (blob) {
              const extractedPrompt = await extractPositivePrompt(blob);
              if (extractedPrompt) {
                  setPrompt(extractedPrompt);
                  showGlobalFeedback('Tokens extracted.');
              } else showGlobalFeedback('Archival metadata null.', true);
          } else showGlobalFeedback('Relic unreadable.', true);
      } catch (error) {
          showGlobalFeedback('Extraction failure.', true);
      }
  };

  const handlePublishClick = () => {
    if (!settings.youtube?.isConnected) {
        showGlobalFeedback("System identity unauthorized. Link in Settings.", true);
        return;
    }
    setIsYoutubeModalOpen(true);
  };

  const handleOnPublished = (url: string) => {
    onUpdate(item.id, { youtubeUrl: url, publishedAt: Date.now() });
  };

  if (!item) return null;

  return (
    <>
      <div className="absolute inset-0 bg-base-300 z-50 flex flex-col lg:flex-row animate-fade-in overflow-hidden">
        <main className="flex-1 flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="relative flex-grow flex items-center justify-center min-h-0 group bg-black/50" onClick={onClose}>
                <Media 
                    url={imageUrls[activeImageIndex] || null} 
                    type={item.type} 
                    title={title} 
                    onClick={(e) => { e.stopPropagation(); setIsViewerOpen(true); }}
                />
                 {imageUrls.length > 1 && (
                    <>
                        <button onClick={(e) => { e.stopPropagation(); handleImageNavigation('prev'); }} className="absolute left-6 top-1/2 -translate-y-1/2 p-3 bg-black/40 hover:bg-black/80 text-white rounded-none transition-opacity opacity-0 group-hover:opacity-100 z-20"><ChevronLeftIcon className="w-8 h-8"/></button>
                        <button onClick={(e) => { e.stopPropagation(); handleImageNavigation('next'); }} className="absolute right-6 top-1/2 -translate-y-1/2 p-3 bg-black/40 hover:bg-black/80 text-white rounded-none transition-opacity opacity-0 group-hover:opacity-100 z-20"><ChevronRightIcon className="w-8 h-8"/></button>
                    </>
                )}
                 <div className="absolute top-6 right-6 z-20 flex items-center">
                    <div className="join bg-black/40 backdrop-blur-md border border-white/10">
                        <button onClick={(e) => { e.stopPropagation(); handlePostNavigation('prev'); }} className="btn btn-sm btn-ghost join-item text-white"><ChevronLeftIcon className="w-4 h-4" /></button>
                        <span className="join-item flex items-center px-6 font-mono text-[10px] font-black text-white uppercase tracking-widest border-x border-white/10">{currentIndex + 1} / {items.length}</span>
                        <button onClick={(e) => { e.stopPropagation(); handlePostNavigation('next'); }} className="btn btn-sm btn-ghost join-item text-white"><ChevronRightIcon className="w-4 h-4" /></button>
                    </div>
                </div>
            </div>
        </main>
        
        <aside className="w-full lg:w-96 bg-base-100 flex-shrink-0 flex flex-col border-l border-base-300" onClick={(e) => e.stopPropagation()}>
            <header className="px-4 h-16 flex justify-between items-center border-b border-base-300 flex-shrink-0 bg-base-200/20">
                <button onClick={() => onTogglePin(item.id)} className={`btn btn-sm btn-ghost btn-square rounded-none ${isPinned ? 'text-primary' : 'opacity-20'}`} title="Pin Artifact">
                    <ThumbTackIcon className="w-5 h-5"/>
                </button>
                <button onClick={onClose} className="btn btn-sm btn-ghost btn-square rounded-none opacity-40 hover:opacity-100 ml-4" title="Close"><CloseIcon className="w-6 h-6"/></button>
            </header>

            <div className="p-6 space-y-8 overflow-y-auto flex-grow custom-scrollbar">
                <InfoRow label="Artifact Identity">
                    {isEditing ? <input type="text" value={title} onChange={e => setTitle((e.currentTarget as any).value)} className="input input-bordered input-sm w-full font-bold uppercase rounded-none"/> : <p className="font-black text-2xl tracking-tighter uppercase leading-none">{title}</p>}
                </InfoRow>

                {imageUrls.length > 0 && (
                    <InfoRow label={`Samples Archive (${activeImageIndex + 1}/${imageUrls.length})`}>
                        <div className="grid grid-cols-4 gap-px bg-base-300 border border-base-300">
                            {imageUrls.map((url, index) => (
                               <div key={`${item.id}-${index}`} className="relative group aspect-square bg-base-100">
                                    <Thumbnail url={url} type={item.type} onClick={() => setActiveImageIndex(index)} isActive={index === activeImageIndex} />
                                    {isEditing && (
                                        <button onClick={() => handleRemoveImage(index)} className="btn btn-xs btn-square btn-error absolute top-1 right-1 opacity-0 group-hover:opacity-100">✕</button>
                                    )}
                               </div>
                            ))}
                             {isEditing && (
                                <button onClick={() => (newFileInputRef.current as any)?.click()} className="aspect-square bg-base-200 flex items-center justify-center text-base-content/20 hover:text-primary transition-colors">
                                    <UploadIcon className="w-6 h-6"/>
                                </button>
                            )}
                        </div>
                    </InfoRow>
                )}

                {item.youtubeUrl && (
                    <InfoRow label="Platform Publication">
                        <div className="p-4 bg-error/10 border border-error/20 flex flex-col gap-2 group/pub">
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] font-black uppercase text-error tracking-widest flex items-center gap-1.5"><PlayIcon className="w-3 h-3 fill-current"/> LIVE ON YOUTUBE</span>
                                <a href={item.youtubeUrl} target="_blank" rel="noopener noreferrer" className="text-[9px] font-black uppercase underline hover:text-error">VIEW ARCHIVE</a>
                            </div>
                            <span className="text-[8px] font-mono text-error/40 uppercase">TIMESTAMP: {new Date(item.publishedAt || 0).toLocaleString()}</span>
                        </div>
                    </InfoRow>
                )}

                <InfoRow label="Vault Notes">
                    {isEditing ? <textarea value={notes} onChange={e => setNotes((e.currentTarget as any).value)} className="textarea textarea-bordered rounded-none w-full h-32 leading-relaxed" placeholder="Archive documentation..."></textarea> : <p className="text-sm font-medium leading-relaxed text-base-content/70 whitespace-pre-wrap italic">"{notes || 'No description archived.'}"</p>}
                </InfoRow>

                 <InfoRow label="Registry Folder">
                    {isEditing ? (
                        <select value={categoryId} onChange={e => setCategoryId((e.currentTarget as any).value)} className="select select-bordered select-sm rounded-none w-full font-bold uppercase text-[10px] tracking-widest">
                            <option value="">General Archive</option>
                            {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                        </select>
                    ) : <p className="font-black uppercase text-[10px] tracking-widest text-primary/40">{categories.find(c => c.id === categoryId)?.name || 'General Archive'}</p>}
                </InfoRow>

                <InfoRow label="Neural Blueprint">
                    {isEditing ? (
                        <div className="space-y-2">
                            <textarea value={prompt} onChange={e => setPrompt((e.currentTarget as any).value)} className="textarea textarea-bordered rounded-none w-full font-mono text-[10px] h-32 leading-relaxed" placeholder="Formula input..."></textarea>
                            <button onClick={() => handleMetadataExtract(activeImageIndex)} className="btn btn-xs btn-ghost w-full border border-base-300 rounded-none uppercase font-black text-[9px] tracking-widest">Refresh Blueprint</button>
                        </div>
                    ) : <p className="text-sm font-medium leading-relaxed text-base-content/60 break-words italic">"{displayPrompt}"</p>}
                </InfoRow>
            </div>

            <footer className="border-t border-base-300 flex bg-base-200/5 p-0 overflow-hidden flex-shrink-0">
                 <button onClick={() => onDelete(item)} className="btn flex-none w-16 h-full flex items-center justify-center text-error/20 hover:text-error hover:bg-error/5 border-r border-base-300 transition-colors" title="Purge Sequence">
                        <DeleteIcon className="w-5 h-5"/>
                </button>
                <div className="flex-1 flex h-full">
                    {isEditing ? (
                        <>
                            <button onClick={handleCancel} className="btn flex-1 rounded-none uppercase font-black text-[10px] tracking-widest hover:bg-base-200 border-r border-base-300 transition-colors">Abort</button>
                            <button onClick={handleSave} className="btn btn-primary flex-1 rounded-none uppercase font-black text-[10px] tracking-widest shadow-lg transition-colors">Commit</button>
                        </>
                    ) : (
                        <>
                             {item.type === 'video' && !item.youtubeUrl && (
                                <button onClick={handlePublishClick} className="btn flex-1 rounded-none text-primary font-black uppercase text-[10px] tracking-widest hover:bg-primary/10 border-r border-base-300 transition-colors">
                                    <PlayIcon className="w-3.5 h-3.5 mr-2 inline-block"/> ARCHIVE
                                </button>
                            )}
                            <button onClick={() => setIsEditing(true)} className="btn btn-secondary flex-1 rounded-none text-secondary-content uppercase font-black text-[10px] tracking-widest transition-colors hover:brightness-110">
                                <EditIcon className="w-3.5 h-3.5 mr-2 inline-block"/> Modify
                            </button>
                        </>
                    )}
                </div>
            </footer>
             <input type="file" ref={newFileInputRef} multiple accept="image/*,video/*" onChange={handleAddImages} className="hidden" />
        </aside>
      </div>
      {isViewerOpen && <FullscreenViewer items={items} currentIndex={currentIndex} initialImageIndex={activeImageIndex} onClose={() => setIsViewerOpen(false)} />}
      <YoutubePublishModal isOpen={isYoutubeModalOpen} onClose={() => setIsYoutubeModalOpen(false)} videoItem={item} onPublished={handleOnPublished} showGlobalFeedback={showGlobalFeedback} />
    </>
  );
};
export default ItemDetailView;