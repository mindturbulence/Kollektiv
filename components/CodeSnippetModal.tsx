// CodeSnippetModal.tsx - Modal for exporting generated prompt snippets to code
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const commonProps = {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const CloseIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M18 6l-12 12" />
    <path d="M6 6l12 12" />
  </svg>
);

const CopyIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M8 8m0 2a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z" />
    <path d="M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2" />
  </svg>
);

const CodeIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M7 8l-4 4l4 4" />
    <path d="M17 8l4 4l-4 4" />
    <path d="M14 4l-4 16" />
  </svg>
);

interface CodeSnippetModalProps {
    isOpen: boolean;
    onClose: () => void;
    promptText: string;
}

const CodeSnippetModal: React.FC<CodeSnippetModalProps> = ({
    isOpen,
    onClose,
    promptText,
}) => {
    const [selectedLanguage, setSelectedLanguage] = useState<'gemini' | 'fetch' | 'langchain'>('gemini');
    const [useStreaming, setUseStreaming] = useState(true);
    const [wrapExpress, setWrapExpress] = useState(false);
    const [addErrorHandling, setAddErrorHandling] = useState(true);
    const [copied, setCopied] = useState(false);

    const codeSnippet = useMemo(() => {
        let code = '';
        const safePrompt = (promptText || '').replace(/"/g, '\\"');
        
        if (selectedLanguage === 'gemini') {
            code = `import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

${wrapExpress ? 'app.post("/api/generate", async (req, res) => {' : 'async function generate() {'}
  ${addErrorHandling ? 'try {' : ''}
    const response = ${useStreaming ? 'await ai.models.generateContentStream({' : 'await ai.models.generateContent({'}
      model: 'gemini-2.0-flash',
      contents: "${safePrompt}",
      config: { systemInstruction: "You are a creative assistant." }
    });
    
    ${useStreaming ? 'for await (const chunk of response) { console.log(chunk.text); }' : 'console.log(response.text());'}
  ${addErrorHandling ? '} catch (error) { console.error(error); }' : ''}
${wrapExpress ? '});' : '}'}`;
        } else if (selectedLanguage === 'fetch') {
            code = `const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: "${safePrompt}" })
});
const data = await response.json();
console.log(data);`;
        }

        return code;
    }, [selectedLanguage, promptText, useStreaming, wrapExpress, addErrorHandling]);

    const handleCopy = () => {
        navigator.clipboard.writeText(codeSnippet);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div id="code_snippet_modal_overlay" className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[2000] flex items-center justify-center p-4 md:p-8" onClick={onClose}>
                    <motion.div
                        id="code_snippet_modal_container"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="bg-transparent w-full max-w-3xl relative p-[3px] corner-frame"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="bg-base-100/90 backdrop-blur-2xl rounded-none w-full max-h-[85vh] flex flex-col overflow-hidden border border-primary/10">
                            <header className="px-8 py-6 flex items-center justify-between bg-base-100/20">
                                <div className="flex items-center gap-3">
                                    <CodeIcon className="w-6 h-6 text-primary" />
                                    <h3 id="code_snippet_modal_title" className="text-xl font-black uppercase text-base-content italic">Export Code<span className="text-primary">.</span></h3>
                                </div>
                                <button id="code_snippet_modal_close" onClick={onClose}><CloseIcon className="w-5 h-5 text-base-content/30 hover:text-primary" /></button>
                            </header>

                            <div className="p-6 flex gap-6 overflow-auto">
                                <div className="w-1/3 space-y-4">
                                    <div className="form-control">
                                        <label className="text-[10px] uppercase font-black text-base-content/50">Language</label>
                                        <select id="code_language_select" className="select select-sm w-full bg-base-200" value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value as any)}>
                                            <option value="gemini">Gemini SDK</option>
                                            <option value="fetch">Standard Fetch</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 text-xs">
                                            <input id="streaming_toggle" type="checkbox" checked={useStreaming} onChange={(e) => setUseStreaming(e.target.checked)} /> Streaming
                                        </label>
                                        <label className="flex items-center gap-2 text-xs">
                                            <input id="express_wrapper_toggle" type="checkbox" checked={wrapExpress} onChange={(e) => setWrapExpress(e.target.checked)} /> Express Wrapper
                                        </label>
                                        <label className="flex items-center gap-2 text-xs">
                                            <input id="error_handling_toggle" type="checkbox" checked={addErrorHandling} onChange={(e) => setAddErrorHandling(e.target.checked)} /> Error Handling
                                        </label>
                                    </div>
                                </div>
                                <div className="w-2/3 bg-black/20 p-4 rounded-md font-mono text-xs overflow-auto">
                                    <pre id="code_snippet_preview">{codeSnippet}</pre>
                                </div>
                            </div>
                            
                            <footer className="p-4 bg-base-100/40 flex justify-end">
                                <button id="code_copy_button" className="btn btn-primary btn-sm rounded-none" onClick={handleCopy}>
                                    <CopyIcon className="w-4 h-4 mr-2" /> {copied ? 'COPIED!' : 'COPY'}
                                </button>
                            </footer>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default CodeSnippetModal;
