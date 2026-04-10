import React from 'react';
import { motion } from 'framer-motion';

interface RollingTextProps {
  text: string;
  className?: string;
  hoverClassName?: string;
}

const RollingText: React.FC<RollingTextProps> = ({ text, className = "", hoverClassName = "" }) => {
  const letters = text.split('');

  return (
    <span className={`relative inline-flex overflow-hidden ${className}`}>
      {letters.map((letter, i) => (
        <span key={i} className="relative inline-block overflow-hidden">
          {/* Top letter (original) */}
          <motion.span
            className="inline-block"
            variants={{
              initial: { y: 0 },
              hover: { y: '-100%' }
            }}
            transition={{
              duration: 0.5,
              ease: [0.6, 0.01, 0.05, 0.95],
              delay: i * 0.02
            }}
          >
            {letter === ' ' ? '\u00A0' : letter}
          </motion.span>
          
          {/* Bottom letter (revealed on hover) */}
          <motion.span
            className={`absolute left-0 top-full inline-block ${hoverClassName}`}
            variants={{
              initial: { y: 0 },
              hover: { y: '-100%' }
            }}
            transition={{
              duration: 0.5,
              ease: [0.6, 0.01, 0.05, 0.95],
              delay: i * 0.02
            }}
          >
            {letter === ' ' ? '\u00A0' : letter}
          </motion.span>
        </span>
      ))}
    </span>
  );
};

export default RollingText;
