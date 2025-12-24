
import React, { useState } from 'react';
import type { CheatsheetItem } from '../types';
import { PhotoIcon } from './icons';
import ImageSlider from './ImageSlider';
import { ImageManagementModal } from './ImageManagementModal';

interface ArtstyleCardProps {
  item: CheatsheetItem;
  onUpdateImages: (newImageUrls: string[]) => void;
}

const ArtstyleCard: React.FC<ArtstyleCardProps> = ({ item, onUpdateImages }) => {
    const [isManageModalOpen, setIsManageModalOpen] = useState(false);

  return (
    <>
      <div className="card bg-base-100 shadow-xl border border-base-300 overflow-hidden">
        <figure className="relative group">
          <ImageSlider imageUrls={item.imageUrls} name={item.name} />
          {item.imageUrls.length > 1 && (
            <div className="absolute top-2 left-2 z-10">
              <div className="badge badge-neutral badge-sm flex items-center gap-1 bg-black/60 border-none text-white/90" title={`${item.imageUrls.length} images`}>
                <PhotoIcon className="w-3 h-3"/>
                {item.imageUrls.length}
              </div>
            </div>
          )}
          <button
            onClick={() => setIsManageModalOpen(true)}
            className="absolute top-2 right-2 z-10 p-2 bg-black/60 hover:bg-primary rounded-full text-white backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
            title={`Manage images for ${item.name}`}
          >
            <PhotoIcon className="w-5 h-5"/>
          </button>
          <div className="absolute bottom-0 left-0 right-0 p-4 z-10 pointer-events-none bg-gradient-to-t from-black/80 to-transparent group-hover:from-black/90 transition-all duration-300 max-h-24 group-hover:max-h-full">
            <h2 className="text-primary-content font-semibold text-base truncate" title={item.name}>{item.name}</h2>
            {item.description && <p className="text-sm text-primary-content/80 mt-1 line-clamp-2 group-hover:line-clamp-none">{item.description}</p>}
          </div>
        </figure>
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
