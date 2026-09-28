import React from 'react';
import { motion } from 'motion/react';

interface RollingTextProps {
  text: string;
  className?: string;
  hoverClassName?: string;
}

/**
 * Rolling hover nav label (M3): the animated letters are decorative
 * duplicates — previously BOTH copies of every letter were exposed to the
 * accessibility tree, so screen readers read "HHoommee" and e2e selectors
 * matched multiple nodes. The real label renders exactly once as sr-only
 * text; every letter span is aria-hidden.
 */
const RollingText: React.FC<RollingTextProps> = ({ text, className = "", hoverClassName = "" }) => {
  const letters = text.split('');
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <span
      className={`relative inline-flex overflow-hidden ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span className="sr-only">{text}</span>
      {letters.map((letter, i) => (
        <span key={i} className="relative inline-block overflow-hidden" aria-hidden="true">
          {/* Top letter (original) */}
          <motion.span
            className="inline-block no-glow"
            animate={isHovered ? { y: '-100%' } : { y: 0 }}
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
            className={`absolute left-0 top-full inline-block no-glow ${hoverClassName}`}
            animate={isHovered ? { y: '-100%' } : { y: 0 }}
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
