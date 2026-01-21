export const PROMPT_DETAIL_LEVELS = {
  SHORT: 'Short',
  MEDIUM: 'Medium',
  LONG: 'Long',
};

// --- Standard Aspect Ratios ---
export const GENERAL_ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"];

// --- Midjourney Specific Modifiers ---
export const MIDJOURNEY_VERSIONS = ["6.1", "6", "5.2", "5.1", "5", "4"];
export const MIDJOURNEY_NIJI_VERSIONS = ["6", "5", "4"];
export const MIDJOURNEY_ASPECT_RATIOS = ["1:1", "2:3", "3:2", "4:5", "5:4", "9:16", "16:9"];

// --- Audio Specific Modifiers ---
export const AUDIO_TYPES = [
    'Dialogue / Speech',
    'Narration / Voiceover',
    'Ambient Background',
    'Sound Effects (SFX)',
    'Musical Composition',
    'Foley Recording',
    'Binaural / 3D Audio',
    'Podcast Segment'
];

export const VOICE_GENDERS = ['Masculine', 'Feminine', 'Androgynous', 'Child', 'Elderly'];

export const VOICE_TONES = [
    'Deep / Bass', 'Smooth / Silk', 'Raspy / Gravelly', 'Energetic / Bright',
    'Monotone / Robotic', 'Whispering / Soft', 'Commanding / Authoritative',
    'Sarcastic / Playful', 'Melancholic / Sad', 'Terrified / Shaky'
];

export const AUDIO_ENVIRONMENTS = [
    'Studio / Dry', 'Large Cathedral Hall', 'Tiled Bathroom', 'Outdoor Forest',
    'Crowded City Street', 'Under water', 'Empty Warehouse', 'Small Cozy Room',
    'Telephone / Radio Filter', 'Space Vacuum'
];

export const AUDIO_MOODS = [
    'Cinematic', 'Suspenseful', 'Hopeful', 'Dark & Gritty',
    'Upbeat & Fun', 'Ethereal / Dreamy', 'Aggressive', 'Calm / Zen'
];

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

// --- Digital Trends & Social Aesthetics ---
export const DIGITAL_AESTHETICS = [
    'Wes Anderson Trend (Symmetry, Pastel, Static)',
    'Coquette Aesthetic (Pink, Ribbons, Vintage Soft)',
    'Dark Academia (Tweed, Libraries, Moody Lighting)',
    'Cottagecore (Rural, Floral, Nostalgic)',
    'Barbiecore (Hot Pink, High-Gloss, Plastic)',
    'Y2K Aesthetic (Cyber, Metallic, Futuristic 2000s)',
    '90s Grunge (Lo-fi, Gritty, Oversized, Grainy)',
    'Indie Sleaze (Flash Photography, Messy, 2010s Retro)',
    'E-Girl / E-Boy (Neon, High Contrast, Digital)',
    'Vibe-core (Abstract, Ethereal, Lighting-focused)',
    'Clean Girl Aesthetic (Minimalist, Beige, De-puffed)',
    'Soft Girl (Pastel, Ethereal, Gentle Lighting)',
    'Baddie Aesthetic (Sharp, High-Glamour, Urban)',
    'Scandi Minimalist (Clean Lines, Natural Wood, Bright)',
    'Moody Tones (Crushed Blacks, Deep Greens, Melancholic)',
    'That Girl (Wellness, Productivity, Bright, Organized)',
    'Disposable Camera (Flash, Red-eye, High Grain)',
    'Paparazzi Candid (Motion Blur, Flash, Staged-Realism)',
    'Old Money / Quiet Luxury (Classic, Rich Textures)',
    'Gorpcore (Outdoor, Tech-utility, Tactical)',
    'Techwear (Cyberpunk Fashion, Straps, All-Black)',
    'Streetwear High-Fashion (Graffiti, Bold Logos)',
    'Balletcore (Tulle, Silk, Graceful, Soft Lighting)',
    'Stealth Wealth (Understated, High-Quality Fabric)',
    'Cyber-Street (Neon-accented, Urban Futuristic)',
    'Dreamcore (Uncanny, Surreal, liminal space)',
    'Weirdcore (Low-res, Glitchy, Nonsensical)',
    'Vaporwave (80s Cyan/Magenta, Retro-Digital)',
    'Cyber-Y2K (Glitch, Chrome, Fisheye Lens)',
    'Lo-fi Hip Hop (Anime Style, Warm, Cozy)',
    'Backrooms Aesthetic (Yellowed, Fluorescent, Liminal)',
    'Frutiger Aero (Glossy, Water, Bubbles, 2000s Tech)'
];

// --- Movie Aesthetics / Cinematic Looks ---
export const AESTHETIC_LOOKS = [
    'Wes Anderson (Symmetrical, Pastel, Whimsical)',
    'Christopher Nolan (High Contrast, Cold Blue, Crisp)',
    'Denis Villeneuve (Brutalist, Scale, Atmospheric Haze)',
    'Wong Kar-wai (Saturated, Motion Blur, Melancholic)',
    'Quentin Tarantino (Gritty 70s, Saturated, Retro)',
    'Stanley Kubrick (Clinical, One-Point Perspective)',
    'Tim Burton (Gothic, Dark Whimsy, German Expressionism)',
    'Michael Bay (High Saturation, Anamorphic Flare)',
    'Zack Snyder (Desaturated, High Contrast, Crushed Blacks)',
    'Guillermo del Toro (Fairy Tale, Amber/Teal, Organic)',
    'David Lynch (Surreal, High Contrast Shadows, Dreamlike)',
    'Akira Kurosawa (High Contrast B&W, Epic Composition)',
    'Blade Runner (Cyberpunk, Neon Noir, Rainy)',
    'Mad Max (Orange/Teal, Gritty, Post-Apocalyptic)',
    'The Matrix (Green-Tinted, Urban Decay, Digital)',
    'Sin City (High Contrast B&W, Selective Red)',
    'Studio Ghibli (Lush Nature, Painterly, Nostalgic)',
    'Film Noir (Chiaroscuro, Smokey, Dramatic Shadows)',
    'Barbiecore (Hot Pink, High-Key, Plasticity)',
    'Dune Aesthetic (Epic Scale, Minimalist, Sand-swept)',
    'Arcane Style (Painterly 3D, Stylized Lighting)',
    'Succession (Corporate Realism, Handheld, Quiet Luxury)',
    'Euphoria Look (Neon Purple, Glitter, Dreamy Haze)',
    'Spaghetti Western (Gritty, Extreme Close-ups, Heat Haze)',
    'Folk Horror (Overexposed, Ritualistic, Midsommar Style)',
    'Giallo (Primary Colors, Stylized Horror, 70s Italian)',
    'Slasher Horror (Low-key, Gritty Grain, Suspenseful)',
    'Found Footage (VHS Glitch, Low-res, Handheld)',
    'CCTV / Security Cam (Grainy, High-Angle, Wide-Angle)',
    'Bridgerton (Period Drama, Saturated Floral, Soft Glow)',
    'Avatar (Bioluminescent, Vibrant Cyan, Exotic Flora)',
    'Interstellar (Cosmic Realism, NASA Aesthetic)',
    'Cyberpunk 2077 (High-Tech Night, Glitchy Neon)',
    'Disney/Pixar 3D (High Polish, Expressive, Clean)',
    'Spider-Verse (Comic-Book Halftone, Multiversal)',
    'A24 Horror (Minimalist, Eerie Naturalism)',
    'Vaporwave (80s Neon, Surreal Pink/Cyan)',
    'Dreamcore / Weirdcore (Uncanny, Nostalgic)',
    '90s Sitcom (Low Contrast, Soft Lighting, Set-Look)',
    'Technicolor Classic (Vibrant 1950s Look)',
    'War Cinema (Gritty, Desaturated, Saving Private Ryan Style)',
    'Space Opera (Epic, Lived-in Future, Star Wars Look)'
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
    'Cinema Camera',
    'Mirrorless Camera',
    'Medium Format Camera',
    'DSLR',
    'Analog Film Camera',
    'Rangefinder Camera',
    'Action Camera',
    'Drone / Aerial Camera',
    'Smartphone Camera'
];

export const CAMERA_MODELS_BY_TYPE: Record<string, string[]> = {
    'Cinema Camera': [
        'ARRI Alexa 35',
        'ARRI Alexa Mini LF',
        'ARRI Alexa 65',
        'RED V-RAPTOR XL',
        'RED KOMODO-X',
        'Sony Venice 2',
        'Sony FX9',
        'Sony FX6',
        'Blackmagic URSA Mini Pro 12K',
        'Panavision Millennium DXL2',
        'Canon EOS C500 Mark II'
    ],
    'Mirrorless Camera': [
        'Sony A7R V',
        'Sony A1',
        'Sony A7S III',
        'Canon EOS R3',
        'Canon EOS R5 II',
        'Nikon Z9',
        'Nikon Z8',
        'Fujifilm X-H2S',
        'Fujifilm X-T5',
        'Panasonic Lumix S1H',
        'Leica SL3'
    ],
    'Medium Format Camera': [
        'Fujifilm GFX 100 II',
        'Fujifilm GFX 100S II',
        'Hasselblad X2D 100C',
        'Hasselblad H6D-100c',
        'Phase One XF IQ4',
        'Leica S3'
    ],
    'DSLR': [
        'Canon EOS-1D X Mark III',
        'Canon EOS 5D Mark IV',
        'Nikon D6',
        'Nikon D850'
    ],
    'Analog Film Camera': [
        'Hasselblad 500C/M',
        'Leica M6',
        'Contax T2',
        'Mamiya RZ67',
        'Pentax 67',
        'Nikon F6'
    ],
    'Rangefinder Camera': [
        'Leica M11',
        'Leica M11-P',
        'Leica M10-R',
        'Fujifilm X-Pro3'
    ]
};

export const ALL_PROFESSIONAL_CAMERA_MODELS = Object.values(CAMERA_MODELS_BY_TYPE).flat();

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
    'Kodak Portra 160', 'Kodak Portra 400', 'Kodak Ektar 100', 'Kodak Gold 200', 'Kodak Tri-X 400',
    'Fujifilm Velvia 50', 'Fujifilm Provia 100F', 'Fujifilm Superia 400', 'CineStill 800T',
    'Ilford HP5 Plus 400', 'Lomography Color Negative 400', 'Polaroid 600', 'Agfa Vista 400'
];
