
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { GalleryItem } from '../types';
import { EllipsisVerticalIcon, EditIcon, DeleteIcon, ThumbTackIcon, PhotoIcon } from './icons';
import { fileSystemManager } from '../utils/fileUtils';

interface ImageListItemProps {
  item: GalleryItem;
  onOpenDetailView: () => void;
  onDeleteItem: (item: GalleryItem) => void;
  onTogglePin: (id: string) => void;
  isPinned: boolean;
}

const ImageListItem: React.FC<ImageListItemProps> = ({ item, onOpenDetailView, onDeleteItem, onTogglePin, isPinned }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mediaBlobUrl, setMediaBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let objectUrl: string | null = null;
    const loadMedia = async () => {
        setIsLoading(true);
        if (item.urls[0]) {
            const blob = await fileSystemManager.getFileAsBlob(item.urls[0]);
            if(blob) {
                objectUrl = URL.createObjectURL(blob);
                setMediaBlobUrl(objectUrl);
            }
        }
        setIsLoading(false);
    };
    loadMedia();
    return () => {
        if(objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }, [item.urls]);


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !(menuRef.current as any).contains(event.target as any)) {
        setIsMenuOpen(false);
      }
    };
    if (typeof (window as any).document !== 'undefined') {
        (window as any).document.addEventListener('mousedown', handleClickOutside);
        return () => (window as any).document.removeEventListener('mousedown', handleClickOutside);
    }
  }, []);

  return (
    <div className="w-full bg-base-100 rounded-lg flex items-center justify-between gap-4 p-3 transition-colors hover:bg-base-200">
      <div onClick={onOpenDetailView} className="flex items-center gap-4 flex-grow min-w-0 cursor-pointer">
        <div 
          className="relative w-20 h-20 bg-base-300 rounded-md flex-shrink-0 overflow-hidden flex items-center justify-center"
        >
          {isLoading ? (
             <div className="w-full h-full animate-pulse bg-base-300"></div>
          ) : !mediaBlobUrl ? (
            <PhotoIcon className="w-8 h-8 text-base-content/40"/>
          ) : item.type === 'video' ? (
            <video 
              src={mediaBlobUrl} 
              className="w-full h-full object-cover"
              muted
              loop
              autoPlay
            />
          ) : (
            <img 
              src={mediaBlobUrl} 
              alt={item.title} 
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )}
          {item.isNsfw && <div className="badge badge-warning badge-xs absolute top-1 left-1 z-10" title="NSFW">NSFW</div>}
        </div>
        <div className="flex-grow min-w-0">
           <div className="flex items-center gap-2">
            {isPinned && <span title="Pinned"><ThumbTackIcon className="w-4 h-4 text-primary flex-shrink-0" /></span>}
            <h4 className="text-primary font-semibold truncate" title={item.title}>
              {item.title}
            </h4>
        </div>
          <p className="text-sm text-base-content/70">
            {item.urls.length} {item.type}${item.urls.length > 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="relative flex-shrink-0" ref={menuRef}>
        <button
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            setIsMenuOpen(!isMenuOpen);
          }}
          className="btn btn-sm btn-ghost btn-circle"
          title="More options"
        >
          <EllipsisVerticalIcon className="w-5 h-5" />
        </button>
        {isMenuOpen && (
          <div
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            className="absolute right-0 bottom-full mb-2 w-48 bg-base-200 backdrop-blur-sm rounded-md shadow-lg py-1 z-20 animate-fade-in-up menu menu-sm"
          >
            <li><a onClick={() => { onOpenDetailView(); setIsMenuOpen(false); }}><EditIcon className="w-4 h-4 mr-3" /> View & Edit</a></li>
            <li><a onClick={() => { onTogglePin(item.id); setIsMenuOpen(false); }}><ThumbTackIcon className="w-4 h-4 mr-3" /> {isPinned ? 'Unpin Item' : 'Pin Item'}</a></li>
            <div className="divider my-1"></div>
            <li><a onClick={() => { onDeleteItem(item); setIsMenuOpen(false); }} className="text-error"><DeleteIcon className="w-4 h-4 mr-3" /> Delete Item</a></li>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageListItem;
