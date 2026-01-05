
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

export const CAMERA_EFFECTS = [
    'Abstract Effect',
    'Bokeh Blur',
    'Cross-processing',
    'Cyanotype Toning',
    'Double Exposure',
    'Edge-softening',
    'Fisheye Distortion',
    'Film Grain',
    'High-key Lighting',
    'Infrared Look',
    'Kaleidoscope Pattern',
    'Lens Flare Sparkle',
    'Motion Blur Streak',
    'Orton Effect Glow',
    'Panning Blur',
    'Retro Vintage Look',
    'Starburst Effect',
    'Tilt-shift Miniature',
    'Ultraviolet Glow',
    'Vignetting Shading',
    'Wide-angle Stretch',
    'X-ray Vision Look',
    'Zoom Burst Blur'
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
    'Kodak Portra 160',
    'Kodak Portra 400',
    'Kodak Portra 800',
    'Kodak Ektar 100',
    'Kodak Gold 200',
    'Kodak ColorPlus 200',
    'Kodak UltraMax 400',
    'Kodak Pro Image 100',
    'Kodak Ektachrome E100',
    'Kodak Tri-X 400 (TX)',
    'Kodak T-Max 100 (TMX)',
    'Kodak T-Max 400 (TMY)',
    'Kodak T-Max P3200 (TMZ)',
    'Kodak Vision3 50D',
    'Kodak Vision3 250D',
    'Kodak Vision3 200T',
    'Kodak Vision3 500T',
    'Kodak Aerochrome',
    'Kodak Verichrome Pan',
    // Fujifilm
    'Fujifilm Superia X-TRA 400',
    'Fujifilm Superia Premium 400',
    'Fujifilm Pro 400H',
    'Fujifilm Fujicolor C200',
    'Fujifilm Industrial 100',
    'Fujifilm Industrial 400',
    'Fujifilm Velvia 50',
    'Fujifilm Velvia 100',
    'Fujifilm Provia 100F',
    'Fujifilm Neopan Acros 100II',
    'Fujifilm Natura 1600',
    'Fujifilm Fortia SP',
    // CineStill
    'CineStill 50D (Daylight)',
    'CineStill 400D (Dynamic)',
    'CineStill 800T (Tungsten)',
    'CineStill BwXX (Double-X)',
    // Ilford
    'Ilford HP5 Plus 400',
    'Ilford FP4 Plus 125',
    'Ilford Delta 100 Professional',
    'Ilford Delta 400 Professional',
    'Ilford Delta 3200 Professional',
    'Ilford Pan F Plus 50',
    'Ilford XP2 Super 400',
    'Ilford SFX 200',
    'Ilford Ortho Plus 80',
    'Kentmere Pan 100',
    'Kentmere Pan 400',
    // Lomography
    'Lomography Color Negative 100',
    'Lomography Color Negative 400',
    'Lomography Color Negative 800',
    'Lomography LomoChrome Metropolis',
    'Lomography LomoChrome Purple',
    'Lomography LomoChrome Turquoise',
    'Lomography Potsdam Kino 100',
    'Lomography Berlin Kino 400',
    'Lomography Earl Grey B&W 100',
    'Lomography Lady Grey B&W 400',
    // Agfa / AgfaPhoto
    'Agfa Vista 200',
    'Agfa Vista 400',
    'Agfa APX 100 Professional',
    'Agfa APX 400 Professional',
    'Agfa Precisa CT 100',
    'Agfacolor Neu',
    // Rollei
    'Rollei Retro 80S',
    'Rollei Retro 400S',
    'Rollei RPX 25',
    'Rollei RPX 100',
    'Rollei RPX 400',
    'Rollei Superpan 200',
    'Rollei Infrared 400S',
    // Foma / Fomapan
    'Fomapan 100 Classic',
    'Fomapan 200 Creative',
    'Fomapan 400 Action',
    'Fomapan R100 (Reversal)',
    // Adox
    'Adox CMS 20 II',
    'Adox HR-50',
    'Adox Silvermax 100',
    'Adox CHS 100 II',
    // Other Manufacturers
    'Ferrania P30 Alpha',
    'Bergger Pancro 400',
    'Kosmo Foto Mono',
    'Street Candy ATM400',
    'Silberra Pan 50',
    'Silberra Pan 160',
    'Oriental Seagull 100',
    'Oriental Seagull 400',
    'Polaroid 600 Color',
    'Polaroid 600 B&W',
    'Fujifilm Instax Mini Film',
    'Technicolor Process 4',
];
