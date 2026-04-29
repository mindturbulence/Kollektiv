import { useState, useEffect } from 'react';
import { motion, type Variants } from 'framer-motion';

export const TerminalText = ({ text, delay = 0, className = "", centered = false }: { text: string; delay?: number; className?: string; centered?: boolean }) => {
    const [displayedText, setDisplayedText] = useState('');
    const [started, setStarted] = useState(false);
    const [isComplete, setIsComplete] = useState(false);
    
    // Use motion's internal presence state if wrapped in AnimatePresence
    // However, since we want a custom "un-typing" on exit, we might need to handle it via a prop or a separate animation
    // For now, let's just make it respond to variants if they stagger correctly.
    // If we want actual un-typing on exit, it's complex because AnimatePresence waits for the component to unmount.
    
    useEffect(() => {
        const timeout = setTimeout(() => {
            setStarted(true);
        }, delay * 1000);
        return () => clearTimeout(timeout);
    }, [delay]);

    useEffect(() => {
        if (!started || !text) return;
        let i = 0;
        const interval = setInterval(() => {
            if (i <= text.length) {
                setDisplayedText(text.slice(0, i));
                if (i === text.length) setIsComplete(true);
                i++;
            } else {
                clearInterval(interval);
            }
        }, 20);
        return () => clearInterval(interval);
    }, [text, started]);

    return (
        <motion.span 
            variants={reverseTextVariants}
            className={`${className} inline-flex items-center ${centered ? 'justify-center w-full' : ''}`}
        >
            {displayedText}
            {!isComplete && (
                <motion.span
                    animate={{ opacity: [1, 0] }}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                    className="inline-block w-2.5 h-[1.1em] bg-current ml-0.5 opacity-80"
                />
            )}
        </motion.span>
    );
};

export const PanelLine = ({ position, delay = 0, duration = 0.4 }: { position: 'top' | 'bottom' | 'left' | 'right'; delay?: number; duration?: number }) => {
    const isHorizontal = position === 'top' || position === 'bottom';
    
    const lineVariants: Variants = {
        hidden: { scaleX: isHorizontal ? 0 : 1, scaleY: isHorizontal ? 1 : 0, opacity: 0 },
        visible: { 
            scaleX: 1, 
            scaleY: 1, 
            opacity: 1,
            transition: { duration, delay, ease: [0.16, 1, 0.3, 1] }
        }
    };

    return (
        <motion.div
            variants={lineVariants}
            className={`absolute bg-primary/20 pointer-events-none z-0 ${
                position === 'top' ? 'top-0 left-0 w-full h-[1px] origin-left' :
                position === 'bottom' ? 'bottom-0 left-0 w-full h-[1px] origin-right' :
                position === 'left' ? 'top-0 left-0 w-[1px] h-full origin-top' :
                'top-0 right-0 w-[1px] h-full origin-bottom'
            }`}
        />
    );
};

export const ScanLine = ({ delay = 0 }: { delay?: number }) => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-40">
        {/* Soft Feathered Glow */}
        <motion.div
            initial={{ top: "-50%" }}
            animate={{ top: "150%" }}
            transition={{ 
                duration: 7, 
                delay, 
                repeat: Infinity,
                repeatDelay: 1,
                ease: "linear" 
            }}
            className="absolute left-0 right-0 h-[45%] opacity-10 mix-blend-screen"
            style={{
                background: `linear-gradient(to bottom, 
                    transparent 0%, 
                    oklch(var(--p) / 0.05) 45%, 
                    oklch(var(--p) / 0.15) 50%, 
                    oklch(var(--p) / 0.05) 55%, 
                    transparent 100%
                )`,
            }}
        />
        {/* Static horizontal texture */}
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.15)_50%)] bg-[length:100%_4px]" />
    </div>
);

export const pageVariants: Variants = {
    hidden: { 
        clipPath: 'inset(100% 0 0 0)',
        opacity: 0,
        scale: 0.98,
        filter: 'blur(10px)',
    },
    visible: { 
        clipPath: 'inset(0% 0 0 0)',
        opacity: 1,
        scale: 1,
        filter: 'blur(0px)',
        transition: { 
            duration: 1.2,
            ease: [0.16, 1, 0.3, 1] as any,
            when: "beforeChildren",
            staggerChildren: 0.1
        }
    },
    exit: {
        clipPath: 'inset(100% 0 0 0)',
        opacity: 0,
        scale: 0.98,
        filter: 'blur(20px)',
        transition: {
            duration: 0.8,
            ease: [0.7, 0, 0.84, 0] as any,
            when: "afterChildren",
            staggerChildren: 0.1,
            staggerDirection: -1
        }
    }
};

export const pageHeaderVariants: Variants = {
    hidden: { opacity: 0, x: -30 },
    visible: { 
        opacity: 1, 
        x: 0,
        transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] }
    },
    exit: { 
        opacity: 0, 
        x: -60,
        transition: { duration: 0.4, ease: [0.7, 0, 0.84, 0] }
    }
};

export const pageBodyVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { 
        opacity: 1,
        transition: { duration: 0.6 }
    },
    exit: { 
        opacity: 0,
        transition: { duration: 0.3 }
    }
};

export const pageFooterVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
        opacity: 1, 
        y: 0,
        transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] }
    },
    exit: { 
        opacity: 0, 
        y: 40,
        transition: { duration: 0.4, ease: [0.7, 0, 0.84, 0] }
    }
};

export const reverseTextVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { 
        opacity: 0,
        transition: { duration: 0.2 }
    }
};

export const panelVariants: Variants = {
    hidden: { 
        opacity: 0,
        scale: 0.95,
        transformOrigin: "top left"
    },
    visible: { 
        opacity: 1,
        scale: 1,
        transition: { 
            duration: 0.5,
            delay: 0.1,
            ease: [0.16, 1, 0.3, 1] as any,
            when: "beforeChildren",
            staggerChildren: 0.1
        }
    },
    exit: {
        opacity: 0,
        scale: 0.95,
        transformOrigin: "top left",
        transition: {
            duration: 0.4,
            ease: [0.7, 0, 0.84, 0] as any,
            when: "afterChildren",
            staggerChildren: 0.05,
            staggerDirection: -1
        }
    }
};

export const sectionWipeVariants: Variants = {
    hidden: { 
        clipPath: 'inset(0 100% 0 0)',
        opacity: 0,
    },
    visible: (custom: number = 0) => ({ 
        clipPath: 'inset(0 -100% -500% -100%)',
        opacity: 1,
        transition: { 
            duration: 1.0, 
            ease: [0.16, 1, 0.3, 1] as any,
            delay: custom
        }
    }),
    exit: {
        clipPath: 'inset(0 100% 0 0)',
        opacity: 0,
        transition: {
            duration: 0.5,
            ease: [0.7, 0, 0.84, 0] as any,
        }
    }
};

export const contentVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: (custom: number = 0) => ({
        opacity: 1,
        y: 0,
        transition: { 
            duration: 0.8, 
            ease: [0.16, 1, 0.3, 1] as any,
            delay: custom 
        }
    }),
    exit: {
        opacity: 0,
        y: 20,
        transition: { 
            duration: 0.4, 
            ease: [0.7, 0, 0.84, 0] as any 
        }
    }
};
