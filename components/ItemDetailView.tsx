import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { GalleryItem, GalleryCategory } from '../types';
import { ChevronLeftIcon, EditIcon, DeleteIcon, CheckIcon, ThumbTackIcon, ChevronRightIcon, CloseIcon, PhotoIcon, UploadIcon, ChevronDownIcon } from './icons';
import FullscreenViewer from './FullscreenViewer';
import { fileSystemManager, extractPositivePrompt, fileToBase64 } from '../utils/fileUtils';

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
        <h4 className="text-xs font-semibold text-base-content/60 uppercase tracking-wider mb-1">{label}</h4>
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
        return <div className={`relative group aspect-square rounded-md overflow-hidden bg-base-200 animate-pulse`}></div>;
    }

    return (
        <button
            onClick={onClick}
            className={`relative group aspect-square rounded-md overflow-hidden transition-all duration-200 focus:outline-none ring-2 ${isActive ? 'ring-primary' : 'ring-transparent hover:ring-primary/70'}`}
            aria-label={`View item`}
        >
            {type === 'video' ? (
                <video src={blobUrl} className="w-full h-full object-cover bg-base-200 pointer-events-none" />
            ) : (
                <img src={blobUrl} alt={`Thumbnail`} className="w-full h-full object-cover bg-base-200 pointer-events-none" />
            )}
            {isActive && (
                <div className="absolute inset-0 bg-primary/30 border-2 border-primary"></div>
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
        // Cleanup on unmount
        return () => {
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
            }
        }
    }, []);

    if (isLoading) {
        return <div className="w-full h-full flex items-center justify-center bg-base-200 rounded-lg"><PhotoIcon className="w-24 h-24 text-base-content/20"/></div>;
    }
    if (hasError || !displayUrl) {
        return <div className="text-center"><PhotoIcon className="w-24 h-24 text-base-content/20"/><p className="mt-2 text-base-content/70">Could not load media.</p></div>;
    }

    return type === 'video' ? (
        <video src={displayUrl} controls autoPlay loop onClick={onClick} className="max-w-full max-h-full object-contain rounded-lg shadow-lg" />
    ) : (
        <img src={displayUrl} alt={title} onClick={onClick} className="max-w-full max-h-full object-contain rounded-lg shadow-lg cursor-pointer" />
    );
});


const ItemDetailView: React.FC<ItemDetailViewProps> = ({ items, currentIndex, isPinned, categories, onClose, onUpdate, onDelete, onTogglePin, onNavigate, showGlobalFeedback }) => {
  const item = useMemo(() => items[currentIndex], [items, currentIndex]);
  
  const [isEditing, setIsEditing] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // Editable fields state
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes || '');
  const [prompt, setPrompt] = useState(item.prompt || '');
  const [categoryId, setCategoryId] = useState(item.categoryId || '');
  const [tags, setTags] = useState<string[]>(item.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>(item.urls || []);
  const newFileInputRef = useRef<HTMLInputElement>(null);

  // Sync state when item changes
  useEffect(() => {
    if (item) {
        setTitle(item.title);
        setNotes(item.notes || '');
        setPrompt(item.prompt || '');
        setCategoryId(item.categoryId || '');
        setTags(item.tags || []);
        setImageUrls(item.urls || []);
        setActiveImageIndex(0); // Reset to first image on item change
        setIsEditing(false); // Cancel edits on navigation
    }
  }, [item]);
  
  const displayPrompt = useMemo(() => {
    const rawPrompt = (item.prompt || '').trim();
    if (!rawPrompt) return 'No prompt saved.';

    // Strategy 1: Attempt to parse as JSON (e.g., for Flux/Fooocus metadata)
    try {
        const parsed = JSON.parse(rawPrompt);
        if (parsed && typeof parsed === 'object') {
            // Prioritize the 'prompt' key as requested.
            if (typeof parsed.prompt === 'string' && parsed.prompt.trim()) {
                return parsed.prompt.trim();
            }
            // Fallback to 'all_prompts' if 'prompt' isn't there.
            if (Array.isArray(parsed.all_prompts) && typeof parsed.all_prompts[0] === 'string' && parsed.all_prompts[0].trim()) {
                return parsed.all_prompts[0].trim();
            }
        }
    } catch (e) {
        // Not a JSON object, so we fall through to text parsing.
    }
    
    // Strategy 2: Parse as plain text (e.g., for A1111 PNG info)
    // Find the end of the positive prompt by looking for parameter keywords.
    const parameterKeywords = [
        'Negative prompt:', 'Steps:', 'Sampler:', 'CFG scale:', 'Seed:', 'Size:', 
        'Model hash:', 'Model:', 'Variation seed:', 'Denoising strength:',
        'Clip skip:', 'ENSD:', 'Hires upscale:', 'Hires steps:', 'Hires sampler:'
    ];

    let firstParamIndex = -1;

    for (const keyword of parameterKeywords) {
        // Case-insensitive search, at the start of a line.
        const regex = new RegExp(`^\\s*${keyword.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1")}`, 'im');
        const match = rawPrompt.match(regex);
        
        if (match && typeof match.index === 'number') {
            if (firstParamIndex === -1 || match.index < firstParamIndex) {
                firstParamIndex = match.index;
            }
        }
    }

    if (firstParamIndex > 0) { // Must be > 0 to ensure there's text before it.
        const positivePrompt = rawPrompt.substring(0, firstParamIndex).trim();
        if (positivePrompt) {
            return positivePrompt;
        }
    }
    
    // Strategy 3: Fallback. If no keywords found, or if keywords are at the very beginning,
    // assume the whole thing is the prompt. This also handles cases where the logic above fails.
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
    // If the viewer is open, its own keydown handler should take precedence.
    if (isViewerOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e as any).key === 'Escape') onClose();
        // Prevent nav while editing text
        const target = e.target as HTMLElement;
        if (target && ['TEXTAREA', 'INPUT'].includes((target as any).tagName)) {
            return;
        }
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
        if (newTag && !tags.includes(newTag)) {
            setTags([...tags, newTag]);
        }
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
                  showGlobalFeedback('Successfully extracted prompt metadata!');
              } else {
                  showGlobalFeedback('No prompt metadata found in the image.', true);
              }
          } else {
              showGlobalFeedback('Could not read the image file.', true);
          }
      } catch (error) {
          console.error("Metadata extraction failed:", error);
          showGlobalFeedback('Failed to read or process the image.', true);
      }
  };

  if (!item) return null;

  return (
    <>
      <div className="absolute inset-0 bg-base-300 z-50 flex flex-col lg:flex-row animate-fade-in overflow-hidden">
        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Media Viewer */}
            <div className="relative flex-grow flex items-center justify-center min-h-0 group bg-black/40" onClick={onClose}>
                <Media 
                    url={imageUrls[activeImageIndex] || null} 
                    type={item.type} 
                    title={title} 
                    onClick={(e) => { e.stopPropagation(); setIsViewerOpen(true); }}
                />
                 {imageUrls.length > 1 && (
                    <>
                        <button onClick={(e) => { e.stopPropagation(); handleImageNavigation('prev'); }} className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-opacity opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-0 disabled:cursor-not-allowed z-20" aria-label="Previous image">
                            <ChevronLeftIcon className="w-6 h-6"/>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleImageNavigation('next'); }} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-opacity opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-0 disabled:cursor-not-allowed z-20" aria-label="Next image">
                            <ChevronRightIcon className="w-6 h-6"/>
                        </button>
                    </>
                )}
                 <div className="absolute top-4 right-4 z-20 flex items-center text-white [text-shadow:0_1px_3px_rgb(0_0_0_/_0.5)]">
                    <div className="join">
                        <button onClick={(e) => { e.stopPropagation(); handlePostNavigation('prev'); }} className="btn btn-sm btn-ghost join-item" title="Previous Post"><ChevronLeftIcon className="w-4 h-4" /></button>
                        <span className="join-item btn btn-sm btn-ghost pointer-events-none text-sm font-mono px-2">{currentIndex + 1} / {items.length}</span>
                        <button onClick={(e) => { e.stopPropagation(); handlePostNavigation('next'); }} className="btn btn-sm btn-ghost join-item" title="Next Post"><ChevronRightIcon className="w-4 h-4" /></button>
                    </div>
                </div>
            </div>
        </main>
        
        {/* Sidebar */}
        <aside className="w-full lg:w-96 bg-base-100 flex-shrink-0 flex flex-col border-l border-base-300" onClick={(e) => e.stopPropagation()}>
            <header className="p-4 flex justify-between items-center border-b border-base-300 flex-shrink-0">
                <button onClick={() => onTogglePin(item.id)} className={`btn btn-sm btn-ghost btn-square ${isPinned ? 'text-primary' : ''}`} title={isPinned ? "Unpin" : "Pin"}>
                    <ThumbTackIcon className="w-5 h-5"/>
                </button>
                <button onClick={onClose} className="btn btn-sm btn-ghost btn-square" title="Close"><CloseIcon className="w-5 h-5"/></button>
            </header>

            <div className="p-4 space-y-4 overflow-y-auto flex-grow">
                <InfoRow label="Title">
                    {isEditing ? <input type="text" value={title} onChange={e => setTitle((e.currentTarget as any).value)} className="input input-bordered input-sm w-full"/> : <p>{title}</p>}
                </InfoRow>

                {imageUrls.length > 0 && (
                    <InfoRow label={`Image Group (${activeImageIndex + 1} / ${imageUrls.length})`}>
                        <div className="grid grid-cols-4 gap-2">
                            {imageUrls.map((url, index) => (
                               <div key={`${item.id}-${index}`} className="relative group aspect-square">
                                    <Thumbnail url={url} type={item.type} onClick={() => setActiveImageIndex(index)} isActive={index === activeImageIndex} />
                                    {isEditing && (
                                        <button onClick={() => handleRemoveImage(index)} className="btn btn-xs btn-circle btn-error absolute -top-1 -right-1 opacity-0 group-hover:opacity-100"><CloseIcon className="w-3 h-3"/></button>
                                    )}
                               </div>
                            ))}
                             {isEditing && (
                                <button onClick={() => (newFileInputRef.current as any)?.click()} className="aspect-square border-2 border-dashed rounded-md flex items-center justify-center text-base-content/50 hover:border-primary">
                                    <UploadIcon className="w-6 h-6"/>
                                </button>
                            )}
                        </div>
                    </InfoRow>
                )}

                <InfoRow label="Notes">
                    {isEditing ? <textarea value={notes} onChange={e => setNotes((e.currentTarget as any).value)} className="textarea textarea-bordered textarea-sm w-full" rows={3}></textarea> : <p className="text-base-content/80 whitespace-pre-wrap">{notes || 'No notes.'}</p>}
                </InfoRow>
                 <InfoRow label="Category">
                    {isEditing ? (
                        <select value={categoryId} onChange={e => setCategoryId((e.currentTarget as any).value)} className="select select-bordered select-sm w-full">
                            <option value="">Uncategorized</option>
                            {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                        </select>
                    ) : <p>{categories.find(c => c.id === categoryId)?.name || 'Uncategorized'}</p>}
                </InfoRow>
                <InfoRow label="Tags">
                    {isEditing ? (
                         <div className="flex flex-wrap items-center gap-2 p-2 bg-base-200 rounded-md min-h-[40px]">
                            {tags.map(tag => (
                                <div key={tag} className="flex items-center gap-1 bg-primary text-primary-content text-xs font-semibold px-2 py-1 rounded-full">
                                    <span>{tag}</span>
                                    <button type="button" onClick={() => handleRemoveTag(tag)} className="text-primary-content/70 hover:text-primary-content font-bold">&times;</button>
                                </div>
                            ))}
                            <input type="text" value={tagInput} onChange={e => setTagInput((e.currentTarget as any).value)} onKeyDown={handleTagInputKeyDown} className="flex-grow bg-transparent outline-none text-sm" placeholder={tags.length === 0 ? "Add tags..." : ""}/>
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-2">{tags.length > 0 ? tags.map(tag => <div key={tag} className="badge badge-outline">{tag}</div>) : <p className="text-base-content/80">No tags.</p>}</div>
                    )}
                </InfoRow>
                <InfoRow label="Prompt">
                    {isEditing ? (
                        <div>
                            <textarea value={prompt} onChange={e => setPrompt((e.currentTarget as any).value)} className="textarea textarea-bordered textarea-sm w-full" rows={5}></textarea>
                            <button onClick={() => handleMetadataExtract(activeImageIndex)} className="btn btn-xs btn-ghost mt-1">Extract from image</button>
                        </div>
                    ) : <p className="text-base-content/80 whitespace-pre-wrap">{displayPrompt}</p>}
                </InfoRow>
            </div>
            <footer className="p-4 flex justify-between items-center border-t border-base-300 flex-shrink-0 mt-auto">
                 <button onClick={() => onDelete(item)} className="btn btn-sm btn-ghost text-error" title="Delete Item">
                        <DeleteIcon className="w-5 h-5"/>
                </button>
                <div className="flex items-center gap-2">
                    {isEditing ? (
                        <>
                            <button onClick={handleCancel} className="btn btn-sm btn-ghost">Cancel</button>
                            <button onClick={handleSave} className="btn btn-sm btn-primary">Save</button>
                        </>
                    ) : (
                        <button onClick={() => setIsEditing(true)} className="btn btn-sm btn-secondary"><EditIcon className="w-4 h-4 mr-2"/> Edit</button>
                    )}
                </div>
            </footer>
             <input type="file" ref={newFileInputRef} multiple accept="image/*,video/*" onChange={handleAddImages} className="hidden" />
        </aside>
      </div>
      {isViewerOpen && <FullscreenViewer items={items} currentIndex={currentIndex} initialImageIndex={activeImageIndex} onClose={() => setIsViewerOpen(false)} />}
    </>
  );
};
export default ItemDetailView;