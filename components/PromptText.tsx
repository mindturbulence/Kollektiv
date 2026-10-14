import React from 'react';

const TIME_LABEL = /^(\d+\s*[–-]\s*\d+\s*s)\s*:\s*(.*)$/;
const NAME_LABEL = /^([A-Z][A-Za-z ]{1,24}):\s*(.*)$/;

/** Result text with its paragraph breaks, timestamp labels pinned in a left column and section labels bolded. */
const PromptText: React.FC<{ text: string }> = ({ text }) => {
    const paragraphs = text.split(/\n\s*\n/).map(p => p.split('\n').filter(l => l.trim()));
    if (paragraphs.length === 1 && paragraphs[0].length === 1) {
        return <p className="text-base font-medium leading-relaxed text-base-content italic selection:bg-primary/20">&ldquo;{paragraphs[0][0]}&rdquo;</p>;
    }
    return (
        <div className="space-y-4 text-base font-medium leading-relaxed text-base-content selection:bg-primary/20">
            {paragraphs.map((lines, pi) => (
                <div key={pi} className="space-y-2">
                    {lines.map((line, li) => {
                        const t = TIME_LABEL.exec(line.trim());
                        if (t) {
                            return (
                                <div key={li} className="grid grid-cols-[4.5rem_1fr] gap-3 items-baseline">
                                    <span className="font-mono text-xs font-bold text-primary tabular-nums">{t[1].replace(/\s+/g, '')}</span>
                                    <p>{t[2]}</p>
                                </div>
                            );
                        }
                        const n = NAME_LABEL.exec(line.trim());
                        return n
                            ? <p key={li}><span className="font-bold text-base-content/70">{n[1]}:</span> {n[2]}</p>
                            : <p key={li}>{line}</p>;
                    })}
                </div>
            ))}
        </div>
    );
};

export default PromptText;
