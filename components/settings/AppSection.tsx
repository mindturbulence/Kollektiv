import React, { useState, useEffect } from 'react';
import type { LLMSettings } from '../../types';
import { fileSystemManager, createZipAndDownload } from '../../utils/fileUtils';
import { getHandle } from '../../utils/db';
import { SettingRow, SettingsGroup } from './primitives';
import { audioService } from '../../services/audioService';
import { UploadIcon, DownloadIcon } from '../icons';
import { useSettings } from '../../contexts/SettingsContext';
import { verifyAndRepairFiles, rebuildGalleryDatabase, rebuildPromptDatabase, optimizeManifests } from '../../utils/integrity';

interface AppSectionProps {
    activeSubTab: string;
    settings: LLMSettings;
    handleSettingsChange: (field: keyof LLMSettings, value: any) => void;
    showGlobalFeedback: (message: string, isError?: boolean) => void;
    setActiveSubTab: (tab: string) => void;
    handleAuthConnect: (mode: 'youtube' | 'google') => void;
    handleGoogleDisconnect: () => void;
    isSyncing: boolean;
    setIsSyncing: (v: boolean) => void;
    isWorking: boolean;
    setIsWorking: (v: boolean) => void;
    setMaintenanceProgress: (v: number) => void;
    setMaintenanceMsg: (v: string) => void;
    onOpenRestartModal: () => void;
    onOpenResetModal: (target: 'all') => void;
    onOpenMigrationModal: (direction: 'push' | 'pull') => void;
}

const AppSection: React.FC<AppSectionProps> = ({
    activeSubTab,
    settings,
    handleSettingsChange,
    showGlobalFeedback,
    setActiveSubTab,
    handleAuthConnect,
    handleGoogleDisconnect,
    isSyncing,
    setIsSyncing,
    isWorking,
    setIsWorking,
    setMaintenanceProgress,
    setMaintenanceMsg,
    onOpenRestartModal,
    onOpenResetModal,
    onOpenMigrationModal,
}) => {
    const { settings: committedSettings } = useSettings();
    const [appDataDirectory, setAppDataDirectory] = useState<string | null>(fileSystemManager.appDirectoryName);
    const [hasCachedHandle, setHasCachedHandle] = useState(false);
    const [cachedDirName, setCachedDirName] = useState<string | null>(null);

    useEffect(() => {
        const checkCached = async () => {
            try {
                const handle = await getHandle<FileSystemDirectoryHandle>('app-data-dir');
                if (handle && typeof handle.name === 'string') {
                    setHasCachedHandle(true);
                    setCachedDirName(handle.name);
                }
            } catch (e) {
                console.warn("Error checking cached handle:", e);
            }
        };
        checkCached();
    }, []);

    useEffect(() => {
        setAppDataDirectory(fileSystemManager.appDirectoryName);
    }, [fileSystemManager.appDirectoryName]);

    const showFeedback = (message: string, isError: boolean = false) => {
        showGlobalFeedback(message, isError);
    };

    const handleIntegrityCheck = async () => {
        if (!fileSystemManager.isDirectorySelected()) {
            showGlobalFeedback("Please select a storage directory first.", true);
            return;
        }

        setIsSyncing(true);
        setIsWorking(true);
        setMaintenanceProgress(10);
        setMaintenanceMsg("INITIATING VAULT_INTEGRITY_CHECK...");

        try {
            setMaintenanceProgress(20);
            setMaintenanceMsg("VERIFYING_FILE_STRUCTURE...");
            await verifyAndRepairFiles((msg, p) => {
                setMaintenanceMsg(msg);
                if (p !== undefined) setMaintenanceProgress(20 + p * 20);
            }, committedSettings);

            setMaintenanceProgress(40);
            setMaintenanceMsg("REBUILDING_GALLERY_DATABASE...");
            await rebuildGalleryDatabase((msg) => setMaintenanceMsg(msg));
            setMaintenanceProgress(60);

            setMaintenanceMsg("REBUILDING_PROMPT_DATABASE...");
            await rebuildPromptDatabase((msg) => setMaintenanceMsg(msg));
            setMaintenanceProgress(80);

            setMaintenanceMsg("OPTIMIZING_MANIFESTS...");
            await optimizeManifests((msg) => setMaintenanceMsg(msg));

            setMaintenanceProgress(100);
            showGlobalFeedback("Vault synchronized successfully.");
        } catch (error: any) {
            console.error("Sync Vault Error:", error);
            showGlobalFeedback(`Sync Error: ${error.message || 'Unknown error'}`, true);
        } finally {
            setIsSyncing(false);
            setIsWorking(false);
            setMaintenanceProgress(0);
            setMaintenanceMsg("");
        }
    };

    const renderGeneral = () => (
        <div className="flex flex-col animate-fade-in">
            <SettingsGroup title="Storage">
            <SettingRow label="Storage Provider" desc="Choose between local sandbox directory and cloud Google Drive syncing.">
                <select
                    value={settings.storageProvider || 'local'}
                    onChange={async (e) => {
                        audioService.playClick();
                        const val = e.target.value as 'local' | 'drive';
                        const updatedSettings = { ...settings, storageProvider: val };
                        handleSettingsChange('storageProvider', val);

                        if (val === 'drive') {
                            const isTokenExpired = settings.googleIdentity?.connectedAt
                                ? (Date.now() - settings.googleIdentity.connectedAt > 50 * 60 * 1000)
                                : true;
                            if (!settings.googleIdentity?.isConnected || isTokenExpired || !settings.googleIdentity?.accessToken) {
                                showGlobalFeedback("Refreshing Google Drive secure session...", false);
                                handleAuthConnect('google');
                            } else {
                                const success = await fileSystemManager.initialize(updatedSettings, {} as any);
                                if (success) {
                                    setAppDataDirectory(fileSystemManager.appDirectoryName);
                                    const folderId = (fileSystemManager as any).rootFolderId;
                                    const finalSettings = {
                                        ...updatedSettings,
                                        driveFolderId: folderId || '',
                                        driveFolderName: (fileSystemManager as any).appDirectoryName || ''
                                    };
                                    handleSettingsChange('driveFolderId', finalSettings.driveFolderId);
                                    showFeedback('Drive Storage Initialized. Syncing databases...');
                                    await verifyAndRepairFiles(() => {}, finalSettings);
                                    showFeedback('Drive Storage Synced with GDrive.');
                                } else {
                                    showGlobalFeedback("Failed to sync with Google Drive folder - attempting refresh session.", true);
                                    handleAuthConnect('google');
                                }
                            }
                        } else {
                            await fileSystemManager.initialize(updatedSettings, {} as any);
                            setAppDataDirectory(fileSystemManager.appDirectoryName);
                            showFeedback("Switched to Local Directory Mode.");
                        }
                    }}
                    className="form-select select select-bordered max-w-xs font-mono font-bold text-xs uppercase"
                >
                    <option value="local">LOCAL STORAGE (BROWSER DIRECTORY)</option>
                    <option value="drive">GOOGLE DRIVE (CLOUD SECURE SYNC)</option>                            </select>
                        </SettingRow>

            {settings.storageProvider === 'drive' ? (
                <SettingRow label="Google Drive Sync" desc={settings.googleIdentity?.isConnected ? `Connected as: ${settings.googleIdentity.email}` : "Credentials required to sync with cloud folders."}>
                    {settings.googleIdentity?.isConnected ? (
                        <div className="flex items-center space-x-2">
                            <div className="text-[10px] font-black tracking-widest text-primary font-mono bg-primary/10 px-3 py-1.5 uppercase">
                                ACTIVE_SYNC
                            </div>
                            <button
                                onClick={() => {
                                    audioService.playClick();
                                    handleGoogleDisconnect();
                                }}
                                className="form-btn bg-error/10 hover:bg-error/20 border-error/20 hover:border-error/40 text-error px-4 text-xs font-mono font-bold uppercase"
                            >
                                DISCONNECT
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => {
                                audioService.playClick();
                                handleAuthConnect('google');
                            }}
                            className="form-btn form-btn-primary px-6 font-mono font-bold text-xs"
                        >
                            AUTHORIZE DRIVE
                        </button>
                    )}
                </SettingRow>
            ) : (
                <SettingRow label="Storage Vault" desc="Current active directory for all local generative artifacts.">
                    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
                        {appDataDirectory ? (
                            <span className="text-xs font-mono font-bold px-4 py-2 border border-white/10 bg-white/5 flex items-center shrink-0">
                                PATH: {appDataDirectory}
                            </span>
                        ) : hasCachedHandle ? (
                            <button onClick={async () => {
                                audioService.playClick();
                                const success = await fileSystemManager.requestExistingPermission();
                                if (success) {
                                    setAppDataDirectory(fileSystemManager.appDirectoryName);
                                    showFeedback('Vault Reconnected');
                                } else {
                                    showGlobalFeedback('Permission request failed. Choose folder manually.', true);
                                }
                            }} className="form-btn bg-primary/10 hover:bg-primary/20 text-primary border-primary/30 px-6 font-mono font-bold text-xs uppercase">
                                RECONNECT VAULT ({cachedDirName || 'CACHED'})
                            </button>
                        ) : null}
                        <button onClick={async () => {
                            audioService.playClick();
                            const handle = await fileSystemManager.selectAndSetAppDataDirectory();
                            if (handle) {
                                setAppDataDirectory(fileSystemManager.appDirectoryName);
                                showFeedback('Vault Connected');
                                setHasCachedHandle(true);
                                setCachedDirName(handle.name);
                            }
                        }} className="form-btn px-6 font-mono font-bold text-xs">
                            {appDataDirectory ? 'CHANGE VAULT' : 'CHOOSE FOLDER'}
                        </button>
                    </div>
                </SettingRow>                        )}
            </SettingsGroup>
            <SettingsGroup title="Engine Lifecycle">
            <SettingRow label="Cold Reboot" desc="Clear application cache and force-reload the interface.">
                <button onClick={() => { audioService.playClick(); onOpenRestartModal(); }} className="form-btn bg-warning text-warning-content border-warning px-6 font-mono font-bold text-xs">RELOAD ENGINE</button>
            </SettingRow>
            </SettingsGroup>
        </div>
    );

    const renderData = () => (
        <div className="flex flex-col animate-fade-in">
            <SettingsGroup title="Data Management">
            <SettingRow label="Sync & Reorganize" desc="Verify manifests and move files to correct category folders.">
                <button
                    onClick={() => { audioService.playClick(); handleIntegrityCheck(); }}
                    disabled={isSyncing}
                    className="form-btn px-6"
                >
                    {isSyncing ? 'SYNCING...' : 'SYNC VAULT'}
                </button>
            </SettingRow>
            <SettingRow label="Full Archival Export" desc="Generate a complete ZIP archive of all local data and files.">
                <button
                    onClick={() => { audioService.playClick(); createZipAndDownload([], 'kollektiv_backup.zip'); }}
                    disabled={isWorking}
                    className="form-btn form-btn-primary px-6"
                >
                    EXPORT ALL
                </button>
            </SettingRow>            <SettingRow label="Registry Purge" desc="Irreversible deletion of all settings, prompts, and media.">
                            <button onClick={() => { audioService.playClick(); onOpenResetModal('all'); }} className="form-btn bg-error text-error-content border-error px-6">WIPE STORAGE</button>
                        </SettingRow>
                     </SettingsGroup>
                     </div>
    );

    const renderMigration = () => (
        <div className="flex flex-col animate-fade-in gap-4">
            <SettingsGroup title="Cloud Sync">
            <SettingRow
                label="Sync to Google Drive (Push)"
                desc="Converts all new local images to JPG in-memory and uploads all prompts, gallery items, and configurations to Google Drive (keeps local originals completely unchanged)."
            >
                <button
                    onClick={async () => {
                        audioService.playClick();
                        if (!settings.googleIdentity?.isConnected) {
                            showGlobalFeedback("You must connect your Google Identity first in General settings.");
                            setActiveSubTab('general');
                            return;
                        }
                        onOpenMigrationModal('push');
                    }}
                    disabled={isWorking}
                    className="form-btn px-6 text-primary bg-primary/10 border-primary/20 hover:bg-primary/25"
                >
                    <UploadIcon className="w-4 h-4 mr-2" />
                    PUSH TO DRIVE
                </button>
            </SettingRow>

            <SettingRow
                label="Sync from Google Drive (Pull)"
                desc="Downloads all prompts, gallery items, and configuration files from Google Drive to your Local storage, synchronizing your offline database."
            >
                <button
                    onClick={async () => {
                        audioService.playClick();
                        if (!settings.googleIdentity?.isConnected) {
                            showGlobalFeedback("You must connect your Google Identity first in General settings.");
                            setActiveSubTab('general');
                            return;
                        }
                        onOpenMigrationModal('pull');
                    }}
                    disabled={isWorking}
                    className="form-btn px-6 text-secondary bg-secondary/10 border-secondary/20 hover:bg-secondary/25"
                >                        <DownloadIcon className="w-4 h-4 mr-2" />
                                PULL FROM DRIVE
                            </button>
                        </SettingRow>
                     </SettingsGroup>
                     </div>
    );

    switch (activeSubTab) {
        case 'general': return renderGeneral();
        case 'data': return renderData();
        case 'migration': return renderMigration();
        default: return null;
    }
};

export default AppSection;
