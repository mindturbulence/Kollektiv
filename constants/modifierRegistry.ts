import {
    GENERAL_ASPECT_RATIOS, CAMERA_ANGLES, CAMERA_PROXIMITY,
    LIGHTING_OPTIONS, COMPOSITION_OPTIONS, CAMERA_TYPES, CAMERA_SETTINGS, CAMERA_EFFECTS,
    LENS_TYPES, ANALOG_FILM_STOCKS, PHOTOGRAPHY_STYLES, DIGITAL_AESTHETICS, AESTHETIC_LOOKS,
    MOTION_OPTIONS, CAMERA_MOVEMENT_OPTIONS, VIDEO_EFFECTS, MIDJOURNEY_VERSIONS,
    MIDJOURNEY_NIJI_VERSIONS, MIDJOURNEY_ASPECT_RATIOS, Z_IMAGE_STYLES, SPECIALTY_LENS_EFFECTS,
    FILM_TYPES, FACIAL_EXPRESSIONS, HAIR_STYLES, EYE_COLORS, SKIN_TEXTURES, REALISM_OPTIONS,
    CLOTHING_STYLES, MUSIC_GENRES, INSTRUMENTATION, VOCAL_STYLES, MUSIC_PRODUCTION_ERAS,
    TIME_OF_DAY, WEATHER_OPTIONS, COLOR_GRADES, AUDIO_TYPES, VOICE_GENDERS, VOICE_TONES,
    AUDIO_ENVIRONMENTS, AUDIO_MOODS, ALL_PROFESSIONAL_CAMERA_MODELS,
} from './modifiers';
import { TARGET_IMAGE_AI_MODELS, TARGET_VIDEO_AI_MODELS, TARGET_AUDIO_AI_MODELS } from './models';

export interface ModifierCategoryDef {
    key: string;
    label: string;
    kind: 'plain' | 'descriptive' | 'model';
    media: 'all' | 'image' | 'video' | 'audio';
    getOptions: () => string[];
}

export const MODIFIER_CATEGORIES: ModifierCategoryDef[] = [
    // Image & All categories
    { key: 'artStyle', label: 'Art Style', kind: 'plain', media: 'all', getOptions: () => [] }, // loaded dynamically from cheatsheet
    { key: 'artist', label: 'Artist', kind: 'plain', media: 'all', getOptions: () => [] }, // loaded dynamically from cheatsheet
    { key: 'photographyStyle', label: 'Photo Genre', kind: 'plain', media: 'all', getOptions: () => PHOTOGRAPHY_STYLES },
    { key: 'aestheticLook', label: 'Aesthetic Look', kind: 'descriptive', media: 'all', getOptions: () => AESTHETIC_LOOKS.map(l => l.name) },
    { key: 'digitalAesthetic', label: 'Digital Trend', kind: 'descriptive', media: 'all', getOptions: () => DIGITAL_AESTHETICS.map(a => a.name) },
    { key: 'aspectRatio', label: 'Aspect Ratio', kind: 'plain', media: 'all', getOptions: () => GENERAL_ASPECT_RATIOS },
    { key: 'cameraType', label: 'Camera Body Type', kind: 'plain', media: 'all', getOptions: () => CAMERA_TYPES },
    { key: 'cameraModel', label: 'Camera Model', kind: 'model', media: 'all', getOptions: () => ALL_PROFESSIONAL_CAMERA_MODELS },
    { key: 'cameraAngle', label: 'Shot Angle', kind: 'plain', media: 'all', getOptions: () => CAMERA_ANGLES },
    { key: 'cameraProximity', label: 'Shot Proximity', kind: 'plain', media: 'all', getOptions: () => CAMERA_PROXIMITY },
    { key: 'cameraSettings', label: 'Technical Settings', kind: 'plain', media: 'all', getOptions: () => CAMERA_SETTINGS },
    { key: 'cameraEffect', label: 'Camera Distortion', kind: 'plain', media: 'all', getOptions: () => CAMERA_EFFECTS },
    { key: 'specialtyLens', label: 'Specialty Optics', kind: 'descriptive', media: 'all', getOptions: () => SPECIALTY_LENS_EFFECTS.map(l => l.name) },
    { key: 'lensType', label: 'Lens Type', kind: 'plain', media: 'all', getOptions: () => LENS_TYPES },
    { key: 'filmType', label: 'Film Type', kind: 'plain', media: 'all', getOptions: () => FILM_TYPES },
    { key: 'filmStock', label: 'Film Stock', kind: 'plain', media: 'all', getOptions: () => ANALOG_FILM_STOCKS },
    { key: 'lighting', label: 'Lighting Rig', kind: 'plain', media: 'all', getOptions: () => LIGHTING_OPTIONS },
    { key: 'composition', label: 'Composition', kind: 'plain', media: 'all', getOptions: () => COMPOSITION_OPTIONS },
    { key: 'timeOfDay', label: 'Time of Day', kind: 'plain', media: 'all', getOptions: () => TIME_OF_DAY },
    { key: 'weather', label: 'Weather', kind: 'plain', media: 'all', getOptions: () => WEATHER_OPTIONS },
    { key: 'colorGrade', label: 'Color Grade', kind: 'plain', media: 'all', getOptions: () => COLOR_GRADES },
    { key: 'facialExpression', label: 'Facial Expression', kind: 'plain', media: 'all', getOptions: () => FACIAL_EXPRESSIONS },
    { key: 'hairStyle', label: 'Hair Style', kind: 'plain', media: 'all', getOptions: () => HAIR_STYLES },
    { key: 'eyeColor', label: 'Eye Color', kind: 'plain', media: 'all', getOptions: () => EYE_COLORS },
    { key: 'skinTexture', label: 'Skin Texture', kind: 'plain', media: 'all', getOptions: () => SKIN_TEXTURES },
    { key: 'realism', label: 'Realism', kind: 'plain', media: 'all', getOptions: () => REALISM_OPTIONS },
    { key: 'clothing', label: 'Clothing', kind: 'plain', media: 'all', getOptions: () => CLOTHING_STYLES },
    { key: 'zImageStyle', label: 'Z-Image Style', kind: 'plain', media: 'image', getOptions: () => Z_IMAGE_STYLES },
    { key: 'mjVersion', label: 'Midjourney Version', kind: 'plain', media: 'image', getOptions: () => MIDJOURNEY_VERSIONS },
    { key: 'mjNiji', label: 'Midjourney Niji', kind: 'plain', media: 'image', getOptions: () => MIDJOURNEY_NIJI_VERSIONS },
    { key: 'mjAspectRatio', label: 'Midjourney Aspect Ratio', kind: 'plain', media: 'image', getOptions: () => MIDJOURNEY_ASPECT_RATIOS },
    { key: 'targetModel', label: 'Target AI Model', kind: 'model', media: 'image', getOptions: () => TARGET_IMAGE_AI_MODELS },

    // Video categories
    { key: 'motion', label: 'Motion', kind: 'descriptive', media: 'video', getOptions: () => MOTION_OPTIONS.map(o => o.name) },
    { key: 'cameraMovement', label: 'Camera Pathing', kind: 'descriptive', media: 'video', getOptions: () => CAMERA_MOVEMENT_OPTIONS.map(o => o.name) },
    { key: 'videoEffect', label: 'Video Effect', kind: 'plain', media: 'video', getOptions: () => VIDEO_EFFECTS },
    { key: 'targetModel', label: 'Target Video Model', kind: 'model', media: 'video', getOptions: () => TARGET_VIDEO_AI_MODELS },

    // Audio categories
    { key: 'audioType', label: 'Audio Category', kind: 'plain', media: 'audio', getOptions: () => AUDIO_TYPES },
    { key: 'voiceGender', label: 'Voice Profile', kind: 'plain', media: 'audio', getOptions: () => VOICE_GENDERS },
    { key: 'voiceTone', label: 'Voice Tone', kind: 'plain', media: 'audio', getOptions: () => VOICE_TONES },
    { key: 'audioEnvironment', label: 'Acoustic Environment', kind: 'plain', media: 'audio', getOptions: () => AUDIO_ENVIRONMENTS },
    { key: 'audioMood', label: 'Audio Mood', kind: 'plain', media: 'audio', getOptions: () => AUDIO_MOODS },
    { key: 'musicGenre', label: 'Music Genre', kind: 'plain', media: 'audio', getOptions: () => MUSIC_GENRES },
    { key: 'instrumentation', label: 'Instrumentation', kind: 'plain', media: 'audio', getOptions: () => INSTRUMENTATION },
    { key: 'vocalStyle', label: 'Vocal Style', kind: 'plain', media: 'audio', getOptions: () => VOCAL_STYLES },
    { key: 'productionEra', label: 'Production Era', kind: 'plain', media: 'audio', getOptions: () => MUSIC_PRODUCTION_ERAS },
    { key: 'targetModel', label: 'Target Audio Model', kind: 'model', media: 'audio', getOptions: () => TARGET_AUDIO_AI_MODELS },
];

/**
 * Build the LLM modifier catalog filtered by media mode.
 * Replaces the former hardcoded buildModifierCatalog in RefinerPage.
 * Artists/artStyles are injected separately via cheatsheet manifests.
 */
export function buildModifierCatalog(mediaMode: 'image' | 'video' | 'audio'): string {
    const catalog: string[] = [];
    const relevant = MODIFIER_CATEGORIES.filter(c => c.media === 'all' || c.media === mediaMode);
    for (const cat of relevant) {
        const options = cat.getOptions();
        if (options.length > 0) {
            catalog.push(`${cat.key}: ${options.join(', ')}`);
        }
    }
    return catalog.join('\\n');
}
