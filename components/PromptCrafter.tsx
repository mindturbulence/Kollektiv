import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import { audioService } from '../services/audioService';
import { TerminalText, PanelLine, ScanLine, panelVariants, sectionWipeVariants, contentVariants } from './AnimatedPanels';
import JSZip from 'jszip';
import { crafterService } from '../services/crafterService';
import type { WildcardFile, CrafterData } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { SparklesIcon } from './icons';
import { fileSystemManager } from '../utils/fileUtils';
import { useSettings } from '../contexts/SettingsContext';
import { useBusy } from '../contexts/BusyContext';
import { translateToEnglish, reconstructFromIntent } from '../services/llmService';
import ConfirmationModal from './ConfirmationModal';
import WildcardTree from './WildcardTree';
import SavedResultItem from './SavedResultItem';
import AutocompleteSelect from './AutocompleteSelect';

interface PromptCrafterProps {
    onSaveToLibrary: (generatedText: string, baseText: string) => void;
    onClip?: (prompt: string) => void;
    onSendToEnhancer: (prompt: string) => void;
    onSavePresetSuccess?: (prompt: string, modifiers: any, constantModifier?: string) => void;
    onSendToRefine?: (prompt: string) => void;
    promptToInsert: { content: string, id: string } | null;
    header: React.ReactNode;
    isNavigating?: boolean;
}

// --- Generative Media Recipes (from SamurAIGPT/Generative-Media-Skills) ---
const MEDIA_RECIPES = [
    // --- Motion / Video (16) ---
    {
        id: 'logo_animation_3d',
        name: '3D Logo Animation',
        category: 'Motion / Video',
        description: 'Transform a 2D logo into a premium 3D version and animate it with professional cinematic effects',
        template: 'A premium 3D logo animation of "{input}", transforming a flat design into a high-end three-dimensional brand symbol. Dynamic camera sweeps, metallic and chrome surface reflections, sleek physical textures, and elegant transitions with professional studio-grade cinematic lighting.'
    },
    {
        id: 'ai_fight_scene',
        name: 'AI Fight Scene Generator',
        category: 'Motion / Video',
        description: 'High-cut-density action / fight scene — 16-cell storyboard image drives Seedance 2.0 i2v for shot-by-shot choreography',
        template: 'An intense, high-cut-density cinematic action choreography and fight scene featuring "{input}". Captured as a 16-cell dramatic storyboard sequence, detailing rapid sequential combat moves, explosive physics-based motion, and fast-paced cinematic cuts with realistic lighting and dynamic keyframe transitions.'
    },
    {
        id: 'animal_vlogger',
        name: 'Animal Vlogger Video',
        category: 'Motion / Video',
        description: 'Hilarious, ultra-realistic anthropomorphic-animal vlogger acting like a human in a real-world setting',
        template: 'An ultra-realistic anthropomorphic animal vlogger depicting "{input}", dressed in casual human clothes, talking direct-to-camera with hilarious relatable expressions. Set in a natural real-world room/studio with realistic fur rendering, expressive eyes, and lifestyle vlogging camera work.'
    },
    {
        id: 'cartoon_dance',
        name: 'Cartoon Dance Animation',
        category: 'Motion / Video',
        description: 'Convert a photo into a Pixar-style 3D cartoon, then animate using a reference dance/motion video',
        template: 'A charming, animated Pixar-style 3D cartoon character representing "{input}", performing a highly fluid, energetic dance routine. Features soft stylized clay-like textures, expressive large eyes, beautiful cinematic global illumination, and high-fidelity motion graphics.'
    },
    {
        id: 'character_story',
        name: 'Character Story Video',
        category: 'Motion / Video',
        description: 'Multi-part animated story video — establish a consistent character then animate sequential scenes',
        template: 'A captivating multi-part animated story sequence following a consistently designed character of "{input}". Features sequential storytelling keyframes depicting continuous character actions, dramatic cinematic camera angles, and a beautiful cohesive visual narrative.'
    },
    {
        id: 'drone_style_video',
        name: 'Drone-Style Video',
        category: 'Motion / Video',
        description: 'Aerial drone-perspective footage — bird\'s-eye sweeps, orbit shots, and flyover sequences',
        template: 'Breathtaking high-altitude drone-perspective footage of "{input}". Features dramatic bird\'s-eye sweeps, smooth orbital camera moves, and expansive flyover sequences. Stunning landscape depth, cinematic color-grading, and natural sunlight.'
    },
    {
        id: 'giant_product_showcase',
        name: 'Giant Product Showcase',
        category: 'Motion / Video',
        description: 'Dramatic giant-scale product visual (building-sized object next to a person), optionally animated',
        template: 'An awe-inspiring dramatic giant-scale product visual of "{input}", styled as a massive building-sized monument placed in a busy city center next to tiny scale-reference people. Shot with an ultra-wide angle lens, featuring detailed textures, realistic cloud reflections, and dramatic cinematic lighting.'
    },
    {
        id: 'jewelry_product_video',
        name: 'Jewelry Product Video',
        category: 'Motion / Video',
        description: 'Luxury jewelry ad with high-end commercial cinematography and detailed macro animation',
        template: 'A luxurious commercial jewelry advertisement highlighting "{input}". Exquisite macro cinematography focusing on micro-fine details, sparkling diamond/gold reflections, elegant velvet backdrops, professional studio spotlighting, and seamless graceful rotational showcase movement.'
    },
    {
        id: 'music_video',
        name: 'Music Video',
        category: 'Motion / Video',
        description: 'Short music video from a song theme — keyframes, animation per beat, matching music track',
        template: 'A striking, highly rhythmic short music video based on the theme of "{input}". Features abstract sequential cinematic keyframes, vibrant flashing reactive lighting, stylized artistic cuts synchronized to a heavy musical beat, and high energy visual design.'
    },
    {
        id: 'one_shot_video',
        name: 'One-Shot Video',
        category: 'Motion / Video',
        description: 'Single continuous cinematic shot — no cuts, one seamless flowing scene',
        template: 'A seamless, continuous single one-shot cinematic video showing "{input}". The camera glides gracefully through a detailed scene without any cuts, shifting focus from foreground to background smoothly, using elegant steadicam motion and realistic volumetric lighting.'
    },
    {
        id: 'cinematic_product_ad',
        name: 'Cinematic Product Ad',
        category: 'Motion / Video',
        description: 'Cinematic 5–10s product ad from a product photo + brand brief',
        template: 'A premium 5-to-10 second cinematic commercial product advertisement for "{input}". Features dramatic slow-motion reveals, artistic fluid splashes or clean smoke atmospheric accents, exquisite studio key lighting, and clean copy-space margins for professional brand briefs.'
    },
    {
        id: 'product_showcase_video',
        name: 'Product Showcase Video',
        category: 'Motion / Video',
        description: 'Dynamic product showcase with explosive ingredient arrangement + realistic motion animation',
        template: 'A dynamic, explosive cinematic product showcase of "{input}". Features floating ingredients and materials arranged in mid-air in a suspended explosion, detailed with slow-motion micro-drops, highly realistic material shaders, and pristine studio backing lights.'
    },
    {
        id: 'product_video_ad_maker',
        name: 'Product Video Ad Maker',
        category: 'Motion / Video',
        description: 'High-end cinematic product video ad starting from a simple product photo',
        template: 'An elegant, high-end commercial video advertisement for "{input}" starting from standard brand photography. Showcases high-contrast lighting setups, majestic rotating product pedestals, moody ambient backgrounds, and luxurious macro focus detailing premium materials.'
    },
    {
        id: 'talking_baby',
        name: 'Talking Baby Video',
        category: 'Motion / Video',
        description: 'Viral-style talking-baby video with custom costumes and scripts',
        template: 'A viral-style talking infant video depicting a baby dressed in a customized costume of "{input}". Highly expressive child features speaking a custom script with matching lip synchronization, comical timing, bright soft baby-room lighting, and clean smartphone camera look.'
    },
    {
        id: 'ugc_lifestyle_try_on',
        name: 'UGC Lifestyle Try-On',
        category: 'Motion / Video',
        description: 'UGC-style lifestyle photos & video of a person using your product — authentic, social-native',
        template: 'A highly authentic UGC-style lifestyle showcase of a real person using "{input}". Natural handheld smartphone video capturing honest expressions, casual home/cafe environment with realistic lighting, focus on a genuine organic product try-on demonstration.'
    },
    {
        id: 'ugc_video_factory',
        name: 'UGC Video Factory',
        category: 'Motion / Video',
        description: 'Person photo + product photo + script → 10s vertical 9:16 UGC video ad with native dialogue',
        template: 'A high-conversion 10s vertical 9:16 UGC video advertisement featuring "{input}". Natural smartphone camera framing, an authentic presenter speaking direct-to-camera with native dialogue, realistic environment, fast-paced transitions, and overlay text captioning.'
    },

    // --- Social (5) ---
    {
        id: 'instagram_post',
        name: 'Instagram Post',
        category: 'Social',
        description: 'Polished on-brand Instagram post — hero image + caption + hashtags',
        template: 'A highly polished, conversion-optimized Instagram feed square post for "{input}". Featuring a striking on-brand hero image, clean modern negative spaces, professional studio aesthetic, paired with a compelling social-media hook outline text space.'
    },
    {
        id: 'product_campaign_pack',
        name: 'Product Campaign Pack',
        category: 'Social',
        description: 'Full multi-channel campaign — hero visuals, social assets, short ad video, platform crops',
        template: 'A premier full multi-channel product campaign toolkit about "{input}". Featuring high-end master hero visuals, social media promotional grids, dynamic short video advertisement frames, and clean layouts optimized for cross-platform crops.'
    },
    {
        id: 'rednote_cover',
        name: 'RedNote Cover',
        category: 'Social',
        description: 'Xiaohongshu (小红书) cover image — vibrant lifestyle aesthetic with typography overlay',
        template: 'A highly aesthetic and vibrant Xiaohongshu RedNote cover design featuring "{input}". Beautiful soft focus lifestyle photography, bright dreamlike color tones, stylish modern typography overlays with elegant margins, and high visual attraction.'
    },
    {
        id: 'social_media_pack',
        name: 'Social Media Pack',
        category: 'Social',
        description: 'Re-render a hero image into Instagram / TikTok / Shorts / X aspect ratios',
        template: 'A multi-format social media asset package based on "{input}". Ready for adaptation into Instagram (1:1), TikTok/Shorts (9:16), and X/Twitter banner aspect ratios, emphasizing high resolution composition, clear subject focus, and professional formatting.'
    },
    {
        id: 'ugc_ads_workflow',
        name: 'UGC Ads Workflow',
        category: 'Social',
        description: 'UGC video ad pipeline — combine selfie + product image, write script, animate',
        template: 'A step-by-step user-generated content video ad concept for "{input}". Integrates realistic selfie footage with a premium product showcase overlay, authentic testimonial scripting elements, and natural smooth animations.'
    },

    // --- Visual / Images & Design (21) ---
    {
        id: 'action_figure_generator',
        name: 'Action Figure Generator',
        category: 'Visual / Images & Design',
        description: 'Convert a photo of a person into a custom 3D action figure with collectible toy packaging',
        template: 'A custom 3D action figure toy of "{input}", showcasing detailed glossy plastic and matte joint textures. Packaged beautifully inside a classic collector\'s vintage cardboard cardback blister packaging layout, with colorful commercial graphics, logo placement, and key lighting.'
    },
    {
        id: 'ad_creative_set',
        name: 'Ad Creative Set',
        category: 'Visual / Images & Design',
        description: 'High-converting ad set — hero image, copy variations, platform crops for Meta / Google / LinkedIn',
        template: 'A complete professional ad creative set for "{input}". Contains a highly converting premium hero visual, dedicated text copies space, and optimized layout assets for high-CTR campaigns on Meta, Google, and LinkedIn.'
    },
    {
        id: 'amazon_listing_pack',
        name: 'Amazon Product Listing Pack',
        category: 'Visual / Images & Design',
        description: 'Full Amazon listing image set — hero, lifestyle, infographic, comparison/detail closeups',
        template: 'An optimized Amazon product listing image set for "{input}". Comprises a pristine pure white background hero shot, authentic in-use lifestyle photography, clear infographics layout spaces, and detailed macro texture detail closeups.'
    },
    {
        id: 'blog_header',
        name: 'Blog Header',
        category: 'Visual / Images & Design',
        description: 'Professional 1200×628 blog header image with optional title composition guidance',
        template: 'A clean 1200x628 professional blog headers image for "{input}". Combines elegant geometric abstractions or scenic background imagery with deep negative spaces, high color contrast, and balanced typographic alignment fields.'
    },
    {
        id: 'brand_kit',
        name: 'Brand Kit',
        category: 'Visual / Images & Design',
        description: 'Cohesive brand visual kit — logo concept, color palette, typography pairings',
        template: 'A cohesive premium visual brand identity and design kit themed on "{input}". Showcases a minimal elegant vector logo, a selected micro-color palette, complimentary typography pairings, and clean aesthetic stationary mockups.'
    },
    {
        id: 'brochure_designer',
        name: 'Brochure Designer',
        category: 'Visual / Images & Design',
        description: 'Multi-page brochure — cover, inner spread, back — for business, real estate, events, launches',
        template: 'A professional multi-page print-ready brochure layout for "{input}". Detailed cover art design, a clean inner-spread grid system with organized text areas, corporate or creative branding, and a beautiful back-cover design.'
    },
    {
        id: 'couple_grid_creator',
        name: 'Couple Grid Creator',
        category: 'Visual / Images & Design',
        description: 'Stylized 6-box grid of a couple in romantic poses, each pose framed inside cardboard packaging',
        template: 'A highly creative 6-box grid illustration of a couple in romantic poses themed as "{input}". Each pose is stylized and showcased inside its own beautifully detailed vintage cardboard packaging box, with cute colors and neat graphics.'
    },
    {
        id: 'brand_design_guide',
        name: 'Brand Design Guide',
        category: 'Visual / Images & Design',
        description: 'Comprehensive design guide — palette, typography, UI components, visual identity rules',
        template: 'An extensive visual brand identity design guide for "{input}". Displays meticulous typographic hierarchies, core asset palettes, clean minimalist UI component designs, and standard layout alignment guidelines.'
    },
    {
        id: 'fashion_try_on',
        name: 'Fashion Try-On',
        category: 'Visual / Images & Design',
        description: 'Virtually try outfits by combining a person\'s photo + clothing item, optional fashion model video',
        template: 'An advanced fashion try-on showcase presenting a clothing item of "{input}". Features extremely natural material draping, folds, and tactile fabric textures on a professional model, configured with clean studio catalog background illumination.'
    },
    {
        id: 'floor_plan_rendering',
        name: 'Floor Plan Rendering',
        category: 'Visual / Images & Design',
        description: 'Design a 2D floor plan and convert into a realistic 3D architectural rendering',
        template: 'A detailed 2D-to-3D interactive floor plan rendering of "{input}". Features clean architectural blueprint grids alongside a beautiful isometric dollhouse 3D interior concept with realistic wood, metal, glass textures, and soft architectural shadows.'
    },
    {
        id: 'interior_design_pro',
        name: 'Interior Design',
        category: 'Visual / Images & Design',
        description: 'Pro interior design visualizations — redesign rooms, generate concepts, visualize furniture styles',
        template: 'A high-end professional interior design concept for a room themed around "{input}". Beautifully arranged luxury furniture styles, custom material textures, gorgeous natural lighting pouring through large windows, and a balanced modern color scheme.'
    },
    {
        id: 'interior_design_visualizer',
        name: 'Interior Design Visualizer',
        category: 'Visual / Images & Design',
        description: 'Generate an empty room and fill it with stylish furniture / decor; or redesign an existing room',
        template: 'A realistic interior design visualizer depicting a decorated spatial setup of "{input}". Showcases a beautifully styled room filled with minimalist furniture, elegant light fixtures, soft rugs, and custom accent decorations.'
    },
    {
        id: 'keyboard_art_maker',
        name: 'Keyboard Art Maker',
        category: 'Visual / Images & Design',
        description: 'Artistic top-down photos of keyboard keycaps arranged to spell custom messages',
        template: 'An aesthetic top-down flat-lay photograph of customized mechanical keyboard keycaps typing the word \'{input}\'. Detailed double-shot PBT keycap textures, clean switches underneath, warm RGB backlighting, and a trendy desk-mat background.'
    },
    {
        id: 'logo_branding_package',
        name: 'Logo + Branding Package',
        category: 'Visual / Images & Design',
        description: 'Logo + full branding package — variations (dark/light/icon), palette, mockups',
        template: 'A complete professional logo and branding package customized for "{input}". Features light mode, dark mode, responsive icon variations, a cohesive style palette, and multi-format commercial product mockups.'
    },
    {
        id: 'logo_generator',
        name: 'Logo Generator',
        category: 'Visual / Images & Design',
        description: 'Quick single-shot polished logo — fast, clean vector aesthetic with accurate brand-name text',
        template: 'A fast, ultra-clean professional vector logo for "{input}". Elegant geometric minimalism, bold lines, high-contrast flat colors, optimized for digital application, and isolated on a solid color.'
    },
    {
        id: 'multi_angle_reshoot',
        name: 'Multi-Angle Reshoot',
        category: 'Visual / Images & Design',
        description: 'Re-render a subject from dramatic camera angles (fish-eye, bird\'s-eye, low, macro) — identity preserved',
        template: 'A multi-angle dramatic camera reshoot series of "{input}". Keeping subject consistency perfectly preserved across four views: a dramatic fish-eye lens, a cinematic bird\'s-eye, a heroic low-angle shot, and a detailed macro texture shot.'
    },
    {
        id: 'multi_angle_shots',
        name: 'Multi-Angle Shots',
        category: 'Visual / Images & Design',
        description: 'Full multi-angle product shot set — front, side, back, top-down, 45°',
        template: 'A professional studio multi-angle product showcase set for "{input}". Beautifully composed as five distinct layout panels: standard front view, detailed side profile, back details, top-down flatlay, and a dynamic 45-degree hero angle, all on a simple light grey studio background.'
    },
    {
        id: 'selfie_with_celebrities',
        name: 'Selfie with Celebrities',
        category: 'Visual / Images & Design',
        description: 'Realistic behind-the-scenes selfie of the user with a celebrity; optional cinematic long-take',
        template: 'A highly realistic, slightly grainy realistic smartphone camera selfie showing a happy person next to a celebrity in the theme of "{input}". Features casual natural phone camera lighting, candid facial expressions, and busy background atmosphere.'
    },
    {
        id: 'storyboard_generator',
        name: 'Storyboard Generator',
        category: 'Visual / Images & Design',
        description: 'Generate N keyframes for a short story or scene sequence (image only, no video)',
        template: 'A professional storyboard sheet displaying sequential narrative scenes of "{input}". Formatted as a grid of high-fidelity concept art sketch frames, featuring dramatic camera positions, director\'s annotation layout spaces, and rich scene composition.'
    },
    {
        id: 'url_to_design',
        name: 'URL to Design',
        category: 'Visual / Images & Design',
        description: 'Analyze a website URL and generate a redesigned, improved UI with modern aesthetics',
        template: 'An elegant, masterfully designed responsive UI redesign mockup based on the concept of "{input}". Features premium card layouts, ultra-clean layout typography, high contrast buttons and badges, dark theme gradients, and clean interface structures.'
    },
    {
        id: 'youtube_thumbnail',
        name: 'YouTube Thumbnail',
        category: 'Visual / Images & Design',
        description: 'High-CTR YouTube thumbnail — striking imagery, bold text placement, emotional face/subject',
        template: 'A highly engaging, high-CTR YouTube video thumbnail featuring "{input}". Striking key visual subject with bright colored outline glows, bold high-impact sans-serif main typography placed for readability on mobile screen, and an expressive focal subject.'
    }
];

const PromptCrafter = ({ onSaveToLibrary, onClip, onSendToEnhancer, onSendToRefine, promptToInsert, header, isNavigating = false }: PromptCrafterProps) => {
    const { settings } = useSettings();
    const { setIsBusy } = useBusy();
    const [crafterData, setCrafterData] = useState<CrafterData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [promptText, setPromptText] = useState('');
    const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
    const [savedResults, setSavedResults] = useState<string[]>([]);
    const [enableTemporal, setEnableTemporal] = useState(false);
    const [enableAcoustic, setEnableAcoustic] = useState(false);
    const [enableSpatial, setEnableSpatial] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lastInsertedId = useRef<string | null>(null);
    const [aiAction, setAiAction] = useState<string | null>(null);
    const [translated, setTranslated] = useState(false);
    const [clipped, setClipped] = useState(false);

    const wildcardScrollerRef = useRef<HTMLDivElement>(null);
    const mainScrollerRef = useRef<HTMLDivElement>(null);

    // --- Template Management State ---
    const [selectedTemplate, setSelectedTemplate] = useState<WildcardFile | null>(null);
    const [templateSearchText, setTemplateSearchText] = useState('');
    const [templateToDelete, setTemplateToDelete] = useState<WildcardFile | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);
    const [templateName, setTemplateName] = useState('');
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const importInputRef = useRef<HTMLInputElement>(null);

    // --- Media Recipes State ---
    const [selectedRecipeId, setSelectedRecipeId] = useState('');

    const selectedRecipeName = useMemo(() => {
        return MEDIA_RECIPES.find(r => r.id === selectedRecipeId)?.name || '';
    }, [selectedRecipeId]);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await crafterService.loadWildcardsAndTemplates();
            setCrafterData(data);
            const saved = await crafterService.loadSavedResults();
            setSavedResults(saved);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!fileSystemManager.isDirectorySelected()) {
            setError("Crafter requires a storage folder. Please select one in Settings > General > Storage Folder.");
            setIsLoading(false);
            return;
        }
        loadData();
    }, [loadData]);

    useEffect(() => {
        if (promptToInsert && promptToInsert.id !== lastInsertedId.current) {
            setPromptText(prev => prev ? `${prev} ${promptToInsert.content}` : promptToInsert.content);
            lastInsertedId.current = promptToInsert.id;
        }
    }, [promptToInsert]);

    const handlePreviewWildcards = () => {
        if (!promptText.trim() || !crafterData) return;
        audioService.playClick();
        try {
            const resolvedOutput = crafterService.processCrafterPrompt(promptText, crafterData.wildcardCategories);
            setGeneratedPrompt(resolvedOutput);
            setClipped(false);
            setTranslated(false);
        } catch (e: any) {
            console.error("Preview resolution failure:", e);
            setError(e.message || "Failed to resolve wildcards locally.");
        }
    };

    const handleGeneratePrompt = async () => {
        if (!promptText.trim() || !crafterData) return;
        audioService.playClick();
        setAiAction('Generating detailed visual prompt...');
        setIsBusy(true);
        setError(null);
        try {
            // STEP A: Resolve wildcards locally
            const resolvedInput = crafterService.processCrafterPrompt(promptText, crafterData.wildcardCategories);

            // STEP B: Build prompt wrapping in selected media skill recipe template (if any is active)
            let assembledPrompt = resolvedInput;
            const activeRecipe = MEDIA_RECIPES.find(r => r.id === selectedRecipeId);
            if (activeRecipe) {
                assembledPrompt = activeRecipe.template.replace('{input}', resolvedInput);
            }

            // STEP C: Append enhancers if checked
            const appendModifiers: string[] = [];
            if (enableTemporal) {
                appendModifiers.push("Keyframe 0s (Origin: establish composition & posture) -> Keyframe 2s (Peak: kinetic motion vector offset & dynamic gravity calibrator) -> Keyframe 4s+ (Resolution: visual deceleration, parallax camera trajectory)");
            }
            if (enableAcoustic) {
                appendModifiers.push("[Genre: Ambient cinematic soundscape] [Tempo: 90 BPM] [Verse: acoustic/timbre tone, expressive voice cadence] [whisper] [breath] [dramatic pause] [Drop]");
            }
            if (enableSpatial) {
                appendModifiers.push("Structured on XYZ coordinate fields with wireframe vertices [X, Y, Z], surface normal extrusion indices, topological mesh grids, and isometric orthographic projection");
            }

            if (appendModifiers.length > 0) {
                assembledPrompt = `${assembledPrompt} --enriched-with [${appendModifiers.join(" | ")}]`;
            }

            // STEP D: Run through LLM to reconstruct. ReconstructFromIntent takes [assembledPrompt] and produces
            // an ultra high quality optimized prompt.
            const polishedPrompt = await reconstructFromIntent([assembledPrompt], settings);
            setGeneratedPrompt(polishedPrompt || assembledPrompt);
            setClipped(false);
            setTranslated(false);
        } catch (err: any) {
            console.error("AI Generation Failure:", err);
            setError(err.message || 'AI processing returned an error. Try again.');
        } finally {
            setAiAction(null);
            setIsBusy(false);
        }
    };

    const handleTranslate = async () => {
        if (!generatedPrompt) return;
        setAiAction('Translating to English...');
        setIsBusy(true);
        setError(null);
        try {
            const translatedText = await translateToEnglish(generatedPrompt, settings);
            setGeneratedPrompt(translatedText);
            setTranslated(true);
        } catch (e) {
            console.error("Translation failure:", e);
            setError(e instanceof Error ? e.message : 'Translation relay failed.');
        } finally {
            setAiAction(null);
            setIsBusy(false);
        }
    };

    const handleReconstruct = async () => {
        if (!generatedPrompt) return;
        setAiAction('Rewriting prompt...');
        setIsBusy(true);
        setError(null);
        try {
            // Stronger rewrite by passing it through the reconstruction logic which cleans up and optimizes visual prose
            const newPrompt = await reconstructFromIntent([generatedPrompt], settings);
            setGeneratedPrompt(newPrompt);
        } catch (e) {
            console.error("Failed to rewrite result:", e);
            setError(e instanceof Error ? e.message : 'Failed to rewrite prompt.');
        } finally {
            setAiAction(null);
            setIsBusy(false);
        }
    };

    const handleSaveResult = () => {
        if (generatedPrompt && !savedResults.includes(generatedPrompt)) {
            const newResults = [generatedPrompt, ...savedResults];
            setSavedResults(newResults);
            crafterService.saveSavedResults(newResults);
        }
    };

    const handleDeleteSavedResult = (index: number) => {
        const newResults = savedResults.filter((_, i) => i !== index);
        setSavedResults(newResults);
        crafterService.saveSavedResults(newResults);
    };

    const handleClip = useCallback(() => {
        if (!generatedPrompt || !onClip) return;
        onClip(generatedPrompt);
        setClipped(true);
        setTimeout(() => setClipped(false), 2000);
    }, [generatedPrompt, onClip]);

    const handleSaveTemplateClick = () => {
        if (selectedTemplate) {
            setTemplateName(selectedTemplate.name);
        } else {
            setTemplateName('');
        }
        setIsSaveModalOpen(true);
    };

    const handleConfirmSaveTemplate = async () => {
        if (!templateName.trim()) return;
        setIsSavingTemplate(true);
        await crafterService.saveTemplate(templateName, promptText);
        await loadData();
        setIsSavingTemplate(false);
        setIsSaveModalOpen(false);
    };

    const handleDeleteTemplate = async (template: WildcardFile) => {
        await crafterService.deleteTemplate(template.name);
        setPromptText('');
        setSelectedTemplate(null);
        setTemplateSearchText('');
        await loadData();
    };

    const handleConfirmDelete = async () => {
        if (templateToDelete) {
            await handleDeleteTemplate(templateToDelete);
            setIsDeleteModalOpen(false);
            setTemplateToDelete(null);
        }
    };

    const handleApplyRecipe = (recipeId: string) => {
        audioService.playClick();
        setSelectedRecipeId(recipeId);
    };

    const handleWildcardClick = useCallback((wildcardName: string) => {
        const textToInsert = `__${wildcardName}__`;
        const prefix = promptText.trim().length > 0 && !promptText.endsWith(' ') ? ' ' : '';
        const newText = `${promptText}${prefix}${textToInsert}`;

        setPromptText(newText);

        const textarea = textareaRef.current;
        if (textarea) {
            setTimeout(() => {
                (textarea as any).focus();
                (textarea as any).setSelectionRange(newText.length, newText.length);
            }, 0);
        }
    }, [promptText]);

    const handleUseTemplate = useCallback((templateToUse: WildcardFile | null = selectedTemplate) => {
        if (templateToUse) {
            setPromptText(templateToUse.content[0] || '');
        }
    }, [selectedTemplate]);

    const handleDeleteTemplateClick = () => {
        if (selectedTemplate) {
            setTemplateToDelete(selectedTemplate);
            setIsDeleteModalOpen(true);
        }
    };

    const filteredTemplates = useMemo(() => {
        if (!templateSearchText) return crafterData?.templates || [];
        return crafterData?.templates.filter(t => t.name.toLowerCase().includes(templateSearchText.toLowerCase())) || [];
    }, [templateSearchText, crafterData?.templates]);

    const handleImportClick = () => {
        importInputRef.current?.click();
    };

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setIsImporting(true);
        setError(null);

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const lowerName = file.name.toLowerCase();

                if (lowerName.endsWith('.txt') || lowerName.endsWith('.yml') || lowerName.endsWith('.yaml')) {
                    const content = await file.text();
                    await crafterService.saveWildcardFile(file.name, content);
                } else if (lowerName.endsWith('.zip')) {
                    const zip = await JSZip.loadAsync(file);
                    const entries = Object.entries(zip.files);
                    for (const [relativePath, zipEntry] of entries) {
                        if (!zipEntry.dir) {
                            const entryLower = relativePath.toLowerCase();
                            if (entryLower.endsWith('.txt') || entryLower.endsWith('.yml') || entryLower.endsWith('.yaml')) {
                                const content = await zipEntry.async('string');
                                await crafterService.saveWildcardFile(relativePath, content);
                            }
                        }
                    }
                }
            }
            await loadData();
        } catch (err: any) {
            console.error("Import failed:", err);
            setError(`Import failed: ${err.message}`);
        } finally {
            setIsImporting(false);
            if (importInputRef.current) importInputRef.current.value = '';
        }
    };

    if (isLoading) return (
        <div className="h-full w-full flex items-center justify-center bg-transparent">
            <LoadingSpinner />
        </div>
    );
    if (error) return <div className="p-4 text-error">{error}</div>;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 overflow-hidden h-full gap-4 min-h-0">
            <motion.aside
                variants={panelVariants}
                initial="hidden"
                animate={isNavigating ? "exit" : "visible"}
                exit="exit"
                className="lg:col-span-3 h-full min-h-0 flex flex-col relative p-[3px] corner-frame overflow-visible"
            >
                <PanelLine position="top" delay={0.4} />
                <PanelLine position="bottom" delay={0.5} />
                <PanelLine position="left" delay={0.6} />
                <PanelLine position="right" delay={0.7} />
                <ScanLine delay={3.5} />
                <div className="flex flex-col h-full w-full overflow-visible min-h-0 relative z-10 bg-base-100/40 backdrop-blur-xl">
                    {header}
                    <motion.header
                        variants={sectionWipeVariants}
                        custom={1.2}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="p-6 h-16 flex items-center bg-base-100/10 backdrop-blur-md flex-shrink-0 panel-header"
                    >
                        <TerminalText text="WILDCARDS" delay={2.0} className="text-xs font-sf-mono uppercase text-primary" />
                    </motion.header>
                    <motion.div
                        variants={contentVariants}
                        custom={2.2}
                        initial="hidden"
                        animate="visible"
                        ref={wildcardScrollerRef}
                        className="flex-grow p-6 overflow-y-auto"
                    >
                        <WildcardTree categories={crafterData?.wildcardCategories || []} onWildcardClick={handleWildcardClick} />
                    </motion.div>
                    <motion.footer
                        variants={contentVariants}
                        custom={2.4}
                        initial="hidden"
                        animate="visible"
                        className="h-14 flex items-stretch bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 flex-shrink-0 panel-footer"
                    >
                        <button
                            onClick={() => {
                                audioService.playClick();
                                loadData();
                            }}
                            disabled={isImporting}
                            className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                        >
                            <span /><span /><span /><span />
                            {isImporting ? '...' : 'REFRESH'}
                        </button>
                        <button
                            onClick={() => {
                                audioService.playClick();
                                handleImportClick();
                            }}
                            disabled={isImporting}
                            className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                        >
                            <span /><span /><span /><span />
                            IMPORT
                        </button>
                        <input
                            type="file"
                            ref={importInputRef}
                            onChange={handleImportFile}
                            accept=".txt,.yml,.yaml,.zip"
                            multiple
                            className="hidden"
                        />
                    </motion.footer>
                </div>
                {/* Manual Corner Accents - Reduced contrast to match app style */}
                <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
            </motion.aside>
            <motion.main
                variants={panelVariants}
                initial="hidden"
                animate={isNavigating ? "exit" : "visible"}
                exit="exit"
                className="lg:col-span-6 h-full min-h-0 flex flex-col relative p-[3px] corner-frame overflow-visible"
            >
                <PanelLine position="top" delay={0.4} />
                <PanelLine position="bottom" delay={0.5} />
                <PanelLine position="left" delay={0.6} />
                <PanelLine position="right" delay={0.7} />
                <ScanLine delay={3.5} />
                <div className="flex flex-col h-full w-full overflow-visible min-h-0 relative z-10 bg-base-100/40 backdrop-blur-xl">
                    <motion.header
                        variants={sectionWipeVariants}
                        custom={1.4}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="flex-shrink-0 flex flex-col bg-base-100/10 p-3 gap-2 panel-header relative z-[800] overflow-visible border-b border-primary/10"
                    >
                        {/* Row 1: Template Selection with Clear & Delete controls right next to it */}
                        <div className="flex flex-col sm:flex-row gap-2.5 items-center w-full justify-between overflow-visible">
                            <div className="flex-1 w-full text-sm h-full flex items-center overflow-visible">
                                <AutocompleteSelect
                                    placeholder="SELECT TEMPLATE..."
                                    value={selectedTemplate?.name || ''}
                                    onChange={(val) => {
                                        const template = filteredTemplates.find(t => t.name === val);
                                        if (template) {
                                            setSelectedTemplate(template);
                                            setTemplateSearchText(template.name);
                                            handleUseTemplate(template);
                                        } else if (val === '') {
                                            setSelectedTemplate(null);
                                            setTemplateSearchText('');
                                            setPromptText('');
                                        }
                                    }}
                                    options={filteredTemplates.map(t => ({ label: t.name.toUpperCase(), value: t.name }))}
                                />
                            </div>
                            <div className="flex gap-2 shrink-0 px-1 items-center">
                                <button
                                    onClick={() => {
                                        audioService.playClick();
                                        setTemplateSearchText('');
                                        setSelectedTemplate(null);
                                        setPromptText('');
                                    }}
                                    onMouseEnter={() => audioService.playHover()}
                                    className="font-sf-mono text-[9px] tracking-widest text-base-content/40 hover:text-base-content transition-all bg-base-100/5 px-2 py-1.5 hover:bg-base-100/10"
                                >
                                    CLEAR
                                </button>
                                <button
                                    className="font-sf-mono text-[9px] tracking-widest text-error/40 hover:text-error transition-all mr-1 bg-error/5 disabled:bg-transparent px-2 py-1.5 hover:bg-error/10 disabled:opacity-20"
                                    onClick={() => {
                                        audioService.playClick();
                                        handleDeleteTemplateClick();
                                    }}
                                    onMouseEnter={() => audioService.playHover()}
                                    disabled={!selectedTemplate}
                                >
                                    DELETE
                                </button>
                            </div>
                        </div>

                        {/* Row 2: Blueprint Skill Selector */}
                        <div className="w-full text-sm flex items-center overflow-visible">
                            <div className="flex-1 overflow-visible">
                                <AutocompleteSelect
                                    placeholder="APPLY BLUEPRINT SKILL..."
                                    value={selectedRecipeId}
                                    onChange={(val) => {
                                        handleApplyRecipe(val);
                                    }}
                                    options={MEDIA_RECIPES.map(r => ({ label: `[${r.category}] ${r.name}`.toUpperCase(), value: r.id, description: r.description }))}
                                />
                            </div>
                        </div>
                    </motion.header>

                    <div className="flex-grow flex flex-col min-h-0 overflow-visible relative z-10">
                        {/* Elegant recipe identifier banner if recipe is currently selected */}
                        {selectedRecipeId && (
                            <div className="px-6 py-2 bg-primary/5 border-b border-primary/10 flex items-center justify-between gap-3 flex-shrink-0 z-20">
                                <span className="text-[10px] font-bold font-sf-mono tracking-wider text-primary">
                                    ACTIVE BLUEPRINT: {selectedRecipeName.toUpperCase()}
                                </span>
                                <button
                                    onClick={() => {
                                        audioService.playClick();
                                        setSelectedRecipeId('');
                                    }}
                                    className="text-[9px] font-sf-mono tracking-wider text-base-content/40 hover:text-base-content"
                                >
                                    RELEASE FORMULA (KEEP TEXT)
                                </button>
                            </div>
                        )}

                        <motion.div
                            variants={sectionWipeVariants}
                            custom={1.6}
                            initial="hidden"
                            animate="visible"
                            className="h-[40%] min-h-[200px] p-6 flex flex-col overflow-hidden panel-header"
                        >
                            <textarea
                                data-ai-id="crafter-prompt-input"
                                ref={textareaRef}
                                value={promptText}
                                onChange={(e) => setPromptText((e.currentTarget as any).value)}
                                placeholder="Define your vision... Inject creative possibilities with __wildcards__."
                                className="w-full h-full resize-none font-medium leading-relaxed bg-transparent focus:outline-none p-0 text-[15px] font-nunito"
                            ></textarea>
                        </motion.div>

                        {/* Generative Media Skill Toggles */}
                        <div className="px-6 py-3 bg-base-100/5 border-b border-primary/10 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between z-20 relative">
                            <span className="text-[11px] font-black uppercase tracking-wider text-base-content/50">Add Creative Enhancers:</span>
                            <div className="flex flex-wrap gap-4">
                                <label className="flex items-center gap-2 cursor-pointer group select-none relative" title="Describe dynamic movement sequencing across time keys for video clips">
                                    <input 
                                        type="checkbox" 
                                        checked={enableTemporal} 
                                        onChange={() => { audioService.playClick(); setEnableTemporal(!enableTemporal); }} 
                                        className="checkbox checkbox-xs rounded-none border-primary/40 checked:border-primary checked:bg-primary/20"
                                    />
                                    <span className="text-[10px] font-sf-mono font-bold uppercase tracking-wider text-base-content/60 group-hover:text-primary transition-colors">
                                        Smooth Video Motion
                                    </span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer group select-none relative" title="Embed premium music instrumentation, voice deliveries, and tempo controls">
                                    <input 
                                        type="checkbox" 
                                        checked={enableAcoustic} 
                                        onChange={() => { audioService.playClick(); setEnableAcoustic(!enableAcoustic); }} 
                                        className="checkbox checkbox-xs rounded-none border-primary/40 checked:border-primary checked:bg-primary/20"
                                    />
                                    <span className="text-[10px] font-sf-mono font-bold uppercase tracking-wider text-base-content/60 group-hover:text-primary transition-colors">
                                        Sound & Music Beats
                                    </span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer group select-none relative" title="Inject spatial mesh coordinates and surface wireframes for 3D model creators">
                                    <input 
                                        type="checkbox" 
                                        checked={enableSpatial} 
                                        onChange={() => { audioService.playClick(); setEnableSpatial(!enableSpatial); }} 
                                        className="checkbox checkbox-xs rounded-none border-primary/40 checked:border-primary checked:bg-primary/20"
                                    />
                                    <span className="text-[10px] font-sf-mono font-bold uppercase tracking-wider text-base-content/60 group-hover:text-primary transition-colors">
                                        3D Shapes & Spatial Grid
                                    </span>
                                </label>
                            </div>
                        </div>

                        {/* Middle Action Bar - Library Style */}
                        <motion.div
                            variants={contentVariants}
                            custom={2.4}
                            initial="hidden"
                            animate="visible"
                            className="h-14 flex items-stretch flex-shrink-0 bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 panel-y-accent"
                        >
                            <button
                                onClick={() => {
                                    audioService.playClick();
                                    setPromptText('');
                                }}
                                onMouseEnter={() => audioService.playHover()}
                                className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake text-[10px]"
                            >
                                <span /><span /><span /><span />
                                RESET DRAFT
                            </button>
                            <button
                                onClick={() => {
                                    audioService.playClick();
                                    handleSaveTemplateClick();
                                }}
                                onMouseEnter={() => audioService.playHover()}
                                className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake text-[10px]"
                            >
                                <span /><span /><span /><span />
                                SAVE TEMPLATE
                            </button>
                            <button
                                data-ai-id="crafter-preview-wildcards"
                                onClick={handlePreviewWildcards}
                                onMouseEnter={() => audioService.playHover()}
                                disabled={!promptText.trim()}
                                className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake text-[10px]"
                            >
                                <span /><span /><span /><span />
                                PREVIEW WILDCARDS
                            </button>
                            <button
                                data-ai-id="crafter-generate-prompt"
                                onClick={handleGeneratePrompt}
                                onMouseEnter={() => audioService.playHover()}
                                disabled={!promptText.trim()}
                                className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake text-[10px]"
                            >
                                <span /><span /><span /><span />
                                GENERATE PROMPT
                            </button>
                        </motion.div>

                        <motion.div
                            variants={contentVariants}
                            custom={2.6}
                            initial="hidden"
                            animate="visible"
                            ref={mainScrollerRef}
                            className="flex-1 min-h-0 overflow-y-auto relative"
                        >
                            {aiAction && (
                                <div className="absolute inset-0 bg-base-100/20 backdrop-blur-sm flex flex-col items-center justify-center z-10 animate-fade-in">
                                    <LoadingSpinner />
                                    <p className="text-[10px] font-normal text-[12px] font-sf-mono uppercase tracking-widest text-primary animate-pulse mt-4">{aiAction}</p>
                                </div>
                            )}
                            {generatedPrompt ? (
                                <div className="p-6 h-full animate-fade-in flex flex-col">
                                    <div className="text-base font-normal font-nunito leading-relaxed italic text-base-content/80 flex-grow">
                                        "{generatedPrompt}"
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-10">
                                    <SparklesIcon className="w-16 h-16 mx-auto mb-4" />
                                    <p className="text-xl text-[12px] font-sf-mono uppercase tracking-widest">Awaiting generated prompt</p>
                                </div>
                            )}
                        </motion.div>
                    </div>

                    {/* Bottom Action Bar - Library Style */}
                    <motion.div
                        variants={contentVariants}
                        custom={2.8}
                        initial="hidden"
                        animate="visible"
                        className="h-14 flex items-stretch flex-shrink-0 bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 panel-footer"
                    >
                        <button
                            onClick={() => {
                                audioService.playClick();
                                handleTranslate();
                            }}
                            disabled={!generatedPrompt || !!aiAction}
                            className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                        >
                            <span /><span /><span /><span />
                            {translated ? 'RE-TRANSLATE' : 'TRANSLATE'}
                        </button>
                        <button
                            onClick={() => {
                                audioService.playClick();
                                handleReconstruct();
                            }}
                            disabled={!generatedPrompt || !!aiAction}
                            className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                        >
                            <span /><span /><span /><span />
                            REWRITE
                        </button>
                        <button
                            onClick={() => {
                                audioService.playClick();
                                onSendToEnhancer(generatedPrompt!);
                            }}
                            disabled={!generatedPrompt || !!aiAction}
                            className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                        >
                            <span /><span /><span /><span />
                            IMPROVE
                        </button>
                        <button
                            onClick={() => {
                                audioService.playClick();
                                handleClip();
                            }}
                            disabled={!generatedPrompt}
                            className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                        >
                            <span /><span /><span /><span />
                            {clipped ? 'OK' : 'CLIP'}
                        </button>
                        <button
                            onClick={() => {
                                audioService.playClick();
                                handleSaveResult();
                            }}
                            disabled={!generatedPrompt || savedResults.includes(generatedPrompt)}
                            className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                        >
                            <span /><span /><span /><span />
                            {savedResults.includes(generatedPrompt!) ? 'SAVED' : 'SAVE RESULT'}
                        </button>
                    </motion.div>
                </div>
                {/* Manual Corner Accents */}
                <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
            </motion.main>

            <motion.aside
                variants={panelVariants}
                initial="hidden"
                animate={isNavigating ? "exit" : "visible"}
                exit="exit"
                className="lg:col-span-3 h-full min-h-0 flex flex-col relative p-[3px] corner-frame overflow-visible hidden lg:flex"
            >
                <PanelLine position="top" delay={0.4} />
                <PanelLine position="bottom" delay={0.5} />
                <PanelLine position="left" delay={0.6} />
                <PanelLine position="right" delay={0.7} />
                <ScanLine delay={3.5} />
                <div className="flex flex-col h-full w-full overflow-hidden min-h-0 relative z-10 bg-base-100/40 backdrop-blur-xl">
                    <motion.header
                        variants={sectionWipeVariants}
                        custom={1.6}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="px-6 py-4 flex-shrink-0 bg-base-100/10 h-16 flex items-center panel-header"
                    >
                        <TerminalText text="CRAFTED RESULTS" delay={2.8} className="text-xs font-sf-mono uppercase text-primary" />
                    </motion.header>
                    <motion.div
                        variants={contentVariants}
                        custom={2.8}
                        initial="hidden"
                        animate="visible"
                        className="flex-grow overflow-y-auto p-1.5 space-y-1.5 custom-scrollbar"
                    >
                        {savedResults.length > 0 ? (
                            savedResults.map((res, idx) => (
                                <SavedResultItem
                                    key={`${idx}-${res.substring(0, 10)}`}
                                    text={res}
                                    onCopy={(txt) => {
                                        if (navigator.clipboard) navigator.clipboard.writeText(txt);
                                    }}
                                    onSaveToLibrary={(txt) => onSaveToLibrary(txt, promptText)}
                                    onDelete={() => handleDeleteSavedResult(idx)}
                                    onRefine={onSendToRefine}
                                />
                            ))
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-10">
                                <SparklesIcon className="w-12 h-12 mb-4" />
                                <p className="text-[10px] text-[12px] font-sf-mono uppercase tracking-widest leading-relaxed">Generated prompts mapped to session index will appear here</p>
                            </div>
                        )}
                    </motion.div>
                </div>
                {/* Manual Corner Accents */}
                <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
            </motion.aside>

            {isSaveModalOpen && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-xl z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsSaveModalOpen(false)}>
                    <div className="w-full max-w-lg relative p-[3px] corner-frame overflow-visible shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="bg-base-100/40 backdrop-blur-xl rounded-none w-full overflow-hidden relative z-10">
                            <header className="px-8 py-6 panel-header">
                                <h3 className="text-2xl font-black tracking-tighter text-base-content leading-none uppercase">SAVE TEMPLATE<span className="text-primary">.</span></h3>
                                <p className="text-[10px] font-normal text-[12px] font-sf-mono uppercase tracking-widest text-base-content/30 mt-1.5">Preset Registration</p>
                            </header>
                            <div className="p-8">
                                <div className="form-control">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Template Identity</label>
                                    <input
                                        type="text"
                                        value={templateName}
                                        onChange={(e) => setTemplateName((e.currentTarget as any).value)}
                                        placeholder="ENTER NAME..."
                                        className="form-input w-full"
                                        autoFocus
                                        onKeyDown={e => e.key === 'Enter' && handleConfirmSaveTemplate()}
                                    />
                                </div>
                            </div>
                            <footer className="h-14 flex items-stretch bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 overflow-hidden flex-shrink-0 panel-footer">
                                <button onClick={() => setIsSaveModalOpen(false)} className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider border border-base-content/5 btn-snake no-glow active:no-glow">
                                    <span /><span /><span /><span />
                                    CANCEL
                                </button>
                                <button onClick={handleConfirmSaveTemplate} disabled={isSavingTemplate || !templateName.trim()} className="btn btn-sm btn-primary h-full flex-1 rounded-none tracking-wider border border-base-content/5 btn-snake-primary no-glow active:no-glow">
                                    <span /><span /><span /><span />
                                    {isSavingTemplate ? "SAVING..." : "COMMIT"}
                                </button>
                            </footer>
                        </div>
                        {/* Manual Corner Accents */}
                        <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                        <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                        <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                        <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
                    </div>
                </div>
            )}
            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                title={`DELETE TEMPLATE`}
                message={`Permanently remove "${templateToDelete?.name}"?`}
            />
        </div>
    );
};

export default PromptCrafter;