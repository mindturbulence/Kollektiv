import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import type { LLMSettings } from '../../types';
import { SettingRow, SettingsGroup } from './primitives';
import { NestedCategoryManager } from '../NestedCategoryManager';
import { audioService } from '../../services/audioService';
import { createZipAndDownload, fileSystemManager } from '../../utils/fileUtils';
import {
    loadCategories as loadGalleryCategoriesFS,
    addCategory as addGalleryCategoryFS,
    updateCategory as updateCategoryFS,
    deleteCategory as deleteGalleryCategoryFS,
    saveCategoriesOrder as saveGalleryCategoriesOrderFS,
    loadGalleryItems,
    replaceGalleryItemUrls,
} from '../../utils/galleryStorage';
import { convertToJpgWithMetadata } from '../../utils/imageFormatTools';
import {
    DownloadIcon, CloseIcon, CheckIcon, RefreshIcon,
    AlertTriangleIcon, PhotoIcon,
} from '../icons';

// ─── Types ────────────────────────────────────────────────────────────────────

type ConvertPhase = 'idle' | 'scanning' | 'scanned' | 'converting' | 'done';

interface NonJpgTarget {
    itemId: string;
    urlIndex: number;
    url: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

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
    // ── Converter modal state (hooks must live at the component top-level) ──

    const [converterOpen, setConverterOpen] = useState(false);
    const [phase, setPhase] = useState<ConvertPhase>('idle');

    // Scan state
    const [scanProgress, setScanProgress] = useState(0);   // 0–100
    const [scanTotal, setScanTotal]       = useState(0);
    const [targets, setTargets]           = useState<NonJpgTarget[]>([]);

    // Convert state
    const [convertProgress, setConvertProgress] = useState(0);
    const [currentFile, setCurrentFile]         = useState('');
    const [convertErrors, setConvertErrors]     = useState<string[]>([]);
    const [wasStopped, setWasStopped]           = useState(false);

    // Settings
    const [quality, setQuality] = useState<number>(settings.jpgCompressionQuality ?? 0.9);

    // Stop signal — a ref so async loops can read the latest value immediately
    const stopRef = useRef(false);

    // Keep quality in sync with settings changes while modal is closed
    useEffect(() => {
        if (!converterOpen) {
            setQuality(settings.jpgCompressionQuality ?? 0.9);
        }
    }, [settings.jpgCompressionQuality, converterOpen]);

    // ── Open handler (opens modal + kicks off scan immediately) ───────────

    const openConverter = useCallback(async () => {
        if (!fileSystemManager.isDirectorySelected()) return;

        audioService.playClick();

        // Reset all state before opening
        setPhase('scanning');
        setScanProgress(0);
        setScanTotal(0);
        setTargets([]);
        setConvertProgress(0);
        setCurrentFile('');
        setConvertErrors([]);
        setWasStopped(false);
        setQuality(settings.jpgCompressionQuality ?? 0.9);
        setConverterOpen(true);

        // ── Scan: find non-JPG images in the vault ──
        try {
            const items = await loadGalleryItems();
            const imageItems = items.filter(item => item.type === 'image');
            const total = imageItems.length;
            setScanTotal(total);

            const found: NonJpgTarget[] = [];

            for (let i = 0; i < imageItems.length; i++) {
                const item = imageItems[i];

                for (let j = 0; j < item.urls.length; j++) {
                    const url = item.urls[j];
                    // Skip data-URIs and external URLs — only local file paths
                    if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
                        continue;
                    }
                    const ext = url.split('.').pop()?.toLowerCase() ?? '';
                    if (ext !== 'jpg' && ext !== 'jpeg') {
                        found.push({ itemId: item.id, urlIndex: j, url });
                    }
                }

                setScanProgress(Math.round(((i + 1) / total) * 100));
                // Yield to the browser every 20 items so the progress bar animates
                if (i % 20 === 9) await new Promise<void>(r => setTimeout(r, 0));
            }

            setTargets(found);
        } catch (e) {
            console.error('[JpgConverter] scan error', e);
            setTargets([]);
        }

        setPhase('scanned');
    }, [settings.jpgCompressionQuality]);

    // ── Start conversion ──────────────────────────────────────────────────

    const startConvert = useCallback(async () => {
        audioService.playClick();
        stopRef.current = false;
        setWasStopped(false);
        setPhase('converting');
        setConvertProgress(0);
        setConvertErrors([]);

        const errList: string[] = [];
        let done = 0;

        // Group targets by itemId so we do one manifest write per gallery item
        const byItem = new Map<string, NonJpgTarget[]>();
        for (const t of targets) {
            if (!byItem.has(t.itemId)) byItem.set(t.itemId, []);
            byItem.get(t.itemId)!.push(t);
        }

        for (const [itemId, itemTargets] of byItem) {
            if (stopRef.current) break;

            const urlMap = new Map<string, string>();

            for (const target of itemTargets) {
                if (stopRef.current) break;

                const filename = target.url.split('/').pop() || target.url;
                setCurrentFile(filename);

                try {
                    const blob = await fileSystemManager.getFileAsBlob(target.url);
                    if (!blob) {
                        errList.push(`Cannot read: ${filename}`);
                        done++;
                        setConvertProgress(done);
                        continue;
                    }

                    const jpgBlob = await convertToJpgWithMetadata(blob, quality);

                    // Replace the extension with .jpg (handles any extension, including none)
                    const newUrl = target.url.replace(/\.[^/.]+$/, '') + '.jpg';

                    await fileSystemManager.saveFile(newUrl, jpgBlob);

                    // Queue old → new for this item's batch manifest update
                    if (newUrl !== target.url) {
                        urlMap.set(target.url, newUrl);
                    }
                } catch (e) {
                    errList.push(`Error converting ${filename}: ${e instanceof Error ? e.message : String(e)}`);
                }

                done++;
                setConvertProgress(done);
            }

            // Patch manifest + metadata JSON once for this item (atomic step)
            if (urlMap.size > 0) {
                try {
                    await replaceGalleryItemUrls(itemId, urlMap);
                    // Safe to delete originals now — manifest no longer references them
                    for (const [oldUrl] of urlMap) {
                        await fileSystemManager.deleteFile(oldUrl).catch(() => {});
                    }
                } catch (e) {
                    errList.push(`Failed to update manifest for item ${itemId}: ${e instanceof Error ? e.message : String(e)}`);
                }
            }
        }

        const stopped = stopRef.current;
        setWasStopped(stopped);
        setConvertErrors(errList);
        setConvertProgress(done);
        setPhase('done');

        // Notify gallery views that the manifest has changed
        window.dispatchEvent(new CustomEvent('gallery-manifest-healed'));
    }, [targets, quality]);

    // ── Stop / close ──────────────────────────────────────────────────────

    const handleStop = useCallback(() => {
        audioService.playClick();
        stopRef.current = true;
    }, []);

    const handleClose = useCallback(() => {
        // Never allow dismissal while an async operation is in flight
        if (phase === 'scanning' || phase === 'converting') return;
        audioService.playClick();
        setConverterOpen(false);
        setPhase('idle');
    }, [phase]);

    // ── Modal JSX (portalled to document.body so it floats above everything) ─

    const modalContent = converterOpen ? (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xl z-[1000] flex items-center justify-center p-4 animate-fade-in"
            onClick={phase === 'scanning' || phase === 'converting' ? undefined : handleClose}
            role="dialog"
            aria-modal="true"
        >
            <div
                className="flex flex-col bg-transparent w-full max-w-[560px] mx-auto relative p-[3px] corner-frame overflow-visible"
                onClick={e => e.stopPropagation()}
            >
                <div className="bg-base-100/90 backdrop-blur-2xl rounded-none w-full flex flex-col overflow-hidden relative z-10">

                    {/* ── Header ── */}
                    <header className="px-8 py-5 border-b border-base-content/10 bg-base-100/20 flex items-center justify-between flex-shrink-0">
                        <div className="min-w-0">
                            <h3 className="text-lg font-black tracking-tighter text-base-content leading-none uppercase">
                                JPG Vault Converter
                            </h3>
                            <p className="text-2xs font-black uppercase tracking-[0.3em] text-base-content/60 mt-1 truncate">
                                {phase === 'scanning'   ? 'SCANNING LOCAL STORAGE...'                                       :
                                 phase === 'scanned'    ? `${targets.length} NON-JPG FILE${targets.length !== 1 ? 'S' : ''} FOUND` :
                                 phase === 'converting' ? `CONVERTING ${convertProgress} / ${targets.length}`               :
                                 phase === 'done'       ? 'CONVERSION COMPLETE'                                             :
                                 'REDUCE STORAGE FOOTPRINT'}
                            </p>
                        </div>
                        {(phase === 'scanned' || phase === 'done') && (
                            <button
                                onClick={handleClose}
                                className="form-btn h-8 w-8 opacity-40 hover:opacity-100 flex-shrink-0 ml-4"
                                aria-label="Close"
                            >
                                <CloseIcon className="w-4 h-4" />
                            </button>
                        )}
                    </header>

                    {/* ── Body ── */}
                    <div className="p-8 space-y-6 min-h-[180px]">

                        {/* Scanning */}
                        {phase === 'scanning' && (
                            <div className="space-y-4 animate-fade-in">
                                <div className="flex items-center gap-3">
                                    <RefreshIcon className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
                                    <span className="text-2xs font-mono text-base-content/70">
                                        Scanning gallery images… {scanProgress}%
                                    </span>
                                </div>
                                <div className="w-full h-1.5 bg-base-300/50 relative overflow-hidden">
                                    <div
                                        className="absolute inset-y-0 left-0 bg-primary transition-all duration-200 ease-out"
                                        style={{ width: `${scanProgress}%` }}
                                    />
                                </div>
                                <p className="text-2xs font-mono text-base-content/60">
                                    Checking {scanTotal} image item{scanTotal !== 1 ? 's' : ''} for non-JPG formats…
                                </p>
                            </div>
                        )}

                        {/* Scanned results */}
                        {phase === 'scanned' && (
                            <div className="space-y-6 animate-fade-in">

                                {/* Summary banner */}
                                {targets.length === 0 ? (
                                    <div className="flex items-center gap-3 p-4 bg-success/5 border border-success/20">
                                        <CheckIcon className="w-5 h-5 text-success flex-shrink-0" />
                                        <div>
                                            <p className="text-2xs font-black uppercase tracking-widest text-success">
                                                All images are already JPG
                                            </p>
                                            <p className="text-2xs font-mono text-base-content/60 mt-0.5">
                                                Scanned {scanTotal} item{scanTotal !== 1 ? 's' : ''} — nothing to convert.
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20">
                                        <PhotoIcon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-2xs font-black uppercase tracking-widest text-primary">
                                                {targets.length} image{targets.length !== 1 ? 's' : ''} will be converted
                                            </p>
                                            <p className="text-2xs font-mono text-base-content/60 mt-0.5">
                                                PNG, WebP, and other non-JPG formats → JPG. Originals are replaced.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Quality slider — only shown when there's work to do */}
                                {targets.length > 0 && (
                                    <>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <label className="text-2xs font-black uppercase tracking-widest text-base-content/60">
                                                    JPG Compression Quality
                                                </label>
                                                <span className="text-2xs font-mono font-bold text-primary">
                                                    {Math.round(quality * 100)}%
                                                </span>
                                            </div>
                                            <input
                                                type="range"
                                                min={0.1} max={1.0} step={0.05}
                                                value={quality}
                                                onChange={e => setQuality(Number(e.currentTarget.value))}
                                                className="range range-xs range-primary w-full"
                                            />
                                            <div className="flex justify-between text-2xs font-mono text-base-content/60">
                                                <span>10% SMALL</span>
                                                <span>100% LOSSLESS</span>
                                            </div>
                                        </div>

                                        {/* Destructive-action warning */}
                                        <div className="flex items-start gap-2 p-3 bg-warning/5 border border-warning/15">
                                            <AlertTriangleIcon className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                                            <p className="text-2xs font-mono text-base-content/60 leading-relaxed">
                                                Original files will be permanently replaced with JPG versions.
                                                All metadata (prompts, tags, notes) is preserved in the gallery JSON.
                                                This action cannot be undone.
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Converting */}
                        {phase === 'converting' && (
                            <div className="space-y-4 animate-fade-in">
                                <div className="space-y-2">
                                    <div className="flex justify-between text-2xs font-mono font-bold">
                                        <span className="text-primary">CONVERTING</span>
                                        <span className="text-base-content/60">
                                            {convertProgress} / {targets.length}
                                        </span>
                                    </div>
                                    <div className="w-full h-1.5 bg-base-300/50 relative overflow-hidden">
                                        <div
                                            className="absolute inset-y-0 left-0 bg-primary transition-all duration-200 ease-out"
                                            style={{
                                                width: targets.length > 0
                                                    ? `${(convertProgress / targets.length) * 100}%`
                                                    : '0%',
                                            }}
                                        />
                                    </div>
                                </div>
                                {currentFile && (
                                    <p className="text-2xs font-mono text-base-content/60 truncate">
                                        → {currentFile}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Done */}
                        {phase === 'done' && (
                            <div className="space-y-4 animate-fade-in">
                                <div className="flex items-center gap-3 p-4 bg-success/5 border border-success/20">
                                    <CheckIcon className="w-5 h-5 text-success flex-shrink-0" />
                                    <div>
                                        <p className="text-2xs font-black uppercase tracking-widest text-success">
                                            {wasStopped
                                                ? `Stopped — converted ${convertProgress} of ${targets.length} image${targets.length !== 1 ? 's' : ''}`
                                                : `${convertProgress} image${convertProgress !== 1 ? 's' : ''} converted successfully`}
                                        </p>
                                        {convertErrors.length > 0 && (
                                            <p className="text-2xs font-mono text-warning mt-0.5">
                                                {convertErrors.length} error{convertErrors.length !== 1 ? 's' : ''} occurred — see below
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Error log */}
                                {convertErrors.length > 0 && (
                                    <div className="p-3 bg-error/5 border border-error/15 max-h-36 overflow-y-auto custom-scrollbar space-y-1">
                                        {convertErrors.map((err, i) => (
                                            <p key={i} className="text-2xs font-mono text-error/70 leading-relaxed">
                                                {err}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Footer ── */}
                    <footer className="h-14 flex items-stretch bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 flex-shrink-0 panel-footer">

                        {/* Scanning: no buttons — operation runs automatically */}

                        {phase === 'scanned' && (
                            <>
                                <button
                                    onClick={handleClose}
                                    className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider uppercase btn-snake no-glow active:no-glow"
                                >
                                    <span /><span /><span /><span />
                                    CLOSE
                                </button>
                                {targets.length > 0 && (
                                    <button
                                        onClick={startConvert}
                                        className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider uppercase btn-snake text-primary no-glow active:no-glow"
                                    >
                                        <span /><span /><span /><span />
                                        START CONVERT
                                    </button>
                                )}
                            </>
                        )}

                        {phase === 'converting' && (
                            <button
                                onClick={handleStop}
                                className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider uppercase btn-snake text-error/70 hover:text-error no-glow active:no-glow"
                            >
                                <span /><span /><span /><span />
                                STOP CONVERT
                            </button>
                        )}

                        {phase === 'done' && (
                            <button
                                onClick={handleClose}
                                className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider uppercase btn-snake text-primary no-glow active:no-glow"
                            >
                                <span /><span /><span /><span />
                                CLOSE
                            </button>
                        )}
                    </footer>
                </div>
            </div>
        </div>
    ) : null;

    const portal = modalContent && typeof document !== 'undefined'
        ? ReactDOM.createPortal(modalContent, document.body)
        : null;

    // ── Render sub-tabs ───────────────────────────────────────────────────

    switch (activeSubTab) {
        case 'categories':
            return (
                <>
                    {portal}
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
                </>
            );

        case 'data':
            return (
                <>
                    {portal}
                    <div className="flex flex-col h-full animate-fade-in">

                        <SettingsGroup title="Export">
                            <SettingRow
                                label="Bulk Export"
                                desc="Package all gallery artifacts into a single ZIP archive for backup."
                            >
                                <button
                                    onClick={() => { audioService.playClick(); void createZipAndDownload([], 'gallery_archive.zip'); }}
                                    className="form-btn form-btn-primary px-6"
                                >
                                    <DownloadIcon className="w-4 h-4 mr-2" />
                                    DOWNLOAD VAULT
                                </button>
                            </SettingRow>
                        </SettingsGroup>

                        <SettingsGroup title="Storage Format">
                            <SettingRow
                                label="Convert Media to JPG (Local Storage)"
                                desc="Automatically convert saved images to JPG format when using Local Storage. Metadata will be preserved."
                            >
                                <input
                                    type="checkbox"
                                    checked={settings.convertImageToJpgLocal || false}
                                    onChange={(e) => { audioService.playClick(); handleSettingsChange('convertImageToJpgLocal', e.target.checked); }}
                                    className="toggle toggle-primary toggle-sm"
                                />
                            </SettingRow>

                            <SettingRow
                                label="Convert Media to JPG (Google Drive)"
                                desc="Automatically convert saved images to JPG format when using Google Drive storage. Metadata will be preserved."
                            >
                                <input
                                    type="checkbox"
                                    checked={settings.convertImageToJpgDrive ?? true}
                                    onChange={(e) => { audioService.playClick(); handleSettingsChange('convertImageToJpgDrive', e.target.checked); }}
                                    className="toggle toggle-primary toggle-sm"
                                />
                            </SettingRow>

                            {(settings.convertImageToJpgLocal || settings.convertImageToJpgDrive) && (
                                <SettingRow
                                    label="JPG Compression Quality"
                                    desc="Adjust the compression level for JPG conversion (10% to 100%)."
                                >
                                    <div className="flex items-center gap-4 w-48">
                                        <input
                                            type="range"
                                            min={0.1} max={1.0} step={0.1}
                                            value={settings.jpgCompressionQuality || 0.9}
                                            onChange={(e) => handleSettingsChange('jpgCompressionQuality', Number(e.currentTarget.value))}
                                            className="range range-xs range-primary"
                                        />
                                        <span className="text-2xs font-mono font-bold text-primary">
                                            {Math.round((settings.jpgCompressionQuality || 0.9) * 100)}%
                                        </span>
                                    </div>
                                </SettingRow>
                            )}
                        </SettingsGroup>

                        <SettingsGroup title="Bulk Convert">
                            <SettingRow
                                label="Convert All to JPG"
                                desc="Scan the vault for non-JPG images and convert them in-place. Gallery manifest and metadata JSON files are updated automatically. Goal: reduce storage footprint."
                            >
                                <button
                                    onClick={openConverter}
                                    disabled={!fileSystemManager.isDirectorySelected()}
                                    title={!fileSystemManager.isDirectorySelected() ? 'Select a storage vault first (Application → General)' : undefined}
                                    className="form-btn px-6"
                                >
                                    <PhotoIcon className="w-4 h-4 mr-2" />
                                    CONVERT
                                </button>
                            </SettingRow>
                        </SettingsGroup>

                    </div>
                </>
            );

        default:
            return null;
    }
};

export default GallerySection;
