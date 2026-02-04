
import React, { useState, useEffect, ComponentType, useRef, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { Observer } from 'gsap/Observer';
import type { CheatsheetCategory, CheatsheetItem, GalleryItem } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { CloseIcon } from './icons';
import { fileSystemManager } from '../utils/fileUtils';
import { loadGalleryItems } from '../utils/galleryStorage';

// Register Observer plugin
gsap.registerPlugin(Observer);

interface CategoryCardProps {
    category: CheatsheetCategory;
    onClick: (cat: CheatsheetCategory) => void;
    onUpdateCategory: (name: string, updates: Partial<CheatsheetCategory>) => Promise<void>;
    index: number;
    globalGallery: GalleryItem[];
}

const CategoryCard: React.FC<CategoryCardProps> = ({ category, onClick, onUpdateCategory, index, globalGallery }) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const titleContainerRef = useRef<HTMLDivElement>(null);
    const bgContainerRef = useRef<HTMLDivElement>(null);
    const [allImageUrls, setAllImageUrls] = useState<string[]>([]);
    const [currentImage, setCurrentImage] = useState<string | null>(null);
    const [hasEntered, setHasEntered] = useState(false);
    const rotationIntervalRef = useRef<number | null>(null);

    // Load static background or fallback rotation
    useEffect(() => {
        let active = true;
        const load = async () => {
            // Priority 1: Specific background image set by user (Manual Choice)
            if (category.backgroundImageUrl) {
                const url = category.backgroundImageUrl;
                if (url.startsWith('http') || url.startsWith('data:')) {
                    setCurrentImage(url);
                } else {
                    const blob = await fileSystemManager.getFileAsBlob(url);
                    if (blob && active) setCurrentImage(URL.createObjectURL(blob));
                }
                setAllImageUrls([]); 
                return;
            }

            // Priority 2: Use random SFW images from the media vault gallery
            // CRITICAL: NEVER use NSFW marked images.
            let urls: string[] = [];
            const sfwVaultItems = globalGallery.filter(item => !item.isNsfw);
            
            if (sfwVaultItems.length > 0) {
                // Pick up to 10 random SFW images from the vault for rotation
                const shuffled = [...sfwVaultItems].sort(() => 0.5 - Math.random());
                urls = shuffled.slice(0, 10).map(item => item.urls[0]);
            } else {
                // Priority 3: Fallback to curated item images if vault is empty/NSFW-only
                for (const item of category.items) {
                    if (item.imageUrls && item.imageUrls.length > 0) {
                        urls.push(item.imageUrls[0]);
                    }
                }
            }

            if (active && urls.length > 0) {
                const processedUrls: string[] = [];
                for (const url of urls) {
                    if (url.startsWith('http') || url.startsWith('data:')) {
                        processedUrls.push(url);
                    } else {
                        const blob = await fileSystemManager.getFileAsBlob(url);
                        if (blob && active) processedUrls.push(URL.createObjectURL(blob));
                    }
                }

                if (active && processedUrls.length > 0) {
                    setAllImageUrls(processedUrls);
                    setCurrentImage(processedUrls[Math.floor(Math.random() * processedUrls.length)]);
                }
            }
        };
        load();
        return () => { active = false; };
    }, [category, globalGallery]);

    // Periodic rotation logic
    useEffect(() => {
        if (allImageUrls.length <= 1 || category.backgroundImageUrl) return;

        rotationIntervalRef.current = window.setInterval(() => {
            if (!bgContainerRef.current) return;
            
            let nextIndex = Math.floor(Math.random() * allImageUrls.length);
            const nextUrl = allImageUrls[nextIndex];

            const currentImgEl = bgContainerRef.current.querySelector('img');
            const newImgEl = document.createElement('img');
            newImgEl.src = nextUrl;
            newImgEl.className = "absolute inset-0 w-full h-full object-cover grayscale opacity-0 scale-110 transition-all duration-1000 group-hover:grayscale-0 group-hover:scale-100";
            bgContainerRef.current.appendChild(newImgEl);

            gsap.to(newImgEl, {
                opacity: 0.2,
                scale: 1,
                duration: 2,
                ease: "power2.inOut",
                onComplete: () => {
                    if (currentImgEl) currentImgEl.remove();
                    setCurrentImage(nextUrl);
                }
            });
        }, 5000 + Math.random() * 2000);

        return () => {
            if (rotationIntervalRef.current) clearInterval(rotationIntervalRef.current);
        };
    }, [allImageUrls, category.backgroundImageUrl]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setHasEntered(true);
                    observer.unobserve(entry.target);
                }
            },
            { threshold: 0.05 }
        );
        if (cardRef.current) observer.observe(cardRef.current);
        return () => observer.disconnect();
    }, []);

    useLayoutEffect(() => {
        if (hasEntered && titleContainerRef.current && bgContainerRef.current) {
            const tl = gsap.timeline({ defaults: { ease: "expo.out", duration: 1.4 } });
            
            tl.fromTo(bgContainerRef.current,
                { opacity: 0, scale: 1.1 },
                { opacity: 1, scale: 1 }, 0
            );

            tl.fromTo(titleContainerRef.current, 
                { y: 40, opacity: 0 },
                { y: 0, opacity: 1 }, 0.2
            );
        }
    }, [hasEntered]);

    return (
        <div 
            ref={cardRef}
            onClick={() => onClick(category)}
            className="flex-shrink-0 w-[80vw] md:w-[45vw] lg:w-[30vw] h-full relative group cursor-pointer select-none bg-base-100 flex flex-col border-r border-base-300 first:border-l overflow-hidden"
        >
            {/* Dynamic Background Image */}
            <div 
                ref={bgContainerRef}
                className="absolute inset-0 z-0 bg-base-200 overflow-hidden"
            >
                {currentImage && (
                    <img 
                        src={currentImage} 
                        className={`absolute inset-0 w-full h-full object-cover transition-all duration-[2500ms] group-hover:scale-100 group-hover:opacity-100 ${category.backgroundImageUrl ? 'grayscale-0 opacity-50 group-hover:opacity-100' : 'grayscale opacity-40 group-hover:grayscale-0'}`} 
                        alt="" 
                    />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-base-100 via-base-100/80 to-transparent opacity-80 group-hover:opacity-40 transition-opacity duration-1000"></div>
            </div>

            {/* Content Layer */}
            <div className="relative z-10 flex flex-col h-full p-10 lg:p-14">
                <div className="flex items-center justify-between gap-4 mb-6 opacity-40 group-hover:opacity-100 transition-opacity duration-500">
                    <div className="flex-grow h-px bg-primary/20"></div>
                    <span className="text-sm font-mono font-black text-primary tracking-[0.3em] uppercase">
                        ID_{String(index + 1).padStart(2, '0')}
                    </span>
                </div>

                <div className="flex-grow flex flex-col justify-end overflow-hidden">
                    <div 
                        ref={titleContainerRef} 
                        className="opacity-0 will-change-transform w-full"
                    >
                        <h3 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter capitalize leading-[0.8] text-base-content break-words w-full transition-colors duration-500 group-hover:text-primary drop-shadow-sm">
                            {category.category.toLowerCase()}
                        </h3>
                        
                        <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-[grid-template-rows] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]">
                            <div className="overflow-hidden">
                                <p className="pt-4 text-[11px] font-bold uppercase tracking-[0.25em] text-base-content/60 max-w-sm leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity duration-700 delay-100">
                                    {category.description || `A comprehensive archival study of ${category.category.toLowerCase()} visual logic and neural aesthetic mapping.`}
                                </p>
                            </div>
                        </div>

                        <div className="mt-8 flex items-center gap-6 opacity-40 group-hover:opacity-100 transition-opacity duration-500">
                            <span className="text-[8px] font-black uppercase tracking-[0.3em] bg-primary/10 text-primary px-4 py-2 border border-primary/20 backdrop-blur-md">
                                {category.items.length} ENTRIES
                            </span>
                            <span className="text-[8px] font-mono font-bold uppercase tracking-widest animate-pulse">
                                SYSTEM_READY
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-0 left-0 w-0 h-1.5 bg-primary group-hover:w-full transition-all duration-1000 ease-in-out"></div>
        </div>
    );
};

interface GenericCheatsheetPageProps {
  title: string;
  subtitle?: string;
  heroText: string;
  searchPlaceholder: string;
  loadDataFn: () => Promise<CheatsheetCategory[]>;
  updateDataFn: (itemId: string, updates: Partial<CheatsheetItem>) => Promise<CheatsheetCategory[]>;
  updateCategoryFn?: (categoryName: string, updates: Partial<CheatsheetCategory>) => Promise<CheatsheetCategory[]>;
  CardComponent: ComponentType<{ 
    item: CheatsheetItem; 
    onUpdateImages: (newImageUrls: string[]) => void;
    onInject: (item: CheatsheetItem) => void;
  }>;
  onSendToPromptsPage?: (item: CheatsheetItem, category: string) => void;
  isCategoryPanelCollapsed: boolean;
  onToggleCategoryPanel: () => void;
  isSidebarPinned: boolean;
  EmptyIcon: ComponentType<React.SVGProps<SVGSVGElement>>;
  layout?: 'grid' | 'article';
}

export const GenericCheatsheetPage: React.FC<GenericCheatsheetPageProps> = ({
  heroText,
  subtitle,
  loadDataFn,
  updateDataFn,
  updateCategoryFn,
  CardComponent,
  onSendToPromptsPage,
}) => {
  const [data, setData] = useState<CheatsheetCategory[]>([]);
  const [globalGallery, setGlobalGallery] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<CheatsheetCategory | null>(null);

  const carouselRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollWrapperRef = useRef<HTMLDivElement>(null);
  const detailViewRef = useRef<HTMLDivElement>(null);
  
  const xPosRef = useRef(0);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [loadedData, gallery] = await Promise.all([
            loadDataFn(),
            loadGalleryItems()
        ]);
        setData(loadedData);
        setGlobalGallery(gallery);
      } catch (e) { console.error(e); } finally { setIsLoading(false); }
    };
    fetchData();
  }, [loadDataFn]);

  useLayoutEffect(() => {
    if (isLoading || activeCategory || !trackRef.current || !scrollWrapperRef.current) return;

    const track = trackRef.current;
    const wrapper = scrollWrapperRef.current;
    
    const updateBounds = () => {
        return track.scrollWidth - wrapper.offsetWidth;
    };

    let maxScroll = updateBounds();

    const applyTranslation = (velocity: number = 0.8) => {
        maxScroll = updateBounds();
        xPosRef.current = Math.max(-maxScroll, Math.min(0, xPosRef.current));
        
        gsap.to(track, {
            x: xPosRef.current,
            duration: velocity,
            ease: "power3.out",
            overwrite: "auto"
        });
    };

    const obs = Observer.create({
        target: wrapper,
        type: "wheel,touch,pointer",
        onWheel: (self) => {
            xPosRef.current -= self.deltaY * 0.8;
            applyTranslation(1.2);
        },
        onDrag: (self) => {
            xPosRef.current += self.deltaX;
            applyTranslation(0.5);
        },
        onDragEnd: () => {
            applyTranslation(0.8);
        },
        tolerance: 5,
        preventDefault: true
    });

    const resizeHandler = () => {
        maxScroll = updateBounds();
        applyTranslation(0.2);
    };

    window.addEventListener('resize', resizeHandler);
    return () => {
        if (obs) obs.kill();
        window.removeEventListener('resize', resizeHandler);
    };
  }, [isLoading, activeCategory, data]);

  const handleCategoryClick = (cat: CheatsheetCategory) => {
      const tl = gsap.timeline({
          defaults: { ease: "expo.inOut", duration: 1.2 }
      });
      
      tl.to(carouselRef.current, {
          y: -150,
          autoAlpha: 0,
          scale: 0.95,
          pointerEvents: 'none'
      });
      
      tl.call(() => setActiveCategory(cat), undefined, ">-0.2");
      
      tl.fromTo(detailViewRef.current, {
          y: 200,
          autoAlpha: 0,
          scale: 1.02
      }, {
          y: 0,
          autoAlpha: 1,
          scale: 1,
          duration: 1.2,
          ease: "expo.out",
          clearProps: "all"
      }, ">");
  };

  const handleBackToCarousel = () => {
      const tl = gsap.timeline({
          defaults: { ease: "expo.inOut", duration: 1.2 }
      });
      
      tl.to(detailViewRef.current, {
          y: 150,
          autoAlpha: 0,
          scale: 0.98,
          pointerEvents: 'none'
      });
      
      tl.call(() => setActiveCategory(null), undefined, ">-0.2");
      
      tl.fromTo(carouselRef.current, {
          y: -100,
          autoAlpha: 0,
          scale: 0.95
      }, {
          y: 0,
          autoAlpha: 1,
          scale: 1,
          duration: 1.2,
          ease: "expo.out",
          clearProps: "all"
      }, ">");
  };

  const handleInject = (item: CheatsheetItem) => {
      onSendToPromptsPage?.(item, activeCategory?.category || '');
  };

  const handleUpdateCategory = async (name: string, updates: Partial<CheatsheetCategory>) => {
      if (updateCategoryFn) {
          const updatedData = await updateCategoryFn(name, updates);
          setData(updatedData);
      }
  };

  if (isLoading) {
    return <div className="h-full w-full flex items-center justify-center bg-base-100"><LoadingSpinner /></div>;
  }

  return (
    <section className="h-full bg-base-100 flex flex-col overflow-hidden relative select-none no-scrollbar">
      <div 
        ref={carouselRef} 
        className={`flex h-full overflow-hidden no-scrollbar ${activeCategory ? 'hidden' : 'flex'}`}
      >
          <div className="flex-shrink-0 h-full w-min min-w-[360px] flex flex-col justify-end p-16 md:pb-40 lg:pb-40 border-r border-base-300 bg-base-200/5 relative z-10">
              <div className="space-y-8">
                  <div className="flex items-center gap-4">
                      <span className="text-[11px] font-black uppercase tracking-[0.6em] text-primary block">ARCHIVE_V2</span>
                      <div className="w-12 h-1 bg-primary"></div>
                  </div>
                  <h1 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tighter uppercase leading-[0.8] text-base-content whitespace-nowrap">
                      {heroText}<span className="text-primary opacity-40">.</span>
                  </h1>
                  <p className="text-[10px] font-bold text-base-content/20 uppercase tracking-[0.5em] leading-relaxed break-words max-w-xs">
                      {subtitle || "DECENTRALIZED ARCHIVE"}
                  </p>
              </div>
              <div className="absolute top-20 left-16 flex items-center gap-4 opacity-5">
                  <span className="text-[8px] font-mono font-black uppercase tracking-widest">DRIVEN_BY_MOTION</span>
                  <div className="w-16 h-px bg-base-content"></div>
              </div>
          </div>

          <div 
              ref={scrollWrapperRef}
              className="flex-grow flex overflow-hidden bg-base-100 h-full touch-none"
          >
              <div ref={trackRef} className="flex h-full will-change-transform">
                {data.map((cat, i) => (
                    <CategoryCard 
                      key={cat.category} 
                      category={cat} 
                      index={i} 
                      onClick={handleCategoryClick} 
                      onUpdateCategory={handleUpdateCategory}
                      globalGallery={globalGallery}
                    />
                ))}
              </div>
          </div>
      </div>

      <div 
        ref={detailViewRef}
        className={`flex-col h-full bg-base-100 z-50 overflow-hidden ${activeCategory ? 'flex' : 'hidden'}`}
      >
          {activeCategory && (
            <>
                <header className="flex-shrink-0 h-28 border-b border-base-300 bg-base-100 px-16 flex items-center justify-between sticky top-0 z-[60] backdrop-blur-md bg-base-100/90">
                    <div className="flex items-center gap-8">
                        <div className="flex flex-col">
                             <span className="text-[11px] font-black uppercase tracking-[0.4em] text-primary/60 mb-1">COLLECTION</span>
                             <h2 className="text-4xl lg:text-5xl font-black tracking-tighter uppercase leading-none">{activeCategory.category}</h2>
                        </div>
                    </div>
                    <div className="flex items-center gap-10">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-mono font-black text-base-content/20 uppercase tracking-widest">NODES_INDEX</span>
                            <span className="text-lg font-black text-base-content/60">{activeCategory.items.length}</span>
                        </div>
                        <button onClick={handleBackToCarousel} className="btn btn-ghost btn-lg btn-square opacity-40 hover:opacity-100 hover:rotate-90 transition-all duration-500"><CloseIcon className="w-8 h-8"/></button>
                    </div>
                </header>

                <div className="flex-grow overflow-y-auto custom-scrollbar bg-base-100">
                    <div className="max-w-screen-2xl mx-auto py-24 px-16">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-base-300 border border-base-300 shadow-2xl">
                            {activeCategory.items.map((item) => (
                                <div key={item.id} className="bg-base-100 group/item overflow-hidden">
                                    <div className="transition-transform duration-1000 group-hover/item:scale-[1.03]">
                                        <CardComponent 
                                          item={item}
                                          onUpdateImages={(newImageUrls) => updateDataFn(item.id, { imageUrls: newImageUrls })}
                                          onInject={handleInject}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </>
          )}
      </div>
    </section>
  );
};
