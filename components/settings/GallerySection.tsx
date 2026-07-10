import React from 'react';
import type { LLMSettings } from '../../types';
import { SettingRow, SettingsGroup } from './primitives';
import { NestedCategoryManager } from '../NestedCategoryManager';
import { audioService } from '../../services/audioService';
import { createZipAndDownload } from '../../utils/fileUtils';
import {
    loadCategories as loadGalleryCategoriesFS,
    addCategory as addGalleryCategoryFS,
    updateCategory as updateCategoryFS,
    deleteCategory as deleteGalleryCategoryFS,
    saveCategoriesOrder as saveGalleryCategoriesOrderFS
} from '../../utils/galleryStorage';
import { DownloadIcon } from '../icons';

interface GallerySectionProps {
    activeSubTab: string;
    settings: LLMSettings;
    handleSettingsChange: (field: keyof LLMSettings, value: any) => void;
}

const GallerySection: React.FC<GallerySectionProps> = ({
    activeSubTab,
    settings,
    handleSettingsChange,
}) => {
    switch (activeSubTab) {
        case 'categories':
            return (
                <NestedCategoryManager
                    title="Gallery Folder Management"
                    type="gallery"
                    loadFn={loadGalleryCategoriesFS}
                    addFn={addGalleryCategoryFS}
                    updateFn={updateCategoryFS}
                    deleteFn={deleteGalleryCategoryFS}
                    saveOrderFn={saveGalleryCategoriesOrderFS}
                    deleteConfirmationMessage={(name) => `Permanently remove gallery folder "${name}"?`}
                />
            );
        case 'data':
            return (
                <div className="flex flex-col h-full animate-fade-in">
                    <SettingsGroup title="Export">
                    <SettingRow label="Bulk Export" desc="Package all gallery artifacts into a single ZIP archive for backup.">
                        <button onClick={() => { audioService.playClick(); createZipAndDownload([], 'gallery_archive.zip'); }} className="form-btn form-btn-primary px-6">
                            <DownloadIcon className="w-4 h-4 mr-2" />
                            DOWNLOAD VAULT
                        </button>
                    </SettingRow>
                    </SettingsGroup>
                    <SettingsGroup title="Storage Format">
                    <SettingRow label="Convert Media to JPG (Local Storage)" desc="Automatically convert saved images to JPG format when using Local Storage. Metadata will be preserved.">
                        <input
                            type="checkbox"
                            checked={settings.convertImageToJpgLocal || false}
                            onChange={(e) => { audioService.playClick(); handleSettingsChange('convertImageToJpgLocal', e.target.checked); }}
                            className="toggle toggle-primary toggle-sm"
                        />
                    </SettingRow>
                    <SettingRow label="Convert Media to JPG (Google Drive)" desc="Automatically convert saved images to JPG format when using Google Drive storage. Metadata will be preserved.">
                        <input
                            type="checkbox"
                            checked={settings.convertImageToJpgDrive ?? true}
                            onChange={(e) => { audioService.playClick(); handleSettingsChange('convertImageToJpgDrive', e.target.checked); }}
                            className="toggle toggle-primary toggle-sm"
                        />
                    </SettingRow>
                    {(settings.convertImageToJpgLocal || settings.convertImageToJpgDrive) && (
                        <SettingRow label="JPG Compression Quality" desc="Adjust the compression level for JPG conversion (10% to 100%).">
                            <div className="flex items-center gap-4 w-48">
                                <input
                                    type="range"
                                    min={0.1} max={1.0} step={0.1}
                                    value={settings.jpgCompressionQuality || 0.9}
                                    onChange={(e) => handleSettingsChange('jpgCompressionQuality', Number(e.currentTarget.value))}
                                    className="range range-xs range-primary"
                                />
                                <span className="text-[10px] font-mono font-bold text-primary">{Math.round((settings.jpgCompressionQuality || 0.9) * 100)}%</span>
                            </div>
                        </SettingRow>
                    )}
                    </SettingsGroup>
                </div>
            );
        default: return null;
    }
};

export default GallerySection;
