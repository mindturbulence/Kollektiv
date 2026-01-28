
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
            if (Array.isArray(parsed.galleryItems) && Array.isArray(parsed.categories) && Array.isArray(parsed.pinnedIds)) {
                return parsed;
            }
        } catch (e) {
            console.error("Failed to parse gallery manifest, starting fresh.", e);
        }
    }
    return {
        galleryItems: [],
        categories: [],
        pinnedIds: [],
    };
};

const saveManifest = async (manifest: GalleryManifest) => {
    await fileSystemManager.saveFile(MANIFEST_NAME, new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
};

export const loadGalleryItems = async (): Promise<GalleryItem[]> => {
    const manifest = await getManifest();
    return manifest.galleryItems.sort((a, b) => b.createdAt - a.createdAt);
};

export const addItemToGallery = async (type: 'image' | 'video', urls: string[], sources: string[], categoryId?: string, defaultTitle?: string, tags?: string[], notes?: string, prompt?: string, isNsfw?: boolean): Promise<GalleryItem> => {
    const manifest = await getManifest();
    const category = manifest.categories.find(c => c.id === categoryId);
    const categoryName = category?.name;

    const newItemId = `item_${Date.now()}_${uuidv4().substring(0, 6)}`;

    const savedUrls = await Promise.all(urls.map(async (url, index) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const extension = blob.type.split('/')[1]?.split('+')[0] || (type === 'image' ? 'png' : 'mp4');
            const fileName = `${newItemId}_${index}.${extension}`;
            
            const pathSegments = ['gallery'];
            if (categoryName) pathSegments.push(categoryName);
            
            return await fileSystemManager.saveFile([...pathSegments, fileName].join('/'), blob);
        } catch (e) {
            console.error(`Failed to save media for item ${newItemId}:`, e);
            return null;
        }
    }));

    const successfulUrls = savedUrls.filter((url): url is string => url !== null);
    
    if (successfulUrls.length === 0) {
        throw new Error("Failed to save any media files.");
    }
    
    const newItem: GalleryItem = {
        id: newItemId,
        createdAt: Date.now(),
        type,
        urls: successfulUrls,
        sources,
        title: defaultTitle || `Untitled Group (${sources.length} ${type}${sources.length > 1 ? 's' : ''})`,
        prompt: prompt || '',
        categoryId: categoryId || undefined,
        tags: tags || [],
        notes: notes || undefined,
        isNsfw: !!isNsfw,
    };

    manifest.galleryItems.unshift(newItem);
    await saveManifest(manifest);
    return newItem;
};

export const updateItemInGallery = async (id: string, updates: Partial<Omit<GalleryItem, 'id' | 'createdAt'>>): Promise<void> => {
    const manifest = await getManifest();
    const itemIndex = manifest.galleryItems.findIndex(item => item.id === id);
    if (itemIndex === -1) return;

    const originalItem = manifest.galleryItems[itemIndex];
    let finalUrls = [...originalItem.urls];
    let finalSources = [...(originalItem.sources || [])];
    
    const categoryChanged = updates.categoryId !== undefined && updates.categoryId !== originalItem.categoryId;
    const newCatId = updates.categoryId !== undefined ? updates.categoryId : originalItem.categoryId;
    const newCategory = newCatId ? manifest.categories.find(c => c.id === newCatId) : null;
    const newCategoryName = newCategory?.name || '';

    // 1. Handle actual image data updates
    if (updates.urls && Array.isArray(updates.urls)) {
        const newUrlList = updates.urls;
        const oldUrlList = originalItem.urls;
        
        const processedUrls = await Promise.all(newUrlList.map(async (urlOrData, index) => {
            if (urlOrData.startsWith('data:')) {
                try {
                    const response = await fetch(urlOrData);
                    const blob = await response.blob();
                    const extension = blob.type.split('/')[1]?.split('+')[0] || (originalItem.type === 'image' ? 'png' : 'mp4');
                    const fileName = `${originalItem.id}_${Date.now()}_${index}.${extension}`;
                    const pathSegments = ['gallery'];
                    if (newCategoryName) pathSegments.push(newCategoryName);
                    
                    const savedPath = await fileSystemManager.saveFile([...pathSegments, fileName].join('/'), blob);
                    return { savedPath, sourceName: `New File ${index+1}` };
                } catch (e) {
                    return null;
                }
            }
            return { savedPath: urlOrData, sourceName: originalItem.sources?.[oldUrlList.indexOf(urlOrData)] || urlOrData };
        }));

        const successfullyProcessed = processedUrls.filter(Boolean) as { savedPath: string, sourceName: string }[];
        finalUrls = successfullyProcessed.map(p => p.savedPath);
        finalSources = successfullyProcessed.map(p => p.sourceName);
        
        const urlsToDelete = oldUrlList.filter(oldUrl => !finalUrls.includes(oldUrl));
        for (const urlToDelete of urlsToDelete) {
            await fileSystemManager.deleteFile(urlToDelete);
        }
    }

    // 2. Handle File Relocation if the category changed
    if (categoryChanged) {
        const relocatedUrls: string[] = [];
        for (const url of finalUrls) {
            if (!url.startsWith('data:') && !url.startsWith('http')) {
                const blob = await fileSystemManager.getFileAsBlob(url);
                if (blob) {
                    const fileName = url.split('/').pop() || `${originalItem.id}_media`;
                    const pathSegments = ['gallery'];
                    if (newCategoryName) pathSegments.push(newCategoryName);
                    const newPath = [...pathSegments, fileName].join('/');
                    
                    if (newPath !== url) {
                        await fileSystemManager.saveFile(newPath, blob);
                        await fileSystemManager.deleteFile(url);
                        relocatedUrls.push(newPath);
                    } else {
                        relocatedUrls.push(url);
                    }
                } else {
                    relocatedUrls.push(url);
                }
            } else {
                relocatedUrls.push(url);
            }
        }
        finalUrls = relocatedUrls;
    }

    manifest.galleryItems[itemIndex] = {
        ...originalItem,
        ...updates,
        urls: finalUrls,
        sources: finalSources,
    };

    await saveManifest(manifest);
};

export const deleteItemFromGallery = async (id: string): Promise<void> => {
    const manifest = await getManifest();
    const itemToDelete = manifest.galleryItems.find(item => item.id === id);
    if (itemToDelete) {
        for (const path of itemToDelete.urls) {
            await fileSystemManager.deleteFile(path);
        }
    }
    manifest.galleryItems = manifest.galleryItems.filter(item => item.id !== id);
    manifest.pinnedIds = manifest.pinnedIds.filter(pid => pid !== id);
    await saveManifest(manifest);
};

export const loadCategories = async (): Promise<GalleryCategory[]> => {
    const manifest = await getManifest();
    return manifest.categories.sort((a, b) => (a.order || 0) - (b.order || 0));
};

export const addCategory = async (name: string, parentId?: string): Promise<GalleryCategory[]> => {
    const manifest = await getManifest();
    const newCategory: GalleryCategory = {
        id: `cat_${Date.now()}`,
        name: name,
        parentId: parentId,
        order: manifest.categories.length
    };
    manifest.categories.push(newCategory);
    await saveManifest(manifest);
    return manifest.categories.sort((a, b) => a.order - b.order);
};

export const updateCategory = async (id: string, updates: Partial<Omit<GalleryCategory, 'id'>>): Promise<GalleryCategory[]> => {
    const manifest = await getManifest();
    const catIndex = manifest.categories.findIndex(c => c.id === id);
    if (catIndex > -1) {
        const oldCategory = manifest.categories[catIndex];
        const nameChanged = updates.name && updates.name !== oldCategory.name;
        
        manifest.categories[catIndex] = { ...oldCategory, ...updates };

        if (nameChanged) {
            const newName = updates.name!;
            for (const item of manifest.galleryItems) {
                if (item.categoryId === id) {
                    const newUrls: string[] = [];
                    for (const url of item.urls) {
                        const blob = await fileSystemManager.getFileAsBlob(url);
                        if (blob) {
                            const fileName = url.split('/').pop() || `${item.id}_media`;
                            const newPath = `gallery/${newName}/${fileName}`;
                            if (newPath !== url) {
                                await fileSystemManager.saveFile(newPath, blob);
                                await fileSystemManager.deleteFile(url);
                                newUrls.push(newPath);
                            } else {
                                newUrls.push(url);
                            }
                        } else {
                            newUrls.push(url);
                        }
                    }
                    item.urls = newUrls;
                }
            }
        }
    }
    await saveManifest(manifest);
    return manifest.categories.sort((a, b) => a.order - b.order);
};

export const saveCategoriesOrder = async (categories: GalleryCategory[]): Promise<void> => {
    const manifest = await getManifest();
    manifest.categories = categories;
    await saveManifest(manifest);
};

export const deleteCategory = async (id: string): Promise<GalleryCategory[]> => {
    const manifest = await getManifest();
    const categoryToDelete = manifest.categories.find(cat => cat.id === id);
    
    if (categoryToDelete) {
        for (const item of manifest.galleryItems) {
            if (item.categoryId === id) {
                const newUrls: string[] = [];
                for (const url of item.urls) {
                    const blob = await fileSystemManager.getFileAsBlob(url);
                    if (blob) {
                        const fileName = url.split('/').pop() || `${item.id}_media`;
                        const newPath = `gallery/${fileName}`;
                        if (newPath !== url) {
                            await fileSystemManager.saveFile(newPath, blob);
                            await fileSystemManager.deleteFile(url);
                            newUrls.push(newPath);
                        } else {
                            newUrls.push(url);
                        }
                    } else {
                        newUrls.push(url);
                    }
                }
                item.urls = newUrls;
                item.categoryId = undefined;
            }
        }
    }

    manifest.categories = manifest.categories.filter(cat => cat.id !== id);
    await saveManifest(manifest);
    return manifest.categories.sort((a, b) => a.order - b.order);
};

export const loadPinnedItemIds = async (): Promise<string[]> => {
    const manifest = await getManifest();
    return manifest.pinnedIds;
};

export const savePinnedItemIds = async (ids: string[]): Promise<void> => {
    const manifest = await getManifest();
    manifest.pinnedIds = ids;
    await saveManifest(manifest);
};
