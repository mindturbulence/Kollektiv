import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import AppSection from './AppSection';
import type { LLMSettings } from '../../types';

// ─── Mock external dependencies ──────────────────────────────────────

vi.mock('../../utils/fileUtils', () => ({
    fileSystemManager: {
        appDirectoryName: 'KollektivVault',
        isDirectorySelected: vi.fn(() => true),
        initialize: vi.fn(async () => true),
        selectAndSetAppDataDirectory: vi.fn(async () => ({ name: 'TestVault' })),
        requestExistingPermission: vi.fn(async () => true),
    },
    createZipAndDownload: vi.fn(),
}));

vi.mock('../../utils/db', () => ({
    getHandle: vi.fn(async () => null),
}));

vi.mock('../../services/audioService', () => ({
    audioService: { playClick: vi.fn() },
}));

vi.mock('../../utils/googleAuth', () => ({
    isGoogleAuthValid: vi.fn(() => false),
    requestSilentTokenRefresh: vi.fn(() => false),
    trySilentRefreshWithWait: vi.fn(async () => false),
}));

vi.mock('../../utils/integrity', () => ({
    verifyAndRepairFiles: vi.fn(async (_cb: any, _settings: any) => {}),
    rebuildGalleryDatabase: vi.fn(async (_cb: any) => {}),
    rebuildPromptDatabase: vi.fn(async (_cb: any) => {}),
    optimizeManifests: vi.fn(async (_cb: any) => {}),
    getGenerationCoverageReport: vi.fn(async () => ({ totalItems: 0, itemsWithoutGenerationPct: 0, danglingGenerations: 0 })),
}));

vi.mock('../icons', () => ({
    UploadIcon: () => <span data-testid="upload-icon" />,
    DownloadIcon: () => <span data-testid="download-icon" />,
}));

vi.mock('../../contexts/SettingsContext', () => ({
    useSettings: () => ({ settings: { activeLLM: 'gemini' } }),
}));

// Import mock references for assertions in tests
import { createZipAndDownload } from '../../utils/fileUtils';
import { isGoogleAuthValid } from '../../utils/googleAuth';

// ─── Helpers ─────────────────────────────────────────────────────────

const defaultProps = {
    activeSubTab: 'general',
    settings: { storageProvider: 'local', driveFolderId: '', driveFolderName: '' } as LLMSettings,
    handleSettingsChange: vi.fn(),
    showGlobalFeedback: vi.fn(),
    setActiveSubTab: vi.fn(),
    handleAuthConnect: vi.fn(),
    handleGoogleDisconnect: vi.fn(),
    handleSpotifyDisconnect: vi.fn(),
    isSyncing: false,
    setIsSyncing: vi.fn(),
    isWorking: false,
    setIsWorking: vi.fn(),
    setMaintenanceProgress: vi.fn(),
    setMaintenanceMsg: vi.fn(),
    onOpenRestartModal: vi.fn(),
    onOpenResetModal: vi.fn(),
    onOpenMigrationModal: vi.fn(),
};

beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
});

// ─── General tab: Storage Provider ───────────────────────────────────

describe('AppSection — Storage Provider (general tab)', () => {
    it('renders the storage provider dropdown with local selected by default', () => {
        render(<AppSection {...defaultProps} />);
        const selects = screen.getAllByRole('combobox');
        expect(selects.length).toBe(1);
        expect((selects[0] as HTMLSelectElement).value).toBe('local');
    });

    it('renders LOCAL STORAGE and GOOGLE DRIVE options', () => {
        render(<AppSection {...defaultProps} />);
        expect(screen.getByText('LOCAL STORAGE (BROWSER DIRECTORY)')).toBeTruthy();
        expect(screen.getByText('GOOGLE DRIVE (CLOUD SECURE SYNC)')).toBeTruthy();
    });

    it('switching to drive calls handleSettingsChange and handleAuthConnect when not authenticated', () => {
        const handleSettingsChange = vi.fn();
        const handleAuthConnect = vi.fn();
        render(
            <AppSection
                {...defaultProps}
                handleSettingsChange={handleSettingsChange}
                handleAuthConnect={handleAuthConnect}
            />
        );
        const selects = screen.getAllByRole('combobox');
        fireEvent.change(selects[0], { target: { value: 'drive' } });
        expect(handleSettingsChange).toHaveBeenCalledWith('storageProvider', 'drive');
        // Silent refresh fails (mocked to return false), so it falls through to auth connect
        expect(handleAuthConnect).toHaveBeenCalledWith('google');
    });

    it('shows ACTIVE_SYNC status and DISCONNECT button when Google is connected on drive mode', () => {
        render(
            <AppSection
                {...defaultProps}
                settings={{
                    storageProvider: 'drive',
                    googleIdentity: { isConnected: true, email: 'user@test.com' },
                } as LLMSettings}
            />
        );
        expect(screen.getByText('ACTIVE_SYNC')).toBeTruthy();
        expect(screen.getByText('DISCONNECT')).toBeTruthy();
        expect(screen.getByText(/user@test.com/)).toBeTruthy();
    });

    it('shows AUTHORIZE DRIVE button when Google is not connected on drive mode', () => {
        render(
            <AppSection
                {...defaultProps}
                settings={{
                    storageProvider: 'drive',
                    googleIdentity: { isConnected: false },
                } as LLMSettings}
            />
        );
        expect(screen.getByText('AUTHORIZE DRIVE')).toBeTruthy();
    });

    it('clicking DISCONNECT calls handleGoogleDisconnect', () => {
        const handleGoogleDisconnect = vi.fn();
        render(
            <AppSection
                {...defaultProps}
                handleGoogleDisconnect={handleGoogleDisconnect}
                settings={{
                    storageProvider: 'drive',
                    googleIdentity: { isConnected: true, email: 'user@test.com' },
                } as LLMSettings}
            />
        );
        fireEvent.click(screen.getByText('DISCONNECT'));
        expect(handleGoogleDisconnect).toHaveBeenCalledOnce();
    });

    it('clicking AUTHORIZE DRIVE calls handleAuthConnect', () => {
        const handleAuthConnect = vi.fn();
        render(
            <AppSection
                {...defaultProps}
                handleAuthConnect={handleAuthConnect}
                settings={{
                    storageProvider: 'drive',
                    googleIdentity: { isConnected: false },
                } as LLMSettings}
            />
        );
        fireEvent.click(screen.getByText('AUTHORIZE DRIVE'));
        expect(handleAuthConnect).toHaveBeenCalledWith('google');
    });

    it('shows Storage Vault section with CHOOSE FOLDER when no directory selected', async () => {
        // Override mock to simulate no directory selected
        const { fileSystemManager } = await import('../../utils/fileUtils');
        const origName = fileSystemManager.appDirectoryName;
        const origFn = fileSystemManager.isDirectorySelected;
        fileSystemManager.appDirectoryName = '';
        fileSystemManager.isDirectorySelected = vi.fn(() => false);
        render(<AppSection {...defaultProps} />);
        expect(screen.getByText('CHOOSE FOLDER')).toBeTruthy();
        // Restore to avoid leaking into subsequent tests
        fileSystemManager.appDirectoryName = origName;
        fileSystemManager.isDirectorySelected = origFn;
    });

    it('shows CHANGE VAULT button when directory is already selected', () => {
        // By default appDirectoryName is 'KollektivVault', so the path is shown
        render(<AppSection {...defaultProps} />);
        expect(screen.getByText(/PATH:/)).toBeTruthy();
        expect(screen.getByText('CHANGE VAULT')).toBeTruthy();
    });

    it('shows Cold Reboot section with RELOAD ENGINE button', () => {
        render(<AppSection {...defaultProps} />);
        expect(screen.getByText('Cold Reboot')).toBeTruthy();
        expect(screen.getByText('RELOAD ENGINE')).toBeTruthy();
    });

    it('clicking RELOAD ENGINE calls onOpenRestartModal', () => {
        const onOpenRestartModal = vi.fn();
        render(<AppSection {...defaultProps} onOpenRestartModal={onOpenRestartModal} />);
        fireEvent.click(screen.getByText('RELOAD ENGINE'));
        expect(onOpenRestartModal).toHaveBeenCalledOnce();
    });
});

// ─── Data tab: Sync, Export, Reset ───────────────────────────────────

describe('AppSection — Data Management (data tab)', () => {
    it('renders SYNC VAULT button', () => {
        render(<AppSection {...defaultProps} activeSubTab="data" />);
        expect(screen.getByText('SYNC VAULT')).toBeTruthy();
    });

    it('renders EXPORT ALL button', () => {
        render(<AppSection {...defaultProps} activeSubTab="data" />);
        expect(screen.getByText('EXPORT ALL')).toBeTruthy();
    });

    it('renders WIPE STORAGE button', () => {
        render(<AppSection {...defaultProps} activeSubTab="data" />);
        expect(screen.getByText('WIPE STORAGE')).toBeTruthy();
    });

    it('clicking WIPE STORAGE calls onOpenResetModal with "all"', () => {
        const onOpenResetModal = vi.fn();
        render(
            <AppSection {...defaultProps} activeSubTab="data" onOpenResetModal={onOpenResetModal} />
        );
        fireEvent.click(screen.getByText('WIPE STORAGE'));
        expect(onOpenResetModal).toHaveBeenCalledWith('all');
    });

    it('clicking EXPORT ALL calls createZipAndDownload', () => {
        render(<AppSection {...defaultProps} activeSubTab="data" />);
        fireEvent.click(screen.getByText('EXPORT ALL'));
        expect(createZipAndDownload).toHaveBeenCalled();
    });
});

// ─── Migration tab: Push / Pull ──────────────────────────────────────

describe('AppSection — Cloud Sync (migration tab)', () => {
    it('renders PUSH TO DRIVE button', () => {
        render(<AppSection {...defaultProps} activeSubTab="migration" />);
        expect(screen.getByText('PUSH TO DRIVE')).toBeTruthy();
    });

    it('renders PULL FROM DRIVE button', () => {
        render(<AppSection {...defaultProps} activeSubTab="migration" />);
        expect(screen.getByText('PULL FROM DRIVE')).toBeTruthy();
    });

    it('shows upload and download icons', () => {
        render(<AppSection {...defaultProps} activeSubTab="migration" />);
        expect(screen.getByTestId('upload-icon')).toBeTruthy();
        expect(screen.getByTestId('download-icon')).toBeTruthy();
    });

    it('clicking PUSH TO DRIVE shows feedback and redirects when not authenticated', () => {
        const showGlobalFeedback = vi.fn();
        const setActiveSubTab = vi.fn();
        const handleAuthConnect = vi.fn();
        render(
            <AppSection
                {...defaultProps}
                activeSubTab="migration"
                showGlobalFeedback={showGlobalFeedback}
                setActiveSubTab={setActiveSubTab}
                handleAuthConnect={handleAuthConnect}
            />
        );
        fireEvent.click(screen.getByText('PUSH TO DRIVE'));
        expect(showGlobalFeedback).toHaveBeenCalled();
        expect(setActiveSubTab).toHaveBeenCalledWith('general');
        expect(handleAuthConnect).toHaveBeenCalledWith('google');
    });

    it('clicking PULL FROM DRIVE shows feedback and redirects when not authenticated', () => {
        const showGlobalFeedback = vi.fn();
        const setActiveSubTab = vi.fn();
        const handleAuthConnect = vi.fn();
        render(
            <AppSection
                {...defaultProps}
                activeSubTab="migration"
                showGlobalFeedback={showGlobalFeedback}
                setActiveSubTab={setActiveSubTab}
                handleAuthConnect={handleAuthConnect}
            />
        );
        fireEvent.click(screen.getByText('PULL FROM DRIVE'));
        expect(showGlobalFeedback).toHaveBeenCalled();
        expect(setActiveSubTab).toHaveBeenCalledWith('general');
        expect(handleAuthConnect).toHaveBeenCalledWith('google');
    });

    it('opens migration modal when already authenticated for push', () => {
        vi.mocked(isGoogleAuthValid).mockReturnValue(true);
        const onOpenMigrationModal = vi.fn();
        render(
            <AppSection
                {...defaultProps}
                activeSubTab="migration"
                onOpenMigrationModal={onOpenMigrationModal}
            />
        );
        fireEvent.click(screen.getByText('PUSH TO DRIVE'));
        expect(onOpenMigrationModal).toHaveBeenCalledWith('push');
    });

    it('opens migration modal when already authenticated for pull', () => {
        vi.mocked(isGoogleAuthValid).mockReturnValue(true);
        const onOpenMigrationModal = vi.fn();
        render(
            <AppSection
                {...defaultProps}
                activeSubTab="migration"
                onOpenMigrationModal={onOpenMigrationModal}
            />
        );
        fireEvent.click(screen.getByText('PULL FROM DRIVE'));
        expect(onOpenMigrationModal).toHaveBeenCalledWith('pull');
    });
});

// ─── Tab switching ───────────────────────────────────────────────────

describe('AppSection — tab switching', () => {
    it('renders general tab content by default', () => {
        render(<AppSection {...defaultProps} />);
        expect(screen.getByText('Storage Provider')).toBeTruthy();
    });

    it('renders data tab content when activeSubTab is "data"', () => {
        render(<AppSection {...defaultProps} activeSubTab="data" />);
        expect(screen.getByText('Data Management')).toBeTruthy();
    });

    it('renders migration tab content when activeSubTab is "migration"', () => {
        render(<AppSection {...defaultProps} activeSubTab="migration" />);
        expect(screen.getByText('Cloud Sync')).toBeTruthy();
    });

    it('returns null for unknown tab', () => {
        const { container } = render(
            <AppSection {...defaultProps} activeSubTab="unknown" />
        );
        expect(container.innerHTML).toBe('');
    });
});
