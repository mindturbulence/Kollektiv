

import type { EnhancementResult, LLMSettings, PromptModifiers, PromptAnatomy, CheatsheetCategory } from '../types';
import { enhancePromptGemini, analyzePaletteMood as analyzePaletteMoodGemini, generatePromptFormulaGemini, refineSinglePromptGemini, abstractImageGemini, generateColorNameGemini, dissectPromptGemini, generateFocusedVariationsGemini, reconstructPromptGemini, reconstructFromIntentGemini, replaceComponentInPromptGemini, detectSalientRegionGemini, generateArtistDescriptionGemini, enhancePromptGeminiStream, refineSinglePromptGeminiStream } from './geminiService';
import { enhancePromptOllama, analyzePaletteMoodOllama, generatePromptFormulaOllama, refineSinglePromptOllama, abstractImageOllama, generateColorNameOllama, dissectPromptOllama, generateFocusedVariationsOllama, reconstructPromptOllama, replaceComponentInPromptOllama, reconstructFromIntentOllama, generateArtistDescriptionOllama, enhancePromptOllamaStream, refineSinglePromptOllamaStream } from './ollamaService';
import { TARGET_VIDEO_AI_MODELS } from "../constants";

import { loadArtStyles } from '../utils/artstyleStorage';
import { loadArtists } from '../utils/artistStorage';
import { loadCheatsheet } from '../utils/cheatsheetStorage';

// Caching for cheatsheet data to avoid repeated file reads
let artStylesCache: CheatsheetCategory[] | null = null;
let artistsCache: CheatsheetCategory[] | null = null;
let generalCheatsheetCache: CheatsheetCategory[] | null = null;


// --- Connection Testing ---
export const testOllamaConnection = async (baseUrl: string): Promise<boolean> => {
  if (!baseUrl || !baseUrl.startsWith('http')) return false;
  try {
    // A simple HEAD request is enough to check for a running server without transferring data.
    const response = await fetch(baseUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch (e) {
    return false;
  }
};

export const buildMidjourneyParams = (modifiers: PromptModifiers): string => {
    const params: string[] = [];
    if (modifiers.mjNo) params.push(`--no ${modifiers.mjNo}`);
    if (modifiers.mjAspectRatio) params.push(`--ar ${modifiers.mjAspectRatio}`);
    if (modifiers.mjChaos && parseInt(modifiers.mjChaos, 10) > 0) params.push(`--chaos ${modifiers.mjChaos}`);
    if (modifiers.mjQuality && modifiers.mjQuality !== '1') params.push(`--q ${modifiers.mjQuality}`);
    if (modifiers.mjRepeat && parseInt(modifiers.mjRepeat, 10) > 1) params.push(`--repeat ${modifiers.mjRepeat}`);
    if (modifiers.mjSeed) params.push(`--seed ${modifiers.mjSeed}`);
    if (modifiers.mjStop && parseInt(modifiers.mjStop, 10) < 100) params.push(`--stop ${modifiers.mjStop}`);
    if (modifiers.mjStyle) params.push(`--style ${modifiers.mjStyle}`);
    if (modifiers.mjStylize && parseInt(modifiers.mjStylize, 10) > 0) params.push(`--stylize ${modifiers.mjStylize}`);
    if (modifiers.mjTile) params.push(`--tile`);
    if (modifiers.mjWeird && parseInt(modifiers.mjWeird, 10) > 0) params.push(`--weird ${modifiers.mjWeird}`);

    if (modifiers.mjNiji) {
        params.push(`--niji ${modifiers.mjNiji}`);
    } else if (modifiers.mjVersion) {
        params.push(`--v ${modifiers.mjVersion}`);
    }
    
    return params.join(' ');
};

// --- Shared System Instruction Builder ---
export const buildSystemInstructionForEnhancer = (
    promptLength: string,
    targetAIModel: string,
    modifiers: PromptModifiers
): string => {
    let instructions: string[] = [];

    const isVideoTarget = TARGET_VIDEO_AI_MODELS.includes(targetAIModel);
    const lowerCaseTarget = targetAIModel.toLowerCase();

    // --- Core Instruction ---
    instructions.push(`You are a master prompt engineer and creative director. Your primary goal is to enhance a user's prompt, making it more vivid, detailed, and effective for a generative AI, while strictly respecting the original intent.

Your task is to take the user's core prompt and modifiers as a foundation and generate three distinct, enhanced variations.

**Crucial Rules:**
1.  **Preserve the Core Subject:** The main subject and core idea of the user's prompt MUST be the central focus of all generated variations. Do not change or replace it.
2.  **Integrate All Modifiers:** All specified modifiers (like art style, artist, lighting, etc.) MUST be clearly and accurately reflected in each prompt.
3.  **Enhance, Don't Replace:** Your role is to build upon the user's idea, not to create a completely new one. Each variation should be a recognizable evolution of the original prompt.
4.  **Offer Variety:** Ensure the three suggestions are genuinely different from each other.

**Enhancement Techniques:**
*   **Weave a Narrative:** Add context and atmosphere. What is the story behind this moment? What emotions are present?
*   **Inject Sensory Details:** Go beyond visuals. Describe textures, sounds, temperatures, and moods to create a more immersive scene.
*   **Use Evocative Language:** Employ strong verbs, specific adjectives, and metaphorical language to paint a clearer picture for the AI.

Each prompt must be a single, coherent paragraph. Return ONLY the three enhanced prompts, each on a new line, without any preamble or numbering.`);

    // --- Apply Modifiers ---
    if (modifiers.artStyle) instructions.push(`The desired art style is "${modifiers.artStyle}". Emphasize its key characteristics in the generated prompts.`);
    if (modifiers.artist) instructions.push(`The prompts should be in the style of the artist "${modifiers.artist}". Capture their typical color palette, brushwork, and subject matter.`);
    if (modifiers.photographyStyle) instructions.push(`The prompts should follow the conventions of "${modifiers.photographyStyle}" photography.`);
    if (modifiers.cameraType) instructions.push(`Incorporate a "${modifiers.cameraType}" camera shot or perspective.`);
    if (modifiers.filmStock) instructions.push(`The aesthetic should resemble footage shot on "${modifiers.filmStock}" film stock. Capture its characteristic grain, color science, and dynamic range.`);
    if (modifiers.lensType) instructions.push(`The shot should look as if it was taken with a "${modifiers.lensType}" lens.`);
    if (modifiers.composition) instructions.push(`The composition should follow the principles of "${modifiers.composition}".`);
    if (modifiers.lighting) instructions.push(`Describe the scene with "${modifiers.lighting}" lighting conditions.`);

    // --- Detail Level ---
    switch (promptLength) {
        case 'Short':
            instructions.push(`As a "Poetic Miniaturist," your prompt must be incredibly dense with meaning. Generate a short, powerful, haiku-like prompt. It must be a single, impactful sentence that evokes a vast scene or story with minimal words. Focus on strong verbs, unexpected juxtapositions, and sensory fragments. Think of it as a cinematic title card or a line of poetry that sparks the imagination.`);
            break;
        case 'Long':
            instructions.push(`As a "World-Building Novelist," generate a rich, immersive narrative passage. The prompt must be a multi-sentence paragraph that reads like an excerpt from a critically-acclaimed fantasy or sci-fi novel. Go beyond visual description. Delve into the implied history of the scene, the subject's inner state, the textures of their clothing, the ambient sounds, the smell in the air, and the specific, unique details that make this world feel real and lived-in. This is about total sensory immersion.`);
            break;
        case 'Medium':
        default:
            instructions.push(`As a "Master Cinematographer," generate a detailed shot description. The prompt should read like a paragraph from a screenplay's scene description. Describe the setting, the subject's key action or expression, the quality of light (e.g., "dappled light filtering through leaves," "harsh neon glare"), and the specific camera shot (e.g., "a breathtaking wide shot," "an intimate close-up"). Evoke a distinct mood and atmosphere in each description.`);
            break;
    }
    
    // --- Target AI Specifics ---
    if (isVideoTarget) {
         if (lowerCaseTarget.includes('wan')) {
             instructions.push(`The prompts are for WAN 2.5 (video generation). 
             1. Describe the visual motion clearly and fluidly (e.g., "The cat runs across the field"). 
             2. Describe camera movement (e.g., "Camera pans right to follow"). 
             3. CRUCIAL: Describe the AUDIO atmosphere. WAN 2.5 generates sound. Include a sentence describing sounds, music, or ambience (e.g., "The sound of rustling leaves and distant birdsong creates a peaceful atmosphere").`);
         } else if (lowerCaseTarget.includes('hun yuan')) {
             instructions.push(`The prompts are for Hun Yuan Video. Follow this strict structure: 
             [Subject Description] + [Background/Environment] + [Camera Language] + [Style/Atmosphere] + [Lighting] + [Video/Motion Details]. 
             Use specific camera terms (e.g., "static camera", "pan right", "zoom in") and describe smooth motion. Emphasize high quality ("8k", "hyper realistic").`);
         } else {
             instructions.push(`The prompts are for a VIDEO generation AI. They MUST describe a scene with motion or a sequence of events. Each prompt MUST include at least one specific camera movement command in brackets, for example: [pan right], [dolly zoom], [handheld footage], [zoom out, pan right]. Also describe subject actions and environmental changes.`);
         }
    } else {
        
        if (lowerCaseTarget.includes('flux')) {
            if (lowerCaseTarget.includes('flux 2')) {
                instructions.push(`For FLUX 2, use strictly natural language. Describe the scene as if speaking to another person. Focus on lighting, composition, and texture. If text is needed in the image, specify it clearly in quotes. Avoid tag-soup and focus on semantic coherence.`);
            } else {
                instructions.push(`For FLUX, focus on rich, descriptive natural language sentences. Weave in quality tags like 'masterpiece, 4k' within the prose. Do not use weighted terms.`);
            }
        } else if (lowerCaseTarget.includes('z-image')) {
             instructions.push(`For Z-Image, prioritize a structured narrative style in this exact order: [Subject/Main Content], [Environment/Context], [Lighting/Atmosphere], [Style/Medium], and [Camera Angle/Composition]. It responds well to specific artistic references and descriptors like "high fidelity", "hyper-realistic", "cinematic", "intricate details" in a cohesive paragraph.`);
        } else if (lowerCaseTarget.includes('seedream')) {
             instructions.push(`For SeeDream, prioritize artistic aesthetics and composition. Use a mix of descriptive phrases and artistic keywords. Focus on lighting, color palette, and mood.`);
        } else if (lowerCaseTarget.includes('nano banana')) {
             instructions.push(`For Nano Banana (Google), generate highly detailed, natural language descriptions. Avoid "tag soup". Emphasize material properties, spatial relationships, and precise lighting interactions. Describe the scene as if explaining it to a person.`);
        } else if (lowerCaseTarget.includes('qwen image')) {
             instructions.push(`For QWEN Image, prompt structure should be clear and logical. Follow this order: [Main Subject] + [Detailed Environment] + [Artistic Style/Medium] + [Lighting/Composition]. Use descriptive natural language enhanced with specific keywords (e.g., "highly detailed", "cinematic lighting", "photorealistic"). Ensure the subject is clearly defined at the start.`);
        } else if (lowerCaseTarget.includes('pony')) {
            instructions.push(`For Pony Diffusion, prompts should be descriptive sentences but also start with quality and scoring tags like 'score_9, score_8_up, source_anime' to guide the AI.`);
        } else if (lowerCaseTarget.includes('sdxl')) {
            instructions.push(`For SDXL, focus on rich, descriptive sentences. Weave in quality tags like 'masterpiece, 4k' within the prose. Use weighting like (word:1.2) to emphasize certain concepts.`);
        } else if (lowerCaseTarget.includes('stable diffusion')) {
            instructions.push(`For older Stable Diffusion models, use a mix of descriptive prose and comma-separated keywords, including quality tags like "masterpiece, best quality". Use weighting like (word:1.2) to emphasize concepts and [word] to de-emphasize them.`);
        } else if (lowerCaseTarget.includes('midjourney')) {
            instructions.push(`For Midjourney, focus entirely on the narrative and descriptive prose. Do NOT add any parameters like --ar or --v; these will be added automatically later.`);
        } else {
            instructions.push(`For a general purpose AI, focus on a clear and descriptive narrative.`);
        }
    }
    
    return instructions.join('\n');
};


// --- Service Implementations ---

export const enhancePrompt = async (
    originalPrompt: string,
    constantModifier: string,
    promptLength: string,
    targetAIModel: string,
    modifiers: PromptModifiers,
    settings: LLMSettings
): Promise<EnhancementResult> => {
    const systemInstruction = buildSystemInstructionForEnhancer(promptLength, targetAIModel, modifiers);

    let text: string;
    if (settings.activeLLM === 'ollama') {
        text = await enhancePromptOllama(originalPrompt, constantModifier, settings, systemInstruction);
    } else {
        text = await enhancePromptGemini(originalPrompt, constantModifier, settings, systemInstruction);
    }

    const midjourneyParams = targetAIModel.toLowerCase().includes('midjourney') 
        ? buildMidjourneyParams(modifiers) 
        : '';

    const suggestions = text.split('\n')
        .map(s => s.trim().replace(/^\s*\d+\.\s*/, ''))
        .filter(Boolean)
        .map(s => [s, midjourneyParams.trim()].filter(Boolean).join(' '));
    
    if (suggestions.length === 0) {
        throw new Error("The AI returned an empty response. Please try rephrasing your prompt.");
    }

    return { suggestions };
};

export async function* enhancePromptStream(
    originalPrompt: string,
    constantModifier: string,
    promptLength: string,
    targetAIModel: string,
    modifiers: PromptModifiers,
    settings: LLMSettings
): AsyncGenerator<string> {
    const systemInstruction = buildSystemInstructionForEnhancer(promptLength, targetAIModel, modifiers);
    
    if (settings.activeLLM === 'ollama') {
        const stream = enhancePromptOllamaStream(originalPrompt, constantModifier, settings, systemInstruction);
        for await (const chunk of stream) {
            yield chunk;
        }
    } else {
        const stream = enhancePromptGeminiStream(originalPrompt, constantModifier, settings, systemInstruction);
        for await (const chunk of stream) {
            yield chunk;
        }
    }
}


const buildSystemInstructionForRefiner = async (targetAIModel: string) => {
    if (!artStylesCache || !artistsCache || !generalCheatsheetCache) {
        const [artStyles, artists, generalCheatsheet] = await Promise.all([
            loadArtStyles(),
            loadArtists(),
            loadCheatsheet()
        ]);
        artStylesCache = artStyles;
        artistsCache = artists;
        generalCheatsheetCache = generalCheatsheet;
    }
    
    const cheatsheetDataForAI = [
        { name: 'Art Style', items: (artStylesCache || []).flatMap(c => c.items.map(i => i.name)) },
        { name: 'Artist', items: (artistsCache || []).flatMap(c => c.items.map(i => i.name)) },
        ...(generalCheatsheetCache || []).map(c => ({ name: c.category, items: c.items.map(i => i.name) }))
    ];

    let cheatsheetContext = "Use the following keywords and concepts from these reference categories to enrich the prompt:\n";
    cheatsheetDataForAI.forEach(sheet => {
        cheatsheetContext += `- ${sheet.name}: ${sheet.items.slice(0, 30).join(', ')}\n`;
    });
    
    const isVideoTarget = TARGET_VIDEO_AI_MODELS.includes(targetAIModel);
    const lowerCaseTarget = targetAIModel.toLowerCase();
    
    let targetInstructions = '';
    if (isVideoTarget) {
        if (lowerCaseTarget.includes('wan')) {
            targetInstructions = `The prompt is for WAN 2.5 (video generation). It MUST describe the scene, the motion, AND the audio/sound. Explicitly include sound descriptions like "Sound of..." or "Audio:..." to utilize the model's capabilities. Use a natural, descriptive style for the visual action.`;
        } else if (lowerCaseTarget.includes('hun yuan')) {
            targetInstructions = `For Hun Yuan Video, strictly organize the prompt into: 1. Subject (Description & Action), 2. Background/Environment, 3. Camera Language (e.g., static, pan, zoom), 4. Style/Atmosphere (e.g. 8k, cinematic), 5. Lighting. Ensure clear motion descriptions.`;
        } else {
            targetInstructions = `The prompt is for a VIDEO generation AI. It MUST describe a scene with motion. Crucially, you MUST include specific, explicit camera movement guidance in brackets, such as [pan right], [dolly zoom], [handheld footage], [slow motion], [zoom out, pan right]. The prompt must contain at least one of these bracketed camera commands. Describe subject actions and changes in the environment over a short duration.`;
        }
    } else {
        if (lowerCaseTarget.includes('flux 2')) {
            targetInstructions = `For FLUX 2, use clear, natural language descriptions. Avoid keywords lists and tag soup. Describe lighting, texture, and composition in full sentences as if speaking to a human. If text needs to be rendered, specify it clearly in quotes.`;
        } else if (lowerCaseTarget.includes('flux')) {
            targetInstructions = `For FLUX models, use rich, descriptive natural language sentences and comma-separated keywords. Do not use weighted terms. Aim for descriptive, detailed prompts.`;
        } else if (lowerCaseTarget.includes('z-image')) {
            targetInstructions = `For Z-Image, use a structured paragraph in this order: [Subject], [Environment], [Lighting], [Style]. Be highly descriptive about materials and visual fidelity using terms like "high fidelity", "intricate details", "hyper-realistic".`;
        } else if (lowerCaseTarget.includes('seedream')) {
            targetInstructions = `For SeeDream, focus on artistic aesthetics. Use a mix of natural language and keywords. emphasize lighting and composition.`;
        } else if (lowerCaseTarget.includes('nano banana')) {
            targetInstructions = `For Nano Banana, use rich, highly detailed natural language. Describe materials, textures, and light physics accurately. Do not use comma-separated tag lists.`;
        } else if (lowerCaseTarget.includes('qwen image')) {
            targetInstructions = `For QWEN Image, organize the prompt into a clear structure: 1. Main Subject, 2. Detailed Environment, 3. Style/Medium, 4. Lighting/Composition. Use descriptive adjectives and style keywords (e.g., 'neon lights', 'cyberpunk style', '8k resolution').`;
        } else if (lowerCaseTarget.includes('pony')) {
            targetInstructions = `For Pony Diffusion models, structure the prompt with quality tags and scoring tags first (e.g., score_9, score_8_up, source_anime, masterpiece, best quality), followed by a descriptive natural language sentence.`;
        } else if (lowerCaseTarget.includes('sdxl')) {
            targetInstructions = `For SDXL models, use a mix of natural language description and comma-separated keywords. Weighted terms like (word:1.2) can be used for emphasis. Aim for descriptive, detailed prompts.`;
        } else if (lowerCaseTarget.includes('stable diffusion')) {
            targetInstructions = `For Stable Diffusion models (like 1.5), structure the prompt as a series of comma-separated keywords and phrases. Use weighted terms like (word:1.2) for emphasis and [word] for de-emphasize.`;
        } else if (lowerCaseTarget.includes('midjourney')) {
            targetInstructions = `For Midjourney, focus on rich, descriptive, natural language prose. Avoid comma-separated keywords. Append relevant Midjourney parameters to the end of the prompt, such as --ar for aspect ratio, --v for version, and --style raw if it enhances the prompt.`;
        } else {
            targetInstructions = `For this general purpose model, focus on a clear and descriptive narrative.`;
        }
    }

    return `You are a world-class prompt engineering expert. Your task is to take a user's prompt and rewrite it into a single, highly effective prompt for a specific generative AI model. 
You must adhere to the best practices and syntax for the target model which is: ${targetAIModel}.
${targetInstructions}
Reference the provided art styles, artists, and other cheatsheet terms to enrich the prompt.
Return ONLY the single, refined prompt text, without any preamble, explanation, or markdown formatting.

${cheatsheetContext}`;
};

export const refineSinglePrompt = async (promptText: string, targetAIModel: string, settings: LLMSettings): Promise<string> => {
    const systemInstruction = await buildSystemInstructionForRefiner(targetAIModel);

    if (settings.activeLLM === 'ollama') {
        return refineSinglePromptOllama(promptText, settings, systemInstruction);
    }
    return refineSinglePromptGemini(promptText, '', settings, systemInstruction);
};

export async function* refineSinglePromptStream(
    promptText: string,
    targetAIModel: string,
    settings: LLMSettings
): AsyncGenerator<string> {
    const systemInstruction = await buildSystemInstructionForRefiner(targetAIModel);
    
    if (settings.activeLLM === 'ollama') {
        const stream = refineSinglePromptOllamaStream(promptText, settings, systemInstruction);
        for await (const chunk of stream) {
            yield chunk;
        }
    } else {
        const stream = refineSinglePromptGeminiStream(promptText, '', settings, systemInstruction);
        for await (const chunk of stream) {
            yield chunk;
        }
    }
}


export const analyzePaletteMood = async (hexColors: string[], settings: LLMSettings): Promise<string> => {
    if (settings.activeLLM === 'ollama') {
        return analyzePaletteMoodOllama(hexColors, settings);
    }
    // Default to Gemini
    return analyzePaletteMoodGemini(hexColors, settings);
};

export const generateColorName = async (hexColor: string, mood: string, settings: LLMSettings): Promise<string> => {
    if (settings.activeLLM === 'ollama') {
        return generateColorNameOllama(hexColor, mood, settings);
    }
    return generateColorNameGemini(hexColor, mood, settings);
};

export const dissectPrompt = async (promptText: string, settings: LLMSettings): Promise<{ [key: string]: string }> => {
    if (settings.activeLLM === 'ollama') {
        return dissectPromptOllama(promptText, settings);
    }
    return dissectPromptGemini(promptText, settings);
};

export const generateFocusedVariations = async (promptText: string, components: { [key: string]: string }, settings: LLMSettings): Promise<{ [key: string]: string[] }> => {
    if (settings.activeLLM === 'ollama') {
        return generateFocusedVariationsOllama(promptText, components, settings);
    }
    return generateFocusedVariationsGemini(promptText, components, settings);
};

export const reconstructPrompt = async (components: { [key: string]: string }, settings: LLMSettings): Promise<string> => {
    if (settings.activeLLM === 'ollama') {
        return reconstructPromptOllama(components, settings);
    }
    return reconstructPromptGemini(components, settings);
};

export const replaceComponentInPrompt = async (originalPrompt: string, componentKey: string, newValue: string, settings: LLMSettings): Promise<string> => {
    if (settings.activeLLM === 'ollama') {
        return replaceComponentInPromptOllama(originalPrompt, componentKey, newValue, settings);
    }
    return replaceComponentInPromptGemini(originalPrompt, componentKey, newValue, settings);
};

export const reconstructFromIntent = async (intents: string[], settings: LLMSettings): Promise<string> => {
    if (settings.activeLLM === 'ollama') {
        return reconstructFromIntentOllama(intents, settings);
    }
    return reconstructFromIntentGemini(intents, settings);
};


export const generatePromptFormulaWithAI = async (promptText: string, settings: LLMSettings): Promise<string> => {
    if (settings.activeLLM === 'ollama') {
        return generatePromptFormulaOllama(promptText, settings);
    }
    return generatePromptFormulaGemini(promptText, settings);
};

export const abstractImage = async (
    base64ImageData: string,
    promptLength: string,
    targetAIModel: string,
    settings: LLMSettings
): Promise<EnhancementResult> => {
    if (settings.activeLLM === 'ollama') {
        return abstractImageOllama(base64ImageData, promptLength, targetAIModel, settings);
    }
    // Default to Gemini
    return abstractImageGemini(base64ImageData, promptLength, targetAIModel, settings);
};

export const generateArtistDescription = async (artistName: string, settings: LLMSettings): Promise<string> => {
    if (settings.activeLLM === 'ollama') {
        return generateArtistDescriptionOllama(artistName, settings);
    }
    return generateArtistDescriptionGemini(artistName, settings);
};

export const detectSalientRegion = async (base64ImageData: string, settings: LLMSettings): Promise<{ box: [number, number, number, number] }> => {
    if (settings.activeLLM === 'ollama') {
        // Ollama support for this is not implemented. Fallback to Gemini.
        console.warn("Ollama does not support salient region detection, falling back to Gemini.");
    }
    return detectSalientRegionGemini(base64ImageData, settings);
};
