import React from 'react';
import { motion } from 'motion/react';
import { audioService } from '../services/audioService';

export const HUDNavItem: React.FC<{
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  onHover?: () => void;
  title?: string;
  badge?: number;
}> = ({ children, onClick, onHover, title, badge }) => {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseEnter={() => {
        audioService.playHover();
        onHover?.();
      }}
      initial="initial"
      whileHover="hover"
      className="group relative p-2 text-primary no-glow transition-colors duration-300 pointer-events-auto z-[99999]"
      title={title}
    >
      {children}

      {badge !== undefined && badge > 0 && (
        <span className="absolute top-0 right-0 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-primary opacity-75"></span>
          <span className="relative inline-flex rounded-none h-2 w-2 bg-primary"></span>
        </span>
      )}
    </motion.button>
  );
};
