import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FilmIcon, PlayIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';
import JSZip from 'jszip';
import { COMPOSER_PRESETS } from '../constants';
import GalleryPickerModal from './GalleryPickerModal';
import type { GalleryItem } from '../types';
import { fileSystemManager } from '../utils/fileUtils';

type EditorTab = 'extractor' | 'joiner';
type ExtractionUnit = 'seconds' | 'minutes' | 'frames';
type FitMode = 'contain' | 'cover';

interface ExtractedFrame {
    id: string;
    url: string;
    timestamp: number;
    blob: Blob;
}

interface JoinableVideo {
    id: string;
    file: File | null;
    url: string;
    duration: number;
    title: string;
    width: number;
    height: number;
}

const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
};

export const VideoToFrames: React.FC = () => {
    const [activeTab, setActiveTab] = useState<EditorTab>('extractor');
    
    const [extractorVideo, setExtractorVideo] = useState<File | string | null>(null);
    const [extractorUrl, setExtractorUrl] = useState('');
    const [frames, setFrames] = useState<ExtractedFrame[]>([]);
    const [isExtracting, setIsExtracting] = useState(false);
    const [extractionProgress, setExtractionProgress] = useState(0);
    const [intervalValue, setIntervalValue] = useState(1);
    const [intervalUnit, setIntervalUnit] = useState<ExtractionUnit>('seconds');
    const extractorVideoRef = useRef<HTMLVideoElement>(null);

    const [joinFiles, setJoinFiles] = useState<JoinableVideo[]>([]);
    const [isJoining, setIsJoining] = useState(false);
    const [joiningProgress, setJoiningProgress] = useState(0);
    const [joinedVideoUrl, setJoinedVideoUrl] = useState<string | null>(null);
    const [outputFormat, setOutputFormat] = useState<'webm' | 'mp4'>('webm');
    const [actualExtension, setActualExtension] = useState('webm');
    const [isFormatSupported, setIsFormatSupported] = useState(true);
    const [joinRes, setJoinRes] = useState({ width: 1920, height: 1080 });
    const [joinFit, setJoinFit] = useState<FitMode>('contain');
    const [keepOriginalRatio, setKeepOriginalRatio] = useState(true);
    
    const joinVideoRef = useRef<HTMLVideoElement>(null);
    const joinCanvasRef = useRef<HTMLCanvasElement>(null);
    const mediaRecorderRef = useRef<any>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const animationFrameRef = useRef<number | null>(null);
    
    const [isPickerOpen, setIsPickerOpen] = useState(false);

    // Sync Join Resolution if Keep Ratio is enabled
    useEffect(() => {
        if (keepOriginalRatio && joinFiles.length > 0) {
            const first = joinFiles[0];
            setJoinRes({ width: first.width, height: first.height });
        }
    }, [keepOriginalRatio, joinFiles]);

    useEffect(() => {
        const mimeType = outputFormat === 'mp4' ? 'video/mp4' : 'video/webm';
        setIsFormatSupported((window as any).MediaRecorder?.isTypeSupported(mimeType));
    }, [outputFormat]);

    const handleExtractorFileSelect = (file: File) => {
        if (!file.type.startsWith('video/')) return;
        if (extractorUrl) URL.revokeObjectURL(extractorUrl);
        setExtractorUrl(URL.createObjectURL(file));
        setExtractorVideo(file);
        setFrames([]);
    };

    const handleLibrarySelect = async (items: GalleryItem[]) => {
        if (!items.length) return;
        
        if (activeTab === 'extractor') {
            const gItem = items[0];
            const blob = await fileSystemManager.getFileAsBlob(gItem.urls[0]);
            if (!blob) return;
            if (extractorUrl) URL.revokeObjectURL(extractorUrl);
            setExtractorUrl(URL.createObjectURL(blob));
            setExtractorVideo(gItem.title);
            setFrames([]);
        } else {
            // Joiner Mode
            const newVideos = await Promise.all(items.map(async (gItem): Promise<JoinableVideo | null> => {
                const blob = await fileSystemManager.getFileAsBlob(gItem.urls[0]);
                if (!blob) return null;
                const url = URL.createObjectURL(blob);
                const metadata = await new Promise<{duration: number, width: number, height: number}>((res) => {
                    const v = (window as any).document.createElement('video');
                    v.src = url;
                    v.onloadedmetadata = () => res({
                        duration: v.duration,
                        width: v.videoWidth,
                        height: v.videoHeight
                    });
                });
                return { 
                    id: gItem.id + Math.random().toString(36).substr(2, 5), 
                    file: null, 
                    url, 
                    duration: metadata.duration,
                    width: metadata.width,
                    height: metadata.height,
                    title: gItem.title
                };
            }));
            const validVideos = newVideos.filter((v): v is JoinableVideo => v !== null);
            setJoinFiles(prev => [...prev, ...validVideos]);
        }
    };

    const extractSingleFrame = useCallback(async (time: number): Promise<ExtractedFrame | null> => {
        const video = extractorVideoRef.current;
        if (!video) return null;

        return new Promise((resolve) => {
            const onSeeked = () => {
                (video as any).removeEventListener('seeked', onSeeked);
                const canvas = (window as any).document.createElement('canvas');
                canvas.width = (video as any).videoWidth;
                canvas.height = (video as any).videoHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob((blob: any) => {
                        if (blob) {
                            resolve({
                                id: Math.random().toString(36).substr(2, 9),
                                url: URL.createObjectURL(blob),
                                timestamp: time,
                                blob
                            });
                        } else resolve(null);
                    }, 'image/jpeg', 0.95);
                } else resolve(null);
            };
            (video as any).addEventListener('seeked', onSeeked);
            (video as any).currentTime = Math.min(time, (video as any).duration - 0.1);
        });
    }, []);

    const handleBatchExtract = async () => {
        const video = extractorVideoRef.current;
        if (!video || isExtracting) return;
        setIsExtracting(true);
        setExtractionProgress(0);
        const duration = (video as any).duration;
        const newFrames: ExtractedFrame[] = [];
        let step = intervalValue;
        if (intervalUnit === 'minutes') step = intervalValue * 60;
        if (intervalUnit === 'frames') step = intervalValue * (1/30);
        if (step <= 0) step = 1;
        for (let t = 0; t <= duration; t += step) {
            const frame = await extractSingleFrame(t);
            if (frame) newFrames.push(frame);
            setExtractionProgress((t / duration) * 100);
        }
        setFrames(prev => [...newFrames, ...prev]);
        setIsExtracting(false);
    };

    const handleCaptureCurrent = async () => {
        const video = extractorVideoRef.current;
        if (!video) return;
        const frame = await extractSingleFrame((video as any).currentTime);
        if (frame) setFrames(prev => [frame, ...prev]);
    };

    const downloadAllFrames = async () => {
        if (frames.length === 0) return;
        const zip = new JSZip();
        frames.forEach((f, i) => { zip.file(`frame_${String(i).padStart(3, '0')}_${f.timestamp.toFixed(2)}s.jpg`, f.blob); });
        const content = await zip.generateAsync({ type: "blob" });
        const link = (window as any).document.createElement('a');
        link.href = URL.createObjectURL(content);
        const vidTitle = typeof extractorVideo === 'string' ? extractorVideo : extractorVideo?.name || 'video';
        link.download = `frames_${vidTitle}.zip`;
        link.click();
    };

    const handleJoinFilesSelect = async (files: FileList | null) => {
        if (!files) return;
        const newVideos = await Promise.all(Array.from(files).map(async (file) => {
            const url = URL.createObjectURL(file);
            const metadata = await new Promise<{duration: number, width: number, height: number}>((res) => {
                const v = (window as any).document.createElement('video');
                v.src = url;
                v.onloadedmetadata = () => res({
                    duration: v.duration,
                    width: v.videoWidth,
                    height: v.videoHeight
                });
            });
            return { 
                id: Math.random().toString(36).substr(2, 9), 
                file, 
                url, 
                duration: metadata.duration,
                width: metadata.width,
                height: metadata.height,
                title: file.name 
            };
        }));
        setJoinFiles(prev => [...prev, ...newVideos]);
    };

    const handleJoinVideos = async () => {
        if (joinFiles.length < 1 || isJoining) return;
        setIsJoining(true); setJoiningProgress(0); recordedChunksRef.current = [];
        const streamVideo = joinVideoRef.current; const streamCanvas = joinCanvasRef.current;
        if (!streamVideo || !streamCanvas) { setIsJoining(false); return; }
        const ctx = (streamCanvas as any).getContext('2d');
        if (!ctx) { setIsJoining(false); return; }
        (streamCanvas as any).width = joinRes.width; (streamCanvas as any).height = joinRes.height;
        const stream = (streamCanvas as any).captureStream(30);
        
        let mimeType = 'video/webm;codecs=vp8';
        if (outputFormat === 'mp4') {
            const mp4Types = ['video/mp4;codecs=h264', 'video/mp4;codecs=avc1', 'video/mp4'];
            const supported = mp4Types.find(t => (window as any).MediaRecorder.isTypeSupported(t));
            if (supported) mimeType = supported;
        } else {
            const webmTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
            const supported = webmTypes.find(t => (window as any).MediaRecorder.isTypeSupported(t));
            if (supported) mimeType = supported;
        }

        const recorder = new (window as any).MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (e: any) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
        recorder.onstop = () => {
            const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType });
            setJoinedVideoUrl(URL.createObjectURL(blob)); setIsJoining(false);
            setActualExtension(recorder.mimeType.includes('mp4') ? 'mp4' : 'webm');
            if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
        };
        let currentIndex = 0;
        const drawLoop = () => {
            ctx.fillStyle = 'black'; ctx.fillRect(0, 0, (streamCanvas as any).width, (streamCanvas as any).height);
            const vWidth = (streamVideo as any).videoWidth || 1; const vHeight = (streamVideo as any).videoHeight || 1;
            const cWidth = (streamCanvas as any).width; const cHeight = (streamCanvas as any).height;
            let dx = 0, dy = 0, dw = cWidth, dh = cHeight;
            if (joinFit === 'contain') { const scale = Math.min(cWidth / vWidth, cHeight / vHeight); dw = vWidth * scale; dh = vHeight * scale; dx = (cWidth / 2) - (dw / 2); dy = (cHeight / 2) - (dh / 2); }
            else { const scale = Math.max(cWidth / vWidth, cHeight / vHeight); dw = vWidth * scale; dh = vHeight * scale; dx = (cWidth / 2) - (dw / 2); dy = (cHeight / 2) - (dh / 2); }
            ctx.drawImage(streamVideo, dx, dy, dw, dh); animationFrameRef.current = requestAnimationFrame(drawLoop);
        };
        const playNext = async () => {
            if (currentIndex >= joinFiles.length) { setTimeout(() => recorder.stop(), 500); return; }
            const currentVideo = joinFiles[currentIndex]; (streamVideo as any).src = currentVideo.url;
            await new Promise<void>((resolve) => { (streamVideo as any).onloadeddata = () => resolve(); });
            try { await (streamVideo as any).play(); currentIndex++; setJoiningProgress((currentIndex / joinFiles.length) * 100); }
            catch (err) { recorder.stop(); }
        };
        (streamVideo as any).onended = playNext; recorder.start(); drawLoop(); playNext();
    };

    const removeJoinItem = (id: string) => { setJoinFiles(prev => prev.filter(v => { if (v.id === id) { URL.revokeObjectURL(v.url); return false; } return true; })); };

    return (
        <div className="h-full bg-transparent flex flex-col overflow-hidden p-0">
            <div className="flex-grow flex flex-col lg:flex-row overflow-hidden gap-4">
                <aside className="w-full lg:w-96 flex-shrink-0 flex flex-col relative p-[3px] corner-frame overflow-visible z-10">
                    <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
                        <div className="h-14 flex items-stretch flex-shrink-0 bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5">
                            <button onClick={() => setActiveTab('extractor')} className={`btn btn-sm h-full rounded-none flex-1 font-normal text-[11px] tracking-wider uppercase px-1 truncate btn-snake font-display ${activeTab === 'extractor' ? 'btn-ghost text-primary font-black shadow-none drop-shadow-none [text-shadow:none] [filter:none]' : 'btn-ghost text-base-content/40 hover:text-primary'}`}>
                                <span/><span/><span/><span/>
                                FRAME EXTRACTOR
                            </button>
                            <button onClick={() => setActiveTab('joiner')} className={`btn btn-sm h-full rounded-none flex-1 font-normal text-[11px] tracking-wider uppercase px-1 truncate btn-snake font-display ${activeTab === 'joiner' ? 'btn-ghost text-primary font-black shadow-none drop-shadow-none [text-shadow:none] [filter:none]' : 'btn-ghost text-base-content/40 hover:text-primary'}`}>
                                <span/><span/><span/><span/>
                                VIDEO JOINER
                            </button>
                        </div>

                        <div className="flex-grow p-6 space-y-8 overflow-y-auto bg-transparent">
                            {activeTab === 'extractor' ? (
                                <div className="space-y-6">
                                    <div>
                                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-4 block">Extraction settings</label>
                                        <div className="form-control mb-4">
                                            <label className="label py-1"><span className="label-text text-[10px] font-black uppercase text-base-content/30">Step Unit</span></label>
                                            <select className="form-select w-full" value={intervalUnit} onChange={(e) => setIntervalUnit((e.currentTarget as any).value as ExtractionUnit)}>
                                                <option value="seconds">Seconds</option>
                                                <option value="minutes">Minutes</option>
                                                <option value="frames">Frames</option>
                                            </select>
                                        </div>
                                        <div className="form-control">
                                            <label className="label py-1"><span className="label-text text-[10px] font-black uppercase text-base-content/30">Interval</span></label>
                                            <input type="number" step="0.1" min="0.1" value={intervalValue} onChange={(e) => setIntervalValue(parseFloat((e.currentTarget as any).value) || 1)} className="form-input w-full font-mono" />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-8">
                                     <div>
                                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-4 block">Output Format</label>
                                         <div className="form-control mb-4">
                                            <label className="label py-1"><span className="label-text text-[10px] font-black uppercase text-base-content/30">Container</span></label>
                                            <div className="form-tab-group w-full">
                                                <button 
                                                    onClick={() => setOutputFormat('webm')} 
                                                    className={`form-tab-item flex-1 ${outputFormat === 'webm' ? 'active' : ''}`}
                                                >
                                                    WEBM
                                                </button>
                                                <button 
                                                    onClick={() => setOutputFormat('mp4')} 
                                                    className={`form-tab-item flex-1 ${outputFormat === 'mp4' ? 'active' : ''}`}
                                                >
                                                    MP4
                                                </button>
                                            </div>
                                            {!isFormatSupported && (
                                                <p className="text-[8px] text-error font-black uppercase tracking-widest mt-2 text-center">
                                                    {outputFormat.toUpperCase()} not supported by browser. Falling back to WEBM.
                                                </p>
                                            )}
                                        </div>
                                        <div className="form-control mb-4">
                                            <label className="cursor-pointer label p-0 gap-4 mb-3">
                                                <span className="text-[10px] font-black uppercase text-base-content/40 tracking-widest">Keep Original Ratio</span>
                                                <input 
                                                    type="checkbox" 
                                                    checked={keepOriginalRatio} 
                                                    onChange={e => setKeepOriginalRatio(e.target.checked)} 
                                                    className="toggle toggle-xs toggle-primary" 
                                                />
                                            </label>
                                            <select 
                                                disabled={keepOriginalRatio}
                                                className="form-select w-full disabled:opacity-40" 
                                                onChange={(e) => { const [w, h] = (e.currentTarget as any).value.split('x').map(Number); setJoinRes({ width: w, height: h }); }} 
                                                value={`${joinRes.width}x${joinRes.height}`}
                                            >
                                                {keepOriginalRatio && joinFiles.length > 0 && (
                                                    <option value={`${joinRes.width}x${joinRes.height}`}>AUTO: {joinRes.width}x{joinRes.height}</option>
                                                )}
                                                {COMPOSER_PRESETS.flatMap(group => group.presets.map(p => <option key={p.name} value={`${p.width}x${p.height}`}>{p.name}</option>))}
                                            </select>
                                        </div>
                                        <div className="form-tab-group w-full">
                                            <button onClick={() => setJoinFit('contain')} className={`form-tab-item flex-1 ${joinFit === 'contain' ? 'active' : ''}`}>FIT</button>
                                            <button onClick={() => setJoinFit('cover')} className={`form-tab-item flex-1 ${joinFit === 'cover' ? 'active' : ''}`}>STRETCH</button>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest">Video Queue</label>
                                            <div className="flex gap-2">
                                                <button onClick={() => (window as any).document.getElementById('joiner-files')?.click()} className="form-btn h-6 px-2 text-[9px] text-base-content/60 hover:text-primary">ADD FILES</button>
                                                <button onClick={() => setIsPickerOpen(true)} className="form-btn h-6 px-2 text-[9px] text-primary hover:underline">LIBRARY</button>
                                            </div>
                                        </div>
                                        <input id="joiner-files" type="file" multiple accept="video/*" className="hidden" onChange={(e) => handleJoinFilesSelect((e.currentTarget as any).files)}/>
                                        
                                        <div className="space-y-2">
                                            {joinFiles.map((v, i) => (
                                                <div key={v.id} className="p-3 bg-transparent flex items-center gap-4 group">
                                                    <div className="w-12 h-12 bg-black rounded-none flex-shrink-0 overflow-hidden relative">
                                                        <video src={v.url} className="w-full h-full object-cover media-monochrome group-hover:filter-none" />
                                                    </div>
                                                    <div className="flex-grow min-w-0">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <p className="text-[11px] font-black truncate uppercase flex-grow leading-tight">{v.title}</p>
                                                            {i === 0 && keepOriginalRatio && <div className="badge badge-primary rounded-none font-black text-[9px] tracking-widest px-2 py-0.5">SOURCE RATIO</div>}
                                                        </div>
                                                        <p className="text-[10px] opacity-40 font-mono mt-1">{formatTime(v.duration)} • {v.width}x{v.height}</p>
                                                    </div>
                                                    <button onClick={() => removeJoinItem(v.id)} className="form-btn h-6 w-6 text-error opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                                                </div>
                                            ))}
                                            {joinFiles.length === 0 && (
                                                <div className="py-12 text-center opacity-10 uppercase font-black tracking-widest text-[9px]">Awaiting sequence</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <footer className="h-14 flex items-stretch flex-shrink-0 bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5">
                            {activeTab === 'extractor' ? (
                                <>
                                    <button onClick={handleCaptureCurrent} disabled={!extractorVideo || isExtracting} className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake font-display">
                                        <span/><span/><span/><span/>
                                        CAPTURE
                                    </button>
                                    <button onClick={handleBatchExtract} disabled={!extractorVideo || isExtracting} className="btn btn-sm btn-primary h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake-primary font-display">
                                        <span/><span/><span/><span/>
                                        EXTRACT
                                    </button>
                                    {frames.length > 0 && (
                                        <button onClick={downloadAllFrames} className="btn btn-sm btn-ghost h-full px-4 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake font-display">
                                            <span/><span/><span/><span/>
                                            ZIP ({frames.length})
                                        </button>
                                    )}
                                </>
                            ) : (
                                <button onClick={handleJoinVideos} disabled={joinFiles.length < 1 || isJoining} className="btn btn-sm btn-primary h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake-primary font-display">
                                    <span/><span/><span/><span/>
                                    {isJoining ? 'PROCESSING...' : 'JOIN VIDEOS'}
                                </button>
                            )}
                        </footer>
                    </div>
                    {/* Manual Corner Accents */}
                    <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                    <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                    <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                    <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
                </aside>

                <main className="flex-grow flex flex-col relative p-[3px] corner-frame overflow-visible z-10 ml-1">
                    <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
                        {activeTab === 'extractor' ? (
                            <div className="flex-grow flex flex-col p-4 lg:p-6 overflow-hidden bg-transparent">
                                <div className="flex-grow bg-transparent relative flex items-center justify-center overflow-hidden">
                                    {extractorUrl ? (
                                        <video ref={extractorVideoRef} src={extractorUrl} className="w-full h-full object-contain" controls />
                                    ) : (
                                        <div className="text-center">
                                            <div className="opacity-10 mb-8">
                                                <FilmIcon className="w-20 h-20 mx-auto mb-6"/>
                                                <p className="text-2xl font-black uppercase tracking-widest">Load Source Video</p>
                                            </div>
                                            <div className="flex justify-center gap-4">
                                                <button onClick={() => (window as any).document.getElementById('extractor-file')?.click()} className="form-btn h-12 px-8">UPLOAD FILE</button>
                                                <button onClick={() => setIsPickerOpen(true)} className="form-btn form-btn-primary h-12 px-8">OPEN LIBRARY</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <input id="extractor-file" type="file" accept="video/*" className="hidden" onChange={(e) => (e.currentTarget as any).files?.[0] && handleExtractorFileSelect((e.currentTarget as any).files[0])}/>
                            </div>
                        ) : (
                            <div className="flex-grow flex flex-col items-center justify-center p-4 lg:p-6 overflow-hidden bg-transparent">
                                <div className="flex-grow w-full bg-transparent relative flex items-center justify-center overflow-hidden">
                                    <canvas ref={joinCanvasRef} className="hidden" />
                                    <video ref={joinVideoRef} className={`w-full h-full object-contain ${isJoining ? 'block' : 'hidden'}`} muted />
                                    {joinedVideoUrl && !isJoining ? (
                                        <div className="w-full h-full group">
                                            <video src={joinedVideoUrl} controls className="w-full h-full object-contain" />
                                            <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <a href={joinedVideoUrl} download={`joined_video_${Date.now()}.${actualExtension}`} className="form-btn form-btn-primary h-12 px-8">
                                                    DOWNLOAD {actualExtension.toUpperCase()}
                                                </a>
                                            </div>
                                        </div>
                                    ) : !isJoining && (
                                        <div className="text-center opacity-10">
                                            <PlayIcon className="w-20 h-20 mx-auto mb-6"/>
                                            <p className="text-2xl font-black uppercase tracking-widest">Ready to join videos</p>
                                        </div>
                                    )}
                                    {isJoining && (
                                        <div className="absolute inset-0 bg-transparent backdrop-blur-md z-40 flex flex-col items-center justify-center">
                                            <LoadingSpinner />
                                            <p className="font-black text-xs uppercase tracking-[0.4em] text-primary animate-pulse mt-6">PROCESSING VIDEO: {Math.round(joiningProgress)}%</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    {/* Manual Corner Accents */}
                    <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                    <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                    <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                    <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
                </main>

                {activeTab === 'extractor' && (
                    <aside className="w-full lg:w-[480px] flex-shrink-0 flex flex-col relative p-[3px] corner-frame overflow-visible z-10">
                        <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
                            <header className="p-6 bg-base-100/10 backdrop-blur-md flex justify-between items-center">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Extracted Frames</h3>
                                <span className="text-[10px] font-mono font-bold text-base-content/20 uppercase">{frames.length} FILES</span>
                            </header>
                            <div className="flex-grow p-6 overflow-y-auto bg-transparent">
                                <div className="grid grid-cols-2 gap-px bg-transparent">
                                    {frames.map(f => (
                                        <div key={f.id} className="group relative aspect-square bg-transparent overflow-hidden">
                                            <div className="w-full h-full relative">
                                                <img src={f.url} className="w-full h-full object-cover media-monochrome group-hover:filter-none transition-all duration-500" alt="frame"/>
                                            </div>
                                            <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                                                <p className="text-[9px] text-white font-mono font-black mb-2 uppercase">{formatTime(f.timestamp)}</p>
                                                <div className="flex gap-2">
                                                    <a href={f.url} download={`frame_${f.timestamp.toFixed(2)}s.jpg`} className="form-btn h-8 flex-grow">SAVE</a>
                                                    <button onClick={() => setFrames(prev => prev.filter(x => x.id !== f.id))} className="form-btn h-8 w-8 text-error">✕</button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {frames.length === 0 && (
                                        <div className="col-span-2 py-32 text-center opacity-10 uppercase font-black tracking-widest">Queue is Empty</div>
                                    )}
                                </div>
                            </div>
                        </div>
                        {/* Manual Corner Accents */}
                        <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                        <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                        <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                        <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
                    </aside>
                )}
            </div>

            <GalleryPickerModal 
                isOpen={isPickerOpen}
                onClose={() => setIsPickerOpen(false)}
                onSelect={handleLibrarySelect}
                selectionMode={activeTab === 'extractor' ? 'single' : 'multiple'}
                typeFilter="video"
                title={activeTab === 'extractor' ? "Select video for extraction" : "Select videos to join"}
            />

            {isExtracting && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex flex-col items-center justify-center text-center">
                    <LoadingSpinner />
                    <p className="font-black text-xs uppercase tracking-[0.4em] text-primary animate-pulse mt-6">EXTRACTING FRAMES: {Math.round(extractionProgress)}%</p>
                </div>
            )}
        </div>
    );
};