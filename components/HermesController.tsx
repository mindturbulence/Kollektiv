import { useEffect } from 'react';
import { appControlService } from '../services/appControlService';
import { useBusy } from '../contexts/BusyContext';

export function HermesController() {
  const { setIsBusy } = useBusy();

  useEffect(() => {
    const eventSource = new EventSource('/api/events');

    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[HermesController] Received control event:', data);

        if (data.type === 'connected') {
          console.log('[HermesController] SSE Connection Established');
          return;
        }

        if (data.action) {
          setIsBusy(true);
          console.log(`[Hermes] Executing action: ${data.action} with payload:`, data.payload);
          
          if (data.action === 'navigate') {
            appControlService.navigate(data.payload);
          } else if (data.action === 'savePrompt') {
            const result = await appControlService.savePrompt(data.payload.title || 'Hermes Prompt', data.payload.prompt);
            console.log(result);
          } else {
            console.warn(`[Hermes] Unsupported action: ${data.action}`);
          }
          setIsBusy(false);
        }
      } catch (err) {
        setIsBusy(false);
        console.error('[HermesController] Failed to parse SSE event:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('[HermesController] EventSource error. Reconnecting...', err);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [setIsBusy]);

  return null;
}
