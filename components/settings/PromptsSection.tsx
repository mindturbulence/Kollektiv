import React from 'react';
import { SettingRow, SettingsGroup } from './primitives';
import { NestedCategoryManager } from '../NestedCategoryManager';
import { audioService } from '../../services/audioService';
import {
    loadPromptCategories,
    addPromptCategory,
    updatePromptCategory,
    deletePromptCategory,
    savePromptCategoriesOrder as savePromptCategoriesOrderFS
} from '../../utils/promptStorage';
import { UploadIcon } from '../icons';

interface PromptsSectionProps {
    activeSubTab: string;
    onOpenTxtImportModal: () => void;
}

const PromptsSection: React.FC<PromptsSectionProps> = ({
    activeSubTab,
    onOpenTxtImportModal,
}) => {
    switch (activeSubTab) {
        case 'categories':
            return (
                <NestedCategoryManager
                    title="Prompt Folder Management"
                    type="prompt"
                    loadFn={loadPromptCategories}
                    addFn={addPromptCategory}
                    updateFn={updatePromptCategory}
                    deleteFn={deletePromptCategory}
                    saveOrderFn={savePromptCategoriesOrderFS}
                    deleteConfirmationMessage={(name) => `Permanently remove prompt folder "${name}"?`}
                />
            );
        case 'data':
            return (
                <div className="flex flex-col h-full animate-fade-in">
                    <SettingsGroup title="Import">
                    <SettingRow label="Batch Ingestion" desc="Import multiple prompts from a ZIP archive containing .txt files.">
                        <button onClick={() => { audioService.playClick(); onOpenTxtImportModal(); }} className="form-btn px-6">
                            <UploadIcon className="w-4 h-4 mr-2" />
                            OPEN IMPORT MODULE
                        </button>
                    </SettingRow>
                    </SettingsGroup>
                </div>
            );
        default: return null;
    }
};

export default PromptsSection;
