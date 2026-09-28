import React, { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Modal from './Modal';
import { appEventBus, type AppEvents } from '../utils/eventBus';

/** Read-only viewer for vault notes opened from the command palette or the
 *  assistant's obsidian_open_in_ui tool (via the `openNote` event). */
const NoteViewer: React.FC = () => {
  const [note, setNote] = useState<AppEvents['openNote'] | null>(null);

  useEffect(() => appEventBus.on('openNote', setNote), []);

  return (
    <Modal isOpen={note !== null} onClose={() => setNote(null)} title={note?.title ?? ''} size="xl">
      {note && (
        <>
          <div className="text-xs font-mono text-base-content/60 mb-3 truncate">{note.path}</div>
          <div className="prose prose-base prose-invert max-w-none max-h-[65vh] overflow-y-auto custom-scrollbar">
            <Markdown remarkPlugins={[remarkGfm]}>{note.content}</Markdown>
          </div>
        </>
      )}
    </Modal>
  );
};

export default NoteViewer;
