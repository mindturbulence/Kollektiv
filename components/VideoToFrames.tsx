import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { FilmIcon, UploadIcon, CloseIcon, DownloadIcon, ScissorsIcon, PlayIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';

const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

const formatTime = (timeInSeconds: number) => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    const milliseconds = Math.round((timeInSeconds - Math.floor(timeInSeconds)) * 1000);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
};

export const VideoToFrames: React.FC = () => {
    const ffmpegRef = useRef<FFmpeg | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // FFmpeg state
    const [isReady, setIsReady] = useState(false);
    const [isLoadingFFmpeg, setIsLoadingFFmpeg] = useState(true);
    const [ffmpegError, setFfmpegError] = useState<string | null>(null);
    const [loadingMessages, setLoadingMessages] = useState<string[]>([]);

    // Video & processing state
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoUrl, setVideoUrl] = useState('');
    const [videoDuration, setVideoDuration] = useState(0);
    const [timelineFrames, setTimelineFrames] = useState<string[]>([]);
    
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingMessage, setProcessingMessage] = useState('');
    const [progress, setProgress] = useState(0);
    
    // Editing state
    const [trimStart, setTrimStart] = useState(0);
    const [trimEnd, setTrimEnd] = useState(0);
    const [playheadPosition, setPlayheadPosition] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [processedVideoUrl, setProcessedVideoUrl] = useState<string | null>(null);
    
    // Dragging state
    const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null);
    
    // --- FFmpeg Loading Effect ---
    useEffect(() => {
        const addMessage = (message: string) => {
            setLoadingMessages(prev => [...prev, message]);
        };

        const load = async () => {
            addMessage('Starting video engine...');
            
            if (typeof window === 'undefined') {
                addMessage('ERROR: Window object not found. Cannot run in a non-browser environment.');
                setFfmpegError("The video editor can only run in a web browser.");
                setIsLoadingFFmpeg(false);
                return;
            }

            addMessage('Checking for secure browser context...');
            if (!(window as any).crossOriginIsolated) {
                const errorMsg = "ERROR: Browser context is not secure (crossOriginIsolated is false).";
                addMessage(errorMsg);
                addMessage("This is a browser security requirement for high-performance video processing.");
                addMessage("This typically occurs when the application is embedded in an iframe that lacks the necessary security headers (COOP and COEP).");
                console.error('crossOriginIsolated is false. FFmpeg will not load.');
                setFfmpegError("Video processing requires a secure environment (cross-origin isolation). Please ensure the app is served with the correct headers or is not embedded in an iframe.");
                setIsLoadingFFmpeg(false);
                return;
            }
            addMessage('Secure context check passed.');

            const ffmpeg = new FFmpeg();
            addMessage('Created FFmpeg instance.');

            ffmpeg.on('log', ({ message }) => console.log('[FFmpeg log]', message));
            ffmpeg.on('progress', ({ progress }) => setProgress(Math.round(progress * 100)));
            addMessage('Logger and progress handlers initialized.');
            
            try {
                addMessage('Loading FFmpeg core via Blob URLs...');
                await ffmpeg.load({
                    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
                    workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
                });
                addMessage('FFmpeg core loaded successfully.');
                ffmpegRef.current = ffmpeg;
                addMessage('FFmpeg instance is ready.');
                setIsReady(true);
            } catch (err: any) {
                const errorDetail = err.message || 'An unknown error occurred.';
                addMessage(`ERROR: FFmpeg failed to load. Details: ${errorDetail}`);
                console.error('FFmpeg failed to load', err);
                setFfmpegError(`Could not load the video processing engine. Details: ${errorDetail}`);
            } finally {
                setIsLoadingFFmpeg(false);
            }
        };
        load();
    }, []);
    
    // --- Video & Timeline Sync ---
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const updatePlayhead = () => { if (video) setPlayheadPosition((video as any).currentTime); };
        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);

        (video as any).addEventListener('timeupdate', updatePlayhead);
        (video as any).addEventListener('play', handlePlay);
        (video as any).addEventListener('pause', handlePause);
        (video as any).addEventListener('seeked', updatePlayhead);

        return () => {
            (video as any).removeEventListener('timeupdate', updatePlayhead);
            (video as any).removeEventListener('play', handlePlay);
            (video as any).removeEventListener('pause', handlePause);
            (video as any).removeEventListener('seeked', updatePlayhead);
        };
    }, [videoUrl, processedVideoUrl]);
    
    // --- Drag Handlers for Timeline Trimming ---
    const handleMouseMove = useCallback((e: any) => {
        if (!draggingHandle || !timelineRef.current || !videoDuration) return;
        const rect = (timelineRef.current as any).getBoundingClientRect();
        const position = (e.clientX - rect.left) / rect.width;
        const time = Math.max(0, Math.min(videoDuration, position * videoDuration));

        if (draggingHandle === 'start') {
            setTrimStart(Math.min(time, trimEnd - 0.1));
        } else {
            setTrimEnd(Math.max(time, trimStart + 0.1));
        }
    }, [draggingHandle, videoDuration, trimStart, trimEnd]);

    const handleMouseUp = useCallback(() => {
        setDraggingHandle(null);
    }, []);

    useEffect(() => {
        if (draggingHandle) {
            (window as any).addEventListener('mousemove', handleMouseMove);
            (window as any).addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            (window as any).removeEventListener('mousemove', handleMouseMove);
            (window as any).removeEventListener('mouseup', handleMouseUp);
        };
    }, [draggingHandle, handleMouseMove, handleMouseUp]);
    
    // --- Core Functions ---
    const handleFileSelect = async (file: File | null) => {
        if (!file || !file.type.startsWith('video/')) return;
        
        // Reset state for new video
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        if (processedVideoUrl) URL.revokeObjectURL(processedVideoUrl);
        setTimelineFrames([]);
        
        setVideoFile(file);
        const url = URL.createObjectURL(file);
        setVideoUrl(url);

        if (typeof (window as any).document === 'undefined') return;

        // Get video duration
        const tempVideo = (window as any).document.createElement('video');
        tempVideo.src = url;
        tempVideo.onloadedmetadata = async () => {
            const duration = tempVideo.duration;
            setVideoDuration(duration);
            setTrimStart(0);
            setTrimEnd(duration);
            setPlayheadPosition(0);
            setProcessedVideoUrl(null);
            
            // Extract frames for timeline
            if (ffmpegRef.current?.loaded) {
                setIsProcessing(true);
                setProcessingMessage('Generating timeline...');
                setProgress(0);
                try {
                    const ffmpeg = ffmpegRef.current;
                    const inputFileName = 'input.mp4';
                    await ffmpeg.writeFile(inputFileName, new Uint8Array(await file.arrayBuffer()));
                    
                    const frameCount = 20;
                    const interval = duration / frameCount;
                    await ffmpeg.exec(['-i', inputFileName, '-vf', `fps=1/${interval}`, 'thumb-%03d.jpg']);
                    
                    const files = await ffmpeg.listDir('.');
                    const frameFiles = files.filter(f => f.name.startsWith('thumb-') && f.name.endsWith('.jpg'));
                    
                    const frameUrls = await Promise.all(frameFiles.map(async (file) => {
                        const data = await ffmpeg.readFile(file.name);
                        return URL.createObjectURL(new Blob([(data as Uint8Array).buffer], { type: 'image/jpeg' }));
                    }));
                    
                    setTimelineFrames(frameUrls);
                } catch (err) {
                    console.error('Error generating timeline:', err);
                    setFfmpegError('Failed to generate video timeline.');
                } finally {
                    setIsProcessing(false);
                    setProcessingMessage('');
                }
            }
        };
    };

    const handleTrimVideo = async () => {
        if (!videoFile || !ffmpegRef.current || !ffmpegRef.current.loaded) return;

        setIsProcessing(true);
        setProcessingMessage('Trimming video...');
        setProgress(0);
        if (processedVideoUrl) URL.revokeObjectURL(processedVideoUrl);
        setProcessedVideoUrl(null);
        
        try {
            const ffmpeg = ffmpegRef.current;
            const inputFileName = 'input.mp4';
            const outputFileName = 'output.mp4';

            await ffmpeg.writeFile(inputFileName, new Uint8Array(await videoFile.arrayBuffer()));
            
            const startTime = formatTime(trimStart).slice(0, -4); 
            const duration = formatTime(trimEnd - trimStart).slice(0, -4);
            
            await ffmpeg.exec(['-i', inputFileName, '-ss', startTime, '-t', duration, '-c', 'copy', outputFileName]);
            
            const data = await ffmpeg.readFile(outputFileName);
            const url = URL.createObjectURL(new Blob([(data as Uint8Array).buffer], { type: 'video/mp4' }));
            setProcessedVideoUrl(url);
        } catch (err) {
            console.error('Error trimming video:', err);
            setFfmpegError('Failed to trim video. The format might not be supported for stream copying.');
        } finally {
            setIsProcessing(false);
            setProcessingMessage('');
        }
    };
    
    const handleDownload = () => {
        if (!processedVideoUrl) return;
        if (typeof (window as any).document === 'undefined') return;
        const a = (window as any).document.createElement('a');
        a.href = processedVideoUrl;
        a.download = `trimmed-${videoFile?.name || 'video.mp4'}`;
        (window as any).document.body.appendChild(a);
        a.click();
        (window as any).document.body.removeChild(a);
    };

    const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!timelineRef.current || !videoRef.current) return;
        const rect = (timelineRef.current as any).getBoundingClientRect();
        const position = (e.clientX - rect.left) / rect.width;
        const newTime = position * videoDuration;
        (videoRef.current as any).currentTime = newTime;
    };
    
    // --- Render Logic ---
    if (isLoadingFFmpeg) {
        return (
            <div className="p-6 text-center">
                <LoadingSpinner />
                <p className="font-semibold mt-2">Loading Video Engine...</p>
                <div className="mt-4 text-left bg-base-300 p-3 rounded-lg text-xs font-mono max-w-lg mx-auto max-h-64 overflow-y-auto">
                    {loadingMessages.map((msg, index) => (
                        <p key={index} className={`whitespace-pre-wrap ${msg.startsWith('ERROR') ? 'text-error' : ''}`}>
                            <span className="text-base-content/50 mr-2">{`[${index + 1}]`}</span>
                            {msg}
                        </p>
                    ))}
                </div>
            </div>
        );
    }
    if (ffmpegError) return <div className="p-6 alert alert-error"><span>{ffmpegError}</span></div>;
    
    const renderDropZone = () => (
        <div 
            className="w-full h-full p-6 flex flex-col items-center justify-center border-2 border-dashed rounded-lg cursor-pointer hover:border-primary"
            onDragEnter={(e) => e.preventDefault()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
                e.preventDefault();
                handleFileSelect((e.dataTransfer as any).files[0]);
            }}
            onClick={() => (fileInputRef.current as any)?.click()}
        >
            <UploadIcon className="w-16 h-16 text-base-content/30" />
            <p className="mt-2 font-semibold">Drop Video File</p>
            <p className="text-sm text-base-content/60">or click to browse</p>
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={(e) => handleFileSelect((e.currentTarget as any).files?.[0] || null)} 
                accept="video/*" 
                className="hidden"
            />
        </div>
    );

    const renderEditor = () => (
        <div className="flex flex-col h-full gap-4">
            {/* Video Player & Download */}
            <div className="flex-grow bg-black rounded-lg flex items-center justify-center relative">
                 <video ref={videoRef} src={processedVideoUrl || videoUrl} className="max-w-full max-h-full" controls/>
                 {processedVideoUrl && (
                    <div className="absolute top-4 right-4 z-10">
                        <button onClick={handleDownload} className="btn btn-sm btn-primary"><DownloadIcon className="w-4 h-4 mr-2"/> Download Trimmed</button>
                    </div>
                )}
            </div>
            
            {/* Timeline & Controls */}
            <div className="flex-shrink-0 bg-base-200 p-4 rounded-lg">
                <div className="flex items-center gap-4">
                    <button onClick={() => videoRef.current && (isPlaying ? (videoRef.current as any).pause() : (videoRef.current as any).play())} className="btn btn-sm btn-circle">
                       {isPlaying ? '❚❚' : <PlayIcon className="w-4 h-4"/>}
                    </button>
                    <div className="flex-grow relative h-16 cursor-pointer" ref={timelineRef} onClick={handleTimelineClick}>
                        <div className="w-full h-full flex gap-1 overflow-hidden rounded-md bg-black">
                            {timelineFrames.map((frame, i) => (
                                <img key={i} src={frame} className="h-full w-auto" alt={`frame ${i}`}/>
                            ))}
                        </div>
                        {/* Shaded Areas */}
                        <div className="absolute top-0 bottom-0 left-0 bg-black/60 pointer-events-none" style={{ width: `${(trimStart / videoDuration) * 100}%` }}></div>
                        <div className="absolute top-0 bottom-0 right-0 bg-black/60 pointer-events-none" style={{ width: `${100 - (trimEnd / videoDuration) * 100}%` }}></div>
                        
                        {/* Handles */}
                        <div className="absolute top-0 bottom-0 -left-1 w-2 cursor-ew-resize bg-primary/80 rounded-l-md" style={{ left: `calc(${(trimStart / videoDuration) * 100}% - 4px)` }} onMouseDown={(e) => { e.stopPropagation(); setDraggingHandle('start'); }}></div>
                        <div className="absolute top-0 bottom-0 -right-1 w-2 cursor-ew-resize bg-primary/80 rounded-r-md" style={{ left: `calc(${(trimEnd / videoDuration) * 100}% - 4px)` }} onMouseDown={(e) => { e.stopPropagation(); setDraggingHandle('end'); }}></div>

                        {/* Playhead */}
                        <div className="absolute top-0 bottom-0 w-0.5 bg-secondary pointer-events-none" style={{ left: `${(playheadPosition / videoDuration) * 100}%` }}></div>
                    </div>
                    <button onClick={handleTrimVideo} disabled={isProcessing} className="btn btn-sm btn-secondary"><ScissorsIcon className="w-4 h-4 mr-2"/>Trim</button>
                </div>
                 <div className="text-xs text-center font-mono mt-2 text-base-content/70">
                    Start: {formatTime(trimStart)} | End: {formatTime(trimEnd)} | Duration: {formatTime(trimEnd - trimStart)}
                </div>
            </div>
        </div>
    );
    
    return (
        <div className="p-6 h-full bg-base-100 rounded-xl shadow-xl flex flex-col">
            {isProcessing && (
                <div className="absolute inset-0 bg-base-100/80 z-20 flex flex-col items-center justify-center rounded-xl">
                    <LoadingSpinner/>
                    <p className="mt-2">{processingMessage}</p>
                    {progress > 0 && <progress className="progress progress-primary w-56 mt-2" value={progress} max="100"></progress>}
                </div>
            )}
            {!videoFile ? renderDropZone() : renderEditor()}
        </div>
    );
};