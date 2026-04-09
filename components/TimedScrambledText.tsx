import React, { useState, useEffect, useRef, useCallback } from 'react';

const TimedScrambledText: React.FC<{ text: string; intervalMs: number; trigger?: any }> = ({ text, intervalMs, trigger }) => {
    const [display, setDisplay] = useState(text);
    const chars = '0123456789ABCDEF!@#%^&*';
    const intervalRef = useRef<number | null>(null);

    const startScramble = useCallback(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        let iteration = 0;
        const maxIterations = 15;
        
        intervalRef.current = window.setInterval(() => {
            setDisplay(text.split('').map((char, index) => {
                if (char === ' ') return ' ';
                if (Math.random() < iteration / maxIterations) return text[index];
                return chars[Math.floor(Math.random() * chars.length)];
            }).join(''));
            
            iteration++;
            if (iteration >= maxIterations) {
                if (intervalRef.current) clearInterval(intervalRef.current);
            }
        }, 50);
    }, [text]);

    useEffect(() => {
        if (trigger !== undefined) {
            startScramble();
        }
    }, [trigger, startScramble]);

    useEffect(() => {
        const timer = setInterval(() => {
            startScramble();
        }, intervalMs);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            clearInterval(timer);
        };
    }, [intervalMs, startScramble]);

    return <span>{display}</span>;
};

export default TimedScrambledText;
