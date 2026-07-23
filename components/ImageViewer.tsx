import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useImageTransform } from '../hooks/useImageTransform';
import { fileSystemManager } from '../utils/fileUtils';
import { ImageBrokenIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';

interface ImageViewerProps {
  src: string;               // URL, data URI, or vault path
  alt?: string;
  title?: string;
  className?: string;
  /** When true, show left/right arrows (multi-image). */
  hasMultiple?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  /** Called when zoom changes. */
  onZoomChange?: (zoom: number) => void;
}

const ImageViewer: React.FC<ImageViewerProps> = ({
  src,
  alt = '',
  title,
  className = '',
  hasMultiple = false,
  onPrev,
  onNext,
  onZoomChange,
}) => {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  const {
    zoom,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,
    imageStyle,
  } = useImageTransform();

  // Notify parent of zoom changes
  useEffect(() => {
    onZoomChange?.(zoom);
  }, [zoom, onZoomChange]);

  // Resolve the source: vault path → blob URL, otherwise use as-is
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setHasError(false);

    const resolve = async () => {
      if (!src.startsWith('data:') && !src.startsWith('http') && !src.startsWith('blob:')) {
        try {
          const blob = await fileSystemManager.getFileAsBlob(src);
          if (!blob || !isMounted) {
            if (isMounted) { setHasError(true); setIsLoading(false); }
            return;
          }
          const url = URL.createObjectURL(blob);
          objectUrlsRef.current.add(url);
          if (isMounted) { setResolvedSrc(url); setIsLoading(false); }
        } catch {
          if (isMounted) { setHasError(true); setIsLoading(false); }
        }
      } else {
        if (isMounted) { setResolvedSrc(src); setIsLoading(false); }
      }
    };
    resolve();
    return () => { isMounted = false; };
  }, [src]);

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
      objectUrlsRef.current.clear();
    };
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { onPrev?.(); }
    if (e.key === 'ArrowRight') { onNext?.(); }
  }, [onPrev, onNext]);

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden w-full h-full select-none ${className}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="img"
      aria-label={alt || title || 'Image viewer'}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <LoadingSpinner size={48} />
        </div>
      )}

      {hasError && !isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <ImageBrokenIcon className="w-16 h-16 text-warning/40" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/30">
            Failed to load image
          </span>
        </div>
      )}

      {resolvedSrc && !hasError && (
        <img
          src={resolvedSrc}
          alt={alt || title || 'Image'}
          className="pointer-events-none"
          style={imageStyle}
          draggable={false}
        />
      )}

      {/* Navigation arrows for multi-image */}
      {hasMultiple && onPrev && zoom <= 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-black/30 hover:bg-black/50 text-white/70 hover:text-white rounded-full transition-all opacity-0 group-hover:opacity-100"
          aria-label="Previous image"
        >
          <ChevronLeftIcon className="w-6 h-6" />
        </button>
      )}
      {hasMultiple && onNext && zoom <= 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-black/30 hover:bg-black/50 text-white/70 hover:text-white rounded-full transition-all opacity-0 group-hover:opacity-100"
          aria-label="Next image"
        >
          <ChevronRightIcon className="w-6 h-6" />
        </button>
      )}
    </div>
  );
};

export default ImageViewer;
