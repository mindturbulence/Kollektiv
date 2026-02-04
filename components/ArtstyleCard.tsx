
import React, { useState } from 'react';
import type { CheatsheetItem } from '../types';
import { PhotoIcon, ChevronRightIcon } from './icons';
import ImageSlider from './ImageSlider';
import { ImageManagementModal } from './ImageManagementModal';

interface ArtstyleCardProps {
  item: CheatsheetItem;
  onUpdateImages: (newImageUrls: string[]) => void;
  onInject: (item: CheatsheetItem) => void;
}

const ArtstyleCard: React.FC<ArtstyleCardProps> = ({ item, onUpdateImages, onInject }) => {
    const [isManageModalOpen, setIsManageModalOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col group bg-base-100 transition-all duration-500 hover:bg-base-200/50 h-full border-b border-base-300 last:border-b-0">
        <figure className="relative w-full aspect-[4/3] bg-base-300 overflow-hidden border-b border-base-300 flex-shrink-0">
          <ImageSlider imageUrls={item.imageUrls} name={item.name} />
          <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
          <button
            onClick={(e) => { e.stopPropagation(); setIsManageModalOpen(true); }}
            className="absolute top-4 right-4 z-10 p-2 bg-black/60 hover:bg-primary rounded-none text-white backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
            title={`Manage artifacts for ${item.name}`}
          >
            <PhotoIcon className="w-4 h-4"/>
          </button>
        </figure>
        
        <div className="p-8 flex flex-col justify-between flex-grow overflow-hidden">
            <div className="min-h-0">
                <div className="flex items-center gap-3 mb-2">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60">Aesthetic ID</span>
                    <span className="text-[9px] font-mono text-base-content/20 truncate uppercase">SAMPLES: {item.imageUrls.length}</span>
                </div>
                <h2 className="text-2xl font-black tracking-tighter text-base-content leading-tight mb-3 group-hover:text-primary transition-colors truncate" title={item.name}>
                    {item.name}
                </h2>
                {item.description && (
                    <p className="text-xs font-medium leading-relaxed text-base-content/40 italic line-clamp-2">
                        "{item.description}"
                    </p>
                )}
            </div>
            
            <button 
                onClick={(e) => { e.stopPropagation(); onInject(item); }}
                className="mt-6 pt-6 border-t border-base-300 flex justify-between items-center opacity-40 group-hover:opacity-100 transition-all w-full text-left"
            >
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Inject Token</span>
                <ChevronRightIcon className="w-4 h-4 text-primary" />
            </button>
        </div>
      </div>

      <ImageManagementModal 
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
        item={item}
        onSave={onUpdateImages}
      />
    </>
  );
};

export default ArtstyleCard;
