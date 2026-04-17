
import { useEffect } from 'react';

// Updates the height of a <textarea> when the value changes.
const useAutosizeTextArea = (
  textAreaRef: HTMLTextAreaElement | null,
  value: string
) => {
  useEffect(() => {
    // Disabled to revert to standard system scrollbar behavior
    /*
    if (textAreaRef) {
      (textAreaRef as any).style.height = "0px";
      const scrollHeight = (textAreaRef as any).scrollHeight;
      (textAreaRef as any).style.height = scrollHeight + "px";
    }
    */
  }, [textAreaRef, value]);
};

export default useAutosizeTextArea;
