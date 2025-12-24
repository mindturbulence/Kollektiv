
import React, { useState, useRef, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { abstractImage } from '../services/llmService';
import type { AppError, EnhancementResult } from '../types';
import { PROMPT_DETAIL_LEVELS, TARGET_IMAGE_AI_MODELS } from '../constants';
import { UploadIcon, PhotoIcon, CloseIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';
import { SuggestionItem } from './SuggestionItem';
import { fileToBase64 } from '../utils/fileUtils';

interface ImageAbstractorProps {
  onSaveSuggestion: (suggestionText: string) => void;
  header: React.ReactNode;
  onRefine: (text: string) => void;
  onClip: (text: string) => void;
}

export const ImageAbstractor: React.FC<ImageAbstractorProps> = ({ onSaveSuggestion, header, onRefine, onClip }) => {
    const { settings } = useSettings();
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const [promptLength, setPromptLength] = useState<string>(PROMPT_DETAIL_LEVELS.MEDIUM);
    const [targetAIModel, setTargetAIModel] = useState<string>(TARGET_IMAGE_AI_MODELS[0]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<AppError | null>(null);
    const [results, setResults] = useState<EnhancementResult | null>(null);

    const handleFileSelect = (file: File | null) => {
        if (file && file.type.startsWith('image/')) {
            setImageFile(file);
            if (imagePreviewUrl && typeof window !== 'undefined') URL.revokeObjectURL(imagePreviewUrl);
            setImagePreviewUrl(URL.createObjectURL(file));
            setError(null);
            setResults(null);
        } else if(file) {
            setError({ message: 'Please select a valid image file.' });
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        handleFileSelect((e.dataTransfer as any).files[0]);
    };

    const handleRemoveImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (imagePreviewUrl && typeof window !== 'undefined') URL.revokeObjectURL(imagePreviewUrl);
        setImageFile(null);
        setImagePreviewUrl(null);
        setError(null);
        setResults(null);
        if (fileInputRef.current) (fileInputRef.current as any).value = "";
    };

    const handleAbstract = useCallback(async () => {
        if (!imageFile) {
            setError({ message: 'Please upload an image first.' });
            return;
        }
        setIsLoading(true);
        setError(null);
        setResults(null);
        try {
            const base64Data = await fileToBase64(imageFile, true);
            const result = await abstractImage(base64Data, promptLength, targetAIModel, settings);
            setResults(result);
        } catch (err: any) {
            setError({ message: err.message });
        } finally {
            setIsLoading(false);
        }
    }, [imageFile, promptLength, targetAIModel, settings]);
    
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 h-full">
            {/* Left Column: Form */}
            <div className="lg:col-span-1 bg-base-100 rounded-lg shadow-lg flex flex-col min-h-0">
                {header}
                <div className="p-4 flex flex-col gap-4 flex-grow min-h-0">
                    <div 
                        className={`relative flex-grow w-full border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors group ${isDragging ? 'border-primary bg-primary/10' : 'border-base-content/20 hover:border-primary/50'}`}
                        style={{
                            backgroundImage: imagePreviewUrl ? `url(${imagePreviewUrl})` : 'none',
                            backgroundSize: 'contain',
                            backgroundPosition: 'center',
                            backgroundRepeat: 'no-repeat'
                        }}
                        onDrop={handleDrop}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onClick={() => (fileInputRef.current as any)?.click()}
                    >
                        <input type="file" ref={fileInputRef} onChange={(e) => handleFileSelect((e.currentTarget as any).files?.[0] || null)} className="hidden" accept="image/*"/>
                        {!imagePreviewUrl && (
                            <div className="text-center text-base-content/60 p-4 bg-base-100/50 rounded-lg backdrop-blur-sm">
                                <UploadIcon className="w-12 h-12 mx-auto"/>
                                <p className="mt-2 font-semibold">Drop an image here</p>
                                <p className="text-sm">or click to browse</p>
                            </div>
                        )}
                         {imagePreviewUrl && (
                            <button onClick={handleRemoveImage} className="btn btn-sm btn-circle btn-error absolute top-2 right-2 opacity-0 group-hover:opacity-100">
                                <CloseIcon className="w-4 h-4"/>
                            </button>
                        )}
                    </div>
                </div>
                <div className="p-4 border-t border-base-300 flex-shrink-0 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="form-control">
                            <label className="label py-1"><span className="label-text">Target AI Model</span></label>
                            <select value={targetAIModel} onChange={(e) => setTargetAIModel((e.currentTarget as any).value)} className="select select-bordered select-sm w-full">
                                {TARGET_IMAGE_AI_MODELS.map(model => <option key={model} value={model}>{model}</option>)}
                            </select>
                        </div>
                        <div className="form-control">
                            <label className="label py-1"><span className="label-text">Prompt Detail Level</span></label>
                            <select value={promptLength} onChange={(e) => setPromptLength((e.currentTarget as any).value)} className="select select-bordered select-sm w-full">
                                {Object.entries(PROMPT_DETAIL_LEVELS).map(([key, value]) => (
                                    <option key={key} value={value}>{value}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <button onClick={handleAbstract} disabled={isLoading || !imageFile} className="btn btn-sm btn-primary w-full">
                        {isLoading ? 'Analyzing...' : 'Describe Image'}
                    </button>
                </div>
            </div>
            {/* Right Column: Results */}
            <div className="lg:col-span-2 bg-base-100 rounded-lg shadow-lg flex flex-col min-h-0">
                <div className="p-4 border-b border-base-300"><h2 className="text-xl font-bold text-primary">Generated Prompts</h2></div>
                <div className="flex-grow p-4 overflow-y-auto">
                    {isLoading ? (
                        <LoadingSpinner />
                    ) : error ? (
                        <div className="alert alert-error">
                            <span>Error: {error.message}</span>
                        </div>
                    ) : results ? (
                        <div className="space-y-4">
                            {results.suggestions.map((suggestion, index) => (
                                <SuggestionItem 
                                    key={index} 
                                    suggestionText={suggestion} 
                                    onSave={onSaveSuggestion}
                                    onRefine={onRefine}
                                    onClip={onClip}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center p-8">
                            <PhotoIcon className="w-16 h-16 mx-auto text-base-content/30" />
                            <p className="mt-4 text-base-content/70">Prompts generated from your image will appear here.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
