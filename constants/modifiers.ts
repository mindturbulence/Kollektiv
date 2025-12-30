
export const PROMPT_DETAIL_LEVELS = {
  SHORT: 'Short',
  MEDIUM: 'Medium',
  LONG: 'Long',
};

// --- Midjourney Specific Modifiers ---
export const MIDJOURNEY_VERSIONS = ["6", "5.2", "5.1", "5", "4"];
export const MIDJOURNEY_ASPECT_RATIOS = ["1:1", "2:3", "3:2", "4:5", "5:4", "9:16", "16:9"];

// --- Z-Image Specific Styles ---
export const Z_IMAGE_STYLES = [
    'Lo-fi Mobile Photo',
    'Casual Mobile Photo',
    'Vintage Candid Photo',
    'Classic Film Photo',
    'Analog Photo',
    'Vintage Introspection',
    'Wide Angle / Peephole',
    'Low-Poly Render',
    'Comic',
    'Vintage Comic',
    'Anime',
    'Oil Painting',
    'Minimalist Sketchwash',
    'Retro Pixel Art',
    'Vintage VGA Monitor'
];

// --- Refiner Dropdown Options ---
export const COMPOSITION_OPTIONS = [
    'Rule of Thirds', 'Golden Ratio', 'Leading Lines', 'Symmetry', 'Asymmetrical Balance',
    'Frame within a Frame', 'Vanishing Point', 'Centered Composition', 'Diagonal Composition'
];

export const CAMERA_ANGLES = [
    'Eye Level Shot',
    'High Angle Shot',
    'Low Angle Shot',
    'Bird\'s Eye View',
    'Worm\'s Eye View',
    'Dutch Angle (Canted)',
    'Over-the-Shoulder Shot',
    'POV (Point of View)',
    'Top-Down Shot',
    'Under-View Shot',
    'Hip Level Shot',
    'Knee Level Shot',
    'Ground Level Shot',
    'Shoulder Level Shot',
    'Extreme High Angle',
    'Extreme Low Angle'
];

export const CAMERA_PROXIMITY = [
    'Extreme Close-Up',
    'Close-Up',
    'Medium Close-Up',
    'Medium Shot',
    'Medium Long Shot',
    'Long Shot',
    'Full Shot',
    'Extreme Long Shot',
    'Establishing Shot',
    'Macro Shot',
    'Microscopic Shot',
    'Wide Shot',
    'Very Wide Shot',
    'Zoomed In',
    'Zoomed Out',
    'Telephoto Zoom',
    'Super Wide Angle'
];

export const CAMERA_SETTINGS = [
    'Fast Shutter Speed',
    'Slow Shutter Speed',
    'Motion Blur',
    'Deep Depth of Field',
    'Shallow Depth of Field',
    'Bokeh',
    'Sharp Focus',
    'Soft Focus',
    'Out of Focus',
    'Lens Flare',
    'Chromatic Aberration',
    'High ISO Grain',
    'Long Exposure',
    'Double Exposure',
    'Time-lapse',
    'High Dynamic Range (HDR)',
    'Vignetting',
    'Motion Trails',
    'Light Painting',
    'High Contrast',
    'Low Contrast',
    'High Saturation',
    'Desaturated',
    'Overexposed',
    'Underexposed'
];

export const FILM_TYPES = [
    'Black and White',
    'Monochromatic',
    'Polaroid',
    'Instax',
    'Kodachrome',
    'Ektachrome',
    'Fujifilm Velvia',
    'Agfacolor',
    'Technicolor',
    'Sepia',
    'Cyanotype',
    'Daguerreotype',
    'Orthochromatic',
    'Panchromatic',
    'Infrared Film',
    '35mm Film',
    '70mm IMAX',
    'Super 8',
    '16mm',
    'Grainy Film',
    'Damaged Film Stock',
    'Expired Film',
    'Cross Processed',
    'Bleach Bypass',
    'Autochrome',
    'Calotype'
];

export const LIGHTING_OPTIONS = [
    'Cinematic Lighting', 'Volumetric Lighting', 'Soft Light', 'Hard Light', 'Rim Lighting',
    'Backlighting', 'Studio Lighting', 'Golden Hour', 'Blue Hour', 'Neon Lighting',
    'Chiaroscuro', 'Ambient Occlusion', 'Global Illumination', 'Crepuscular Rays'
];

export const PHOTOGRAPHY_STYLES = [
    'Street Photography',
    'Portrait Photography',
    'Landscape Photography',
    'Wildlife Photography',
    'Macro Photography',
    'Architectural Photography',
    'Fashion Photography',
    'Food Photography',
    'Abstract Photography',
    'Documentary Photography',
    'Glamour Photography',
    'Still Life Photography',
];

export const CAMERA_TYPES = [
    'DSLR', 'Mirrorless Camera', 'Film Camera', 'Action Camera (GoPro)', 'Drone Footage',
    'Security Camera Footage', 'Smartphone Camera', 'Analog Film', 'Pinhole Camera', 'Vintage Camera'
];

export const CAMERA_MOVEMENT_OPTIONS = [
    'Static Camera', 'Panning Shot', 'Tilting Shot', 'Dolly Zoom', 'Tracking Shot',
    'Crane Shot', 'Handheld Movement', 'Drone Flyover', 'Orbit Shot', 'POV (Point of View)',
    'Fast Zoom In', 'Slow Zoom Out', 'Steadicam Follow'
];

export const MOTION_OPTIONS = [
    'Subtle Movement', 'Fast Action', 'Fluid Motion', 'Slow Motion (Slo-mo)',
    'Explosive Energy', 'Graceful Flow', 'Chaotic Motion', 'Time-lapse Style',
    'Windy Atmosphere', 'Gentle Breeze', 'High-Speed Chase'
];

export const LENS_TYPES = [
    'Wide-Angle Lens', 'Telephoto Lens', 'Macro Lens', 'Prime Lens (50mm)', 'Fisheye Lens',
    'Tilt-Shift Lens', 'Anamorphic Lens', 'Lens Flare'
];

export const ANALOG_FILM_STOCKS = [
    // Kodak
    'Kodak Portra 400',
    'Kodak Portra 160',
    'Kodak Portra 800',
    'Kodak Ektar 100',
    'Kodak Gold 200',
    'Kodak ColorPlus 200',
    'Kodak Pro Image 100',
    'Kodak Vision3 50D',
    'Kodak Vision3 250D',
    'Kodak Vision3 500T',
    'Kodak Tri-X 400',
    'Kodak T-MAX 400',
    // Fujifilm
    'Fujifilm Superia X-TRA 400',
    'Fujifilm Pro 400H',
    'Fujifilm Fujicolor C200',
    'Fujifilm Velvia 50',
    'Fujifilm Provia 100F',
    'Fujifilm Acros 100',
    // CineStill
    'CineStill 800T',
    'CineStill 50D',
    'CineStill 400D',
    // Ilford
    'Ilford HP5 Plus 400',
    'Ilford Delta 3200',
    'Ilford FP4 Plus 125',
    // Lomography
    'Lomography Color Negative 400',
    'Lomography Color Negative 800',
    'Lomography LomoChrome Metropolis',
    'Lomography LomoChrome Purple',
];
