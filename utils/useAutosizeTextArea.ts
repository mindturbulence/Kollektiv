
import { useEffect } from 'react';

// Updates the height of a <textarea> when the value changes.
const useAutosizeTextArea = (
  textAreaRef: HTMLTextAreaElement | null,
  value: string
) => {
  useEffect(() => {
    if (textAreaRef) {
      // We need to reset the height momentarily to get the correct scrollHeight for shrinking when deleting text.
      (textAreaRef as any).style.height = "0px";
      const scrollHeight = (textAreaRef as any).scrollHeight;

      // We then set the height directly, outside of the render loop.
      // Use max-height to prevent it from growing indefinitely
      (textAreaRef as any).style.height = scrollHeight + "px";
    }
  }, [textAreaRef, value]);
};

export default useAutosizeTextArea;
