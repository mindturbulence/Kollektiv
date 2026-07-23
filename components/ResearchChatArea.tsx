import React, { useRef, useEffect } from 'react';
import { useResearch } from '../contexts/ResearchContext';
import { SparklesIcon } from './icons';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const ResearchChatArea: React.FC = () => {
  const { messages, sendMessage, isProcessing, error, clearError } = useResearch();
  const [input, setInput] = React.useState('');
  const [lastSendError, setLastSendError] = React.useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
    }
  }, [input]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isProcessing) return;
    const text = input.trim();
    setInput('');
    setLastSendError(null);
    const result = await sendMessage(text);
    if (!result.ok) {
      setLastSendError(result.error);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-w-0 bg-base-100/20">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
              <SparklesIcon className="w-5 h-5 text-primary/60" />
            </div>
            <p className="text-sm font-mono opacity-50 max-w-xs">
              Ask a question about your sources to get started.
            </p>
            <p className="text-xs font-mono opacity-30 mt-2">
              Responses include inline citations you can trace back.
            </p>
          </div>
        ) : (
          <div className="p-4 md:p-6 space-y-5">
            {messages.map((msg, i) => (
              <div key={i}>
                {msg.role === 'user' && (
                  <div className="flex justify-end">
                    <div className="bg-primary/20 text-base-content px-4 py-2.5 max-w-[80%] rounded-2xl rounded-tr-sm border border-primary/30 text-sm leading-relaxed">
                      {msg.content}
                    </div>
                  </div>
                )}
                {msg.role === 'assistant' && (
                  <div className="bg-base-200/40 text-base-content px-4 py-3 rounded-2xl rounded-tl-sm border border-white/5 text-sm leading-relaxed">
                    <div className="prose prose-sm prose-invert max-w-none">
                      <Markdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </Markdown>
                    </div>
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <p className="text-[10px] font-mono uppercase tracking-wider opacity-30 mb-1.5">Sources</p>
                        <div className="flex flex-wrap gap-2">
                          {msg.citations.map((c, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-base-300/50 text-[11px] font-mono text-base-content/60 border border-white/5"
                            >
                              <span className="text-primary/70 font-bold">[{c.index}]</span>
                              {c.title}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {msg.role === 'system' && (
                  <div className="text-center">
                    <span className="inline-block text-[11px] font-mono text-warning/60 bg-warning/5 px-2 py-1 rounded border border-warning/10">
                      {msg.content}
                    </span>
                  </div>
                )}
              </div>
            ))}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-base-200/40 px-4 py-3 rounded-2xl rounded-tl-sm border border-white/5">
                  <div className="flex space-x-1.5 items-center h-5">
                    <div className="w-2 h-2 bg-primary/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-2 h-2 bg-primary/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" />
                  </div>
                </div>
              </div>)}
            {(lastSendError || error) && (
              <div className="flex justify-center">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-error/80 bg-error/5 px-3 py-1.5 rounded border border-error/10 max-w-md">
                  <span>⚠</span>
                  <span>{lastSendError || error}</span>
                  <button
                    onClick={() => { setLastSendError(null); clearError(); }}
                    className="ml-1 opacity-50 hover:opacity-100"
                  >×</button>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="px-4 py-3 border-t border-white/5 bg-base-200/20 shrink-0">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Ask about your sources..."
            className="flex-1 bg-base-300/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/50 resize-none transition-colors"
            disabled={isProcessing}
            rows={1}
            style={{ minHeight: '36px', maxHeight: '160px' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className="bg-primary hover:bg-primary-focus text-primary-content p-2.5 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            title="Send"
          >
            <SparklesIcon className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
