import React from 'react';

/** "Oct 6"; empty for a timestamp that is not a real date, so a bad manifest value never renders "Invalid Date". */
export const shortDate = (ms: number): string => {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const MAX_TAGS = 3;

/** First three tags as pills plus "+N"; renders nothing for no tags. */
export const TagPills: React.FC<{ tags: string[] }> = ({ tags }) => {
  if (tags.length === 0) return null;
  const extra = tags.length - MAX_TAGS;
  return (
    <div className="flex gap-1 overflow-hidden">
      {tags.slice(0, MAX_TAGS).map((t) => <span key={t} className="paper-tag max-w-[40%] truncate">{t}</span>)}
      {extra > 0 && <span className="paper-tag shrink-0">+{extra}</span>}
    </div>
  );
};

/** One swatch per palette colour; renders nothing for undefined or []. */
export const PaletteStrip: React.FC<{ palette: string[] | undefined }> = ({ palette }) => {
  if (!palette || palette.length === 0) return null;
  return (
    <div className="flex gap-1">
      {palette.map((hex) => (
        <span
          key={hex}
          role="img"
          aria-label={hex}
          title={hex}
          style={{ backgroundColor: hex }}
          className="h-5 w-5 rounded-md ring-1 ring-inset ring-black/20"
        />
      ))}
    </div>
  );
};

/** Font chips such as "Inter / 56px"; renders nothing for undefined or []. */
export const FontChips: React.FC<{ fonts: string[] | undefined }> = ({ fonts }) => {
  if (!fonts || fonts.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-wrap justify-end gap-1">
      {fonts.map((f) => (
        <span key={f} className="max-w-full truncate rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">{f}</span>
      ))}
    </div>
  );
};
