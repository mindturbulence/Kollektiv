import React, { useEffect, useState } from 'react';
import { loadGalleryItems } from '../../utils/galleryStorage';
import { loadNotes } from '../../utils/notesStorage';
import { loadMemories } from '../../utils/memoryStorage';
import { appEventBus } from '../../utils/eventBus';
import { fileSystemManager } from '../../utils/fileUtils';

const VaultStatsWidget: React.FC = () => {
  const [stats, setStats] = useState({ gallery: 0, notes: 0, memories: 0, files: 0 });

  const refresh = async () => {
    try {        const [galleryItems, notes, memories] = await Promise.all([
            loadGalleryItems(),
            loadNotes(),
            loadMemories(),
          ]);
      let fileCount = 0;
      try {
        if (fileSystemManager.isDirectorySelected()) {
          for await (const h of fileSystemManager.listDirectoryContents('assistant')) {
            if ((h as any).kind === 'file') fileCount++;
          }
        }
      } catch {}
      setStats({
        gallery: galleryItems.filter(i => !i.isNsfw).length,
        notes: notes.length,
        memories: memories.length,
        files: fileCount,
      });
    } catch {}
  };

  useEffect(() => {
    refresh();
    const off1 = appEventBus.on('notesChanged', refresh);
    const off2 = appEventBus.on('assistantFilesChanged', refresh);
    return () => { off1(); off2(); };
  }, []);

  const items = [
    { label: 'Gallery', value: stats.gallery, page: 'gallery' as const },
    { label: 'Notes', value: stats.notes, page: null },
    { label: 'Memories', value: stats.memories, page: null },
    { label: 'Files', value: stats.files, page: null },
  ];

  return (
    <div className="bg-base-100/40 backdrop-blur-xl border border-base-content/10 p-4 relative corner-frame">
      <div className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 mb-3">Vault Stats</div>
      <div className="grid grid-cols-2 gap-2">
        {items.map(item => (
          <button
            key={item.label}
            onClick={() => { if (item.page) appEventBus.emit('navigate', item.page); }}
            className={`flex flex-col items-start p-2 bg-base-200/30 hover:bg-base-200/50 transition-colors text-left ${item.page ? 'cursor-pointer' : ''}`}
          >
            <span className="text-xl font-bold font-mono text-base-content">{item.value}</span>
            <span className="text-[9px] font-mono uppercase tracking-wider text-base-content/40">{item.label}</span>
          </button>
        ))}
      </div>
      <div className="absolute -top-[1px] -left-[1px] w-2 h-2 border-t border-l border-primary/20 pointer-events-none" />
      <div className="absolute -top-[1px] -right-[1px] w-2 h-2 border-t border-r border-primary/20 pointer-events-none" />
    </div>
  );
};

export default VaultStatsWidget;
