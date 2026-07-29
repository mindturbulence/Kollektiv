import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { PaperclipIcon } from './icons';

export interface ChatBubbleMessage {
    /** Stable unique ID, generated at creation time so React.memo keyed on it survives prepend/shift. */
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    attachments?: { data: string; mimeType: string; fileName?: string }[];
    citations?: { index: number; fileName: string; title: string }[];
}

const MessageBubbleImpl: React.FC<{ msg: ChatBubbleMessage; isTyping: boolean }> = ({ msg, isTyping }) => (
    <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : msg.role === 'system' ? 'items-center' : 'items-start'}`}>
        {msg.role === 'system' && !msg.content.includes('Control Node initialized. Awaiting commands.') && (
            <div className="text-[15px] font-mono text-warning/80 bg-warning/10 px-3 py-1.5 rounded-lg border border-warning/20 inline-block my-2">
                &gt; {msg.content}
            </div>
        )}

        {msg.role === 'user' && (
            <div className="bg-primary/30 text-base-content px-4 py-3 max-w-[80%] rounded-2xl rounded-tr-sm border border-primary/40 shadow-sm backdrop-blur-sm flex flex-col gap-2">
                {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {msg.attachments.map((att, idx) => (
                            <div key={idx} className="relative bg-black/20 rounded p-1 overflow-hidden" style={{ width: '80px', height: '80px' }}>
                                {att.mimeType.startsWith('image/') ? (
                                    <img src={att.data} alt={att.fileName} className="w-full h-full object-cover rounded" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-xs opacity-70">
                                        <PaperclipIcon className="w-6 h-6 mb-1" />
                                        <span className="truncate w-full text-center px-1">{att.fileName}</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                <div className="text-[15px] whitespace-pre-wrap">{msg.content}</div>
            </div>
        )}

        {msg.role === 'assistant' && (
            <div className="bg-base-200/80 text-base-content px-4 py-3 max-w-[95%] rounded-2xl rounded-tl-sm border border-white/5 shadow-sm backdrop-blur-sm">
                <div className="prose prose-sm prose-invert max-w-none text-[15px] leading-relaxed">
                    <Markdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            table: ({ node, ...props }) => (
                                <div className="overflow-x-auto my-4 w-full">
                                    <table className="table table-zebra w-full border border-base-content/10 text-[15px]" {...props} />
                                </div>
                            ),
                            th: ({ node, ...props }) => <th className="bg-base-300 text-base-content/80 font-bold text-[15px]" {...props} />,
                            td: ({ node, ...props }) => <td className="text-[15px]" {...props} />,
                            code({ node, inline, className, children, ...props }: any) {
                                const match = /language-(\w+)/.exec(className || '');
                                return !inline && match ? (
                                    <SyntaxHighlighter
                                        {...props}
                                        style={vscDarkPlus}
                                        language={match[1]}
                                        PreTag="div"
                                        className="rounded-md my-4 !bg-base-300"
                                    >
                                        {String(children).replace(/\n$/, '')}
                                    </SyntaxHighlighter>
                                ) : (
                                    <code {...props} className={`${className} bg-base-300 text-primary px-1.5 py-0.5 rounded text-[0.85em]`}>
                                        {children}
                                    </code>
                                );
                            },
                        }}
                    >
                        {msg.content}
                    </Markdown>
                </div>
                {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/10 space-y-1">
                        <p className="text-[10px] font-mono uppercase tracking-wider opacity-40 mb-1">Sources</p>
                        {msg.citations.map((c) => (
                            <div key={c.index} className="flex items-center gap-2 text-xs font-mono opacity-60 hover:opacity-100">
                                <span className="text-primary text-[10px]">[{c.index}]</span>
                                <span className="truncate">{c.title || c.fileName}</span>
                            </div>
                        ))}
                    </div>
                )}
                {!msg.content && isTyping && (
                    <div className="flex space-x-1 items-center h-4 mt-2">
                        <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce"></div>
                    </div>
                )}
            </div>
        )}
    </div>
);

// React.memo's default shallow comparison is sufficient here: LLMChatPanel
// builds its next messages array as [...prev] with only the streaming
// element replaced, so every OTHER element keeps its exact object
// reference across a re-render — memo skips those bubbles entirely.
// Keyed by the message's stable id (not array index) in the parent, so
// prepending older messages doesn't defeat this memoization.
export const MessageBubble = React.memo(MessageBubbleImpl);
