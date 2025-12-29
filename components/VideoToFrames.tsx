
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { FilmIcon, UploadIcon, DownloadIcon, CloseIcon, PlayIcon, ScissorsIcon, PhotoIcon, RefreshIcon, ChevronDownIcon, InformationCircleIcon, AdjustmentsVerticalIcon, ViewGridIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';
import JSZip from 'jszip';
import { COMPOSER_PRESETS } from '../constants';

// --- Types ---
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
    file: File;
    url: string;
    duration: number;
}

const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
};

export const VideoToFrames: React.FC = () => {
    const [activeTab, setActiveTab] = useState<EditorTab>('extractor');
    
    // --- Extractor State ---
    const [extractorVideo, setExtractorVideo] = useState<File | null>(null);
    const [extractorUrl, setExtractorUrl] = useState('');
    const [frames, setFrames] = useState<ExtractedFrame[]>([]);
    const [isExtracting, setIsExtracting] = useState(false);
    const [extractionProgress, setExtractionProgress] = useState(0);
    const [intervalValue, setIntervalValue] = useState(1);
    const [intervalUnit, setIntervalUnit] = useState<ExtractionUnit>('seconds');
    const extractorVideoRef = useRef<HTMLVideoElement>(null);

    // --- Joiner State ---
    const [joinFiles, setJoinFiles] = useState<JoinableVideo[]>([]);
    const [isJoining, setIsJoining] = useState(false);
    const [joiningProgress, setJoiningProgress] = useState(0);
    const [joinedVideoUrl, setJoinedVideoUrl] = useState<string | null>(null);
    const [joinRes, setJoinRes] = useState({ width: 1920, height: 1080 });
    const [joinFit, setJoinFit] = useState<FitMode>('contain');
    
    const joinVideoRef = useRef<HTMLVideoElement>(null);
    const joinCanvasRef = useRef<HTMLCanvasElement>(null);
    const mediaRecorderRef = useRef<any>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const animationFrameRef = useRef<number | null>(null);

    // --- Extractor Handlers ---
    const handleExtractorFileSelect = (file: File) => {
        if (!file.type.startsWith('video/')) return;
        if (extractorUrl) URL.revokeObjectURL(extractorUrl);
        setExtractorUrl(URL.createObjectURL(file));
        setExtractorVideo(file);
        setFrames([]);
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
            (video as any).currentTime = time;
        });
    }, []);

    const handleBatchExtract = async () => {
        const video = extractorVideoRef.current;
        if (!video || isExtracting) return;

        setIsExtracting(true);
        setExtractionProgress(0);
        const duration = (video as any).duration;
        const newFrames: ExtractedFrame[] = [];
        
        // Calculate real interval in seconds
        let step = intervalValue;
        if (intervalUnit === 'minutes') step = intervalValue * 60;
        if (intervalUnit === 'frames') step = intervalValue * (1/30); // Assume 30fps baseline for calculation

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
        frames.forEach((f, i) => {
            zip.file(`frame_${String(i).padStart(3, '0')}_${f.timestamp.toFixed(2)}s.jpg`, f.blob);
        });
        const content = await zip.generateAsync({ type: "blob" });
        const link = (window as any).document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `frames_${extractorVideo?.name || 'video'}.zip`;
        link.click();
    };

    // --- Joiner Handlers ---
    const handleJoinFilesSelect = async (files: FileList | null) => {
        if (!files) return;
        const newVideos = await Promise.all(Array.from(files).map(async (file) => {
            const url = URL.createObjectURL(file);
            const duration = await new Promise<number>((res) => {
                const v = (window as any).document.createElement('video');
                v.src = url;
                v.onloadedmetadata = () => res(v.duration);
            });
            return { id: Math.random().toString(36).substr(2, 9), file, url, duration };
        }));
        setJoinFiles(prev => [...prev, ...newVideos]);
    };

    // --- Fix: Implemented missing moveJoinItem handler ---
    const moveJoinItem = (index: number, direction: 'up' | 'down') => {
        setJoinFiles(prev => {
            const next = [...prev];
            const targetIndex = direction === 'up' ? index - 1 : index + 1;
            if (targetIndex >= 0 && targetIndex < next.length) {
                [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
            }
            return next;
        });
    };

    // --- Fix: Implemented missing removeJoinItem handler ---
    const removeJoinItem = (id: string) => {
        setJoinFiles(prev => {
            const itemToRemove = prev.find(v => v.id === id);
            if (itemToRemove) {
                URL.revokeObjectURL(itemToRemove.url);
            }
            return prev.filter(v => v.id !== id);
        });
    };

    const handleJoinVideos = async () => {
        if (joinFiles.length < 2 || isJoining) return;
        setIsJoining(true);
        setJoiningProgress(0);
        recordedChunksRef.current = [];

        const streamVideo = joinVideoRef.current;
        const streamCanvas = joinCanvasRef.current;
        if (!streamVideo || !streamCanvas) {
            setIsJoining(false);
            return;
        }

        const ctx = (streamCanvas as any).getContext('2d');
        if (!ctx) {
            setIsJoining(false);
            return;
        }

        (streamCanvas as any).width = joinRes.width; 
        (streamCanvas as any).height = joinRes.height;

        const stream = (streamCanvas as any).captureStream(30);
        const recorder = new (window as any).MediaRecorder(stream, { 
            mimeType: 'video/webm;codecs=vp8',
            videoBitsPerSecond: 8000000 
        });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e: any) => {
            if (e.data.size > 0) recordedChunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
            const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
            setJoinedVideoUrl(URL.createObjectURL(blob));
            setIsJoining(false);
            if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
        };

        let currentIndex = 0;

        const drawLoop = () => {
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, (streamCanvas as any).width, (streamCanvas as any).height);
            
            const vWidth = (streamVideo as any).videoWidth || 1;
            const vHeight = (streamVideo as any).videoHeight || 1;
            const cWidth = (streamCanvas as any).width;
            const cHeight = (streamCanvas as any).height;
            
            let dx = 0, dy = 0, dw = cWidth, dh = cHeight;

            if (joinFit === 'contain') {
                const scale = Math.min(cWidth / vWidth, cHeight / vHeight);
                dw = vWidth * scale;
                dh = vHeight * scale;
                dx = (cWidth / 2) - (dw / 2);
                dy = (cHeight / 2) - (dh / 2);
            } else {
                const scale = Math.max(cWidth / vWidth, cHeight / vHeight);
                dw = vWidth * scale;
                dh = vHeight * scale;
                dx = (cWidth / 2) - (dw / 2);
                dy = (cHeight / 2) - (dh / 2);
            }
            
            ctx.drawImage(streamVideo, dx, dy, dw, dh);
            animationFrameRef.current = requestAnimationFrame(drawLoop);
        };

        const playNext = async () => {
            if (currentIndex >= joinFiles.length) {
                setTimeout(() => recorder.stop(), 500);
                return;
            }
            const currentVideo = joinFiles[currentIndex];
            (streamVideo as any).src = currentVideo.url;
            
            await new Promise<void>((resolve) => {
                (streamVideo as any).onloadeddata = () => resolve();
            });

            try {
                await (streamVideo as any).play();
                currentIndex++;
                setJoiningProgress((currentIndex / joinFiles.length) * 100);
            } catch (err) {
                console.error("Playback error during join:", err);
                recorder.stop();
            }
        };

        (streamVideo as any).onended = playNext;
        
        recorder.start();
        drawLoop();
        playNext();
    };

    return (
        <div className="h-full bg-base-200 flex flex-col lg:flex-row overflow-hidden">
            {/* Left Sidebar: Controls & Navigation */}
            <aside className="w-full lg:w-80 bg-base-100 border-r border-base-300 flex flex-col p-4 shadow-lg z-10 flex-shrink-0 overflow-y-auto">
                <div className="flex items-center gap-2 mb-6 px-1">
                    <FilmIcon className="w-6 h-6 text-primary" />
                    <h2 className="font-black text-xl uppercase tracking-tighter">Video Studio</h2>
                </div>

                {/* Top Tabs */}
                <div className="tabs tabs-boxed mb-6 w-full">
                    <button onClick={() => setActiveTab('extractor')} className={`tab flex-1 text-xs font-bold ${activeTab === 'extractor' ? 'tab-active' : ''}`}>Extractor</button>
                    <button onClick={() => setActiveTab('joiner')} className={`tab flex-1 text-xs font-bold ${activeTab === 'joiner' ? 'tab-active' : ''}`}>Joiner</button>
                </div>

                {activeTab === 'extractor' ? (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-[10px] font-black uppercase text-base-content/50 tracking-widest mb-3">Extraction Mode</h3>
                            <div className="form-control mb-4">
                                <label className="label py-1"><span className="label-text text-xs font-bold">Extraction Unit</span></label>
                                <select 
                                    className="select select-bordered select-sm w-full"
                                    value={intervalUnit}
                                    onChange={(e) => setIntervalUnit((e.currentTarget as any).value as ExtractionUnit)}
                                >
                                    <option value="seconds">Every X Seconds</option>
                                    <option value="minutes">Every X Minutes</option>
                                    <option value="frames">Every X Frames</option>
                                </select>
                            </div>
                            <div className="form-control">
                                <label className="label py-1"><span className="label-text text-xs font-bold">Value</span></label>
                                <div className="join w-full">
                                    <input 
                                        type="number" 
                                        step="0.1" 
                                        min="0.1" 
                                        value={intervalValue} 
                                        onChange={(e) => setIntervalValue(parseFloat((e.currentTarget as any).value) || 1)} 
                                        className="input input-bordered input-sm join-item w-full"
                                    />
                                    <span className="btn btn-sm btn-disabled join-item uppercase text-[10px]">{intervalUnit.substring(0, 3)}</span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 mt-6">
                                <button onClick={handleBatchExtract} disabled={!extractorVideo || isExtracting} className="btn btn-primary btn-sm w-full">
                                    <ScissorsIcon className="w-4 h-4 mr-2"/> Start Extraction
                                </button>
                                <button onClick={handleCaptureCurrent} disabled={!extractorVideo || isExtracting} className="btn btn-secondary btn-sm w-full">
                                    <PhotoIcon className="w-4 h-4 mr-2"/> Snap Current
                                </button>
                            </div>
                        </div>
                        {frames.length > 0 && (
                            <div className="pt-4 border-t border-base-300">
                                <button onClick={downloadAllFrames} className="btn btn-accent btn-sm w-full shadow-md">
                                    <DownloadIcon className="w-4 h-4 mr-2"/> Download ZIP ({frames.length})
                                </button>
                                <button onClick={() => setFrames([])} className="btn btn-ghost btn-xs w-full mt-2 text-error">Clear All</button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6 flex flex-col h-full">
                        <div>
                            <h3 className="text-[10px] font-black uppercase text-base-content/50 tracking-widest mb-3">Export Settings</h3>
                            <div className="form-control mb-3">
                                <label className="label py-1"><span className="label-text text-xs font-bold">Resolution Preset</span></label>
                                <select 
                                    className="select select-bordered select-sm w-full"
                                    onChange={(e) => {
                                        const [w, h] = (e.currentTarget as any).value.split('x').map(Number);
                                        setJoinRes({ width: w, height: h });
                                    }}
                                    value={`${joinRes.width}x${joinRes.height}`}
                                >
                                    {COMPOSER_PRESETS.map(group => (
                                        <optgroup key={group.category} label={group.category}>
                                            {group.presets.map(p => <option key={p.name} value={`${p.width}x${p.height}`}>{p.name} ({p.width}x{p.height})</option>)}
                                        </optgroup>
                                    ))}
                                </select>
                            </div>
                            <div className="form-control mb-3">
                                <label className="label py-1"><span className="label-text text-xs font-bold">Scaling Behavior</span></label>
                                <div className="join w-full">
                                    <button onClick={() => setJoinFit('contain')} className={`btn btn-xs join-item flex-1 ${joinFit === 'contain' ? 'btn-active' : ''}`}>Fit</button>
                                    <button onClick={() => setJoinFit('cover')} className={`btn btn-xs join-item flex-1 ${joinFit === 'cover' ? 'btn-active' : ''}`}>Fill</button>
                                </div>
                            </div>
                            <div className="divider opacity-20"></div>
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="text-[10px] font-black uppercase text-base-content/50 tracking-widest">Join Queue</h3>
                                <button onClick={() => (window as any).document.getElementById('joiner-files')?.click()} className="btn btn-xs btn-primary">
                                    <UploadIcon className="w-3 h-3 mr-1"/> Add
                                </button>
                            </div>
                            <input id="joiner-files" type="file" multiple accept="video/*" className="hidden" onChange={(e) => handleJoinFilesSelect((e.currentTarget as any).files)}/>
                            
                            <div className="max-h-64 overflow-y-auto space-y-2 pr-1 mb-4">
                                {joinFiles.length > 0 ? (
                                    joinFiles.map((v, i) => (
                                        <div key={v.id} className="p-2 bg-base-200 rounded-xl flex items-center gap-3 border border-base-300 group">
                                            <div className="w-12 h-12 bg-black rounded-lg flex-shrink-0 overflow-hidden shadow-inner">
                                                <video src={v.url} className="w-full h-full object-cover" />
                                            </div>
                                            <div className="flex-grow min-w-0">
                                                <p className="text-[10px] font-black truncate leading-tight">{v.file.name}</p>
                                                <p className="text-[8px] opacity-40 font-mono mt-0.5">{formatTime(v.duration)}</p>
                                            </div>
                                            <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => moveJoinItem(i, 'up')} disabled={i === 0} className="btn btn-ghost btn-xs btn-square h-5 w-5">▲</button>
                                                <button onClick={() => moveJoinItem(i, 'down')} disabled={i === joinFiles.length - 1} className="btn btn-ghost btn-xs btn-square h-5 w-5">▼</button>
                                            </div>
                                            <button onClick={() => removeJoinItem(v.id)} className="btn btn-ghost btn-xs btn-circle text-error">✕</button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="h-32 flex flex-col items-center justify-center opacity-20 text-center p-4 border-2 border-dashed border-base-content/20 rounded-2xl">
                                        <FilmIcon className="w-8 h-8 mb-2"/>
                                        <p className="text-[10px] font-bold">Queue Empty</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        <div className="pt-4 border-t border-base-300 mt-auto">
                            <button 
                                onClick={handleJoinVideos} 
                                disabled={joinFiles.length < 2 || isJoining} 
                                className={`btn btn-primary btn-sm w-full shadow-lg ${isJoining ? 'loading' : ''}`}
                            >
                                {isJoining ? 'Processing...' : 'Merge Sequence'}
                            </button>
                            {joinedVideoUrl && (
                                <button onClick={() => setJoinedVideoUrl(null)} className="btn btn-ghost btn-xs w-full mt-2 text-error">Reset Joiner</button>
                            )}
                        </div>
                    </div>
                )}
            </aside>

            {/* Main Center Area: Side-by-Side View */}
            <main className="flex-grow overflow-hidden relative flex flex-col lg:flex-row p-6 lg:p-8 gap-8 min-h-0 bg-base-200/50">
                
                {/* Left Panel: Video Player Console */}
                <section className="flex-1 flex flex-col gap-6 min-h-0">
                    <div className="bg-base-100 rounded-3xl overflow-hidden shadow-2xl border border-base-300 p-2 flex-grow flex flex-col">
                        <div className="bg-black rounded-[1.25rem] aspect-video relative flex items-center justify-center overflow-hidden shadow-inner flex-grow">
                            <canvas ref={joinCanvasRef} className="hidden" />
                            <video ref={joinVideoRef} className={`w-full h-full ${isJoining ? 'block' : 'hidden'}`} muted />
                            
                            {activeTab === 'extractor' ? (
                                extractorUrl ? (
                                    <video ref={extractorVideoRef} src={extractorUrl} className="w-full h-full" controls />
                                ) : (
                                    <div 
                                        className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors p-10 group"
                                        onClick={() => (window as any).document.getElementById('extractor-file')?.click()}
                                    >
                                        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                            <UploadIcon className="w-10 h-10"/>
                                        </div>
                                        <p className="font-black text-xl mt-6 uppercase tracking-tighter">Load Video</p>
                                        <p className="text-sm opacity-40 mt-2">MP4 or WebM supported</p>
                                    </div>
                                )
                            ) : (
                                !isJoining && !joinedVideoUrl && (
                                     <div className="opacity-20 flex flex-col items-center text-center p-10">
                                        <PlayIcon className="w-16 h-16 mb-4"/>
                                        <p className="font-black text-xl uppercase tracking-tighter">Join Preview</p>
                                        <p className="text-xs mt-2 font-bold max-w-xs">Merged sequence will render here.</p>
                                     </div>
                                )
                            )}
                            
                            {joinedVideoUrl && activeTab === 'joiner' && !isJoining && (
                                <div className="w-full h-full group">
                                    <video src={joinedVideoUrl} controls className="w-full h-full object-contain" />
                                    <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <a href={joinedVideoUrl} download={`kollektiv_joined_${Date.now()}.webm`} className="btn btn-accent shadow-2xl font-black">
                                            <DownloadIcon className="w-5 h-5 mr-2"/> DOWNLOAD EXPORT
                                        </a>
                                    </div>
                                </div>
                            )}

                            {isJoining && (
                                <div className="absolute inset-0 bg-base-300/80 backdrop-blur-md z-40 flex flex-col items-center justify-center text-center p-6">
                                    <LoadingSpinner />
                                    <h2 className="text-2xl font-black mt-6">Rendering Sequence</h2>
                                    <div className="w-64 mt-6">
                                        <progress className="progress progress-primary w-full" value={joiningProgress} max="100"></progress>
                                        <p className="text-[10px] font-mono mt-2 uppercase opacity-50">Progress: {Math.round(joiningProgress)}%</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <input id="extractor-file" type="file" accept="video/*" className="hidden" onChange={(e) => (e.currentTarget as any).files?.[0] && handleExtractorFileSelect((e.currentTarget as any).files[0])}/>
                    
                    <div className="bg-info/5 p-4 rounded-2xl border border-info/10 flex gap-4 text-sm">
                        <InformationCircleIcon className="w-5 h-5 text-info flex-shrink-0"/>
                        <p className="text-base-content/70">
                            {activeTab === 'extractor' 
                                ? "Extraction works in the browser. High intervals or long videos may take a moment to process."
                                : "Joiner records a real-time virtual canvas. Output is high-quality WebM."}
                        </p>
                    </div>
                </section>

                {/* Right Panel: Gallery Output */}
                <section className="w-full lg:w-[400px] flex flex-col gap-4 min-h-0">
                    <div className="flex justify-between items-end px-1">
                        <div>
                            <h3 className="text-xl font-black tracking-tighter uppercase">Output Gallery</h3>
                            <p className="text-[10px] opacity-50 font-bold uppercase tracking-widest">Process Results</p>
                        </div>
                        {activeTab === 'extractor' && (
                             <div className="badge badge-primary font-mono text-[10px]">{frames.length} Items</div>
                        )}
                    </div>

                    <div className="flex-grow bg-base-100 rounded-3xl shadow-xl border border-base-300 flex flex-col overflow-hidden">
                        <div className="p-4 flex-grow overflow-y-auto custom-scrollbar pb-20">
                            {activeTab === 'extractor' ? (
                                frames.length > 0 ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        {frames.map(f => (
                                            <div key={f.id} className="group relative aspect-square bg-base-300 rounded-2xl overflow-hidden border border-base-300 shadow-md hover:shadow-lg transition-all duration-300">
                                                <img src={f.url} className="w-full h-full object-cover" alt="frame"/>
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                                                    <p className="text-[9px] text-white/60 font-mono mb-2 uppercase">{formatTime(f.timestamp)}</p>
                                                    <div className="flex gap-2">
                                                        <a href={f.url} download={`frame_${f.timestamp.toFixed(2)}s.jpg`} className="btn btn-xs btn-primary flex-grow text-[9px] font-black">SAVE</a>
                                                        <button onClick={() => setFrames(prev => prev.filter(x => x.id !== f.id))} className="btn btn-xs btn-square btn-error">✕</button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center opacity-20 text-center p-8">
                                        <PhotoIcon className="w-16 h-16 mb-4"/>
                                        <p className="font-black text-sm uppercase">No frames yet</p>
                                    </div>
                                )
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center opacity-20 text-center p-8">
                                    <ViewGridIcon className="w-16 h-16 mb-4"/>
                                    <p className="font-black text-sm uppercase">Joined Result Preview Area</p>
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            </main>

            {/* Global Loader for Extraction */}
            {isExtracting && (
                <div className="fixed inset-0 bg-base-300/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center text-center">
                    <LoadingSpinner />
                    <h2 className="text-2xl font-black mt-6 uppercase tracking-tighter">Capturing High-Res Stills</h2>
                    <div className="w-64 mt-6">
                        <progress className="progress progress-primary w-full" value={extractionProgress} max="100"></progress>
                        <p className="text-[10px] font-mono mt-2 uppercase opacity-50">Seeking: {Math.round(extractionProgress)}%</p>
                    </div>
                </div>
            )}
        </div>
    );
};
