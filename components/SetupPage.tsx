import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { LLMSettings, ActiveSettingsTab, GalleryCategory, PromptCategory, SavedPrompt, FeatureSettings } from '../types';
import { testOllamaConnection } from '../services/llmService';
import { fileSystemManager, createZipAndDownload, readZip } from '../utils/fileUtils';
import { useSettings } from '../contexts/SettingsContext';
import GenericCategoryManager from './GenericCategoryManager';
import { loadCategories as loadGalleryCategoriesFS, addCategory as addGalleryCategoryFS, updateCategory as updateGalleryCategoryFS, deleteCategory } from '../utils/galleryStorage';
import { loadPromptCategories, addPromptCategory, updatePromptCategory, deletePromptCategory, addMultipleSavedPrompts } from '../utils/promptStorage';
import { resetAllSettings } from '../utils/settingsStorage';
import { AVAILABLE_LLM_MODELS, DAISYUI_LIGHT_THEMES, DAISYUI_DARK_THEMES } from '../constants';
import ConfirmationModal from './ConfirmationModal';
import { Cog6ToothIcon, CpuChipIcon, AppIcon, PromptIcon, PhotoIcon, FolderClosedIcon, PaintBrushIcon, DeleteIcon, CheckIcon, EditIcon, AdjustmentsVerticalIcon, SparklesIcon } from './icons';
import FeedbackModal from './FeedbackModal';
import { PromptTxtImportModal } from './PromptTxtImportModal';
import { enrichArtistDataWithDescriptions } from '../utils/artistStorage';

interface SetupPageProps {
  activeSettingsTab: ActiveSettingsTab;
  setActiveSettingsTab: (tab: ActiveSettingsTab) => void;
  activeSubTab: string;
  setActiveSubTab: (subTab: string) => void;
  showGlobalFeedback: (message: string, isError?: boolean) => void;
}

const subMenuConfig: Record<string, { id: string; label: string, icon: React.ReactNode, description: string }[]> = {
    app: [
        { id: 'general', label: 'General', icon: <Cog6ToothIcon className="w-5 h-5" />, description: "Manage storage and global font size." },
        { id: 'features', label: 'Features', icon: <AdjustmentsVerticalIcon className="w-5 h-5" />, description: "Enable or disable core app features." },
        { id: 'appearance', label: 'Appearance', icon: <PaintBrushIcon className="w-5 h-5" />, description: "Customize the look and feel." },
        { id: 'data', label: 'Data Management', icon: <FolderClosedIcon className="w-5 h-5" />, description: "Backup, restore, or reset app data." }
    ],
    llm: [ { id: 'provider', label: 'Provider Settings', icon: <CpuChipIcon className="w-5 h-5" />, description: "Configure Gemini or a local Ollama instance." } ],
    prompt: [
        { id: 'categories', label: 'Prompt Categories', icon: <FolderClosedIcon className="w-5 h-5" />, description: "Organize your prompt library." },
        { id: 'data', label: 'Prompt Data', icon: <FolderClosedIcon className="w-5 h-5" />, description: "Import prompts from external files." }
    ],
    gallery: [
        { id: 'categories', label: 'Gallery Categories', icon: <FolderClosedIcon className="w-5 h-5" />, description: "Organize your image gallery." },
        { id: 'data', label: 'Gallery Data', icon: <FolderClosedIcon className="w-5 h-5" />, description: "Export or import your collection." }
    ],
};

export const SetupPage: React.FC<SetupPageProps> = ({ 
    activeSettingsTab, setActiveSettingsTab, activeSubTab, setActiveSubTab, showGlobalFeedback
}) => {
  const { settings: globalSettings, updateSettings } = useSettings();
  const { features } = globalSettings;
  const [settings, setSettings] = useState<LLMSettings>(globalSettings);
  const [modalFeedback, setModalFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [isTestingOllama, setIsTestingOllama] = useState(false);
  const [ollamaTestStatus, setOllamaTestStatus] = useState<'idle' | 'success' | 'failed' | 'error'>('idle');
  const [appDataDirectory, setAppDataDirectory] = useState<string | null>(fileSystemManager.appDirectoryName);
  
  const [resetTarget, setResetTarget] = useState<'all' | null>(null);
  const [isWorking, setIsWorking] = useState<boolean>(false);
  const importAllRef = useRef<HTMLInputElement>(null);
  const importGalleryRef = useRef<HTMLInputElement>(null);
  const [promptCategories, setPromptCategories] = useState<PromptCategory[]>([]);
  const [isTxtImportModalOpen, setIsTxtImportModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isRestartModalOpen, setIsRestartModalOpen] = useState(false);

  const [galleryCategories, setGalleryCategories] = useState<GalleryCategory[]>([]);
  const [isDeleteCategoryModalOpen, setIsDeleteCategoryModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<GalleryCategory | null>(null);
  const [editingGalleryCategory, setEditingGalleryCategory] = useState<GalleryCategory | null>(null);
  const [newGalleryCategoryName, setNewGalleryCategoryName] = useState('');
  const [newGalleryCategoryIsNsfw, setNewGalleryCategoryIsNsfw] = useState(false);
  
  // State for manual data enrichment
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState({ current: 0, total: 0 });

  const mainCategories = useMemo(() => {
    const categories: {id: ActiveSettingsTab, label: string, icon: React.ReactNode}[] = [
        { id: 'app', label: 'Application', icon: <AppIcon className="w-5 h-5"/> },
        { id: 'llm', label: 'Language Model', icon: <CpuChipIcon className="w-5 h-5"/> },
    ];

    if (features.isPromptLibraryEnabled) {
        categories.push({ id: 'prompt', label: 'Prompts Library', icon: <PromptIcon className="w-5 h-5"/> });
    }
    if (features.isGalleryEnabled) {
        categories.push({ id: 'gallery', label: 'Gallery', icon: <PhotoIcon className="w-5 h-5"/> });
    }
    return categories;
  }, [features]);

  useEffect(() => {
    const availableCategoryIds = mainCategories.map(c => c.id);
    if (!availableCategoryIds.includes(activeSettingsTab)) {
      setActiveSettingsTab('app');
      setActiveSubTab('general');
    }
  }, [mainCategories, activeSettingsTab, setActiveSettingsTab, setActiveSubTab]);

  useEffect(() => {
    loadPromptCategories().then(setPromptCategories);
    loadGalleryCategoriesFS().then(setGalleryCategories);
  }, []);

  useEffect(() => {
    setSettings(globalSettings);
  }, [globalSettings]);
  
  const showFeedback = (message: string, isError: boolean = false) => {
    setModalFeedback({ message, type: isError ? 'error' : 'success' });
  };

  const handleSettingsChange = (field: keyof LLMSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    // Add live preview for font size changes
    if (field === 'fontSize' && typeof window !== 'undefined') {
      (window as any).document.documentElement.style.fontSize = `${value}px`;
    }
  };

  const handleFeatureToggle = (feature: keyof FeatureSettings, value: boolean) => {
    setSettings(prev => ({
      ...prev,
      features: {
        ...prev.features,
        [feature]: value
      }
    }));
  };

  const saveSettings = () => {
    updateSettings(settings);
    showFeedback('Settings saved successfully!');
  };
  
  const handleCancel = () => {
      setSettings(globalSettings);
      // Revert any live previews to their saved state
      if (typeof window !== 'undefined') {
        (window as any).document.documentElement.style.fontSize = `${globalSettings.fontSize}px`;
      }
      showFeedback('Changes discarded.');
  };
  
  const handleTestOllamaConnection = async () => {
    setIsTestingOllama(true);
    setOllamaTestStatus('idle');
    try {
        const result = await testOllamaConnection(settings.ollamaBaseUrl);
        setOllamaTestStatus(result ? 'success' : 'failed');
    } catch(e) {
        setOllamaTestStatus('error');
    }
    setIsTestingOllama(false);
  };

  const handleSelectAppDataDirectory = async () => {
    const handle = await fileSystemManager.selectAndSetAppDataDirectory();
    if(handle) {
        setAppDataDirectory(handle.name);
        showFeedback('Application directory set! Reloading...');
        if (typeof window !== 'undefined') {
            setTimeout(() => (window as any).location.reload(), 1500);
        }
    }
  };
  
  const handleExportAll = async () => {
    setIsWorking(true);
    const manifestFiles = [ 'kollektiv_gallery_manifest.json', 'prompts_manifest.json' ];
    const filesToZip: {name: string, content: Blob}[] = [];

    for await (const handle of fileSystemManager.listDirectoryContents('')) {
        if(handle.kind === 'file' && manifestFiles.includes(handle.name)) {
            const file = await (handle as FileSystemFileHandle).getFile();
            filesToZip.push({ name: handle.name, content: file });
        } else if (handle.kind === 'directory') {
            for await (const subHandle of fileSystemManager.listDirectoryContents(handle.name)) {
                 if (subHandle.kind === 'file') {
                    const file = await (subHandle as FileSystemFileHandle).getFile();
                    filesToZip.push({ name: `${handle.name}/${subHandle.name}`, content: file });
                 }
            }
        }
    }
    await createZipAndDownload(filesToZip, `kollektiv_backup_${new Date().toISOString().split('T')[0]}.zip`);
    setIsWorking(false);
  };
  
  const handleImportAll = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!(e.currentTarget as any).files?.length) return;
    setIsWorking(true);
    try {
        const zipFile = (e.currentTarget as any).files![0];
        const zip = await readZip(zipFile);
        for(const relativePath in zip.files) {
            const fileData = await zip.files[relativePath].async('blob');
            await fileSystemManager.saveFile(relativePath, fileData);
        }
        showFeedback('Import successful! The application will now reload.');
        setTimeout(() => { if (typeof window !== 'undefined') (window as any).location.reload(); }, 2000);
    } catch (err) {
        showFeedback('Import failed. See console for details.', true);
        console.error(err);
    } finally {
        setIsWorking(false);
    }
  };

  const handleExportGallery = async () => {
    setIsWorking(true);
    const filesToZip: {name: string, content: Blob}[] = [];
    try {
        const manifestBlob = await fileSystemManager.getFileAsBlob('kollektiv_gallery_manifest.json');
        if (manifestBlob) {
            filesToZip.push({ name: 'kollektiv_gallery_manifest.json', content: manifestBlob });
        }
        
        async function recursivelyAddFiles(currentPath: string) {
            for await (const handle of fileSystemManager.listDirectoryContents(currentPath)) {
                const newPath = `${currentPath}/${handle.name}`;
                if (handle.kind === 'file') {
                    const file = await (handle as FileSystemFileHandle).getFile();
                    filesToZip.push({ name: newPath, content: file });
                } else if (handle.kind === 'directory') {
                    await recursivelyAddFiles(newPath);
                }
            }
        }
        await recursivelyAddFiles('gallery');

        if (filesToZip.length > 0) {
            await createZipAndDownload(filesToZip, `kollektiv_gallery_backup_${new Date().toISOString().split('T')[0]}.zip`);
        } else {
             showFeedback('No gallery data to export.', true);
        }
    } catch (err) {
         showFeedback('Export failed. See console for details.', true);
         console.error(err);
    } finally {
        setIsWorking(false);
    }
  };

  const handleImportGallery = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!(e.currentTarget as any).files?.length) return;
    setIsWorking(true);
    try {
        const zipFile = (e.currentTarget as any).files![0];
        const zip = await readZip(zipFile);
        let foundGalleryData = false;
        for(const relativePath in zip.files) {
            if (relativePath.startsWith('gallery/') || relativePath === 'kollektiv_gallery_manifest.json') {
                foundGalleryData = true;
                const fileData = await zip.files[relativePath].async('blob');
                await fileSystemManager.saveFile(relativePath, fileData);
            }
        }
        if (foundGalleryData) {
            showFeedback('Gallery import successful! The application will now reload.');
            setTimeout(() => { if (typeof window !== 'undefined') (window as any).location.reload(); }, 2000);
        } else {
            showFeedback('No valid gallery data found in the zip file.', true);
        }
    } catch (err) {
        showFeedback('Import failed. See console for details.', true);
        console.error(err);
    } finally {
        setIsWorking(false);
    }
  };

  const handleReset = async () => {
      if (!resetTarget) return;
      setIsWorking(true);
      if (resetTarget === 'all') {
          await resetAllSettings();
          showFeedback('All settings and data have been reset. The app will reload.');
          setTimeout(() => { if (typeof window !== 'undefined') (window as any).location.reload(); }, 2000);
      }
      setIsWorking(false);
      setResetTarget(null);
      setIsResetModalOpen(false);
  };
  
  const handleConfirmDeleteGalleryCategory = async () => {
    if (categoryToDelete) {
        const updated = await deleteCategory(categoryToDelete.id);
        setGalleryCategories(updated);
        setCategoryToDelete(null);
        setIsDeleteCategoryModalOpen(false);
    }
  };

  const handleConfirmRestart = async () => {
      setIsRestartModalOpen(false);
      setIsWorking(true);
      showFeedback('Clearing cache and restarting application...');

      try {
          // Unregister all service workers
          if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
              const registrations = await navigator.serviceWorker.getRegistrations();
              for (const registration of registrations) {
                  await registration.unregister();
              }
          }

          // Delete all caches
          if (typeof window !== 'undefined' && 'caches' in window) {
              const keys = await caches.keys();
              await Promise.all(keys.map(key => caches.delete(key)));
          }
          
          showFeedback('Cache cleared. Reloading now...');
          
          // Give feedback a moment to show before reloading
          setTimeout(() => {
              if (typeof window !== 'undefined') {
                  (window as any).location.reload();
              }
          }, 1500);

      } catch (error) {
          console.error("Failed to clear cache and restart:", error);
          showFeedback('Failed to clear cache. Please try clearing your browser data manually.', true);
          setIsWorking(false);
      }
  };

  const handleEnrichArtistData = async () => {
    setIsEnriching(true);
    setEnrichmentProgress({ current: 0, total: 0 });
    try {
        const { updated, total } = await enrichArtistDataWithDescriptions(settings, (progress) => {
            setEnrichmentProgress(progress);
        });
        
        if (total > 0) {
             showFeedback(`Enrichment complete! ${updated} of ${total} artist descriptions updated.`);
        } else {
             showFeedback('All artist descriptions are already present. No action needed.');
        }

    } catch (e) {
        showFeedback(e instanceof Error ? e.message : 'An unknown error occurred during enrichment.', true);
    } finally {
        setIsEnriching(false);
    }
  };


  const handleSubCategoryClick = (mainTab: ActiveSettingsTab, subTab: string) => {
      setActiveSettingsTab(mainTab);
      setActiveSubTab(subTab);
  };
  
  const isGeminiKeyMissing = useMemo(() => {
    return settings.activeLLM === 'gemini' && !settings.apiKeyOverride?.trim();
  }, [settings.activeLLM, settings.apiKeyOverride]);

    
    const renderAppSettings = () => {
        switch(activeSubTab) {
            case 'general':
                return (
                    <div className="space-y-6">
                        <section>
                            <h3 className="text-lg font-semibold text-base-content">Storage</h3>
                            <p className="text-sm text-base-content/70 mt-1">Manage where your application data is stored on your local device.</p>
                            <div className="form-control mt-4"><label className="label"><span className="label-text">Storage Location</span></label><button onClick={handleSelectAppDataDirectory} className="btn btn-secondary btn-sm max-w-xs">Select Local Data Folder</button>{appDataDirectory && <span className="text-xs mt-2">Current: {appDataDirectory}</span>}</div>
                        </section>
                        <div className="divider"></div>
                        <section>
                             <h3 className="text-lg font-semibold text-base-content">User Interface</h3>
                             <p className="text-sm text-base-content/70 mt-1">Control the global font size for the application.</p>
                            <div className="form-control w-full max-w-xs mt-4">
                                <label className="label"><span className="label-text">UI Font Size: {settings.fontSize}px</span></label>
                                <input type="range" min={10} max={18} value={settings.fontSize} onChange={(e) => handleSettingsChange('fontSize', Number((e.currentTarget as any).value))} className="range range-primary" />
                            </div>
                        </section>
                        <div className="divider"></div>
                        <section>
                            <h3 className="text-lg font-semibold text-base-content">Application State</h3>
                            <p className="text-sm text-base-content/70 mt-1">If you are experiencing issues with outdated content, restarting the application and clearing its cache can help resolve them. This will force all assets to be re-downloaded.</p>
                            <button onClick={() => setIsRestartModalOpen(true)} className="btn btn-warning btn-sm mt-4" disabled={isWorking}>
                                {isWorking ? 'Working...' : 'Restart & Clear Cache'}
                            </button>
                        </section>
                    </div>
                );
            case 'features':
                return (
                    <section>
                         <h3 className="text-lg font-semibold text-base-content">Feature Management</h3>
                         <p className="text-sm text-base-content/70 mt-1 mb-4">Enable or disable core application features. Changes will apply after a refresh.</p>
                        <div className="space-y-2 max-w-md">
                            <div className="form-control"><label className="label cursor-pointer"><span className="label-text font-semibold">Prompt Library</span><input type="checkbox" checked={settings.features.isPromptLibraryEnabled} onChange={(e) => handleFeatureToggle('isPromptLibraryEnabled', (e.currentTarget as any).checked)} className="toggle toggle-primary" /></label></div>
                            <div className="form-control"><label className="label cursor-pointer"><span className="label-text font-semibold">Image Gallery</span><input type="checkbox" checked={settings.features.isGalleryEnabled} onChange={(e) => handleFeatureToggle('isGalleryEnabled', (e.currentTarget as any).checked)} className="toggle toggle-primary" /></label></div>
                            <div className="form-control"><label className="label cursor-pointer"><span className="label-text font-semibold">Cheatsheets</span><input type="checkbox" checked={settings.features.isCheatsheetsEnabled} onChange={(e) => handleFeatureToggle('isCheatsheetsEnabled', (e.currentTarget as any).checked)} className="toggle toggle-primary" /></label></div>
                            <div className="form-control"><label className="label cursor-pointer"><span className="label-text font-semibold">Tools</span><input type="checkbox" checked={settings.features.isToolsEnabled} onChange={(e) => handleFeatureToggle('isToolsEnabled', (e.currentTarget as any).checked)} className="toggle toggle-primary" /></label></div>
                        </div>
                    </section>
                );
            case 'appearance':
                return (
                    <section>
                         <h3 className="text-lg font-semibold text-base-content">Appearance</h3>
                         <p className="text-sm text-base-content/70 mt-1">Select your preferred light and dark themes for the application.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 max-w-xl">
                            <div className="form-control"><label className="label"><span className="label-text">Light Theme</span></label><select value={settings.lightTheme} onChange={(e) => handleSettingsChange('lightTheme', (e.currentTarget as any).value)} className="select select-bordered w-full select-sm"><option disabled>Select a light theme</option>{DAISYUI_LIGHT_THEMES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                            <div className="form-control"><label className="label"><span className="label-text">Dark Theme</span></label><select value={settings.darkTheme} onChange={(e) => handleSettingsChange('darkTheme', (e.currentTarget as any).value)} className="select select-bordered w-full select-sm"><option disabled>Select a dark theme</option>{DAISYUI_DARK_THEMES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                        </div>
                    </section>
                );
            case 'data':
                 return (
                     <div className="space-y-6">
                        <section>
                            <h3 className="text-lg font-semibold text-base-content">Backup & Restore</h3>
                            <p className="text-sm text-base-content/70 mt-1">Export all your data into a single zip file for backup, or import a backup to restore your data.</p>
                            <div className="flex gap-4 mt-4">
                                <button onClick={handleExportAll} className="btn btn-sm btn-secondary" disabled={isWorking || isEnriching}>{isWorking ? 'Exporting...' : 'Export All Data'}</button>
                                <button onClick={() => (importAllRef.current as any)?.click()} className="btn btn-sm btn-accent" disabled={isWorking || isEnriching}>{isWorking ? 'Importing...' : 'Import from Backup'}</button>
                                <input type="file" ref={importAllRef} onChange={handleImportAll} className="hidden" accept=".zip"/>
                            </div>
                        </section>
                        <div className="divider"></div>
                        <section>
                            <h3 className="text-lg font-semibold text-base-content">AI Data Enrichment</h3>
                            <p className="text-sm text-base-content/70 mt-1">Use AI to automatically generate descriptions for cheatsheet items that are missing them. This can take several minutes depending on the number of items and API rate limits.</p>
                            <div className="mt-4">
                                {isEnriching ? (
                                    <div className="space-y-2 max-w-sm">
                                        <span className="font-semibold text-sm">Enriching artist data... ({enrichmentProgress.current} / {enrichmentProgress.total})</span>
                                        <progress className="progress progress-primary w-full" value={enrichmentProgress.current} max={enrichmentProgress.total}></progress>
                                    </div>
                                ) : (
                                    <div className="tooltip" data-tip={isGeminiKeyMissing ? "A Gemini API Key is required for this feature." : undefined}>
                                        <button 
                                            onClick={handleEnrichArtistData} 
                                            className="btn btn-sm btn-secondary" 
                                            disabled={isWorking || isGeminiKeyMissing}
                                        >
                                            <SparklesIcon className="w-4 h-4 mr-2" />
                                            Enrich Artist Descriptions
                                        </button>
                                    </div>
                                )}
                            </div>
                        </section>
                         <div className="divider"></div>
                        <section>
                            <h3 className="text-lg font-semibold text-error">Danger Zone</h3>
                            <p className="text-sm text-base-content/70 mt-1">Permanently delete all application settings and stored data. This action cannot be undone.</p>
                            <button onClick={() => { setResetTarget('all'); setIsResetModalOpen(true); }} className="btn btn-sm btn-error mt-4" disabled={isWorking || isEnriching}>Reset Application</button>
                        </section>
                     </div>
                 );
            default: return null;
        }
      };

    const renderLLMSettings = () => (
        <div className="space-y-6">
            <section>
                <h3 className="text-lg font-semibold text-base-content">Provider</h3>
                 <p className="text-sm text-base-content/70 mt-1">Choose which AI provider will power the prompt generation features.</p>
                 <div className="mt-4 space-y-2">
                    <div className="form-control"><label className="label cursor-pointer"><span className="label-text">Use Gemini</span><input type="radio" name="llm-provider" className="radio" checked={settings.activeLLM === 'gemini'} onChange={() => handleSettingsChange('activeLLM', 'gemini')} /></label></div>
                    <div className="form-control"><label className="label cursor-pointer"><span className="label-text">Use Ollama</span><input type="radio" name="llm-provider" className="radio" checked={settings.activeLLM === 'ollama'} onChange={() => handleSettingsChange('activeLLM', 'ollama')} /></label></div>
                 </div>
            </section>
            <div className="divider"></div>
            {settings.activeLLM === 'gemini' && (
                <section className="animate-fade-in">
                    <h3 className="text-lg font-semibold text-base-content">Gemini Settings</h3>
                    <div className="mt-4 space-y-4 max-w-xl">
                        <div className="form-control">
                            <label className="label"><span className="label-text">Gemini API Key</span></label>
                            <input 
                                type="password" 
                                value={settings.apiKeyOverride || ''} 
                                onChange={(e) => handleSettingsChange('apiKeyOverride', (e.currentTarget as any).value)} 
                                className="input input-bordered input-sm w-full" 
                                placeholder="Enter your API key"
                            />
                             <label className="label"><span className="label-text-alt">Stored locally in your browser.</span></label>
                        </div>
                        <div className="form-control"><label className="label"><span className="label-text">Gemini Model</span></label><select value={settings.llmModel} onChange={(e) => handleSettingsChange('llmModel', (e.currentTarget as any).value)} className="select select-bordered select-sm w-full">{AVAILABLE_LLM_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
                    </div>
                </section>
            )}
            
            {settings.activeLLM === 'ollama' && (
                 <section className="animate-fade-in">
                    <h3 className="text-lg font-semibold text-base-content">Ollama Settings</h3>
                     <div className="mt-4 space-y-4 max-w-md">
                        <div className="form-control"><label className="label"><span className="label-text">Ollama Base URL</span></label><div className="join w-full"><input type="text" value={settings.ollamaBaseUrl} onChange={(e) => handleSettingsChange('ollamaBaseUrl', (e.currentTarget as any).value)} className="input input-bordered input-sm join-item w-full" /><button onClick={handleTestOllamaConnection} disabled={isTestingOllama} className="btn btn-sm join-item">{isTestingOllama ? '...' : 'Test'}</button></div></div>
                        {ollamaTestStatus === 'success' && <div className="text-success text-xs">Connection successful!</div>}
                        {ollamaTestStatus === 'failed' && <div className="text-error text-xs">Connection failed.</div>}
                        <div className="form-control"><label className="label"><span className="label-text">Ollama Model Name</span></label><input type="text" value={settings.ollamaModel} onChange={(e) => handleSettingsChange('ollamaModel', (e.currentTarget as any).value)} className="input input-bordered input-sm w-full" placeholder="e.g., llama3"/></div>
                    </div>
                </section>
            )}
        </div>
    );

    const renderPromptSettings = () => {
        switch(activeSubTab) {
            case 'categories': return <GenericCategoryManager title="Prompt Categories" loadFn={loadPromptCategories} addFn={addPromptCategory} updateFn={updatePromptCategory} deleteFn={deletePromptCategory} deleteConfirmationMessage={(name) => `Are you sure you want to delete the category "${name}"? All prompts within it will become uncategorized.`} />;
            case 'data': return <div>
                <h3 className="text-lg font-semibold text-base-content">Prompt Data Management</h3>
                <p className="text-sm text-base-content/70 mt-1 mb-4">Import prompts from a zip file containing .txt files.</p>
                <button onClick={() => setIsTxtImportModalOpen(true)} className="btn btn-sm btn-accent max-w-xs">Import from .txt files</button>
            </div>;
            default: return null;
        }
    };

    const renderGallerySettings = () => {
        switch(activeSubTab) {
            case 'categories': return (
                <div>
                     <h3 className="text-lg font-semibold text-base-content">Gallery Categories</h3>
                     <form onSubmit={async (e: React.FormEvent) => { e.preventDefault(); const updated = await addGalleryCategoryFS(newGalleryCategoryName, newGalleryCategoryIsNsfw); setGalleryCategories(updated); setNewGalleryCategoryName(''); setNewGalleryCategoryIsNsfw(false); }} className="flex gap-2 items-end mb-4 mt-4">
                        <div className="form-control flex-grow"><label className="label py-1"><span className="label-text text-xs">New Category Name</span></label><input type="text" value={newGalleryCategoryName} onChange={(e) => setNewGalleryCategoryName((e.currentTarget as any).value)} className="input input-bordered input-sm w-full" /></div>
                        <div className="form-control"><label className="label cursor-pointer gap-2 py-1"><span className="label-text text-xs">NSFW</span><input type="checkbox" checked={newGalleryCategoryIsNsfw} onChange={(e) => setNewGalleryCategoryIsNsfw((e.currentTarget as any).checked)} className="checkbox checkbox-sm" /></label></div>
                        <button type="submit" className="btn btn-primary btn-sm">Add</button>
                     </form>
                     <div className="space-y-2">
                        {galleryCategories.map(cat => (
                            <div key={cat.id} className="p-2 rounded-lg flex items-center justify-between hover:bg-base-200/50">
                                {editingGalleryCategory?.id === cat.id ? (
                                    <>
                                        <input type="text" value={editingGalleryCategory.name} onChange={(e) => setEditingGalleryCategory(c => c ? ({...c, name: (e.currentTarget as any).value}) : null)} className="input input-sm input-bordered flex-grow"/>
                                        <label className="label cursor-pointer gap-2"><span className="label-text text-xs">NSFW</span><input type="checkbox" checked={!!editingGalleryCategory.isNsfw} onChange={(e) => setEditingGalleryCategory(c => c ? ({...c, isNsfw: (e.currentTarget as any).checked}) : null)} className="checkbox checkbox-sm" /></label>
                                        <button onClick={async () => { if(editingGalleryCategory) { const updated = await updateGalleryCategoryFS(editingGalleryCategory.id, editingGalleryCategory.name, !!editingGalleryCategory.isNsfw); setGalleryCategories(updated); } setEditingGalleryCategory(null); }} className="btn btn-xs btn-ghost"><CheckIcon className="w-4 h-4 text-success"/></button>
                                    </>
                                ) : (
                                    <>
                                        <span className="flex items-center gap-2">{cat.name} {cat.isNsfw && <div className="badge badge-warning badge-xs">NSFW</div>}</span>
                                        <div className="flex gap-1">
                                            <button onClick={() => setEditingGalleryCategory({...cat})} className="btn btn-xs btn-ghost"><EditIcon className="w-4 h-4"/></button>
                                            <button onClick={() => { setCategoryToDelete(cat); setIsDeleteCategoryModalOpen(true); }} className="btn btn-xs btn-ghost"><DeleteIcon className="w-4 h-4 text-error"/></button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                     </div>
                </div>
            );
            case 'data': return (
                <div>
                    <h3 className="text-lg font-semibold text-base-content">Gallery Data Management</h3>
                    <p className="text-sm text-base-content/70 mt-1 mb-4">Export your gallery data (manifest and images) into a single zip file, or import from a backup.</p>
                    <div className="flex gap-4 mt-2">
                        <button onClick={handleExportGallery} className="btn btn-sm btn-secondary" disabled={isWorking}>{isWorking ? 'Exporting...' : 'Export Gallery Data'}</button>
                        <button onClick={() => (importGalleryRef.current as any)?.click()} className="btn btn-sm btn-accent" disabled={isWorking}>{isWorking ? 'Importing...' : 'Import from Backup'}</button>
                        <input type="file" ref={importGalleryRef} onChange={handleImportGallery} className="hidden" accept=".zip"/>
                    </div>
                </div>
            );
            default: return null;
        }
    };
    
    const renderContent = () => {
        switch(activeSettingsTab) {
            case 'app': return renderAppSettings();
            case 'llm': return renderLLMSettings();
            case 'prompt': return renderPromptSettings();
            case 'gallery': return renderGallerySettings();
            default: return null;
        }
    };

    const currentSubTab = subMenuConfig[activeSettingsTab]?.find(sub => sub.id === activeSubTab);
    const currentSubTabLabel = currentSubTab?.label || '';
    const currentSubTabDescription = currentSubTab?.description || '';
    
  return (
    <>
    <section className="flex flex-row bg-base-200 text-base-content h-full">
        <aside className="w-80 flex-shrink-0 bg-base-100 p-6 flex flex-col">
            <h1 className="text-2xl font-bold mb-6 px-3">Settings</h1>
            <nav className="flex-grow overflow-y-auto">
                <ul className="menu p-0">
                   {mainCategories.map(mainCat => (
                       <li key={mainCat.id}>
                           <h2 className="menu-title text-base-content/80 font-semibold">{mainCat.label}</h2>
                           <ul>
                            {(subMenuConfig[mainCat.id as ActiveSettingsTab] || []).map(subCat => (
                                <li key={subCat.id} className="p-0">
                                    <a 
                                        onClick={() => handleSubCategoryClick(mainCat.id as ActiveSettingsTab, subCat.id)}
                                        className={`p-3 ${activeSettingsTab === mainCat.id && activeSubTab === subCat.id ? 'active' : ''}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="flex-shrink-0 text-base-content/60">{subCat.icon}</div>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{subCat.label}</span>
                                                <span className="text-xs text-base-content/60">{subCat.description}</span>
                                            </div>
                                        </div>
                                    </a>
                                </li>
                            ))}
                           </ul>
                       </li>
                   ))}
                </ul>
            </nav>
        </aside>

        <main className="flex-grow flex flex-col overflow-hidden">
             <div className="flex-grow overflow-y-auto p-8">
                 <header className="mb-6">
                    <h2 className="text-2xl font-bold text-base-content">{currentSubTabLabel}</h2>
                    <p className="text-base-content/70 mt-1">{currentSubTabDescription}</p>
                 </header>
                 <div className="bg-base-100 p-6 rounded-lg shadow-lg">
                    {renderContent()}
                 </div>
            </div>
            {(activeSettingsTab === 'app' || activeSettingsTab === 'llm') && (
                 <footer className="flex-shrink-0 p-4 bg-base-100 border-t border-base-300 flex justify-end items-center gap-2">
                    <button onClick={handleCancel} className="btn btn-ghost">Cancel</button>
                    <button onClick={saveSettings} className="btn btn-primary">Save Changes</button>
                </footer>
            )}
        </main>
      </section>
      
      {modalFeedback && <FeedbackModal isOpen={!!modalFeedback} onClose={() => setModalFeedback(null)} message={modalFeedback.message} type={modalFeedback.type} />}
      <ConfirmationModal isOpen={isResetModalOpen} onClose={() => setIsResetModalOpen(false)} onConfirm={handleReset} title={`Confirm Reset`} message={'Are you sure you want to delete ALL application data? This is irreversible.'} />
      <ConfirmationModal isOpen={isDeleteCategoryModalOpen} onClose={() => setIsDeleteCategoryModalOpen(false)} onConfirm={handleConfirmDeleteGalleryCategory} title={`Delete "${categoryToDelete?.name}"`} message="Are you sure? Items in this category will become uncategorized." />
      <ConfirmationModal 
        isOpen={isRestartModalOpen} 
        onClose={() => setIsRestartModalOpen(false)} 
        onConfirm={handleConfirmRestart} 
        title="Restart and Clear Cache" 
        message="This will unregister the service worker, delete all cached application data, and reload the page. This is useful for fixing display issues after an update. Are you sure?"
        btnClassName="btn-warning"
      />
      
      {promptCategories && <PromptTxtImportModal isOpen={isTxtImportModalOpen} onClose={() => setIsTxtImportModalOpen(false)} categories={promptCategories} onImport={async (file, categoryId) => {
          const zip = await readZip(file);
          const promptsToSave: Omit<SavedPrompt, 'id' | 'createdAt'>[] = [];
          for(const relativePath in zip.files) {
              if (relativePath.toLowerCase().endsWith('.txt')) {
                  const text = await zip.files[relativePath].async('string');
                  if (text.trim()) {
                       promptsToSave.push({ text: text.trim(), title: relativePath.replace(/\.txt$/i, ''), categoryId: categoryId || undefined });
                  }
              }
          }
          if (promptsToSave.length > 0) {
              await addMultipleSavedPrompts(promptsToSave);
              showGlobalFeedback(`Imported ${promptsToSave.length} prompts!`);
          } else {
              showGlobalFeedback('No valid .txt files found in the zip.', true);
          }
          setIsTxtImportModalOpen(false);
      }} />}
    </>
  );
};