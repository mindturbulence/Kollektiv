
import React from 'react';

// Icons from Tabler Icons (tabler.io) & custom icons

const commonProps = {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const SearchIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
    <path d="M21 21l-6 -6" />
  </svg>
);

export const LayoutGridSmIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M4 4m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" />
    <path d="M10 4m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" />
    <path d="M16 4m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" />
    <path d="M4 10m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" />
    <path d="M10 10m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" />
    <path d="M16 10m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" />
    <path d="M4 16m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" />
    <path d="M10 16m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" />
    <path d="M16 16m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" />
  </svg>
);

export const LayoutGridMdIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M4 4m0 1a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1z" />
    <path d="M13 4m0 1a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1z" />
    <path d="M4 13m0 1a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1z" />
    <path d="M13 13m0 1a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1z" />
  </svg>
);

export const LayoutGridLgIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
  </svg>
);

export const LayoutDashboardIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M5 4h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1" />
    <path d="M5 16h4a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1" />
    <path d="M15 12h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1" />
    <path d="M15 4h4a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1" />
  </svg>
);

export const ScissorsIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M6 7m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
        <path d="M6 17m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
        <path d="M8.6 8.6l10.4 10.4" />
        <path d="M8.6 15.4l10.4 -10.4" />
    </svg>
);

export const ClockIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
        <path d="M12 7v5l3 3" />
    </svg>
);

export const EyeIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
        <path d="M22 12c-2.667 4.667 -6 7 -10 7s-7.333 -2.333 -10 -7c2.667 -4.667 6 -7 10 -7s7.333 2.333 10 7" />
    </svg>
);

export const FunctionIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M14 10h1a2 2 0 0 1 2 2v1a2 2 0 0 1 -2 2h-1" />
        <path d="M10 15.5c.667 -1 1.667 -2.4 3 -3.5" />
        <path d="M3 19c0 1.5 .5 3 2 4" />
        <path d="M12 5c-5.5 0 -9 3.5 -9 9" />
        <path d="M19 4c1.5 0 3 .5 4 2" />
        <path d="M14 19c5.5 0 8.5 -3.5 8.5 -9" />
    </svg>
);

export const BrainIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M15.5 14a3.5 3.5 0 0 0 -3.5 3.5v1a3.5 3.5 0 0 0 7 0v-1.8" />
        <path d="M8.5 14a3.5 3.5 0 0 1 3.5 3.5v1a3.5 3.5 0 0 1 -7 0v-1.8" />
        <path d="M17.5 16a3.5 3.5 0 0 0 0 -7h-1.5" />
        <path d="M19 9.3v-2.8a3.5 3.5 0 0 0 -7 0" />
        <path d="M6.5 16a3.5 3.5 0 0 1 0 -7h1.5" />
        <path d="M5 9.3v-2.8a3.5 3.5 0 0 1 7 0v10" />
    </svg>
);

export const ScaleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M7 20l10 0" />
        <path d="M6 6l6 -1l6 1" />
        <path d="M12 3l0 17" />
        <path d="M9 12l-3 -6l-3 6a3 3 0 0 0 6 0" />
        <path d="M21 12l-3 -6l-3 6a3 3 0 0 0 6 0" />
    </svg>
);

export const AlertTriangleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M12 9v2m0 4v.01" />
        <path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.5 0l-7.1 12.25a2 2 0 0 0 1.75 2.75" />
  </svg>
);

export const GitBranchIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M7 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
        <path d="M7 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -2 0" />
        <path d="M17 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
        <path d="M7 8v8" />
        <path d="M9 18h6a2 2 0 0 0 2 -2v-5" />
        <path d="M14 14l3 -3l3 3" />
    </svg>
);

export const TemplateIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M4 4h16v4h-16z" />
        <path d="M4 12h6v8h-6z" />
        <path d="M14 12h6" />
        <path d="M14 16h6" />
        <path d="M14 20h6" />
    </svg>
);

export const WaveSineIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M21 12h-2c-.89 -4.28 -3.995 -6 -7 -6s-6.11 1.72 -7 6h-2" />
        <path d="M3 12h2c.89 4.28 3.995 6 7 6s6.11 -1.72 7 -6h2" />
    </svg>
);

export const AdjustmentsVerticalIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M4 10a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
    <path d="M6 4v4" /><path d="M6 12v8" /><path d="M10 16a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
    <path d="M12 4v10" /><path d="M12 18v2" /><path d="M16 7a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
    <path d="M18 4v1" /><path d="M18 9v11" />
  </svg>
);

export const AppIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M3 5m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" />
        <path d="M6 8h.01" />
        <path d="M9 8h.01" />
    </svg>
);

export const LinkOffIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M9 15l6 -6" />
        <path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-1.828 1.828a5 5 0 0 1 -7.071 0l-1.828 -1.828a5 5 0 0 1 0 -7.071l.463 -.536" />
        <path d="M13 18l-.397 .534a5 5 0 0 1 -7.071 -7.072l1.828 -1.828a5 5 0 0 1 7.071 0l1.828 1.828a5 5 0 0 1 0 7.071l-.397 .534" />
        <path d="M3 3l18 18" />
    </svg>
);

export const Atom2Icon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
    <path d="M12 21l0 -2" />
    <path d="M20.61 17.61l-1.41 -1.41" />
    <path d="M21 12l-2 0" />
    <path d="M17.61 3.39l-1.41 1.41" />
    <path d="M12 3l0 2" />
    <path d="M6.39 3.39l1.41 1.41" />
    <path d="M3 12l2 0" />
    <path d="M3.39 17.61l1.41 -1.41" />
  </svg>
);

export const ViewSplitHorizontalIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M3 12h18" />
        <path d="M3 6a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" />
        <path d="M3 16a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" />
    </svg>
);

export const BookOpenIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0" />
    <path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0" />
    <path d="M3 6l0 13" /><path d="M12 6l0 13" /><path d="M21 6l0 13" />
  </svg>
);

export const PaintBrushIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M3 21v-4a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v4" />
    <path d="M21 3a16 16 0 0 0 -12 12a16 16 0 0 0 12 12" />
  </svg>
);

export const CheckIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M5 12l5 5l10 -10" />
  </svg>
);

// --- Added Missing Icons ---

export const InformationCircleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
    <path d="M12 9h.01" />
    <path d="M11 12h1v4h1" />
  </svg>
);

export const DownloadIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
    <path d="M7 11l5 5l5 -5" />
    <path d="M12 4l0 12" />
  </svg>
);

export const SparklesIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z" />
  </svg>
);

export const PhotoIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M15 8h.01" />
    <path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z" />
    <path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" />
    <path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" />
  </svg>
);

export const FilmIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M3 5m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" />
    <path d="M7 5l0 14" />
    <path d="M17 5l0 14" />
    <path d="M3 9l4 0" />
    <path d="M3 15l4 0" />
    <path d="M17 9l4 0" />
    <path d="M17 15l4 0" />
  </svg>
);

export const Cog6ToothIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37a1.724 1.724 0 0 0 2.572 -1.065z" />
    <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
  </svg>
);

export const CpuChipIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M5 5m0 1a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1z" />
    <path d="M9 9h6v6h-6z" />
    <path d="M3 10h2" />
    <path d="M3 14h2" />
    <path d="M10 3v2" />
    <path d="M14 3v2" />
    <path d="M19 10h2" />
    <path d="M19 14h2" />
    <path d="M10 19v2" />
    <path d="M14 19v2" />
  </svg>
);

export const PromptIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M5 7l5 5l-5 5" />
    <path d="M12 19l7 0" />
  </svg>
);

export const FolderClosedIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2" />
  </svg>
);

export const FolderOpenIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M5 19l2.757 -7.351a1 1 0 0 1 .936 -.649h12.307a1 1 0 0 1 .986 1.164l-.887 3.548a2 2 0 0 1 -1.941 1.515h-14.172z" />
    <path d="M5 19v-11a2 2 0 0 1 2 -2h3l2 2h5a2 2 0 0 1 2 2v2" />
  </svg>
);

export const DeleteIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M4 7l16 0" />
    <path d="M10 11l0 6" />
    <path d="M14 11l0 6" />
    <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
    <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
  </svg>
);

export const EditIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" />
    <path d="M13.5 6.5l4 4" />
  </svg>
);

export const ArrowsUpDownIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M7 3l0 18" />
    <path d="M10 6l-3 -3l-3 3" />
    <path d="M20 18l-3 3l-3 -3" />
    <path d="M17 21l0 -18" />
  </svg>
);

export const GripVerticalIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M9 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    <path d="M9 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    <path d="M9 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    <path d="M15 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    <path d="M15 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    <path d="M15 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
  </svg>
);

export const ImageBrokenIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M5 7h1a2 2 0 0 0 2 -2v-1" />
    <path d="M16 4v1a2 2 0 0 0 2 2h1" />
    <path d="M19 16v1a2 2 0 0 1 -2 2h-1" />
    <path d="M8 20h-1a2 2 0 0 1 -2 -2v-1" />
    <path d="M8 4h8" />
    <path d="M20 8v8" />
    <path d="M16 20h-8" />
    <path d="M4 16v-8" />
    <path d="M12 12l1 1" />
    <path d="M10 10l1 1" />
  </svg>
);

export const ThumbTackIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    className="w-5 h-5"
    {...props}
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M15.113 3.21l.094 .083l5.5 5.5a1 1 0 0 1 -1.175 1.59l-3.172 3.171l-1.424 3.797a1 1 0 0 1 -.158 .277l-.07 .08l-1.5 1.5a1 1 0 0 1 -1.32 .082l-.095 -.083l-2.793 -2.792l-3.793 3.792a1 1 0 0 1 -1.497 -1.32l.083 -.094l3.792 -3.793l-2.792 -2.793a1 1 0 0 1 -.083 -1.32l.083 -.094l1.5 -1.5a1 1 0 0 1 .258 -.187l.098 -.042l3.796 -1.425l3.171 -3.17a1 1 0 0 1 1.497 -1.26z" />
  </svg>
);

export const EllipsisVerticalIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    <path d="M12 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    <path d="M12 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
  </svg>
);

export const ChevronLeftIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M15 6l-6 6l6 6" />
  </svg>
);

export const ChevronRightIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M9 6l6 6l-6 6" />
  </svg>
);

export const ChevronDownIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M6 9l6 6l6 -6" />
  </svg>
);

export const HomeIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M5 12l-2 0l9 -9l9 9l-2 0" />
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" />
    <path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6" />
  </svg>
);

export const AppLogoIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M3 5m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" />
    <path d="M6 8h.01" />
    <path d="M9 8h.01" />
  </svg>
);

export const PaletteIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.982 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25" />
    <path d="M8.5 10.5m-1 0a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0" />
    <path d="M12.5 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    <path d="M16.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
  </svg>
);

export const AspectRatioIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M3 19h18" />
    <path d="M19 19v-10" />
    <path d="M19 5v2" />
    <path d="M3 5h2" />
    <path d="M3 7v12" />
  </svg>
);

export const CropIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M8 5v10a2 2 0 0 0 2 2h10" />
    <path d="M5 8h10a2 2 0 0 1 2 2v10" />
  </svg>
);

export const ViewColumnsIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M4 4h16v16h-16z" />
    <path d="M12 4v16" />
  </svg>
);

export const UsersIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
    <path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    <path d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
  </svg>
);

export const MenuIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M4 6l16 0" />
    <path d="M4 12l16 0" />
    <path d="M4 18l16 0" />
  </svg>
);

export const BookmarkIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M9 4h6a2 2 0 0 1 2 2v14l-5 -3l-5 3v-14a2 2 0 0 1 2 -2" />
  </svg>
);

export const CloseIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M18 6l-12 12" />
    <path d="M6 6l12 12" />
  </svg>
);

export const CenterIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
    <path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    <path d="M12 3l0 3" />
    <path d="M12 18l0 3" />
    <path d="M3 12l3 0" />
    <path d="M18 12l3 0" />
  </svg>
);

export const RefreshIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
    <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
  </svg>
);

export const SunIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
    <path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7" />
  </svg>
);

export const MoonIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" />
  </svg>
);

export const PlayIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M7 4v16l13 -8z" />
  </svg>
);

export const LinkIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M10 14a3.5 3.5 0 0 0 5 0l4 -4a3.5 3.5 0 0 0 -5 -5l-.5 .5" />
    <path d="M14 10a3.5 3.5 0 0 0 -5 0l-4 4a3.5 3.5 0 0 0 5 5l.5 -.5" />
  </svg>
);

export const ViewGridIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M4 4h6v6h-6z" />
    <path d="M14 4h6v6h-6z" />
    <path d="M4 14h6v6h-6z" />
    <path d="M14 14h6v6h-6z" />
  </svg>
);

export const UploadIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
    <path d="M7 9l5 -5l5 5" />
    <path d="M12 4l0 12" />
  </svg>
);

export const ArchiveIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M3 4m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" />
    <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-10" />
    <path d="M10 12l4 0" />
  </svg>
);

export const BracesIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M7 4a2 2 0 0 0 -2 2v3a2 3 0 0 1 -2 3a2 3 0 0 1 2 3v3a2 2 0 0 0 2 2" />
    <path d="M17 4a2 2 0 0 1 2 2v3a2 3 0 0 0 2 3a2 3 0 0 0 -2 3v3a2 2 0 0 1 -2 2" />
  </svg>
);

export const PlusIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M12 5l0 14" />
    <path d="M5 12l14 0" />
  </svg>
);

export const YouTubeIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M2 8a4 4 0 0 1 4 -4h12a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-12a4 4 0 0 1 -4 -4z" />
    <path d="M10 9l5 3l-5 3z" />
  </svg>
);

export const InstagramIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M4 4m0 4a4 4 0 0 1 4 -4h8a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-8a4 4 0 0 1 -4 -4z" />
    <path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
    <path d="M16.5 7.5l0 .01" />
  </svg>
);
