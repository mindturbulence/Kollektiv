import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';

const fallingStrings = ["SYSTEM", "ANALYZE", "INIT", "PROCESSING", "DATA", "LOADING", "LINK", "VERIFY", "MATRIX", "01011"];

const FallingText = () => {
    const [drops, setDrops] = useState<{ id: number, text: string, x: number, duration: number, delay: number }[]>([]);

    useEffect(() => {
        const newDrops = Array.from({ length: 8 }).map((_, i) => ({
            id: i,
            text: fallingStrings[Math.floor(Math.random() * fallingStrings.length)],
            x: Math.random() * 80 + 10,
            duration: Math.random() * 2 + 2,
            delay: Math.random() * 2,
        }));
        setDrops(newDrops);
    }, []);

    return (
        <motion.div 
            className="absolute top-[8%] left-[8%] right-[8%] bottom-[8%] overflow-hidden rounded-full pointer-events-none z-0"
            animate={{ clipPath: ['inset(0% 0% 0% 0%)', 'inset(0% 0% 100% 0%)'] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
        >
            {drops.map((drop) => (
                <motion.div
                    key={drop.id}
                    className="absolute font-mono text-[8px] md:text-[10px] text-primary/40 font-bold"
                    style={{ 
                        left: `${drop.x}%`, 
                        writingMode: 'vertical-rl', 
                        textOrientation: 'upright',
                        letterSpacing: '0.2em'
                    }}
                    initial={{ top: '-10%', opacity: 0 }}
                    animate={{ top: '110%', opacity: [0, 0.8, 0] }}
                    transition={{
                        duration: drop.duration,
                        repeat: Infinity,
                        delay: drop.delay,
                        ease: 'linear'
                    }}
                >
                    {drop.text}
                </motion.div>
            ))}
        </motion.div>
    );
};

const LoadingSpinner: React.FC<{ size?: string | number, className?: string, text?: string }> = ({ size = 250, className = "", text }) => {
  const numSize = typeof size === 'string' ? parseInt(size, 10) : size;
  const scale = numSize / 250;

  return (
    <div className={`flex flex-col items-center justify-center ${className}`} aria-label="Loading content...">
      <div 
        className="relative flex items-center justify-center"
        style={{ width: numSize, height: numSize }}
      >
        {numSize > 64 ? (
          <>
            <FallingText />
            {/* Horizontal Scanner Line */}
            <div className="absolute top-[8%] left-[8%] right-[8%] bottom-[8%] rounded-full overflow-hidden pointer-events-none z-10 mix-blend-screen">
               <motion.div
                 className="absolute left-0 right-0 h-[2px] bg-primary"
                 style={{ boxShadow: '0 0 10px currentColor, 0 4px 10px -2px currentColor' }}
                 animate={{ top: ['100%', '0%'] }}
                 transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
               />
            </div>

            <svg 
              className="absolute inset-0 w-full h-full text-primary pointer-events-none drop-shadow-[0_0_4px_currentColor]" 
              viewBox="0 0 100 100"
            >
              <defs>
                 <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                 </filter>
                 <linearGradient id="diagramBar" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="currentColor" stopOpacity="0.8"/>
                    <stop offset="100%" stopColor="currentColor" stopOpacity="0"/>
                 </linearGradient>
              </defs>

              {/* Central Orb */}
              <circle cx="50" cy="50" r="4.5" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.4"/>
              <circle cx="50" cy="50" r="2.5" fill="#a0a0a0" filter="url(#softGlow)" />
              <circle cx="50" cy="50" r="1" fill="#ffffff" />

              {/* Inner ring */}
              <circle cx="50" cy="50" r="12" fill="none" stroke="currentColor" strokeWidth="0.3" opacity="0.6"/>
              
              {/* Main radar ring tick marks */}
              <circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" strokeWidth="0.2" opacity="0.5"/>
              <circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" strokeWidth="2.5" pathLength="36" strokeDasharray="0.1 0.9" opacity="0.8"/>

              {/* Outer boundary ring */}
              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="0.4" opacity="0.3"/>
              
              {/* Background Tracking Reticle */}
              <motion.g
                 style={{ originX: '50px', originY: '50px' }}
                 animate={{ rotate: 360 }}
                 transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
                 opacity="0.3"
              >
                  <line x1="50" y1="8" x2="50" y2="92" stroke="currentColor" strokeWidth="0.2" strokeDasharray="2 2" />
                  <line x1="8" y1="50" x2="92" y2="50" stroke="currentColor" strokeWidth="0.2" strokeDasharray="2 2" />
                  <circle cx="50" cy="50" r="28" fill="none" stroke="currentColor" strokeWidth="0.2" />
              </motion.g>
              
            </svg>
          </>
        ) : (
          /* Small elegant fallback loader */
          <motion.svg 
            className="w-full h-full text-primary" 
            viewBox="0 0 100 100"
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          >
             <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray="60 180" strokeLinecap="square" />
             <circle cx="50" cy="50" r="20" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="20 60" strokeLinecap="square" opacity="0.5" />
          </motion.svg>
        )}
      </div>

      {text && (
        <div className="flex flex-col items-center relative z-10 w-full mt-6" style={{ transform: `scale(${Math.max(scale * 1.1, 0.85)})`, transformOrigin: 'top center' }}>
          <div className="font-rajdhani text-primary text-lg md:text-xl uppercase tracking-[0.4em] font-bold mb-2 ml-1 drop-shadow-[0_0_4px_currentColor]">
            <motion.span
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              {text}
            </motion.span>
          </div>
          
          <div className="font-mono text-primary/70 text-[11px] md:text-xs uppercase tracking-widest flex items-center space-x-2">
            <span>Snsr</span>
            <div className="flex space-x-[3px] h-[8px] md:h-3">
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  className="w-[3px] md:w-1 bg-primary/60 rounded-[1px] origin-bottom"
                  animate={{ scaleY: [0.2, 1, 0.2], opacity: [0.3, 1, 0.3] }}
                  transition={{ 
                    duration: 1.5, 
                    repeat: Infinity, 
                    ease: "easeInOut", 
                    delay: i * 0.1 
                  }}
                />
              ))}
            </div>
            <span>Actv</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoadingSpinner;
