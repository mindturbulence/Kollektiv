import React, { useEffect, useRef } from 'react';

export const TabTitleManager: React.FC<{ defaultTitle: string }> = ({ defaultTitle }) => {
  const currentTitleRef = useRef(defaultTitle);
  const intervalRef = useRef<number | null>(null);

  const typeTerminalText = (targetText: string, speed = 60) => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);

    let currentIndex = 0;
    const cursor = "_";

    intervalRef.current = window.setInterval(() => {
      const revealed = targetText.slice(0, currentIndex);
      const isLast = currentIndex >= targetText.length;
      
      document.title = isLast ? targetText : revealed + cursor;

      if (isLast) {
        if (intervalRef.current) window.clearInterval(intervalRef.current);
      }

      currentIndex++;
    }, speed);
  };

  useEffect(() => {
    // Terminal type when the title prop changes
    typeTerminalText(defaultTitle);
    currentTitleRef.current = defaultTitle;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab inactive
        document.title = "KOLLEKTIV IS WAITING...";
      } else {
        // Tab active - Re-type the current title
        typeTerminalText(currentTitleRef.current, 40);
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [defaultTitle]);

  return null;
};
