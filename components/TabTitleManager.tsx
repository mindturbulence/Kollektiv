import React, { useEffect, useRef } from 'react';

export const TabTitleManager: React.FC<{ defaultTitle: string }> = ({ defaultTitle }) => {
  const currentTitleRef = useRef(defaultTitle);
  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const typeTerminalText = (targetText: string, speed = 50) => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);

    let currentIndex = 0;
    const beam = "█";

    // Immediate start with beam
    document.title = beam;

    // Small delay before typing starts
    timeoutRef.current = window.setTimeout(() => {
        intervalRef.current = window.setInterval(() => {
          currentIndex++;
          const revealed = targetText.slice(0, currentIndex);
          const isComplete = currentIndex >= targetText.length;
          
          // Use the blocky beam during typing
          document.title = isComplete ? targetText : revealed + beam;
    
          if (isComplete) {
            if (intervalRef.current) window.clearInterval(intervalRef.current);
          }
        }, speed);
    }, 200);
  };

  useEffect(() => {
    // Start typing immediately
    typeTerminalText(defaultTitle);
    currentTitleRef.current = defaultTitle;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (intervalRef.current) window.clearInterval(intervalRef.current);
        document.title = "KOLLEKTIV IS WAITING...";
      } else {
        typeTerminalText(currentTitleRef.current, 30);
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [defaultTitle]);

  return null;
};
