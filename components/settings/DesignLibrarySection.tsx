import React, { useCallback, useState } from 'react';
import type { DesignCollection, DesignRecipe } from '../../types';
import { NestedCategoryManager } from '../NestedCategoryManager';
import {
    loadDesignLibrary,
    addCollection,
    renameCollection,
    moveCollection,
    deleteCollection,
    saveCollectionsOrder,
} from '../../utils/designLibraryStorage';
import { countAffected, parentOfCollection } from '../../utils/designCollections';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Says exactly what deleting `id` moves where; nothing is ever deleted with a collection. */
const deleteMessage = (collections: DesignCollection[], recipes: DesignRecipe[], id: string): string => {
    const target = collections.find(c => c.id === id);
    if (!target) return '';
    const { recipes: recipeCount, subCollections } = countAffected(collections, recipes, id);
    if (recipeCount === 0 && subCollections === 0) return `Delete the empty collection "${target.name}"?`;
    const parentId = parentOfCollection(collections, id);
    const parentName = collections.find(c => c.id === parentId)?.name;
    const parts = [
        subCollections > 0 ? plural(subCollections, 'sub-collection', 'sub-collections') : '',
        recipeCount > 0 ? plural(recipeCount, 'recipe', 'recipes') : '',
    ].filter(Boolean).join(' and ');
    const where = parentName
        ? `"${parentName}"`
        : `the top level${recipeCount > 0 ? ' (recipes become Unsorted)' : ''}`;
    return `Delete collection "${target.name}"? Its ${parts} will move to ${where}. Nothing else is deleted.`;
};

/** Web Design Library collections, managed with the same nested-folder manager as gallery and prompt folders. */
const DesignLibrarySection: React.FC = () => {
    // Latest library snapshot, so the delete dialog can count what a delete would move.
    const [lib, setLib] = useState<{ collections: DesignCollection[]; recipes: DesignRecipe[] }>({ collections: [], recipes: [] });

    const refresh = useCallback(async (): Promise<DesignCollection[]> => {
        const { collections, recipes } = await loadDesignLibrary();
        setLib({ collections, recipes });
        return [...collections].sort((a, b) => a.order - b.order);
    }, []);

    const addFn = useCallback(async (name: string, parentId?: string) => { await addCollection(name, parentId); return refresh(); }, [refresh]);
    const updateFn = useCallback(async (id: string, updates: { name?: string; parentId?: string }) => {
        if ('name' in updates && updates.name !== undefined) await renameCollection(id, updates.name);
        if ('parentId' in updates) await moveCollection(id, updates.parentId);
        return refresh();
    }, [refresh]);
    const deleteFn = useCallback(async (id: string) => { await deleteCollection(id); return refresh(); }, [refresh]);

    return (
        <NestedCategoryManager
            title="Design Collections"
            type="design"
            loadFn={refresh}
            addFn={addFn}
            updateFn={updateFn}
            deleteFn={deleteFn}
            saveOrderFn={saveCollectionsOrder}
            deleteConfirmationMessage={(_name, id) => deleteMessage(lib.collections, lib.recipes, id)}
        />
    );
};

export default DesignLibrarySection;
