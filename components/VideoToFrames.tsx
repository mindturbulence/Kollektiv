import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FilmIcon, DownloadIcon, PlayIcon, ScissorsIcon, PhotoIcon } from './icons';
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
        const recorder = new (window as any).MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 8000000 });
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (e: any) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
        recorder.onstop = () => {
            const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
            setJoinedVideoUrl(URL.createObjectURL(blob)); setIsJoining(false);
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

    const heroTitle = activeTab === 'extractor' ? 'Frame Extractor' : 'Video Joiner';
    const heroSubtitle = activeTab === 'extractor' 
        ? 'Deconstruct temporal motion into high-fidelity visual fragments.' 
        : 'Synthesize multiple temporal artifacts into a seamless cinematic sequence.';

    return (
        <div className="h-full bg-base-100 flex flex-col overflow-hidden">
            <div className="flex-grow flex flex-col lg:flex-row overflow-hidden">
                <aside className="w-full lg:w-96 flex-shrink-0 bg-base-100 flex flex-col border-r border-base-300 overflow-hidden">
                    <div className="p-4 border-b border-base-300 bg-base-200/10">
                        <div className="tabs tabs-boxed rounded-none bg-transparent gap-1 p-0">
                            <button onClick={() => setActiveTab('extractor')} className={`tab flex-1 rounded-none font-black text-[9px] tracking-widest uppercase ${activeTab === 'extractor' ? 'tab-active' : ''}`}>FRAME EXTRACTOR</button>
                            <button onClick={() => setActiveTab('joiner')} className={`tab flex-1 rounded-none font-black text-[9px] tracking-widest uppercase ${activeTab === 'joiner' ? 'tab-active' : ''}`}>VIDEO JOINER</button>
                        </div>
                    </div>

                    <div className="flex-grow p-6 space-y-8 overflow-y-auto custom-scrollbar">
                        {activeTab === 'extractor' ? (
                            <div className="space-y-6">
                                <div>
                                    <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-4 block">Extraction settings</label>
                                    <div className="form-control mb-4">
                                        <label className="label py-1"><span className="label-text text-[10px] font-black uppercase text-base-content/30">Step Unit</span></label>
                                        <select className="select select-bordered select-sm rounded-none w-full font-bold uppercase text-xs" value={intervalUnit} onChange={(e) => setIntervalUnit((e.currentTarget as any).value as ExtractionUnit)}>
                                            <option value="seconds">Seconds</option>
                                            <option value="minutes">Minutes</option>
                                            <option value="frames">Frames</option>
                                        </select>
                                    </div>
                                    <div className="form-control">
                                        <label className="label py-1"><span className="label-text text-[10px] font-black uppercase text-base-content/30">Interval</span></label>
                                        <input type="number" step="0.1" min="0.1" value={intervalValue} onChange={(e) => setIntervalValue(parseFloat((e.currentTarget as any).value) || 1)} className="input input-bordered input-sm rounded-none w-full font-mono font-bold" />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                 <div>
                                    <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-4 block">Output Format</label>
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
                                            className="select select-bordered select-sm rounded-none w-full font-bold uppercase text-xs disabled:opacity-40" 
                                            onChange={(e) => { const [w, h] = (e.currentTarget as any).value.split('x').map(Number); setJoinRes({ width: w, height: h }); }} 
                                            value={`${joinRes.width}x${joinRes.height}`}
                                        >
                                            {keepOriginalRatio && joinFiles.length > 0 && (
                                                <option value={`${joinRes.width}x${joinRes.height}`}>AUTO: {joinRes.width}x{joinRes.height}</option>
                                            )}
                                            {COMPOSER_PRESETS.flatMap(group => group.presets.map(p => <option key={p.name} value={`${p.width}x${p.height}`}>{p.name}</option>))}
                                        </select>
                                    </div>
                                    <div className="join w-full">
                                        <button onClick={() => setJoinFit('contain')} className={`join-item btn btn-xs flex-1 rounded-none font-black text-[9px] tracking-widest ${joinFit === 'contain' ? 'btn-active' : ''}`}>FIT</button>
                                        <button onClick={() => setJoinFit('cover')} className={`join-item btn btn-xs flex-1 rounded-none font-black text-[9px] tracking-widest ${joinFit === 'cover' ? 'btn-active' : ''}`}>STRETCH</button>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest">Video Queue</label>
                                        <div className="flex gap-2">
                                            <button onClick={() => (window as any).document.getElementById('joiner-files')?.click()} className="text-[9px] font-black uppercase tracking-widest text-base-content/60 hover:text-primary">ADD FILES</button>
                                            <button onClick={() => setIsPickerOpen(true)} className="text-[9px] font-black uppercase tracking-widest text-primary hover:underline">LIBRARY</button>
                                        </div>
                                    </div>
                                    <input id="joiner-files" type="file" multiple accept="video/*" className="hidden" onChange={(e) => handleJoinFilesSelect((e.currentTarget as any).files)}/>
                                    
                                    <div className="space-y-2">
                                        {joinFiles.map((v, i) => (
                                            <div key={v.id} className="p-3 bg-base-100 border border-base-300 rounded-none flex items-center gap-4 group">
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
                                                <button onClick={() => removeJoinItem(v.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-error/40 hover:text-error px-2">✕</button>
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
                    <footer className="p-4 border-t border-base-300 bg-base-200/20 flex flex-col gap-2">
                        {activeTab === 'extractor' ? (
                            <>
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={handleCaptureCurrent} disabled={!extractorVideo || isExtracting} className="btn btn-ghost border border-base-300 btn-sm rounded-none font-black text-[9px] tracking-widest uppercase">
                                        <PhotoIcon className="w-3.5 h-3.5 mr-2 opacity-40"/> CAPTURE
                                    </button>
                                    <button onClick={handleBatchExtract} disabled={!extractorVideo || isExtracting} className="btn btn-primary btn-sm rounded-none font-black text-[9px] tracking-widest uppercase shadow-lg">
                                        <ScissorsIcon className="w-3.5 h-3.5 mr-2"/> EXTRACT
                                    </button>
                                </div>
                                {frames.length > 0 && (
                                    <button onClick={downloadAllFrames} className="btn btn-secondary btn-sm w-full rounded-none font-black text-[9px] tracking-widest shadow-lg uppercase">
                                        <DownloadIcon className="w-3.5 h-3.5 mr-2"/> DOWNLOAD ZIP ({frames.length})
                                    </button>
                                )}
                            </>
                        ) : (
                            <button onClick={handleJoinVideos} disabled={joinFiles.length < 1 || isJoining} className="btn btn-primary btn-sm w-full rounded-none font-black text-[9px] tracking-widest shadow-lg">
                                {isJoining ? 'PROCESSING...' : 'JOIN VIDEOS'}
                            </button>
                        )}
                    </footer>
                </aside>

                <main className="flex-grow bg-base-100 overflow-y-auto overflow-x-hidden scroll-smooth custom-scrollbar flex flex-col">
                    <section className="p-10 border-b border-base-300 bg-base-200/20">
                        <div className="max-w-screen-2xl mx-auto flex flex-col gap-1">
                            <div className="flex flex-col md:flex-row md:items-stretch justify-between gap-6">
                                <h1 className="text-2xl lg:text-3xl font-black tracking-tighter text-base-content leading-none flex items-center uppercase">{heroTitle}<span className="text-primary">.</span></h1>
                            </div>
                            <p className="text-[11px] font-bold text-base-content/30 uppercase tracking-[0.3em] w-full">{heroSubtitle}</p>
                        </div>
                    </section>

                    {activeTab === 'extractor' ? (
                        <div className="flex-grow flex flex-col lg:flex-row overflow-hidden bg-base-200/20">
                            <div className="flex-1 flex flex-col p-8 lg:p-12 overflow-hidden border-r border-base-300 bg-base-200/10">
                                <div className="flex-grow bg-black border border-base-300 shadow-2xl relative flex items-center justify-center overflow-hidden">
                                    {extractorUrl ? (
                                        <video ref={extractorVideoRef} src={extractorUrl} className="w-full h-full" controls />
                                    ) : (
                                        <div className="text-center">
                                            <div className="opacity-10 mb-8">
                                                <FilmIcon className="w-20 h-20 mx-auto mb-6"/>
                                                <p className="text-2xl font-black uppercase tracking-widest">Load Source Video</p>
                                            </div>
                                            <div className="flex justify-center gap-4">
                                                <button onClick={() => (window as any).document.getElementById('extractor-file')?.click()} className="btn btn-ghost border border-base-300 rounded-none font-black tracking-widest px-8">UPLOAD FILE</button>
                                                <button onClick={() => setIsPickerOpen(true)} className="btn btn-primary rounded-none font-black tracking-widest px-8 shadow-lg">OPEN LIBRARY</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <input id="extractor-file" type="file" accept="video/*" className="hidden" onChange={(e) => (e.currentTarget as any).files?.[0] && handleExtractorFileSelect((e.currentTarget as any).files[0])}/>
                            </div>

                            <div className="w-full lg:w-[480px] bg-base-100 flex flex-col overflow-hidden">
                                <header className="p-6 border-b border-base-300 bg-base-200/10 flex justify-between items-center">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Extracted Frames</h3>
                                    <span className="text-[10px] font-mono font-bold text-base-content/20 uppercase">{frames.length} FILES</span>
                                </header>
                                <div className="flex-grow p-6 overflow-y-auto custom-scrollbar">
                                    <div className="grid grid-cols-2 gap-px bg-base-300 border border-base-300">
                                        {frames.map(f => (
                                            <div key={f.id} className="group relative aspect-square bg-base-100 overflow-hidden">
                                                <div className="w-full h-full relative">
                                                    <img src={f.url} className="w-full h-full object-cover media-monochrome group-hover:filter-none transition-all duration-500" alt="frame"/>
                                                </div>
                                                <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                                                    <p className="text-[9px] text-white font-mono font-black mb-2 uppercase">{formatTime(f.timestamp)}</p>
                                                    <div className="flex gap-2">
                                                        <a href={f.url} download={`frame_${f.timestamp.toFixed(2)}s.jpg`} className="btn btn-xs btn-primary rounded-none flex-grow font-black text-[8px] tracking-widest">SAVE</a>
                                                        <button onClick={() => setFrames(prev => prev.filter(x => x.id !== f.id))} className="btn btn-xs btn-square btn-error rounded-none">✕</button>
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
                        </div>
                    ) : (
                        <div className="flex-grow flex flex-col items-center justify-center p-12 lg:p-24 overflow-hidden bg-base-200/20">
                            <div className="w-full max-w-5xl aspect-video bg-black border border-base-300 shadow-2xl relative flex items-center justify-center overflow-hidden">
                                <canvas ref={joinCanvasRef} className="hidden" />
                                <video ref={joinVideoRef} className={`w-full h-full ${isJoining ? 'block' : 'hidden'}`} muted />
                                {joinedVideoUrl && !isJoining ? (
                                    <div className="w-full h-full group">
                                        <video src={joinedVideoUrl} controls className="w-full h-full object-contain" />
                                        <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <a href={joinedVideoUrl} download={`joined_video_${Date.now()}.webm`} className="btn btn-primary rounded-none shadow-2xl font-black text-[10px] tracking-widest px-8 py-4 h-auto">
                                                DOWNLOAD VIDEO
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
                                    <div className="absolute inset-0 bg-base-300/80 backdrop-blur-md z-40 flex flex-col items-center justify-center">
                                        <LoadingSpinner />
                                        <p className="font-black text-xs uppercase tracking-[0.4em] text-primary animate-pulse mt-6">PROCESSING VIDEO: {Math.round(joiningProgress)}%</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </main>
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