
import React, { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { gsap } from 'gsap';
import type { CheatsheetCategory, CheatsheetItem } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { SearchIcon } from './icons';
import { fileSystemManager } from '../utils/fileUtils';
import LayeredCheatsheetDetail from './LayeredCheatsheetDetail';
import { audioService } from '../services/audioService';

const CATEGORY_PLACEHOLDER = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop";

interface CategoryCardProps {
    category: CheatsheetCategory;
    onClick: (cat: CheatsheetCategory, el: HTMLElement) => void;
    index: number;
}

const CategoryCard: React.FC<CategoryCardProps> = ({ 
    category, onClick, index
}) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const titleContainerRef = useRef<HTMLDivElement>(null);
    const bgContainerRef = useRef<HTMLDivElement>(null);
    const [currentImage, setCurrentImage] = useState<string | null>(null);
    const [hasEntered, setHasEntered] = useState(false);

    useEffect(() => {
        let active = true;
        const load = async () => {
            const itemWithImg = category.items.find(i => i.imageUrls && i.imageUrls.length > 0);
            const firstImg = itemWithImg?.imageUrls[0];
            const urlToLoad = category.backgroundImageUrl || firstImg;

            if (urlToLoad) {
                if (urlToLoad.startsWith('http') || urlToLoad.startsWith('data:')) {
                    setCurrentImage(urlToLoad);
                } else {
                    const blob = await fileSystemManager.getFileAsBlob(urlToLoad);
                    if (blob && active) setCurrentImage(URL.createObjectURL(blob));
                }
            } else {
                setCurrentImage(CATEGORY_PLACEHOLDER);
            }
        };
        load();
        return () => { active = false; };
    }, [category]);

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setHasEntered(true);
                observer.unobserve(entry.target);
            }
        }, { threshold: 0.05 });
        if (cardRef.current) observer.observe(cardRef.current);
        return () => observer.disconnect();
    }, []);

    useLayoutEffect(() => {
        if (hasEntered && titleContainerRef.current && bgContainerRef.current) {
            const tl = gsap.timeline({ defaults: { ease: "expo.out", duration: 1.4 } });
            tl.fromTo(bgContainerRef.current, { opacity: 0, scale: 1.2 }, { opacity: 1, scale: 1 }, 0);
            tl.fromTo(titleContainerRef.current, { y: 40, opacity: 0 }, { y: 0, opacity: 1 }, 0.2);
        }
    }, [hasEntered]);

    return (
        <div 
            ref={cardRef}
            onClick={() => cardRef.current && onClick(category, cardRef.current)}
            className="category-card flex-shrink-0 w-[300px] md:w-[380px] lg:w-[450px] h-full relative group cursor-pointer select-none flex flex-col overflow-hidden will-change-transform"
        >
            <div ref={bgContainerRef} className="absolute inset-0 z-0 bg-transparent overflow-hidden">
                {currentImage && (
                    <img 
                        src={currentImage} 
                        className="absolute inset-0 h-full w-full object-cover transition-all duration-[3000ms] group-hover:scale-110 grayscale opacity-30 group-hover:grayscale-0 group-hover:opacity-100" 
                        alt="" 
                    />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-base-100 via-base-100/80 to-transparent opacity-90 group-hover:opacity-60 transition-opacity duration-1000"></div>
            </div>

            <div className="relative z-10 flex h-full flex-col p-8 lg:p-10">
                <div className="flex items-center gap-4 mb-6 opacity-40 group-hover:opacity-100 transition-opacity duration-500">
                    <span className="text-[10px] font-mono font-black text-primary tracking-[0.3em] uppercase">
                        NODE_{String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="flex-grow h-px bg-primary/20"></div>
                </div>

                <div className="flex-grow flex flex-col justify-end overflow-hidden">
                    <div ref={titleContainerRef} className="w-full">
                        {/* REDUCED TITLE SIZE */}
                        <h3 className="text-xl md:text-2xl lg:text-3xl font-black tracking-tighter capitalize leading-[1] text-base-content break-words transition-colors duration-500 group-hover:text-primary">
                            {category.category.toLowerCase()}
                        </h3>
                        
                        <div className="grid transition-[grid-template-rows] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] grid-rows-[0fr] group-hover:grid-rows-[1fr]">
                            <div className="overflow-hidden">
                                <p className="pt-4 text-[9px] font-bold uppercase tracking-[0.25em] text-base-content/50 max-w-xs leading-relaxed transition-opacity duration-700 opacity-0 group-hover:opacity-100">
                                    {category.description || `Tactical deconstruction of ${category.category.toLowerCase()} artifact sets.`}
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 flex items-center gap-6 opacity-40 group-hover:opacity-100 transition-opacity duration-500">
                            <span className="text-[8px] font-black uppercase tracking-[0.3em] bg-primary/10 text-primary px-3 py-1.5 border border-primary/20 backdrop-blur-md">
                                {category.items.length} ENTRIES
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            <div className="selection-overlay absolute inset-0 bg-primary/20 opacity-0 pointer-events-none z-20"></div>
            <div className="absolute bottom-0 left-0 h-1 bg-primary transition-all duration-1000 ease-in-out w-0 group-hover:w-full"></div>
        </div>
    );
};

interface GenericCheatsheetPageProps {
  title: string;
  subtitle?: string;
  heroText: string;
  loadDataFn: () => Promise<CheatsheetCategory[]>;
  updateDataFn: (itemId: string, updates: Partial<CheatsheetItem>) => Promise<CheatsheetCategory[]>;
  onSendToPromptsPage?: (item: CheatsheetItem, category: string) => void;
}

export const GenericCheatsheetPage: React.FC<GenericCheatsheetPageProps> = ({
  title, heroText, subtitle, loadDataFn, updateDataFn, onSendToPromptsPage
}) => {
  const [data, setData] = useState<CheatsheetCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<CheatsheetCategory | null>(null);
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isTransitioning, setIsTransitioning] = useState(false);

  const scrollWrapperRef = useRef<HTMLDivElement>(null);
  const scrollTargetX = useRef(0);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const loadedData = await loadDataFn();
        setData(loadedData);
      } catch (e) { console.error(e); } finally { setIsLoading(false); }
    };
    fetchData();
  }, [loadDataFn]);

  // GSAP Smooth Scroll Mapping
  useEffect(() => {
    if (isLoading || activeCategory || !scrollWrapperRef.current) return;
    
    const wrapper = scrollWrapperRef.current;
    scrollTargetX.current = wrapper.scrollLeft;

    const handleWheel = (e: WheelEvent) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            e.preventDefault();
            const maxScroll = wrapper.scrollWidth - wrapper.clientWidth;
            scrollTargetX.current = Math.max(0, Math.min(maxScroll, scrollTargetX.current + e.deltaY * 2.5));
            
            gsap.to(wrapper, {
                scrollLeft: scrollTargetX.current,
                duration: 0.8,
                ease: "power3.out",
                overwrite: 'auto'
            });
        } else {
            scrollTargetX.current = wrapper.scrollLeft;
        }
    };

    wrapper.addEventListener('wheel', handleWheel, { passive: false });
    return () => wrapper.removeEventListener('wheel', handleWheel);
  }, [isLoading, activeCategory, data]);

  const handleCategoryClick = (cat: CheatsheetCategory, cardEl: HTMLElement) => {
      if (isTransitioning) return;
      setIsTransitioning(true);
      audioService.playClick();

      const allCards = gsap.utils.toArray('.category-card');
      const otherCards = allCards.filter(c => c !== cardEl);
      const selectionOverlay = cardEl.querySelector('.selection-overlay');

      const tl = gsap.timeline({
          onComplete: () => {
              setActiveCategory(cat);
              if (cat.items.length > 0) {
                  setActiveItemIndex(0);
              }
              setIsTransitioning(false);
          }
      });

      // Stage 1: Card Selection Feedback (Complete this first)
      tl.to(cardEl, {
          scale: 0.98,
          duration: 0.2,
          ease: "power2.inOut"
      });
      
      tl.to(selectionOverlay, {
          opacity: 1,
          duration: 0.2,
          ease: "power2.out"
      }, 0);

      // Stage 2: Page Transition (Staggered Exit)
      tl.to(otherCards, {
          y: 60,
          opacity: 0,
          stagger: {
              amount: 0.3,
              from: allCards.indexOf(cardEl)
          },
          duration: 0.5,
          ease: "power3.in"
      }, "+=0.1");

      tl.to(cardEl, {
          y: -20,
          opacity: 0,
          duration: 0.4,
          ease: "power3.in"
      }, "-=0.3");
  };

  const handleUpdateItem = async (itemId: string, updates: Partial<CheatsheetItem>) => {
      const updatedData = await updateDataFn(itemId, updates);
      setData(updatedData);
      if (activeCategory) {
          const newActive = updatedData.find(c => c.category === activeCategory.category);
          if (newActive) setActiveCategory(newActive);
      }
  };

  const handleInject = (item: CheatsheetItem) => {
      onSendToPromptsPage?.(item, activeCategory?.category || '');
  };

  const filteredItems = useMemo(() => {
      if (!activeCategory) return [];
      if (!searchQuery.trim()) return activeCategory.items;
      const q = searchQuery.toLowerCase();
      return activeCategory.items.filter(i => 
          i.name.toLowerCase().includes(q) || 
          i.description?.toLowerCase().includes(q)
      );
  }, [activeCategory, searchQuery]);

  if (isLoading) {
    return <div className="h-full w-full flex items-center justify-center bg-transparent"><LoadingSpinner /></div>;
  }

  return (
    <>
    <section className="flex flex-col h-full bg-transparent w-full relative p-[3px] corner-frame overflow-visible">
      <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
      {!activeCategory ? (
        <>
            <header className="flex-shrink-0">
                <div className="p-10">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div className="space-y-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.6em] text-primary/60 block">{heroText} INDEX</span>
                            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-base-content leading-none uppercase">
                                {title}<span className="text-primary">.</span>
                            </h1>
                            <p className="text-[11px] font-bold text-base-content/30 uppercase tracking-[0.4em] leading-relaxed max-w-2xl mt-3">
                                {subtitle || "Systematic visual logic and aesthetic repositories."}
                            </p>
                        </div>
                        <div className="flex flex-col md:flex-row items-center gap-6">
                            <div className="relative w-full md:w-64">
                                <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-20 pointer-events-none" />
                                <input 
                                    type="text" 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search registry..."
                                    className="form-input w-full pl-12"
                                />
                            </div>
                            <div className="flex">
                                <div className="px-8 py-3 flex flex-col items-center justify-center">
                                    <span className="text-3xl font-black tracking-tighter leading-none">{data.length}</span>
                                    <span className="text-[8px] uppercase font-black text-base-content/30 tracking-[0.2em] mt-1">Folders</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* SCROLLABLE TRACK */}
            <div 
                ref={scrollWrapperRef} 
                className="flex-grow min-h-0 w-full flex overflow-x-auto overflow-y-hidden bg-transparent relative animate-fade-in"
                style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}
            >
                <div className="flex flex-nowrap h-full min-w-max">
                    {data.map((cat, i) => (
                        <CategoryCard 
                            key={cat.category}
                            category={cat} 
                            index={i} 
                            onClick={handleCategoryClick} 
                        />
                    ))}
                </div>
            </div>
        </>
      ) : (
        <div className="flex flex-col h-full w-full min-w-0 bg-transparent z-50 overflow-hidden relative animate-fade-in">
            <LayeredCheatsheetDetail 
                items={filteredItems}
                currentIndex={activeItemIndex ?? 0}
                onClose={() => {
                    setActiveItemIndex(null);
                    setActiveCategory(null);
                }}
                onNavigate={setActiveItemIndex}
                onInject={handleInject}
                onUpdateItem={handleUpdateItem}
            />
        </div>
      )}
      </div>
      {/* Manual Corner Accents */}
      <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
      <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
      <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
      <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
    </section>
    </>
  );
};
