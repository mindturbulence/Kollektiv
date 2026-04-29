
import React from 'react';
import type { CheatsheetItem } from '../types';
import { ChevronRightIcon } from './icons';
import ImageSlider from './ImageSlider';

interface ArtstyleCardProps {
  item: CheatsheetItem;
  onInject: (item: CheatsheetItem) => void;
}

const ArtstyleCard: React.FC<ArtstyleCardProps> = ({ item, onInject }) => {
  return (
    <>
      <div className="flex flex-col group bg-transparent transition-all duration-500 hover:bg-base-200/50 h-full border-b border-base-300 last:border-b-0">
        <figure className="relative w-full aspect-[4/3] bg-transparent overflow-hidden border-b border-base-300 flex-shrink-0">
          <div className="w-full h-full transition-transform duration-[3000ms] ease-[cubic-bezier(0.65,0,0.35,1)] group-hover:scale-110 will-change-transform">
            <ImageSlider imageUrls={item.imageUrls} name={item.name} />
          </div>
          <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
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
    </>
  );
};

export default ArtstyleCard;
