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

export interface DescriptiveOption {
  name: string;
  description: string;
}

// --- Digital Trends & Social Aesthetics ---
export const DIGITAL_AESTHETICS: DescriptiveOption[] = [
    { name: 'Wes Anderson Trend', description: 'Symmetry, Pastel, Static Composition' },
    { name: 'Coquette Aesthetic', description: 'Pink, Ribbons, Vintage Soft, Feminine' },
    { name: 'Dark Academia', description: 'Tweed, Libraries, Moody Lighting, Intellectual' },
    { name: 'Cottagecore', description: 'Rural, Floral, Nostalgic, Pastoral' },
    { name: 'Barbiecore', description: 'Hot Pink, High-Gloss, Plastic, Maximalist' },
    { name: 'Y2K Aesthetic', description: 'Cyber, Metallic, Futuristic 2000s, Iridescent' },
    { name: '90s Grunge', description: 'Lo-fi, Gritty, Oversized, Grainy, Counter-culture' },
    { name: 'Indie Sleaze', description: 'Flash Photography, Messy, 2010s Retro, Party' },
    { name: 'E-Girl / E-Boy', description: 'Neon, High Contrast, Digital, Alternative' },
    { name: 'Vibe-core', description: 'Abstract, Ethereal, Lighting-focused, Atmospheric' },
    { name: 'Clean Girl Aesthetic', description: 'Minimalist, Beige, De-puffed, Polished' },
    { name: 'Soft Girl', description: 'Pastel, Ethereal, Gentle Lighting, Cute' },
    { name: 'Baddie Aesthetic', description: 'Sharp, High-Glamour, Urban, Fierce' },
    { name: 'Scandi Minimalist', description: 'Clean Lines, Natural Wood, Bright, Functional' },
    { name: 'Moody Tones', description: 'Crushed Blacks, Deep Greens, Melancholic, Somber' },
    { name: 'That Girl', description: 'Wellness, Productivity, Bright, Organized, Aesthetic' },
    { name: 'Disposable Camera', description: 'Flash, Red-eye, High Grain, Candid' },
    { name: 'Paparazzi Candid', description: 'Motion Blur, Flash, Staged-Realism, Hectic' },
    { name: 'Old Money / Quiet Luxury', description: 'Classic, Rich Textures, Understated, Timeless' },
    { name: 'Gorpcore', description: 'Outdoor, Tech-utility, Tactical, Functional' },
    { name: 'Techwear', description: 'Cyberpunk Fashion, Straps, All-Black, Futuristic' },
    { name: 'Streetwear High-Fashion', description: 'Graffiti, Bold Logos, Urban, Designer' },
    { name: 'Balletcore', description: 'Tulle, Silk, Graceful, Soft Lighting, Classical' },
    { name: 'Stealth Wealth', description: 'Understated, High-Quality Fabric, Anonymous Luxury' },
    { name: 'Cyber-Street', description: 'Neon-accented, Urban Futuristic, Night-life' },
    { name: 'Dreamcore', description: 'Uncanny, Surreal, Liminal Space, Nostalgic' },
    { name: 'Weirdcore', description: 'Low-res, Glitchy, Nonsensical, Unsettling' },
    { name: 'Vaporwave', description: '80s Cyan/Magenta, Retro-Digital, Surreal' },
    { name: 'Cyber-Y2K', description: 'Glitch, Chrome, Fisheye Lens, Tech-Retro' },
    { name: 'Lo-fi Hip Hop', description: 'Anime Style, Warm, Cozy, Chilled' },
    { name: 'Backrooms Aesthetic', description: 'Yellowed, Fluorescent, Liminal, Eerie' },
    { name: 'Frutiger Aero', description: 'Glossy, Water, Bubbles, 2000s Tech, Optimistic' }
];

// --- Movie Aesthetics / Cinematic Looks ---
export const AESTHETIC_LOOKS: DescriptiveOption[] = [
    { name: 'Wes Anderson', description: 'Symmetrical, Pastel, Whimsical, Centered' },
    { name: 'Christopher Nolan', description: 'High Contrast, Cold Blue, Crisp, Epic' },
    { name: 'Denis Villeneuve', description: 'Brutalist, Scale, Atmospheric Haze, Minimalist' },
    { name: 'Wong Kar-wai', description: 'Saturated, Motion Blur, Melancholic, Neon' },
    { name: 'Quentin Tarantino', description: 'Gritty 70s, Saturated, Retro, Violent' },
    { name: 'Stanley Kubrick', description: 'Clinical, One-Point Perspective, Precise' },
    { name: 'Tim Burton', description: 'Gothic, Dark Whimsy, German Expressionism' },
    { name: 'Michael Bay', description: 'High Saturation, Anamorphic Flare, Dynamic' },
    { name: 'Zack Snyder', description: 'Desaturated, High Contrast, Crushed Blacks' },
    { name: 'Guillermo del Toro', description: 'Fairy Tale, Amber/Teal, Organic, Macabre' },
    { name: 'David Lynch', description: 'Surreal, High Contrast Shadows, Dreamlike' },
    { name: 'Akira Kurosawa', description: 'High Contrast B&W, Epic Composition, Dynamic' },
    { name: 'Blade Runner', description: 'Cyberpunk, Neon Noir, Rainy, Melancholic' },
    { name: 'Mad Max', description: 'Orange/Teal, Gritty, Post-Apocalyptic, Kinetic' },
    { name: 'The Matrix', description: 'Green-Tinted, Urban Decay, Digital, Sharp' },
    { name: 'Sin City', description: 'High Contrast B&W, Selective Red, Noir' },
    { name: 'Studio Ghibli', description: 'Lush Nature, Painterly, Nostalgic, Whimsical' },
    { name: 'Film Noir', description: 'Chiaroscuro, Smokey, Dramatic Shadows, Noir' },
    { name: 'Barbiecore', description: 'Hot Pink, High-Key, Plasticity, Vibrant' },
    { name: 'Dune Aesthetic', description: 'Epic Scale, Minimalist, Sand-swept, Cinematic' },
    { name: 'Arcane Style', description: 'Painterly 3D, Stylized Lighting, Saturated' },
    { name: 'Succession', description: 'Corporate Realism, Handheld, Quiet Luxury' },
    { name: 'Euphoria Look', description: 'Neon Purple, Glitter, Dreamy Haze, Saturated' },
    { name: 'Spaghetti Western', description: 'Gritty, Extreme Close-ups, Heat Haze' },
    { name: 'Folk Horror', description: 'Overexposed, Ritualistic, Midsommar Style' },
    { name: 'Giallo', description: 'Primary Colors, Stylized Horror, 70s Italian' },
    { name: 'Slasher Horror', description: 'Low-key, Gritty Grain, Suspenseful, Dark' },
    { name: 'Found Footage', description: 'VHS Glitch, Low-res, Handheld, Raw' },
    { name: 'CCTV / Security Cam', description: 'Grainy, High-Angle, Wide-Angle, Raw' },
    { name: 'Bridgerton', description: 'Period Drama, Saturated Floral, Soft Glow' },
    { name: 'Avatar', description: 'Bioluminescent, Vibrant Cyan, Exotic Flora' },
    { name: 'Interstellar', description: 'Cosmic Realism, NASA Aesthetic, Atmospheric' },
    { name: 'Cyberpunk 2077', description: 'High-Tech Night, Glitchy Neon, Urban' },
    { name: 'Disney/Pixar 3D', description: 'High Polish, Expressive, Clean, Soft' },
    { name: 'Spider-Verse', description: 'Comic-Book Halftone, Multiversal, Stylized' },
    { name: 'A24 Horror', description: 'Minimalist, Eerie Naturalism, Atmospheric' },
    { name: 'Vaporwave', description: '80s Neon, Surreal Pink/Cyan, Retro-Future' },
    { name: 'Dreamcore / Weirdcore', description: 'Uncanny, Nostalgic, Surreal, Liminal' },
    { name: '90s Sitcom', description: 'Low Contrast, Soft Lighting, Set-Look, Flat' },
    { name: 'Technicolor Classic', description: 'Vibrant 1950s Look, High Saturation' },
    { name: 'War Cinema', description: 'Gritty, Desaturated, Saving Private Ryan Style' },
    { name: 'Space Opera', description: 'Epic, Lived-in Future, Star Wars Look' }
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

export const SPECIALTY_LENS_EFFECTS: DescriptiveOption[] = [
    { name: 'Helios 44-2 Swirly Bokeh', description: 'Vintage Soviet lens known for a distinct circular "swirling" background blur.' },
    { name: 'Petzval Spiral Bokeh', description: 'Classical 19th-century look with sharp centers and extreme spiral bokeh.' },
    { name: 'Meyer Optik Trioplan Soap Bubble Bokeh', description: 'Famous for "soap bubble" bokeh, where highlights have sharp, thin edges.' },
    { name: 'Anamorphic Oval Bokeh & Blue Streak', description: 'Cinematic widescreen look with oval bokeh and horizontal blue light flares.' },
    { name: 'Leica Noctilux Soft Focus Glow', description: 'Creamy, dreamlike "glow" with extremely shallow depth of field.' },
    { name: 'Canon 50mm f/0.95 Dream Lens Bloom', description: 'The "Dream Lens" known for massive light bloom and ethereal soft focus.' },
    { name: 'Minolta STF Smooth Trans Focus', description: 'Smooth Trans Focus for perfectly creamy, distraction-free backgrounds.' },
    { name: 'Lensbaby Sweet Spot Selective Blur', description: 'Selectively sharp center with dramatic, smeared blur towards edges.' },
    { name: 'Industar-61 Star-shaped Bokeh', description: 'Soviet macro lens known for producing unique star-shaped bokeh highlights.' },
    { name: 'Zenitar 50mm f/1.7 Gritty Sharpness', description: 'Gritty, vintage sharpness with a specific micro-contrast character.' },
    { name: 'Jupiter-9 Silky Portrait Rendering', description: 'Legendary portrait lens with a silky, painting-like rendering of skin.' },
    { name: 'Takumar Flare & Warmth', description: 'Vintage warmth and beautiful orange/gold multi-layered lens flares.' },
    { name: 'Cine-Nikkor Retro Vignetting', description: 'Retro cinema lens look with heavy vignetting and soft edge falloff.' },
    { name: 'Wollensak Raptar Soft Rendering', description: 'Mid-century soft-rendering lens used for classic glamor portraits.' },
    { name: 'Aerochrome Lens Filter Aesthetic', description: 'Mimics infrared film, turning greens into vibrant pinks and reds.' },
    { name: 'Infrared Wood Effect Optics', description: 'Captures heat signatures, making foliage appear snowy white and skies black.' }
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

export const CAMERA_MOVEMENT_OPTIONS: DescriptiveOption[] = [
    { name: 'Static Camera', description: 'Fixed position with no movement.' },
    { name: 'Dolly', description: 'Camera moves toward or away from the subject on a track.' },
    { name: 'Slow Dolly In', description: 'Gradual movement towards the subject for tension.' },
    { name: 'Slow Dolly Out', description: 'Gradual movement away to reveal environment.' },
    { name: 'Fast Dolly In', description: 'Rapid movement towards the subject for impact.' },
    { name: 'Vertigo Effect', description: 'Simultaneous dolly-in and zoom-out (Dolly Zoom).' },
    { name: 'Extreme Macro Zoom', description: 'Ultra-tight focus shifting to reveal micro-details.' },
    { name: 'Cosmic Hyper Zoom', description: 'Seamless zoom from planetary scale to molecular detail.' },
    { name: 'Panning Shot', description: 'Camera pivots horizontally from a fixed point.' },
    { name: 'Tilting Shot', description: 'Camera pivots vertically (up or down).' },
    { name: 'Tilt Up', description: 'Camera pivots upward to reveal height.' },
    { name: 'Tilt Down', description: 'Camera pivots downward to reveal the ground.' },
    { name: 'Camera Truck Left', description: 'Camera moves physically left on a parallel plane.' },
    { name: 'Camera Truck Right', description: 'Camera moves physically right on a parallel plane.' },
    { name: 'Lateral Truck Left', description: 'Horizontal sideway movement at constant height.' },
    { name: 'Lateral Truck Right', description: 'Horizontal sideway movement at constant height.' },
    { name: 'Orbit 360', description: 'Camera circles the subject in a full rotation.' },
    { name: 'Fast 360 Orbit', description: 'High-speed circular rotation for energy.' },
    { name: 'Slow Cinematic Arc', description: 'Graceful partial circular movement for drama.' },
    { name: 'Pedestal Up', description: 'Moving the entire camera vertically up.' },
    { name: 'Pedestal Down', description: 'Moving the entire camera vertically down.' },
    { name: 'Crane Up', description: 'Elevating camera on a mechanical arm for scale.' },
    { name: 'Crane Down', description: 'Lowering camera on a mechanical arm.' },
    { name: 'Smooth Optical Zoom In', description: 'Lens magnification increasing focal length.' },
    { name: 'Smooth Optical Zoom Out', description: 'Lens magnification decreasing focal length.' },
    { name: 'Snap Zoom', description: 'Instant, aggressive focal length jump.' },
    { name: 'Rack Focus', description: 'Shifting focus between foreground and background.' },
    { name: 'Dolly Zoom', description: 'Distorting perspective while keeping subject size constant.' },
    { name: 'Tracking Shot', description: 'Camera follows subject movement at constant distance.' },
    { name: 'Leading Shot', description: 'Camera moves backward while facing a following subject.' },
    { name: 'Following Shot', description: 'Camera moves forward while following a subject.' },
    { name: 'Parallel Shot', description: 'Camera tracks alongside the subject laterally.' },
    { name: 'POV Walk', description: 'First-person perspective walking motion.' },
    { name: 'Handheld Movement', description: 'Natural, slightly shaky manual operation.' },
    { name: 'Handheld Documentary Style', description: 'Gritty, reactive, and kinetic manual camera.' },
    { name: 'Whip Pan', description: 'Extremely fast horizontal pivot causing motion blur.' },
    { name: 'Dutch Angle', description: 'Tilted horizon for psychological instability.' },
    { name: 'Drone Flyover', description: 'Aerial movement passing over a landscape.' },
    { name: 'Epic Drone Reveal', description: 'Starting low/hidden and rising to reveal a vista.' },
    { name: 'Large Scale Drone Orbit', description: 'Aerial circle around a landmark or terrain.' },
    { name: 'FPV Drone Aggressive', description: 'High-speed, acrobatic aerial maneuvers.' },
    { name: 'Top Down', description: 'Birds-eye view looking directly perpendicular to ground.' },
    { name: 'Worms Eye Tracking', description: 'Following movement from a ground-level perspective.' },
    { name: 'Snorricam Shot', description: 'Camera rigged to the actor for a locked-face POV.' }
];

export const MOTION_OPTIONS: DescriptiveOption[] = [
    { name: 'Subtle Movement', description: 'Micro-motions and gentle idling.' },
    { name: 'Reveal from Behind', description: 'Wipe movement uncovering a hidden subject.' },
    { name: 'Through Shot', description: 'Flying through an aperture or narrow opening.' },
    { name: 'Reveal from Blur', description: 'Fade in from a defocused or soft state.' },
    { name: 'Fast Action', description: 'High-velocity kinetic energy.' },
    { name: 'Fluid Motion', description: 'Smooth, liquid-like transitions.' },
    { name: 'Slow Motion', description: 'Temporal dilation for detail preservation.' },
    { name: 'Explosive Energy', description: 'Burst of speed and particle displacement.' },
    { name: 'Hyperlapse', description: 'Moving time-lapse with camera displacement.' },
    { name: 'Bullet Time', description: 'Frozen moment with rotating camera view.' },
    { name: 'Barrel Roll', description: 'Full 360-degree rotation on the Z-axis.' },
    { name: 'Graceful Flow', description: 'Elegant, rhythmic pacing.' },
    { name: 'Chaotic Motion', description: 'Unpredictable and high-turbulence physics.' },
    { name: 'Time-lapse Style', description: 'Rapid progression of environmental changes.' },
    { name: 'Windy Atmosphere', description: 'Physical response to high-velocity air.' },
    { name: 'High-Speed Chase', description: 'Intense, focused directional velocity.' },
    { name: 'Jittery Shaking', description: 'High-frequency vibration and instability.' },
    { name: 'Elastic Bounce', description: 'Physics with recoil and squash/stretch.' },
    { name: 'Swirling Vortex', description: 'Centripetal rotation around a core.' },
    { name: 'Temporal Warp', description: 'Distortion of time and spatial consistency.' },
    { name: 'Liquid Ripple', description: 'Wave propagation across surfaces.' }
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