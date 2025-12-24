
import type { GalleryItem, GalleryCategory } from '../types';
import { fileSystemManager } from './fileUtils';
import { v4 as uuidv4 } from 'uuid';

interface GalleryManifest {
  galleryItems: GalleryItem[];
  categories: GalleryCategory[];
  pinnedIds: string[];
}

const MANIFEST_NAME = 'kollektiv_gallery_manifest.json';

const getManifest = async (): Promise<GalleryManifest> => {
    const manifestContent = await fileSystemManager.readFile(MANIFEST_NAME);
    if (manifestContent) {
        try {
            const parsed = JSON.parse(manifestContent);
            // Basic validation
            if (Array.isArray(parsed.galleryItems) && Array.isArray(parsed.categories) && Array.isArray(parsed.pinnedIds)) {
                return parsed;
            }
        } catch (e) {
            console.error("Failed to parse gallery manifest, starting fresh.", e);
        }
    }
    // Return a default empty manifest if it doesn't exist or is invalid
    return {
        galleryItems: [],
        categories: [],
        pinnedIds: [],
    };
};

const saveManifest = async (manifest: GalleryManifest) => {
    await fileSystemManager.saveFile(MANIFEST_NAME, new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
};


// --- Gallery Items ---
export const loadGalleryItems = async (): Promise<GalleryItem[]> => {
    const manifest = await getManifest();
    return manifest.galleryItems.sort((a, b) => b.createdAt - a.createdAt);
};

export const addItemToGallery = async (type: 'image' | 'video', urls: string[], sources: string[], categoryId?: string, defaultTitle?: string, tags?: string[], notes?: string, prompt?: string): Promise<GalleryItem> => {
    const manifest = await getManifest();
    const category = manifest.categories.find(c => c.id === categoryId);
    const categoryName = category?.name;
    const itemIsNsfw = category ? !!category.isNsfw : false;

    const newItemId = `item_${Date.now()}_${uuidv4().substring(0, 6)}`;

    const savedUrls = await Promise.all(urls.map(async (url, index) => {
        try {
            const blob = url.startsWith('data:') 
                ? await (await fetch(url)).blob() 
                : await (await fetch(url)).blob(); // Fetch both data and http URLs to get a blob
            
            const extension = blob.type.split('/')[1] || (type === 'image' ? 'png' : 'mp4');
            const fileName = `${newItemId}_${index}.${extension}`;
            
            const pathSegments = ['gallery'];
            if (categoryName) pathSegments.push(categoryName);
            
            return await fileSystemManager.saveFile([...pathSegments, fileName].join('/'), blob);
        } catch (e) {
            console.error(`Failed to save media for item ${newItemId}:`, e);
            return null; // Return null for failed saves
        }
    }));

    const successfulUrls = savedUrls.filter((url): url is string => url !== null);
    
    if (successfulUrls.length === 0) {
        throw new Error("Failed to save any media files to the selected directory.");
    }
    
    const newItem: GalleryItem = {
        id: newItemId,
        createdAt: Date.now(),
        type,
        urls: successfulUrls, // Store relative paths
        sources,
        title: defaultTitle || `Untitled Group (${sources.length} ${type}${sources.length > 1 ? 's' : ''})`,
        prompt: prompt || '',
        categoryId: categoryId || undefined,
        tags: tags || [],
        notes: notes || undefined,
        isNsfw: itemIsNsfw,
    };

    manifest.galleryItems.unshift(newItem);
    await saveManifest(manifest);
    return newItem;
};

export const updateItemInGallery = async (id: string, updates: Partial<Omit<GalleryItem, 'id' | 'createdAt'>>): Promise<void> => {
    const manifest = await getManifest();
    const itemIndex = manifest.galleryItems.findIndex(item => item.id === id);
    if (itemIndex === -1) {
        console.warn(`Item with id ${id} not found for update.`);
        return;
    }

    const originalItem = manifest.galleryItems[itemIndex];
    let finalUrls = originalItem.urls;
    let finalSources = originalItem.sources || [];
    
    const { isNsfw, ...otherUpdates } = updates;
    const newCategory = otherUpdates.categoryId ? manifest.categories.find(c => c.id === otherUpdates.categoryId) :
                         originalItem.categoryId ? manifest.categories.find(c => c.id === originalItem.categoryId) : null;
    const newItemIsNsfw = newCategory ? !!newCategory.isNsfw : false;


    if (updates.urls && Array.isArray(updates.urls)) {
        // Handle URL changes: save new ones, delete removed ones.
        const newUrlList = updates.urls;
        const oldUrlList = originalItem.urls;
        const categoryName = newCategory?.name || '';
        
        const processedUrls = await Promise.all(newUrlList.map(async (urlOrData, index) => {
            if (urlOrData.startsWith('data:')) {
                // This is a new file that needs to be saved
                try {
                    const response = await fetch(urlOrData);
                    const blob = await response.blob();
                    const extension = blob.type.split('/')[1]?.split('+')[0] || (originalItem.type === 'image' ? 'png' : 'mp4');
                    const fileName = `${originalItem.id}_${Date.now()}_${index}.${extension}`;
                    const pathSegments = ['gallery'];
                    if (categoryName) pathSegments.push(categoryName);
                    
                    const savedPath = await fileSystemManager.saveFile([...pathSegments, fileName].join('/'), blob);
                    return { savedPath, sourceName: `New File ${index+1}` };
                } catch (e) {
                    console.error(`Failed to save new media for item ${originalItem.id}:`, e);
                    return null; // Failed to save
                }
            }
             // It's an existing file path, find its original source name
             const originalIndex = originalItem.urls.indexOf(urlOrData);
             const sourceName = (originalIndex !== -1 && originalItem.sources) ? originalItem.sources[originalIndex] : urlOrData;
            return { savedPath: urlOrData, sourceName };
        }));

        const successfullyProcessed = processedUrls.filter(Boolean) as { savedPath: string, sourceName: string }[];
        finalUrls = successfullyProcessed.map(p => p.savedPath);
        finalSources = successfullyProcessed.map(p => p.sourceName);
        
        // Find and delete orphaned files
        const urlsToDelete = oldUrlList.filter(oldUrl => !finalUrls.includes(oldUrl));
        for (const urlToDelete of urlsToDelete) {
            await fileSystemManager.deleteFile(urlToDelete);
        }
    }

    // Merge updates
    manifest.galleryItems[itemIndex] = {
        ...originalItem,
        ...otherUpdates,
        urls: finalUrls,
        sources: finalSources,
        isNsfw: newItemIsNsfw,
    };

    await saveManifest(manifest);
};

export const deleteItemFromGallery = async (id: string): Promise<void> => {
    const manifest = await getManifest();
    const itemToDelete = manifest.galleryItems.find(item => item.id === id);
    
    if (itemToDelete) {
        // Delete media files from disk
        for (const path of itemToDelete.urls) {
            await fileSystemManager.deleteFile(path);
        }
    }
    
    manifest.galleryItems = manifest.galleryItems.filter(item => item.id !== id);
    manifest.pinnedIds = manifest.pinnedIds.filter(pid => pid !== id); // Also unpin
    await saveManifest(manifest);
};


// --- Categories ---
export const loadCategories = async (): Promise<GalleryCategory[]> => {
    const manifest = await getManifest();
    return manifest.categories;
};

export const addCategory = async (name: string, isNsfw: boolean): Promise<GalleryCategory[]> => {
    const manifest = await getManifest();
    const newCategory: GalleryCategory = {
        id: `cat_${Date.now()}`,
        name: name,
        isNsfw: isNsfw
    };
    manifest.categories.push(newCategory);
    await saveManifest(manifest);
    return manifest.categories;
};

export const updateCategory = async (id: string, newName: string, isNsfw: boolean): Promise<GalleryCategory[]> => {
    const manifest = await getManifest();
    const catIndex = manifest.categories.findIndex(c => c.id === id);
    if (catIndex > -1) {
        manifest.categories[catIndex].name = newName;
        manifest.categories[catIndex].isNsfw = isNsfw;

        manifest.galleryItems.forEach(item => {
            if (item.categoryId === id) {
                item.isNsfw = isNsfw;
            }
        });
    }
    await saveManifest(manifest);
    return manifest.categories;
};

export const deleteCategory = async (id: string): Promise<GalleryCategory[]> => {
    const manifest = await getManifest();
    manifest.categories = manifest.categories.filter(cat => cat.id !== id);
    // Uncategorize items
    manifest.galleryItems.forEach(item => {
        if (item.categoryId === id) {
            item.categoryId = undefined;
            item.isNsfw = false;
        }
    });
    await saveManifest(manifest);
    return manifest.categories;
};


// --- Pinned Items ---
export const loadPinnedItemIds = async (): Promise<string[]> => {
    const manifest = await getManifest();
    return manifest.pinnedIds;
};

export const savePinnedItemIds = async (ids: string[]): Promise<void> => {
    const manifest = await getManifest();
    manifest.pinnedIds = ids;
    await saveManifest(manifest);
};
