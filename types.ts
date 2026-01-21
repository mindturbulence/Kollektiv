// --- Core App Types ---
export type ActiveTab =
  | 'dashboard'
  | 'prompts'
  | 'prompt'
  | 'gallery'
  | 'cheatsheet'
  | 'artstyles'
  | 'artists'
  | 'resizer'
  | 'video_to_frames'
  | 'image_compare'
  | 'color_palette_extractor'
  | 'composer'
  | 'settings';

export type ActiveSettingsTab = 'app' | 'llm' | 'prompt' | 'gallery';

export interface AppError {
  message: string;
  details?: unknown;
}

export interface Idea {
  id: string;
  lens: string;
  title: string;
  prompt: string;
  source: string;
}

// --- Settings ---
export interface FeatureSettings {
  isPromptLibraryEnabled: boolean;
  isGalleryEnabled: boolean;
  isCheatsheetsEnabled: boolean;
  isToolsEnabled: boolean;
}

export interface YouTubeConnection {
  isConnected: boolean;
  channelName?: string;
  accessToken?: string;
  subscriberCount?: string;
  videoCount?: number;
  thumbnailUrl?: string;
  connectedAt?: number;
}

export interface LLMSettings {
  // LLM Provider Settings
  llmModel: string;
  activeLLM: 'gemini' | 'ollama';
  ollamaBaseUrl: string;
  ollamaModel: string;

  // Theme Settings
  activeThemeMode: 'light' | 'dark';
  lightTheme: string;
  darkTheme: string;
  fontSize: number;
  
  // Feature Toggles
  features: FeatureSettings;
  
  // Integrations
  youtube?: YouTubeConnection;
}

// --- Prompt Generation & Library ---
export interface PromptModifiers {
  artStyle?: string;
  artist?: string;
  photographyStyle?: string;
  aestheticLook?: string;
  digitalAesthetic?: string;
  aspectRatio?: string; 
  cameraType?: string;
  cameraModel?: string;
  cameraAngle?: string;
  cameraProximity?: string;
  cameraSettings?: string;
  cameraEffect?: string;
  lensType?: string;
  filmType?: string;
  filmStock?: string;
  lighting?: string;
  composition?: string;
  // Specific model styles
  zImageStyle?: string;
  // Video specific
  motion?: string;
  cameraMovement?: string;
  videoInputType?: 't2v' | 'i2v'; 
  // Audio specific
  audioType?: string;
  voiceGender?: string;
  voiceTone?: string;
  audioEnvironment?: string;
  audioMood?: string;
  audioDuration?: string;
  // Midjourney specific
  mjAspectRatio?: string;
  mjChaos?: string;
  mjStylize?: string;
  mjVersion?: string;
  mjNiji?: '' | '4' | '5' | '6';
  mjStyle?: 'raw' | '';
  mjTile?: boolean;
  mjWeird?: string;
  mjNo?: string;
  mjQuality?: string;
  mjSeed?: string;
  mjStop?: string;
  mjRepeat?: string;
}

export interface EnhancementResult {
  suggestions: string[];
  grounding_metadata?: any;
}

export interface SavedPrompt {
  id: string;
  title?: string;
  text: string;
  createdAt: number;
  basePrompt?: string;
  targetAI?: string;
  categoryId?: string;
  tags?: string[];
}

export interface PromptCategory {
  id: string;
  name: string;
  parentId?: string;
  order: number;
}

export interface PromptAnatomyComponent {
  category: string;
  value: string;
}
export interface PromptAnatomy {
    components?: { [key: string]: string };
    variations?: { [key: string]: string[] };
    subject?: string;
    setting?: string;
    identified_components?: PromptAnatomyComponent[];
    additional_details?: string[];
    overall_mood?: string;
}


// --- Image Gallery ---
export interface GalleryItem {
  id: string;
  createdAt: number;
  type: 'image' | 'video';
  urls: string[];
  sources: string[];
  title: string;
  prompt?: string;
  notes?: string;
  tags?: string[];
  categoryId?: string;
  isNsfw?: boolean;
  // YouTube Publication tracking
  youtubeUrl?: string;
  publishedAt?: number;
}

export interface GalleryCategory {
  id: string;
  name: string;
  isNsfw?: boolean;
  parentId?: string;
  order: number;
}

// --- Cheatsheets ---
export interface CheatsheetItem {
  id: string;
  name: string;
  description?: string;
  example?: string;
  keywords?: string[];
  imageUrls: string[];
}

export interface CheatsheetCategory {
  category: string;
  items: CheatsheetItem[];
}

// --- Prompt Crafter ---
export interface WildcardFile {
  name: string;
  path: string;
  content: string[];
}
export interface WildcardCategory {
  name: string;
  path: string;
  files: WildcardFile[];
  subCategories: WildcardCategory[];
}
export interface CrafterData {
  templates: WildcardFile[];
  wildcardCategories: WildcardCategory[];
}
