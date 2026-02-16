
import React, { useState, useEffect, ComponentType, useRef, useLayoutEffect, useMemo } from 'react';
import { gsap } from 'gsap';
import { Observer } from 'gsap/Observer';
import type { CheatsheetCategory, CheatsheetItem } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { CloseIcon, ChevronLeftIcon, SearchIcon } from './icons';
import { fileSystemManager } from '../utils/fileUtils';
import CheatsheetDetailView from './CheatsheetDetailView';

// Register Observer plugin
gsap.registerPlugin(Observer);

const CATEGORY_PLACEHOLDER = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop";

interface CategoryCardProps {
    category: CheatsheetCategory;
    onClick: (cat: CheatsheetCategory) => void;
    index: number;
    isReturning: boolean;
}

const CategoryCard: React.FC<CategoryCardProps> = ({
    category, onClick, index, isReturning
}) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const titleContainerRef = useRef<HTMLDivElement>(null);
    const bgContainerRef = useRef<HTMLDivElement>(null);
    const [currentImage, setCurrentImage] = useState<string | null>(null);
    const [hasEntered, setHasEntered] = useState(false);

    useEffect(() => {
        let active = true;
        const load = async () => {
            // Priority: 1. Explicit Background -> 2. First Item Image -> 3. Placeholder
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
        if (isReturning) {
            setHasEntered(true);
            return;
        }
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setHasEntered(true);
                observer.unobserve(entry.target);
            }
        }, { threshold: 0.05 });
        if (cardRef.current) observer.observe(cardRef.current);
        return () => observer.disconnect();
    }, [isReturning]);

    useLayoutEffect(() => {
        if (hasEntered && titleContainerRef.current && bgContainerRef.current) {
            const tl = gsap.timeline({ defaults: { ease: "expo.out", duration: 1.2 } });
            tl.fromTo(bgContainerRef.current, { opacity: 0, scale: 1.1 }, { opacity: 1, scale: 1 }, 0);
            tl.fromTo(titleContainerRef.current, { y: 30, opacity: 0 }, { y: 0, opacity: 1 }, 0.15);
        }
    }, [hasEntered]);

    return (
        <div
            ref={cardRef}
            onClick={() => onClick(category)}
            className={`category-card flex-shrink-0 w-[80vw] md:w-[45vw] lg:w-[30vw] h-full relative group cursor-pointer select-none bg-base-100 flex flex-col border-r border-base-300 first:border-l overflow-hidden will-change-transform`}
        >
            <div ref={bgContainerRef} className="absolute inset-0 z-0 bg-base-200 overflow-hidden">
                {currentImage && (
                    <img
                        src={currentImage}
                        className="absolute inset-0 w-full h-full object-cover transition-all duration-[2500ms] group-hover:scale-110 grayscale opacity-40 group-hover:grayscale-0 group-hover:opacity-100"
                        alt=""
                    />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-base-100 via-base-100/80 to-transparent opacity-80 group-hover:opacity-40 transition-opacity duration-1000"></div>
            </div>

            <div className="relative z-10 flex flex-col h-full p-10 lg:p-14">
                <div className="flex items-center justify-between gap-4 mb-6 opacity-40 group-hover:opacity-100 transition-opacity duration-500">
                    <div className="flex-grow h-px bg-primary/20"></div>
                    <span className="text-sm font-mono font-black text-primary tracking-[0.3em] uppercase">
                        ID_{String(index + 1).padStart(2, '0')}
                    </span>
                </div>

                <div className="flex-grow flex flex-col justify-end overflow-hidden">
                    <div ref={titleContainerRef} className="w-full">
                        <h3 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter capitalize leading-[0.8] text-base-content break-words w-full transition-colors duration-500 group-hover:text-primary drop-shadow-sm">
                            {category.category.toLowerCase()}
                        </h3>
                        <div className="grid transition-[grid-template-rows] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] grid-rows-[0fr] group-hover:grid-rows-[1fr]">
                            <div className="overflow-hidden">
                                <p className="pt-4 text-[11px] font-bold uppercase tracking-[0.25em] text-base-content/60 max-w-sm leading-relaxed transition-opacity duration-700 opacity-0 group-hover:opacity-100">
                                    {category.description || `A comprehensive archival study of ${category.category.toLowerCase()} visual logic.`}
                                </p>
                            </div>
                        </div>
                        <div className="mt-8 flex items-center gap-6 opacity-40 group-hover:opacity-100 transition-opacity duration-500">
                            <span className="text-[8px] font-black uppercase tracking-[0.3em] bg-primary/10 text-primary px-4 py-2 border border-primary/20 backdrop-blur-md">
                                {category.items.length} ENTRIES
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            <div className="absolute bottom-0 left-0 h-1.5 bg-primary transition-all duration-1000 ease-in-out w-0 group-hover:w-full"></div>
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
    title, heroText, subtitle, loadDataFn, updateDataFn, CardComponent, onSendToPromptsPage, EmptyIcon, layout = 'grid', searchPlaceholder
}) => {
    const [data, setData] = useState<CheatsheetCategory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState<CheatsheetCategory | null>(null);
    const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isTransitioning, setIsTransitioning] = useState(false);
    const isReturningRef = useRef(false);

    const carouselRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const scrollWrapperRef = useRef<HTMLDivElement>(null);
    const heroRef = useRef<HTMLDivElement>(null);
    const xPosRef = useRef(0);

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

    useLayoutEffect(() => {
        if (isLoading || activeCategory || !trackRef.current || !scrollWrapperRef.current) return;

        const track = trackRef.current;
        const wrapper = scrollWrapperRef.current;

        const applyTranslation = (velocity: number = 0.8) => {
            if (!wrapper || !track) return;
            const maxScroll = Math.max(0, track.scrollWidth - wrapper.offsetWidth);
            const atStart = xPosRef.current >= 0;
            const atEnd = xPosRef.current <= -maxScroll;

            gsap.to(track, {
                x: xPosRef.current,
                duration: velocity,
                ease: "power3.out",
                overwrite: "auto"
            });

            return { maxScroll, atStart, atEnd };
        };

        const handleResize = () => {
            applyTranslation(0.4);
        };

        const obs = Observer.create({
            target: wrapper,
            type: "wheel,touch,pointer",
            onWheel: (self) => {
                const maxScroll = Math.max(0, track.scrollWidth - wrapper.offsetWidth);
                const isVerticalScroll = Math.abs(self.deltaY) >= Math.abs(self.deltaX);
                const atStart = xPosRef.current >= 0;
                const atEnd = xPosRef.current <= -maxScroll;

                if (isVerticalScroll && (atStart || atEnd)) {
                    return;
                }

                const delta = isVerticalScroll ? self.deltaY : self.deltaX;
                xPosRef.current -= delta * 0.8;
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
            preventDefault: false
        });

        window.addEventListener('resize', handleResize);

        // Initial sync
        const timer = setTimeout(() => applyTranslation(0), 100);

        return () => {
            obs.kill();
            clearTimeout(timer);
            window.removeEventListener('resize', handleResize);
        };
    }, [isLoading, activeCategory, data]);

    // Entrance of Detail View
    useLayoutEffect(() => {
        if (activeCategory && !isTransitioning) {
            const items = gsap.utils.toArray('.item-card-wrapper');
            gsap.fromTo(items,
                { y: '100%', opacity: 0 },
                { y: 0, opacity: 1, stagger: 0.05, duration: 0.8, ease: "power3.out", clearProps: "all" }
            );
            gsap.fromTo('.detail-header',
                { y: -20, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.4, ease: "power2.out", clearProps: "all" }
            );
        }
    }, [activeCategory, isTransitioning]);

    const handleCategoryClick = (cat: CheatsheetCategory) => {
        if (isTransitioning) return;
        setIsTransitioning(true);

        const cards = gsap.utils.toArray('.category-card');
        const tl = gsap.timeline({
            onComplete: () => {
                setActiveCategory(cat);
                setIsTransitioning(false);
            }
        });

        tl.to(cards, {
            y: '100%',
            opacity: 0,
            stagger: 0.08,
            duration: 0.6,
            ease: "power2.inOut"
        }, 0);

        tl.to(heroRef.current, {
            x: -30,
            opacity: 0,
            duration: 0.4,
            ease: "power2.in"
        }, 0.2);
    };

    const handleBackToCarousel = () => {
        if (isTransitioning) return;
        setIsTransitioning(true);

        const items = gsap.utils.toArray('.item-card-wrapper');
        const tl = gsap.timeline({
            onComplete: () => {
                setActiveCategory(null);
                setIsTransitioning(false);
                isReturningRef.current = true;
                setTimeout(() => { isReturningRef.current = false; }, 100);
            }
        });

        tl.to(items, {
            y: '100%',
            opacity: 0,
            stagger: 0.05,
            duration: 0.6,
            ease: "power2.inOut"
        }, 0);

        tl.to('.detail-header', {
            y: -20,
            opacity: 0,
            duration: 0.3,
            ease: "power2.in"
        }, 0);
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
        return <div className="h-full w-full flex items-center justify-center bg-base-100"><LoadingSpinner /></div>;
    }

    return (
        <section className={`h-full bg-base-100 flex flex-col overflow-hidden relative ${!activeCategory ? 'select-none' : ''}`}>
            {!activeCategory ? (
                <div ref={carouselRef} className="flex h-full overflow-hidden no-scrollbar animate-fade-in">
                    <div
                        ref={heroRef}
                        className="flex-shrink-0 h-full w-min min-w-[360px] flex flex-col justify-end p-16 md:pb-40 lg:pb-40 border-r border-base-300 bg-base-200/5 relative z-10"
                    >
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
                    </div>

                    <div ref={scrollWrapperRef} className="flex-grow flex overflow-x-hidden overflow-y-hidden bg-base-100 h-full touch-none">
                        <div ref={trackRef} className="flex flex-nowrap h-full will-change-transform">
                            {data.map((cat, i) => (
                                <CategoryCard
                                    key={cat.category}
                                    category={cat}
                                    index={i}
                                    onClick={handleCategoryClick}
                                    isReturning={isReturningRef.current}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col h-full bg-base-100 z-50 overflow-hidden relative">
                    {activeItemIndex !== null && (
                        <CheatsheetDetailView
                            items={filteredItems}
                            currentIndex={activeItemIndex}
                            onClose={() => setActiveItemIndex(null)}
                            onNavigate={setActiveItemIndex}
                            onInject={handleInject}
                            onUpdateItem={handleUpdateItem}
                        />
                    )}

                    <header className="detail-header flex-shrink-0 border-b border-base-300 bg-base-200/10 p-10 flex flex-col md:flex-row md:items-center justify-between gap-6 z-[60]">
                        <div className="flex items-center gap-6">
                            <button onClick={handleBackToCarousel} className="btn btn-ghost btn-circle opacity-40 hover:opacity-100 hover:bg-base-300 transition-all">
                                <ChevronLeftIcon className="w-6 h-6" />
                            </button>
                            <div>
                                <h2 className="text-2xl lg:text-4xl font-black tracking-tighter uppercase leading-none">{activeCategory.category}</h2>
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/40 mt-1">{heroText} REPOSITORY</p>
                            </div>
                        </div>

                        <div className="relative w-full md:w-96">
                            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-20 pointer-events-none" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={searchPlaceholder}
                                className="input input-bordered rounded-none w-full pl-12 font-bold uppercase tracking-tight text-sm h-12"
                            />
                        </div>
                    </header>

                    <div className="flex-grow overflow-y-auto custom-scrollbar bg-base-100 select-auto">
                        <div className={`mx-auto py-16 px-10 ${layout === 'article' ? 'max-w-4xl' : 'max-w-screen-2xl'}`}>
                            <div className={layout === 'grid'
                                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-base-300 border border-base-300 shadow-2xl"
                                : "flex flex-col gap-px bg-base-300 border border-base-300 shadow-2xl"
                            }>
                                {filteredItems.map((item, idx) => (
                                    <div
                                        key={item.id}
                                        className="item-card-wrapper bg-base-100 group/item overflow-hidden will-change-transform cursor-pointer"
                                        onClick={() => setActiveItemIndex(idx)}
                                    >
                                        <div className="transition-transform duration-1000 group-hover/item:scale-[1.01]">
                                            <CardComponent
                                                item={item}
                                                onUpdateImages={(newImageUrls) => handleUpdateItem(item.id, { imageUrls: newImageUrls })}
                                                onInject={handleInject}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {filteredItems.length === 0 && (
                                <div className="py-40 text-center opacity-10 flex flex-col items-center justify-center gap-6">
                                    <EmptyIcon className="w-16 h-16" />
                                    <span className="uppercase font-black tracking-widest text-2xl">Empty Registry</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};
