import React, { useMemo, useRef, useState } from 'react';
import Modal from '../Modal';

type Request =
  | { kind: 'confirm'; message: string; confirmLabel: string; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; message: string; initial: string; resolve: (value: string | null) => void };

export interface Ask {
  /** Resolves true on OK, false on Cancel / Escape / backdrop. */
  confirm(message: string, confirmLabel?: string): Promise<boolean>;
  /** Resolves the entered text, or null on Cancel / Escape / backdrop. */
  prompt(message: string, initial?: string): Promise<string | null>;
}

const btn = 'h-8 px-3 text-2xs font-mono uppercase border border-base-content/15 text-base-content/70 hover:text-primary hover:border-primary';
const primary = 'h-8 px-3 text-2xs font-mono uppercase border border-primary text-primary hover:bg-primary/10';

const PromptBody: React.FC<{ req: Extract<Request, { kind: 'prompt' }>; done: (v: string | null) => void }> = ({ req, done }) => {
  const [value, setValue] = useState(req.initial);
  return (
    <form className="p-4 flex flex-col gap-3" onSubmit={e => { e.preventDefault(); done(value); }}>
      <input autoFocus aria-label={req.message} value={value} className="form-input h-8 text-xs" onChange={e => setValue(e.target.value)}
        onFocus={e => e.currentTarget.select()} />
      <div className="flex justify-end gap-2">
        <button type="button" className={btn} onClick={() => done(null)}>Cancel</button>
        <button type="submit" className={primary}>OK</button>
      </div>
    </form>
  );
};

/**
 * Promise-based confirm/prompt on the shared Modal — replaces window.confirm /
 * window.prompt (native dialogs block the page, can't be styled or tested, and
 * the Assets Manager's rule is "shared Modal, never window.confirm").
 * Render `dialog` once in the page; a new request cancels one still open.
 */
export function useAsk(): { ask: Ask; dialog: React.ReactNode } {
  const [req, setReq] = useState<Request | null>(null);
  const open = useRef<Request | null>(null);

  const ask = useMemo<Ask>(() => {
    const show = (r: Request) => {
      const prev = open.current;
      if (prev?.kind === 'confirm') prev.resolve(false);
      else if (prev) prev.resolve(null);
      open.current = r;
      setReq(r);
    };
    return {
      confirm: (message, confirmLabel = 'OK') => new Promise<boolean>(resolve => show({ kind: 'confirm', message, confirmLabel, resolve })),
      prompt: (message, initial = '') => new Promise<string | null>(resolve => show({ kind: 'prompt', message, initial, resolve })),
    };
  }, []);

  const finish = (value: boolean | string | null) => {
    const r = open.current;
    if (!r) return;
    open.current = null;
    setReq(null);
    if (r.kind === 'confirm') r.resolve(value === true);
    else r.resolve(typeof value === 'string' ? value : null);
  };

  const dialog = req && (
    <Modal isOpen onClose={() => finish(req.kind === 'confirm' ? false : null)} title={req.kind === 'confirm' ? 'Confirm' : req.message} size="sm">
      {req.kind === 'confirm' ? (
        <div className="p-4 flex flex-col gap-4">
          <p className="text-xs font-mono text-base-content/80">{req.message}</p>
          <div className="flex justify-end gap-2">
            <button type="button" className={btn} onClick={() => finish(false)}>Cancel</button>
            <button type="button" autoFocus className={primary} onClick={() => finish(true)}>{req.confirmLabel}</button>
          </div>
        </div>
      ) : (
        <PromptBody req={req} done={v => finish(v)} />
      )}
    </Modal>
  );
  return { ask, dialog };
}
