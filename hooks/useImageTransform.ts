import { useState, useRef, useCallback } from 'react';

export interface ImageTransformState {
  zoom: number;
  position: { x: number; y: number };
  isPanning: boolean;
}

export function useImageTransform() {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  const resetTransform = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const scaleAmount = -e.deltaY * 0.005;
    setZoom(prev => {
      const newZoom = Math.max(1, prev + scaleAmount);
      if (newZoom <= 1) setPosition({ x: 0, y: 0 });
      return newZoom;
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom > 1) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    }
  }, [zoom, position.x, position.y]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPosition({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
    }
  }, [isPanning]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (zoom > 1) {
      setZoom(1);
      setPosition({ x: 0, y: 0 });
    } else {
      setZoom(2.5);
    }
  }, [zoom]);

  const imageStyle = {
    transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
    transformOrigin: 'center' as const,
    cursor: isPanning ? 'grabbing' as const : zoom > 1 ? 'grab' as const : 'default' as const,
    maxHeight: '100%' as const,
    maxWidth: 'none' as const,
    width: 'auto' as const,
    height: 'auto' as const,
    userSelect: 'none' as const,
    transition: zoom === 1 ? 'transform 0.3s ease-out' : 'transform 0.1s ease-out',
  };

  return {
    zoom,
    position,
    isPanning,
    resetTransform,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,
    imageStyle,
    panStartRef,
  };
}
