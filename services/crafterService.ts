
import { fileSystemManager } from '../utils/fileUtils';
import type { CrafterData, WildcardFile, WildcardCategory, LLMSettings } from '../types';
import { generatePromptFormulaWithAI } from './llmService';

const CRAFTER_DIR = 'crafter';
const MANIFEST_NAME = 'crafter_manifest.json';

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
                if (Array.isArray(parsed.templates)) {
                    return parsed;
                }
            } catch (e) {
                console.error("Failed to parse crafter manifest, returning empty.", e);
            }
        }
        return { templates: [] };
    }

    private async saveManifest(manifest: CrafterManifest): Promise<void> {
        await fileSystemManager.saveFile(MANIFEST_NAME, new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
    }
    
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
                            i++; 
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

    private buildCategoryTreeFromParsedYaml(rootName: string, rootPath: string, parsedYaml: Record<string, string[]>): WildcardCategory {
        const rootCategory: WildcardCategory = { name: rootName, path: rootPath, files: [], subCategories: [] };

        for (const [fullPath, content] of Object.entries(parsedYaml)) {
            const pathSegments = fullPath.split('/');
            let currentCategory = rootCategory;

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

            const fileName = pathSegments[pathSegments.length - 1];
            currentCategory.files.push({
                name: fileName,
                path: fullPath, 
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
        
        const manifest = await this.getManifest();
        const templates: WildcardFile[] = manifest.templates.map(t => ({
            name: t.name,
            path: `${t.name}.txt`, 
            content: [t.content]
        }));

        const wildcardCategories: WildcardCategory[] = [];
        const rootWildcardFiles: WildcardFile[] = [];

        try {
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
        
        if (rootWildcardFiles.length > 0) {
            wildcardCategories.unshift({
                name: 'Root Wildcards',
                path: 'Root', 
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
            manifest.templates[existingIndex].content = content;
        } else {
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
                for (const file of category.files) {
                    const pathWithoutExt = file.path.replace(/\.(txt|yml|yaml)$/i, '');
                    wildcardMap.set(pathWithoutExt.toLowerCase(), file.content);
                    wildcardMap.set(file.name.toLowerCase(), file.content);
                }
                if (category.subCategories) {
                    buildMap(category.subCategories);
                }
            }
        };
        
        buildMap(wildcardData);
        
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
        const MAX_ITERATIONS = 25; 

        while (keepProcessing && iterations < MAX_ITERATIONS) {
            let foundMatch = false;
            processedPrompt = processedPrompt.replace(wildcardRegex, (match, wildcardName) => {
                const cleanedName = wildcardName.trim().toLowerCase().replace(/\\/g, '/');
                const options = expandedMap.get(cleanedName);
                if (options && options.length > 0) {
                    foundMatch = true;
                    return options[Math.floor(Math.random() * options.length)] || '';
                }
                return match; 
            });

            keepProcessing = foundMatch;
            iterations++;
        }
        
        return processedPrompt;
    }

    public async generateFormulaFromPrompt(promptText: string, settings: LLMSettings): Promise<string> {
        const crafterData = await this.loadWildcardsAndTemplates();
        const allPotentialMatches: { text: string; placeholder: string }[] = [];
        const wildcardPathList: string[] = [];

        const extractFromCategory = (category: WildcardCategory) => {
            for (const file of category.files) {
                const cleanPath = file.path.replace(/\.(txt|yml|yaml)$/i, '');
                const placeholder = `__${cleanPath}__`;
                wildcardPathList.push(placeholder);
                for (const line of file.content) {
                    const trimmedLine = line.trim().toLowerCase();
                    if (trimmedLine.length > 2) allPotentialMatches.push({ text: trimmedLine, placeholder });
                }
            }
            for (const subCat of category.subCategories) extractFromCategory(subCat);
        };

        crafterData.wildcardCategories.forEach(extractFromCategory);
        allPotentialMatches.sort((a, b) => b.text.length - a.text.length);
        
        let modifiedPrompt = promptText;
        let localReplacementsCount = 0;

        for (const { text, placeholder } of allPotentialMatches) {
            const escapedValue = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escapedValue}\\b`, 'gi');
            if (regex.test(modifiedPrompt)) {
                modifiedPrompt = modifiedPrompt.replace(regex, placeholder);
                localReplacementsCount++;
            }
        }

        if (localReplacementsCount > 2 || (localReplacementsCount > 0 && modifiedPrompt.includes('__'))) {
            return modifiedPrompt;
        }

        // Token Optimization: Only send relevant wildcard names to the AI
        const promptLower = promptText.toLowerCase();
        const filteredWildcards = wildcardPathList.filter(wp => {
            const parts = wp.replace(/__/g, '').split('/');
            return parts.some(p => promptLower.includes(p.toLowerCase()));
        });
        const finalWildcardContext = filteredWildcards.length > 0 ? filteredWildcards : wildcardPathList.slice(0, 30);

        return generatePromptFormulaWithAI(promptText, finalWildcardContext, settings);
    }
}

export const crafterService = new CrafterService();
