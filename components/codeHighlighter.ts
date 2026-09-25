// PrismLight keeps refractor's ~900 KB of grammars out of the entry chunk.
// Unregistered languages render as plain text; add a grammar here if a chat
// language shows up often enough to matter.
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';

const languages: Record<string, unknown> = {
    javascript, js: javascript, jsx: tsx,
    typescript, ts: typescript, tsx,
    python, py: python,
    json,
    bash, sh: bash, shell: bash, zsh: bash,
    css,
};
for (const [name, grammar] of Object.entries(languages)) SyntaxHighlighter.registerLanguage(name, grammar);

export { SyntaxHighlighter };
export { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
