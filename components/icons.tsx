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
        <path d="M7 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
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

export const InformationCircleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
    <path d="M12 9h.01" /><path d="M11 12h1v4h1" />
  </svg>
);

export const Cog6ToothIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" />
    <path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
  </svg>
);

export const CpuChipIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <rect x="5" y="5" width="14" height="14" rx="1" /><path d="M9 9h6v6h-6z" /><path d="M3 10h2" />
    <path d="M3 14h2" /><path d="M10 3v2" /><path d="M14 3v2" /><path d="M21 10h-2" /><path d="M21 14h-2" />
    <path d="M14 21v-2" /><path d="M10 21v-2" />
  </svg>
);

export const PromptIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M10 14v-4a2 2 0 1 1 4 0v4" /><path d="M10 12h4" />
    <path d="M21 15a8 8 0 0 0 -8 -8h-1a8 8 0 0 0 -6.47 3.5a8 8 0 0 0 -.53 9.5a8 8 0 0 0 5 4.5h1a8 8 0 0 0 8 -8" />
  </svg>
);

export const PhotoIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M15 8h.01" /><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z" />
    <path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" /><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l2 2" />
  </svg>
);

export const FolderClosedIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2" />
  </svg>
);

export const PlayIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M7 4v16l13 -8z" />
  </svg>
);

export const DeleteIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" />
    <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
  </svg>
);

export const LinkIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M10 14a3.5 3.5 0 0 0 5 0l4 -4a3.5 3.5 0 0 0 -5 -5l-.5 .5" />
    <path d="M14 10a3.5 3.5 0 0 0 -5 0l-4 4a3.5 3.5 0 0 0 5 5l.5 -.5" />
  </svg>
);

export const UploadIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 9l5 -5l5 5" /><path d="M12 4l0 12" />
  </svg>
);

export const ChevronDownIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M6 9l6 6l6 -6" />
  </svg>
);

export const EditIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M4 20h4l10.5 -10.5a1.5 1.5 0 0 0 -4 -4l-10.5 10.5v4" /><line x1="13.5" y1="6.5" x2="17.5" y2="10.5" />
  </svg>
);

export const SparklesIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2" />
    <path d="M8 12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2" />
    <path d="M12 2v2" /><path d="M20 12h2" /><path d="M12 20v2" /><path d="M4 12h2" />
  </svg>
);

export const TextIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M7 20h10" />
    <path d="M12 4v16" />
  </svg>
);

export const BookmarkIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M9 4h6a2 2 0 0 1 2 2v14l-5-3l-5 3v-14a2 2 0 0 1 2 -2" />
    </svg>
);

export const CloseIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M18 6l-12 12" />
        <path d="M6 6l12 12" />
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

export const UsersIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
        <path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        <path d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
    </svg>
);

export const AppLogoIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" {...props}>
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{stopColor: 'currentColor', stopOpacity: 1}} />
        <stop offset="100%" style={{stopColor: 'currentColor', stopOpacity: 0.5}} />
      </linearGradient>
    </defs>
    <path d="M50,5 A45,45 0 1,1 50,95 A45,45 0 0,1 50,5 M50,15 A35,35 0 1,0 50,85 A35,35 0 0,0 50,15" fill="url(#grad1)" fillRule="evenodd"/>
    <circle cx="50" cy="50" r="10" fill="currentColor"/>
  </svg>
);

export const MenuIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M4 6l16 0" /><path d="M4 12l16 0" /><path d="M4 18l16 0" />
    </svg>
);

export const SunIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
        <path d="M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7" />
    </svg>
);

export const MoonIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" />
    </svg>
);

export const ViewColumnsIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
        <path d="M12 4l0 16" />
    </svg>
);

export const ViewGridIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M4 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
        <path d="M14 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
        <path d="M4 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
        <path d="M14 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
    </svg>
);

export const ViewListIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M9 6l11 0" /><path d="M9 12l11 0" /><path d="M9 18l11 0" />
        <path d="M5 6l0 .01" /><path d="M5 12l0 .01" /><path d="M5 18l0 .01" />
    </svg>
);

export const ArrowsUpDownIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M7 3l0 18" /><path d="M10 6l-3 -3l-3 3" />
        <path d="M17 21l0 -18" /><path d="M20 18l-3 3l-3 -3" />
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

export const ThumbTackIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M15 4.5l-4 4l-4 1.5l-1.5 1.5l7 7l1.5 -1.5l1.5 -4l4 -4" />
        <path d="M9 15l-4.5 4.5" /><path d="M14.5 4l5.5 5.5" />
    </svg>
);

export const ImageBrokenIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M15 8h.01" /><path d="M11.996 11.999l-4.996 -5l-4 8" />
        <path d="M17 21l-1.121 -2.243m-2.884 -5.756l-3.995 -8.001a3 3 0 0 1 2.682 -4h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -.996 2.121" />
        <path d="M14 14l1 -1c.617 -.595 1.328 -.783 2.007 -.59l2.553 .686" />
        <path d="M3 3l18 18" />
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

export const CenterIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M4 12h-1" /><path d="M9 12h-1" /><path d="M16 12h-1" />
        <path d="M21 12h-1" /><path d="M12 4v-1" /><path d="M12 9v-1" />
        <path d="M12 16v-1" /><path d="M12 21v-1" />
    </svg>
);

export const FolderOpenIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M5 19l2.757 -7.351a1 1 0 0 1 .936 -.649h12.307a1 1 0 0 1 .986 1.164l-.996 5.211a2 2 0 0 1 -1.964 1.625h-14.026a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2h4l3 3h7a2 2 0 0 1 2 2v2" />
    </svg>
);

export const CropIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M8 5v10a1 1 0 0 0 1 1h10" /><path d="M5 8h10a1 1 0 0 1 1 1v10" />
    </svg>
);

export const FilmIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
        <path d="M8 4l0 16" /><path d="M16 4l0 16" /><path d="M4 8l4 0" />
        <path d="M4 16l4 0" /><path d="M4 12l16 0" /><path d="M16 8l4 0" /><path d="M16 16l4 0" />
    </svg>
);

export const DownloadIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
        <path d="M7 11l5 5l5 -5" /><path d="M12 4l0 12" />
    </svg>
);

export const RefreshIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...commonProps} {...props}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
        <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
    </svg>
);

export const PaletteIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M12 21a9 9 0 1 1 0 -18a9 9 0 0 1 0 18z" />
    <path d="M3.6 9h16.8" />
    <path d="M3.6 15h16.8" />
    <path d="M11.5 3a17 17 0 0 0 0 18" />
    <path d="M12.5 3a17 17 0 0 1 0 18" />
  </svg>
);

export const AspectRatioIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...commonProps} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M3 5.5a2.5 2.5 0 0 1 5 0v13a2.5 2.5 0 0 1 -5 0v-13z" />
    <path d="M16 5.5a2.5 2.5 0 0 1 5 0v13a2.5 2.5 0 0 1 -5 0v-13z" />
  </svg>
);