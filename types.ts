
// --- Core App Types ---
export type ActiveTab =
  | 'dashboard'
  | 'assistant'
  | 'discovery'
  | 'prompts'
  | 'crafter'
  | 'refiner'
  | 'prompt_analyzer'
  | 'media_analyzer'
  | 'prompt'
  | 'gallery'

  | 'resizer'
  | 'video_to_frames'
  | 'image_compare'
  | 'color_palette_extractor'
  | 'composer'
  | 'lora_editor'
  | 'settings';

export type ActiveSettingsTab = 'app' | 'appearance' | 'integrations' | 'prompt' | 'gallery';

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
export interface YouTubeConnection {
  isConnected: boolean;
  channelName?: string;
  accessToken?: string;
  subscriberCount?: string;
  videoCount?: number;
  thumbnailUrl?: string;
  connectedAt?: number;
  customClientId?: string;
  customApiKey?: string;
}

export interface SpotifyConnection {
  isConnected: boolean;
  displayName?: string;
  email?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  connectedAt?: number;
  customClientId?: string;
  customClientSecret?: string;
}

export interface GoogleIdentityConnection {
  isConnected: boolean;
  email?: string;
  name?: string;
  picture?: string;
  accessToken?: string;
  /** Absolute timestamp (ms) when the access token expires. 
   *  Captured from the `expires_in` field of the OAuth response. */
  expiresAt?: number;
  /** Absolute timestamp (ms) when the connection was first established. */
  connectedAt?: number;
  customApiKey?: string;
}

export interface TokenUsage {
  used: number;
  limit: number;
}

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  apiKey?: string;
  headers?: Record<string, string>;
  /** Set when this entry was created from the Predefined tab — identifies which
   *  catalog entry (see constants/mcpPresets.ts) it was derived from, and keeps
   *  it out of the Custom tab's list. */
  presetId?: string;
}

export interface LLMSettings {
  // LLM Provider Settings
  geminiApiKey: string;
  llmModel: string;
  activeLLM: 'gemini' | 'ollama' | 'ollama_cloud' | 'openrouter' | 'llamacpp' | 'anthropic';
  ollamaBaseUrl: string;
  ollamaModel: string;
  
  // OpenRouter Settings
  openrouterApiKey?: string;
  openrouterModel?: string;
  
  // Llama.cpp Settings
  llamacppBaseUrl: string;
  llamacppModel: string;
  llamacppApiKey: string;
  
  // Ollama Cloud Settings
  ollamaCloudBaseUrl: string;
  ollamaCloudModel: string;
  ollamaCloudApiKey: string;
  ollamaCloudUseGoogleAuth: boolean;

  // Anthropic Settings
  anthropicApiKey?: string;
  anthropicModel?: string;
  anthropicConnectionMode?: 'api_key' | 'subscription';
  anthropicSubscriptionUrl?: string;
  anthropicSubscriptionKey?: string;

  // Tensor Art Settings
  tensorartApiKey?: string;

  // MCP Server Settings
  mcpServers: McpServerConfig[];

  // OpenAI Settings
  openaiApiKey?: string;
  /** Voice backend provider. Default: 'gemini_live' */
  voiceProvider?: 'gemini_live' | 'openai_realtime';

  // AI Assistant Persona (chat + Gemini Live voice mode)
  assistantName?: string;
  assistantVoice?: string;
  assistantLanguage?: string;
  assistantPersonality?: string;
  /** Reasoning engine for the chat assistant. Live voice always runs on Gemini. */
  assistantProvider?: 'gemini' | 'ollama' | 'ollama_cloud' | 'openrouter' | 'anthropic' | 'llamacpp';

  // Prompt & Token Tracking
  masterRolePrompt?: string;
  geminiTokenUsage?: TokenUsage;
  ollamaTokenUsage?: TokenUsage;
  openrouterTokenUsage?: TokenUsage;
  llamacppTokenUsage?: TokenUsage;
  anthropicTokenUsage?: TokenUsage;

  // Theme Settings
  activeThemeMode: 'dark';
  lightTheme: string;
  darkTheme: string;
  fontSize: number;

  // Dashboard Settings
  dashboardVideoUrl: string;
  isDashboardVideoEnabled: boolean;
  dashboardBackgroundType?: 'video' | 'image' | 'color';
  dashboardImageUrl?: string;
  musicYoutubeUrl: string;
  musicEnabled: boolean;
  idleScreenType: 'matrix' | 'gallery';
  isIdleEnabled: boolean;
  idleTimeoutMinutes: number;
  
  // Google Cloud API key (top-level for robust persistence, used by YouTube search & other Google APIs)
  googleApiKey?: string;

  // Integrations
  youtube?: YouTubeConnection;
  spotify?: SpotifyConnection;
  googleIdentity?: GoogleIdentityConnection;
  storageProvider?: 'local' | 'drive';
  driveFolderId?: string;
  driveFolderName?: string;

  // Gallery
  convertImageToJpgLocal?: boolean;
  convertImageToJpgDrive?: boolean;
  jpgCompressionQuality?: number;
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
  specialtyLens?: string;
  lensType?: string;
  filmType?: string;
  filmStock?: string;
  lighting?: string;
  composition?: string;
  timeOfDay?: string;
  weather?: string;
  colorGrade?: string;
  // Specific model styles
  zImageStyle?: string;
  facialExpression?: string;
  hairStyle?: string;
  eyeColor?: string;
  skinTexture?: string;
  realism?: string;
  clothing?: string;
  // Video specific
  motion?: string;
  cameraMovement?: string;
  videoInputType?: 't2v' | 'i2v'; 
  videoEffect?: string;
  // Audio specific
  audioType?: string;
  voiceGender?: string;
  voiceTone?: string;
  audioEnvironment?: string;
  audioMood?: string;
  musicGenre?: string;
  instrumentation?: string;
  vocalStyle?: string;
  productionEra?: string;
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
  // Refiner specific
  creativity?: number; 
}

export interface EnhancementResult {
  suggestions: string[];
  breakdown?: any;
  grounding_metadata?: any;
}

export interface PromptVersionNode {
  versionId: string;
  timestamp: number;
  refinedText: string;
  appliedModifiers: string[];
  parentVersionId: string | null;
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
  lineage?: PromptVersionNode[];
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
  description?: string;
  backgroundImageUrl?: string;
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
