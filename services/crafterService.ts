

import { fileSystemManager } from '../utils/fileUtils';
import type { CrafterData, WildcardFile, WildcardCategory, LLMSettings } from '../types';
import { generatePromptFormulaWithAI } from './llmService';

const CRAFTER_DIR = 'crafter';
const MANIFEST_NAME = 'crafter_manifest.json';

// New interface for manifest structure
interface CrafterTemplate {
    name: string;
    content: string;
}

interface CrafterManifest {
    templates: CrafterTemplate[];
}

class CrafterService {
    private async getManifest(): Promise<CrafterManifest> {
        const manifestContent = await fileSystemManager.readFile(MANIFEST_NAME);
        if (manifestContent) {
            try {
                const parsed = JSON.parse(manifestContent);
                // Basic validation
                if (Array.isArray(parsed.templates)) {
                    return parsed;
                }
            } catch (e) {
                console.error("Failed to parse crafter manifest, returning empty.", e);
            }
        }
        // If it doesn't exist or is corrupt, return an empty manifest. 
        // The integrity check is responsible for creation.
        return { templates: [] };
    }

    private async saveManifest(manifest: CrafterManifest): Promise<void> {
        await fileSystemManager.saveFile(MANIFEST_NAME, new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
    }
    
    /**
     * A simple line-by-line YAML parser that handles nested keys and lists of strings.
     * It builds a flat map of full_path -> values.
     * E.g., `parent:\n  child:\n    - item1` becomes `{'parent/child': ['item1']}`.
     */
    private parseSimpleYaml(content: string): Record<string, string[]> {
        const lines = content.split('\n');
        const result: Record<string, string[]> = {};
        const pathStack: { key: string; indent: number }[] = [];

        const getIndent = (line: string): number => line.match(/^\s*/)?.[0].length || 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            if (trimmedLine.startsWith('#') || trimmedLine === '') {
                continue;
            }

            const indent = getIndent(line);

            while (pathStack.length > 0 && indent <= pathStack[pathStack.length - 1].indent) {
                pathStack.pop();
            }

            if (trimmedLine.endsWith(':')) {
                const key = trimmedLine.slice(0, -1).trim();
                pathStack.push({ key, indent });
            } else if (trimmedLine.startsWith('-')) {
                const currentPath = pathStack.map(p => p.key).join('/');
                if (!currentPath) continue;

                let value = trimmedLine.substring(1).trim();

                if (value.match(/^>-$|^\|$|^>$/) || value.match(/^>-\s*$/) || value.match(/^\|\s*$/)) {
                    // Multiline indicator. Assume content is on the next line(s) and more indented.
                    let multilineContent = '';
                    let firstLine = true;
                    while (i + 1 < lines.length) {
                        const nextLine = lines[i + 1];
                        const nextIndent = getIndent(nextLine);
                        if (nextIndent > indent) {
                            if (firstLine) {
                                multilineContent = nextLine.trim();
                                firstLine = false;
                            } else {
                                multilineContent += ' ' + nextLine.trim();
                            }
                            i++; // Consume the next line
                        } else {
                            break;
                        }
                    }
                    value = multilineContent;
                }
                
                if (value) {
                    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
                        value = value.substring(1, value.length - 1);
                    }
                    if (!result[currentPath]) {
                        result[currentPath] = [];
                    }
                    result[currentPath].push(value);
                }
            }
        }

        return result;
    }

    /**
     * Converts the flat path map from `parseSimpleYaml` into a tree of WildcardCategory
     * that can be displayed in the UI.
     */
    private buildCategoryTreeFromParsedYaml(rootName: string, rootPath: string, parsedYaml: Record<string, string[]>): WildcardCategory {
        const rootCategory: WildcardCategory = { name: rootName, path: rootPath, files: [], subCategories: [] };

        for (const [fullPath, content] of Object.entries(parsedYaml)) {
            const pathSegments = fullPath.split('/');
            let currentCategory = rootCategory;

            // Create sub-category folders for nested keys
            for (let i = 0; i < pathSegments.length - 1; i++) {
                const segment = pathSegments[i];
                let subCategory = currentCategory.subCategories.find(c => c.name === segment);
                if (!subCategory) {
                    const subCategoryPath = pathSegments.slice(0, i + 1).join('/');
                    subCategory = { 
                        name: segment, 
                        path: subCategoryPath,
                        files: [], 
                        subCategories: [] 
                    };
                    currentCategory.subCategories.push(subCategory);
                }
                currentCategory = subCategory;
            }

            // The last segment is the filename
            const fileName = pathSegments[pathSegments.length - 1];
            currentCategory.files.push({
                name: fileName,
                path: fullPath, // The full path is the key for wildcard replacement
                content: content
            });
        }
        return rootCategory;
    }

    private async recursivelyScan(dirHandle: FileSystemDirectoryHandle, currentPath: string): Promise<WildcardCategory> {
        const category: WildcardCategory = {
            name: dirHandle.name,
            path: currentPath,
            files: [],
            subCategories: []
        };

        for await (const handle of (dirHandle as any).values()) {
            const lowerCaseName = handle.name.toLowerCase();
            if (handle.kind === 'file' && lowerCaseName.endsWith('.txt')) {
                const file = await (handle as FileSystemFileHandle).getFile();
                const content = await file.text();
                const lines = content.split('\n').map(line => line.trim()).filter(Boolean);
                if (lines.length > 0) {
                    category.files.push({
                        name: handle.name.replace(/\.txt$/i, ''),
                        path: `${currentPath}/${handle.name}`,
                        content: lines
                    });
                }
            } else if (handle.kind === 'file' && (lowerCaseName.endsWith('.yml') || lowerCaseName.endsWith('.yaml'))) {
                 const file = await (handle as FileSystemFileHandle).getFile();
                 const content = await file.text();
                 const parsed = this.parseSimpleYaml(content);
                 const yamlCategory = this.buildCategoryTreeFromParsedYaml(
                     handle.name.replace(/\.(yml|yaml)$/i, ''),
                     `${currentPath}/${handle.name}`,
                     parsed
                 );
                 if (yamlCategory.files.length > 0 || yamlCategory.subCategories.length > 0) {
                     category.subCategories.push(yamlCategory);
                 }

            } else if (handle.kind === 'directory') {
                const subCategory = await this.recursivelyScan(handle as FileSystemDirectoryHandle, `${currentPath}/${handle.name}`);
                if (subCategory.files.length > 0 || subCategory.subCategories.length > 0) {
                    category.subCategories.push(subCategory);
                }
            }
        }
        category.files.sort((a, b) => a.name.localeCompare(b.name));
        category.subCategories.sort((a, b) => a.name.localeCompare(b.name));
        return category;
    }

    public async loadWildcardsAndTemplates(): Promise<CrafterData> {
        if (!fileSystemManager.isDirectorySelected()) {
            return { templates: [], wildcardCategories: [] };
        }
        
        // Load templates from manifest
        const manifest = await this.getManifest();
        const templates: WildcardFile[] = manifest.templates.map(t => ({
            name: t.name,
            path: `${t.name}.txt`, // Path is not a real file but kept for type consistency
            content: [t.content]
        }));

        const wildcardCategories: WildcardCategory[] = [];
        const rootWildcardFiles: WildcardFile[] = [];

        try {
            // Scan for both root files and directories
            for await (const handle of fileSystemManager.listDirectoryContents(CRAFTER_DIR) as any) {
                const lowerCaseName = handle.name.toLowerCase();
                if (handle.kind === 'directory') {
                    const category = await this.recursivelyScan(handle as FileSystemDirectoryHandle, handle.name);
                    if (category.files.length > 0 || category.subCategories.length > 0) {
                        wildcardCategories.push(category);
                    }
                } else if (handle.kind === 'file' && lowerCaseName.endsWith('.txt')) {
                    const file = await (handle as FileSystemFileHandle).getFile();
                    const content = await file.text();
                    const lines = content.split('\n').map(line => line.trim()).filter(Boolean);
                    if (lines.length > 0) {
                        rootWildcardFiles.push({
                            name: handle.name.replace(/\.txt$/i, ''),
                            path: handle.name,
                            content: lines
                        });
                    }
                } else if (handle.kind === 'file' && (lowerCaseName.endsWith('.yml') || lowerCaseName.endsWith('.yaml'))) {
                     const file = await (handle as FileSystemFileHandle).getFile();
                     const content = await file.text();
                     const parsed = this.parseSimpleYaml(content);
                     const yamlCategory = this.buildCategoryTreeFromParsedYaml(
                         handle.name.replace(/\.(yml|yaml)$/i, ''),
                         handle.name,
                         parsed
                     );
                     if (yamlCategory.files.length > 0 || yamlCategory.subCategories.length > 0) {
                         wildcardCategories.push(yamlCategory);
                     }
                }
            }
        } catch (e) {
            console.error("Error reading crafter files:", e);
            throw new Error("An error occurred while reading files from the Crafter directory.");
        }
        
        // Group root files into a special category for display
        if (rootWildcardFiles.length > 0) {
            wildcardCategories.unshift({
                name: 'Root Wildcards',
                path: 'Root', // Path for UI key, not for processing
                files: rootWildcardFiles.sort((a, b) => a.name.localeCompare(b.name)),
                subCategories: []
            });
        }
        
        wildcardCategories.sort((a, b) => a.name.localeCompare(b.name));
        templates.sort((a, b) => a.name.localeCompare(b.name));

        return { templates, wildcardCategories };
    }
    
    public async saveTemplate(templateName: string, content: string): Promise<void> {
        if (!fileSystemManager.isDirectorySelected()) {
            throw new Error("Application data directory not selected. Please configure it in Settings.");
        }
        
        const manifest = await this.getManifest();
        
        const existingIndex = manifest.templates.findIndex(t => t.name === templateName);
        if (existingIndex > -1) {
            // Update existing
            manifest.templates[existingIndex].content = content;
        } else {
            // Add new
            manifest.templates.push({ name: templateName, content });
        }

        await this.saveManifest(manifest);
    }

    public async deleteTemplate(templateName: string): Promise<void> {
        if (!fileSystemManager.isDirectorySelected()) {
            throw new Error("Application data directory not selected.");
        }
        const manifest = await this.getManifest();
        manifest.templates = manifest.templates.filter(t => t.name !== templateName);
        await this.saveManifest(manifest);
    }
    
    public async saveWildcardFile(filePath: string, content: string): Promise<void> {
        if (!fileSystemManager.isDirectorySelected()) {
            throw new Error("Application data directory not selected.");
        }
        const fullPath = `${CRAFTER_DIR}/${filePath}`;
        await fileSystemManager.saveFile(fullPath, new Blob([content], { type: 'text/plain;charset=utf-8' }));
    }

    public async deleteWildcardFile(filePath: string): Promise<void> {
        if (!fileSystemManager.isDirectorySelected()) {
            throw new Error("Application data directory not selected.");
        }
        await fileSystemManager.deleteFile(`${CRAFTER_DIR}/${filePath}`);
    }

    public processCrafterPrompt(prompt: string, wildcardData: WildcardCategory[]): string {
        const wildcardRegex = /__([\w\-/.*]+)__/g;
        
        const wildcardMap = new Map<string, string[]>();

        const buildMap = (categories: WildcardCategory[]) => {
            for (const category of categories) {
                // For files, the `path` property is the unique key for the wildcard.
                // For .txt files, this is the file path relative to `crafter/` (e.g., 'animals/cats.txt').
                // For .yml files, this is the nested key path (e.g., 'cf-elf/color').
                for (const file of category.files) {
                    const pathWithoutExt = file.path.replace(/\.(txt|yml|yaml)$/i, '');
                    wildcardMap.set(pathWithoutExt.toLowerCase(), file.content);
                    // Also add simple name for convenience (can be overwritten, which is intended).
                    wildcardMap.set(file.name.toLowerCase(), file.content);
                }
                if (category.subCategories) {
                    buildMap(category.subCategories);
                }
            }
        };
        
        buildMap(wildcardData);
        
        // Support for wildcard within wildcard, e.g. `__colors/light__` choosing from `__colors/*__`
        const expandedMap = new Map<string, string[]>(wildcardMap);
        for(const [key, values] of wildcardMap.entries()){
            const parts = key.split('/');
            if(parts.length > 1){
                const parentKey = parts.slice(0, -1).join('/') + '/*';
                if(!expandedMap.has(parentKey)){
                    expandedMap.set(parentKey, []);
                }
                expandedMap.get(parentKey)!.push(...values);
            }
        }

        let processedPrompt = prompt;
        let keepProcessing = true;
        let iterations = 0;
        const MAX_ITERATIONS = 25; // Safety break for deep nesting

        while (keepProcessing && iterations < MAX_ITERATIONS) {
            let foundMatch = false;
            processedPrompt = processedPrompt.replace(wildcardRegex, (match, wildcardName) => {
                const cleanedName = wildcardName.trim().toLowerCase().replace(/\\/g, '/');
                const options = expandedMap.get(cleanedName);
                if (options && options.length > 0) {
                    foundMatch = true;
                    return options[Math.floor(Math.random() * options.length)] || '';
                }
                return match; // Not found, leave it
            });

            keepProcessing = foundMatch;
            iterations++;
        }
        
        return processedPrompt;
    }

    public async generateFormulaFromPrompt(promptText: string, settings: LLMSettings): Promise<string> {
        const crafterData = await this.loadWildcardsAndTemplates();
        const allWildcards: { value: string; placeholder: string }[] = [];

        const processCategory = (category: WildcardCategory) => {
            for (const file of category.files) {
                const placeholder = `__${file.path.replace(/\.(txt|yml|yaml)$/i, '')}__`;
                // To fix "Invalid string length" errors, use file names as keywords instead of file content.
                // e.g., "sci-fi_weapons.txt" becomes a searchable keyword "sci fi weapons".
                const value = file.name.replace(/[-_]/g, ' ').toLowerCase();
                allWildcards.push({ value, placeholder });
            }
            for (const subCat of category.subCategories) {
                processCategory(subCat);
            }
        };

        crafterData.wildcardCategories.forEach(processCategory);

        // Sort to replace longer, more specific names first (e.g., "sci fi weapon" before "sci fi").
        allWildcards.sort((a, b) => b.value.length - a.value.length);
        
        let modifiedPrompt = promptText;
        let replacementsMade = false;

        for (const { value, placeholder } of allWildcards) {
            const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Use word boundaries `\b` to avoid replacing "art" in "artist".
            const regex = new RegExp(`\\b${escapedValue}\\b`, 'gi');
            
            if (regex.test(modifiedPrompt)) {
                modifiedPrompt = modifiedPrompt.replace(regex, placeholder);
                replacementsMade = true;
            }
        }

        if (replacementsMade) {
            return modifiedPrompt;
        }

        // Fallback to AI if no local replacements were made
        return generatePromptFormulaWithAI(promptText, settings);
    }
}

export const crafterService = new CrafterService();