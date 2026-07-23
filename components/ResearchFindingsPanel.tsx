import React, { useState, useEffect } from 'react';
import { useResearch } from '../contexts/ResearchContext';
import { EditIcon } from './icons';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const ResearchFindingsPanel: React.FC = () => {
  const { findings, saveFindings } = useResearch();
  const [editText, setEditText] = useState(findings);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => { setEditText(findings); }, [findings]);

  const handleSave = () => {
    saveFindings(editText);
    setIsEditing(false);
  };

  return (
    <div className="w-96 flex-shrink-0 border-l border-white/5 flex flex-col bg-base-200/20">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
        <span className="text-sm font-mono uppercase tracking-wider opacity-50">
          Findings
        </span>
        {isEditing ? (
          <button onClick={handleSave} className="btn btn-xs btn-primary rounded-none px-2">
            Save
          </button>
        ) : (
          <button onClick={() => setIsEditing(true)} className="btn btn-xs btn-ghost rounded-none p-1 opacity-50 hover:opacity-100" aria-label="Edit findings">
            <EditIcon className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        {isEditing ? (
          <textarea
            value={editText}
            onChange={e => setEditText(e.target.value)}
            className="w-full h-full bg-base-300/50 border border-white/10 rounded p-2 text-base font-mono focus:outline-none focus:border-primary/50 resize-none"
          />
        ) : (
          <div className="prose prose-base prose-invert max-w-none">
            {findings ? (
              <Markdown remarkPlugins={[remarkGfm]}>{findings}</Markdown>
            ) : (
              <div className="text-center mt-8">
                <p className="text-sm font-mono opacity-30">No findings yet.</p>
                <p className="text-xs font-mono opacity-20 mt-1">Click edit to add notes.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
