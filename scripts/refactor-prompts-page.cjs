// Transform PromptsPage.tsx: replace inline refiner with RefinerPage component
const fs = require('fs');
const path = require('path');

const filePath = path.resolve('components/PromptsPage.tsx');
let content = fs.readFileSync(filePath, 'utf8');
const origLen = content.length;

// 1. Add RefinerPage import
content = content.replace(
    "import { PropertyCard } from './RefinerSlots';",
    "import { PropertyCard } from './RefinerSlots';\nimport RefinerPage from './RefinerPage';"
);

// 2. Remove refiner-local state declarations (from "// --- Refiner State ---" up to composerPromptToInsert)
//    Keep composerPromptToInsert and everything after it (shared state)
const refinerStateStart = content.indexOf("    // --- Refiner State ---");
const sharedStateStart = content.indexOf("const [composerPromptToInsert");
if (refinerStateStart > 0 && sharedStateStart > 0) {
    const beforeState = content.substring(0, refinerStateStart);
    const afterState = content.substring(sharedStateStart);
    content = beforeState + afterState;
}

// 3. Remove refiner-local effects and memos that are no longer needed
//    Remove: isGoogleProduct, isMidjourney, tabs, loadPresets, and their effects
//    Remove: buildModifierCatalog and all handlers that moved to RefinerPage
//    But KEEP: handleSaveSuggestion, handleClipSuggestion, handleSendToRefine, handleConfirmSaveSuggestion

// Remove from after shared state until the return statement
// We need to be surgical here. Let's remove specific blocks:

const removals = [
    // Remove isGoogleProduct
    { from: "    const isGoogleProduct = useMemo", to: "    const isMidjourney = useMemo" },
    // Remove isMidjourney and tabs
    { from: "    const isMidjourney = useMemo", to: "    // Load Presets" },
    // Remove loadPresets + useEffect + model reset effect + tab fallback effect + loadData effect
    { from: "    // Load Presets", to: "    useEffect(() => {" },
    // Remove the loadArtStyles/loadPromptCategories effect (moved to RefinerPage)
    { from: "    useEffect(() => {\n        const loadData = async () => {", to: "    useEffect(() => {\n        if (initialState) {" },
    // Remove buildModifierCatalog
    { from: "    const buildModifierCatalog = useCallback", to: "    const handleEnhance" },
    // Remove handleEnhance through handleResetRefiner (inclusive)
    { from: "    const handleEnhance = useCallback", to: "    const handleSaveSuggestion" },
    // Remove handleCopySuggestionText through handleDownloadJson (inclusive)
    { from: "    const handleCopySuggestionText = useCallback", to: "    const handleSaveAsPreset" },
    // Remove handleSaveAsPreset
    { from: "    const handleSaveAsPreset = async", to: "    const handleClipSuggestion" },
    // Remove handlePasteRefineText
    { from: "    const handlePasteRefineText = async", to: "    const handleSendToRefine" },
    // Remove activeConstructionItems through handleModifierClick (inclusive)
    { from: "    const activeConstructionItems = useMemo", to: "    // --- Preset Handlers ---" },
    // Remove preset handlers
    { from: "    // --- Preset Handlers ---", to: "    return (" },
];

// Actually, this approach is getting complicated because the file is large and I need to be precise.
// Let me take a simpler approach: keep everything from the start to handleSaveSuggestion,
// keep handleSaveSuggestion, handleClipSuggestion, handleSendToRefine, handleSwitchView,
// and then everything from the return statement onward - but replace the refine JSX block.

// Let me find key landmarks
const handleSaveSuggestionIdx = content.indexOf("    const handleSaveSuggestion = (suggestionText: string, title?: string) => {");
const handleClipSuggestionIdx = content.indexOf("    const handleClipSuggestion = useCallback");
const handleSendToRefineIdx = content.indexOf("    const handleSendToRefine = (text: string) => {");
const handleSwitchViewIdx = content.indexOf("    const handleSwitchView = (newView");
const returnIdx = content.indexOf("    return (");
const refineJSXStart = content.indexOf("{activeView === 'refine' && (");
const nextViewIdx = content.indexOf("{activeView === 'analyzer' && (", refineJSXStart);

console.log("Landmarks found:");
console.log("  handleSaveSuggestion at:", handleSaveSuggestionIdx);
console.log("  handleClipSuggestion at:", handleClipSuggestionIdx);
console.log("  handleSendToRefine at:", handleSendToRefineIdx);
console.log("  return at:", returnIdx);
console.log("  refine JSX start at:", refineJSXStart);
console.log("  next view at:", nextViewIdx);

// Build the new file
let result = '';

// Part 1: Everything up to and including handleSwitchView
result += content.substring(0, handleSwitchViewIdx);

// Add the handleSwitchView function
result += content.substring(handleSwitchViewIdx, handleSaveSuggestionIdx);

// Keep handleSaveSuggestion (shared - used by PromptCrafter + refiner)
result += content.substring(handleSaveSuggestionIdx, handleClipSuggestionIdx);

// Keep handleClipSuggestion (shared)
result += content.substring(handleClipSuggestionIdx, handleSendToRefineIdx);

// Modify handleSendToRefine to use pendingRefinerInput state
// Instead of setting refineText directly (which is now in RefinerPage),
// we set a pending refiner input state
const sendToRefineEnd = content.indexOf("    const activeConstructionItems", handleSendToRefineIdx);
let sendToRefineCode = content.substring(handleSendToRefineIdx, sendToRefineEnd);
// Replace setRefineText with setPendingRefinerInput
sendToRefineCode = sendToRefineCode.replace(/setRefineText/g, 'setPendingRefinerInput');
sendToRefineCode = sendToRefineCode.replace(/setResultsRefine/g, '/* results in RefinerPage */');
sendToRefineCode = sendToRefineCode.replace(/setDirectMediaResult/g, '/* directMedia in RefinerPage */');
sendToRefineCode = sendToRefineCode.replace(/setErrorRefine/g, '/* error in RefinerPage */');
result += sendToRefineCode;

// Skip the rest of the refiner-local code between handleSendToRefine and return
// Go directly to the return statement
result += content.substring(returnIdx, refineJSXStart);

// Replace the refine JSX block with RefinerPage
const refineJSXEnd = content.indexOf("{activeView === 'analyzer' &&", refineJSXStart);
result += `{activeView === 'refine' && (
                        <RefinerPage
                            isExiting={isExiting}
                            showGlobalFeedback={showGlobalFeedback}
                            setIsBusy={setIsBusy}
                            settings={settings}
                            initialPrompt={pendingRefinerInput}
                            onSaveSuggestion={handleSaveSuggestion}
                            onClipSuggestion={handleClipSuggestion}
                            onSendToBuilder={onSendToBuilder}
                        />
                    )}

                    `;

// Add the rest after the refine block (analyzer, prompt_analyzer, modals, etc.)
result += content.substring(refineJSXEnd);

// Add pending refiner input state before the return (inside the component)
const componentOpen = result.lastIndexOf("return (");
const stateInsert = "    const [pendingRefinerInput, setPendingRefinerInput] = useState<string | undefined>(undefined);\n\n";
result = result.slice(0, componentOpen) + stateInsert + result.slice(componentOpen);

// Clean up duplicate/skipped markers
result = result.replace(/\/\* results in RefinerPage \*\//g, '');
result = result.replace(/\/\* directMedia in RefinerPage \*\//g, '');
result = result.replace(/\/\* error in RefinerPage \*\//g, '');
result = result.replace(/\/\* error in RefinerPage \*\//g, '');

// Clean up: remove unused refiner imports
// Keep imports that are still used (checking for usage in the new file)
const usedImports = [
    'useState', 'useCallback', 'useEffect', 'useMemo', 'useRef',
    'PromptEditorModal', 'PromptCrafter', 'MediaAnalyzer', 'PromptAnalyzer',
    'BlobLoader', 'AutocompleteSelect', 'SparklesIcon',
    'ConfirmationModal', 'JSONBreakdownModal', 'CodeSnippetModal',
    'RefinerModifierControls', 'RefineSubTab', 'PropertyCard',
    'RefinerPage', 'audioService', 'useSettings', 'useBusy',
    'loadPromptCategories', 'loadSavedPrompts',
    'ActiveTab', 'Idea', 'SavedPrompt', 'PromptCategory',
];
// Leave the import cleanup for tsc to handle

fs.writeFileSync(filePath, result, 'utf8');
console.log(`Written ${result.length} chars (was ${origLen} chars)`);
console.log("Done!");
