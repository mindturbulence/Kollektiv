import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import type { PromptModifiers } from '../types';
import { dissectPrompt, generateFocusedVariations, generateConstructorPreset } from '../services/llmService';
import { refinerPresetService } from '../services/refinerPresetService';
import { EditIcon, CheckIcon, ChevronDownIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';

interface PromptAnatomyPanelProps {
  promptToAnalyze: string | null;
  onReconstructFromComponents: (newComponents: { [key: string]: string }) => Promise<void>;
  onReplaceVariation: (key: string, value: string) => Promise<void>;
  onSaveSuccess?: (prompt: string, modifiers: PromptModifiers, constantModifier?: string) => void;
  analysisTrigger: number;
  isProcessing: boolean;
  modifierCatalog?: string;
}

export const PromptAnatomyPanel: React.FC<PromptAnatomyPanelProps> = ({ promptToAnalyze, onReconstructFromComponents, onReplaceVariation, onSaveSuccess, analysisTrigger, isProcessing, modifierCatalog }) => {
  const { settings } = useSettings();
  const [components, setComponents] = useState<{[key: string]: string} | null>(null);
  const [variations, setVariations] = useState<{[key: string]: string[]} | null>(null);
  
  const [loadingState, setLoadingState] = useState<'idle' | 'dissecting' | 'variating'>('idle');
  const [error, setError] = useState<string | null>(null);

  const [editingComponent, setEditingComponent] = useState<{key: string, value: string} | null>(null);
  const [isReconstructing, setIsReconstructing] = useState(false);
  const [processingVariation, setProcessingVariation] = useState<{key: string, value: string} | null>(null);
  const [expandedVariations, setExpandedVariations] = useState<Record<string, boolean>>({});

  const scrollerRef = useRef<HTMLDivElement>(null);

  const [isComponentsSectionExpanded, setIsComponentsSectionExpanded] = useState(true);
  const [isVariationsSectionExpanded, setIsVariationsSectionExpanded] = useState(true);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [pendingPresetName, setPendingPresetName] = useState('');
  const [pendingPresetContent, setPendingPresetContent] = useState('');
  const [pendingPresetModifiers, setPendingPresetModifiers] = useState<PromptModifiers>({});
  const [pendingPresetConstantModifier, setPendingPresetConstantModifier] = useState('');

  const handleDissect = useCallback(async () => {
    if (!promptToAnalyze || !promptToAnalyze.trim()) {
      setComponents(null);
      setVariations(null);
      setError(null);
      return;
    }
    setLoadingState('dissecting');
    setError(null);
    setComponents(null);
    setVariations(null);
    setIsReconstructing(false);
    setProcessingVariation(null);

    try {
      const dissected = await dissectPrompt(promptToAnalyze, settings, modifierCatalog);
      setComponents(dissected);
      setIsComponentsSectionExpanded(true); 
      setIsVariationsSectionExpanded(true);

      if (Object.keys(dissected).length > 0) {
        setLoadingState('variating');
        const componentVariations = await generateFocusedVariations(promptToAnalyze, dissected, settings);
        setVariations(componentVariations);
        const initialExpanded: Record<string, boolean> = {};
        Object.keys(componentVariations).forEach(key => {
            initialExpanded[key] = false; 
        });
        setExpandedVariations(initialExpanded);
      }
    } catch (e: any) {
      setError(e.message || "Failed to analyze prompt.");
    } finally {
      setLoadingState('idle');
    }
  }, [promptToAnalyze, settings]);
  
  useEffect(() => {
    if (analysisTrigger > 0) {
        handleDissect();
    }
  }, [analysisTrigger, handleDissect]);

  useEffect(() => {
    if (!promptToAnalyze) {
        setComponents(null);
        setVariations(null);
        setError(null);
        setLoadingState('idle');
    }
  }, [promptToAnalyze]);

  const handleVariationClick = async (key: string, value: string) => {
    if (processingVariation || isReconstructing) return;
    setProcessingVariation({ key, value });
    try {
        await onReplaceVariation(key, value);
    } finally {
        setProcessingVariation(null);
    }
  };
  
  const handleComponentEdit = (key: string, value: string) => {
    setEditingComponent({ key, value });
  };
  
  const handleComponentSave = async () => {
    if (editingComponent && components) {
        setIsReconstructing(true);
        try {
            const newComponents = { ...components, [editingComponent.key]: editingComponent.value };
            await onReconstructFromComponents(newComponents);
            setEditingComponent(null);
        } finally {
            setIsReconstructing(false);
        }
    }
  };

  const handleSavePreset = async () => {
    if (!components || isSavingPreset) return;
    setIsSavingPreset(true);
    try {
      const result = await generateConstructorPreset(components, settings, modifierCatalog);
      const subject = components['Subject'] || components['subject'] || components['Prompt Idea'] || components['prompt idea'] || 'New Preset';
      const defaultName = `Constructor: ${subject.substring(0, 20)}${subject.length > 20 ? '...' : ''}`;
      
      setPendingPresetContent(result.prompt);
      setPendingPresetModifiers(result.modifiers);
      setPendingPresetConstantModifier(result.constantModifier || '');
      setPendingPresetName(defaultName);
      setShowSaveModal(true);
    } catch (e: any) {
      setError(e.message || "Failed to save preset.");
    } finally {
      setIsSavingPreset(false);
    }
  };

  const confirmSavePreset = async () => {
    if (!pendingPresetName.trim() || !pendingPresetContent) return;
    setIsSavingPreset(true);
    try {
      await refinerPresetService.savePreset({
        name: pendingPresetName.trim(),
        modifiers: pendingPresetModifiers,
        targetAIModel: 'Default (General Purpose)',
        mediaMode: 'image',
        promptLength: 'Medium',
        refineText: pendingPresetContent,
        constantModifier: pendingPresetConstantModifier
      });
      
      // Call success callback to update Refiner state if needed
      onSaveSuccess?.(pendingPresetContent, pendingPresetModifiers, pendingPresetConstantModifier);
      
      setShowSaveModal(false);
      setPendingPresetContent('');
      setPendingPresetName('');
      setPendingPresetModifiers({});
      setPendingPresetConstantModifier('');
    } catch (e: any) {
      setError(e.message || "Failed to save preset.");
    } finally {
      setIsSavingPreset(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden min-h-0 relative bg-base-100/30 backdrop-blur-xl">
      <header className="p-6 flex justify-between items-center flex-shrink-0 bg-base-100/10 backdrop-blur-md">
        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-primary">Prompt Analysis</h3>
      </header>
      <main ref={scrollerRef} className="p-6 overflow-y-auto space-y-8 flex-grow min-h-0">
        {error && <div className="alert alert-error rounded-none text-xs p-2"><span>{error}</span></div>}
        
        {loadingState !== 'idle' && (
            <div className="text-center py-12">
                <LoadingSpinner size={48} />
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary animate-pulse -mt-4">
                    {loadingState === 'dissecting' && 'Analyzing prompt...'}
                    {loadingState === 'variating' && 'Suggesting variations...'}
                </p>
            </div>
        )}

        {loadingState === 'idle' && !components && (
             <div className="text-center py-32 opacity-10 uppercase font-black tracking-widest text-sm">
                Ready to analyze
            </div>
        )}

        {loadingState !== 'dissecting' && components && (
            <div className="animate-fade-in space-y-12">
                <section>
                    <summary 
                        className="list-none flex items-center cursor-pointer font-black text-xs uppercase tracking-widest text-base-content/30 mb-6"
                        onClick={(e) => { e.preventDefault(); setIsComponentsSectionExpanded(p => !p); }}
                    >
                         <ChevronDownIcon className={`w-4 h-4 mr-2 transition-transform duration-200 ${!isComponentsSectionExpanded ? '-rotate-90' : ''}`} />
                        Components Found
                    </summary>
                    {isComponentsSectionExpanded && (
                        <div className="space-y-6">
                        {Object.keys(components).length > 0 ? (
                            <>
                                {(Object.entries(components) as [string, string][]).map(([key, value]) => (
                                    <div key={key} className="group relative border-b border-base-300/30 pb-4 last:border-0">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 mb-2">{key}</h4>
                                        <div className="flex justify-between items-start gap-4">
                                            {editingComponent?.key === key ? (
                                                <input 
                                                    type="text" 
                                                    value={editingComponent.value}
                                                    onChange={(e) => setEditingComponent({...editingComponent, value: (e.currentTarget as any).value})}
                                                    onKeyDown={e => e.key === 'Enter' && handleComponentSave()}
                                                    onBlur={handleComponentSave}
                                                    className="form-input w-full"
                                                    autoFocus
                                                    disabled={isProcessing || isReconstructing}
                                                />
                                            ) : (
                                                <p className="text-base font-medium leading-relaxed text-base-content/80">{value}</p>
                                            )}
                                            
                                            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {editingComponent?.key === key ? (
                                                    <button onClick={handleComponentSave} disabled={isProcessing || isReconstructing} className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 btn-snake">
                                                        <span/><span/><span/><span/>
                                                        {isReconstructing ? <LoadingSpinner size={16} /> : <CheckIcon className="w-4 h-4 text-success"/>}
                                                    </button>
                                                ) : (
                                                    <button onClick={() => handleComponentEdit(key, value)} disabled={isProcessing || isReconstructing || !!processingVariation} className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 btn-snake">
                                                        <span/><span/><span/><span/>
                                                        <EditIcon className="w-4 h-4"/>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </>
                        ) : (
                            <p className="text-xs font-black uppercase tracking-widest text-base-content/20 text-center py-12">No components mapped.</p>
                        )}
                        </div>
                    )}
                </section>
                
                {variations && Object.keys(variations).length > 0 && (
                    <section className="border-t border-base-300 pt-8">
                        <summary 
                            className="list-none flex items-center cursor-pointer font-black text-xs uppercase tracking-widest text-base-content/30 mb-6"
                            onClick={(e) => { e.preventDefault(); setIsVariationsSectionExpanded(p => !p); }}
                        >
                            <ChevronDownIcon className={`w-4 h-4 mr-2 transition-transform duration-200 ${!isVariationsSectionExpanded ? '-rotate-90' : ''}`} />
                            Alternative Suggestions
                        </summary>
                        {isVariationsSectionExpanded && (
                            <div className="space-y-6">
                                {(Object.entries(variations) as [string, string[]][]).map(([key, values]) => {
                                    const isAnyVariationProcessing = !!processingVariation;

                                    return (
                                        <div key={key} className="space-y-3">
                                            <div 
                                                className="flex items-center gap-2 cursor-pointer"
                                                onClick={() => setExpandedVariations(prev => ({ ...prev, [key]: !prev[key] }))}
                                            >
                                                <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform duration-200 ${!expandedVariations[key] ? '-rotate-90' : ''} text-base-content/20`} />
                                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40">{key}</h4>
                                            </div>
                                            {expandedVariations[key] && (
                                                <div className="flex flex-wrap gap-2 pl-5">
                                                    {values.map((v, i) => {
                                                        const isThisOneProcessing = processingVariation?.key === key && processingVariation?.value === v;
                                                        return (
                                                    <button 
                                                                key={i} 
                                                                onClick={() => handleVariationClick(key, v)}
                                                                className="btn btn-xs btn-ghost h-auto py-2 px-4 text-left whitespace-normal text-xs font-bold tracking-tight disabled:opacity-30 rounded-none btn-snake"
                                                                disabled={isProcessing || isReconstructing || isAnyVariationProcessing}
                                                            >
                                                                <span/><span/><span/><span/>
                                                                {isThisOneProcessing ? <LoadingSpinner size={14} /> : v}
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </section>
                )}
            </div>
        )}
      </main>
      
      {components && (
        <footer className="p-1.5 bg-base-100/80 backdrop-blur-md flex-shrink-0">
          <button 
            onClick={handleSavePreset} 
            disabled={isSavingPreset || loadingState !== 'idle'}
            className="btn btn-sm btn-primary w-full h-12 rounded-none font-black text-[10px] tracking-widest uppercase disabled:text-base-content/20 disabled:bg-transparent disabled:opacity-100 btn-snake-primary"
          >
            <span/><span/><span/><span/>
            {isSavingPreset ? <LoadingSpinner size={16} /> : "SAVE CONSTRUCTOR PRESET"}
          </button>
        </footer>
      )}

      {showSaveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-xl animate-fade-in" onClick={() => setShowSaveModal(false)}>
          <div className="bg-base-100/40 w-full max-w-sm p-8 shadow-2xl space-y-6" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-2">
              <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Save Constructor Preset</h4>
              <p className="text-xs text-base-content/60 leading-relaxed font-medium">This will be saved to your Refiner Presets registry.</p>
            </div>
            
            <div className="space-y-4">
              <div className="form-control">
                <label className="label py-0 mb-2">
                  <span className="label-text text-[9px] font-black uppercase tracking-widest opacity-40">Preset Name</span>
                </label>
                <input 
                  type="text" 
                  value={pendingPresetName}
                  onChange={(e) => setPendingPresetName(e.target.value)}
                  className="form-input w-full"
                  placeholder="ENTER NAME..."
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && confirmSavePreset()}
                />
              </div>

              <div className="flex gap-1.5 pt-2">
                <button 
                  onClick={() => setShowSaveModal(false)}
                  className="btn btn-sm btn-ghost flex-1 h-10 rounded-none uppercase font-black text-[10px] tracking-widest btn-snake"
                >
                  <span/><span/><span/><span/>
                  Cancel
                </button>
                <button 
                  onClick={confirmSavePreset}
                  disabled={!pendingPresetName.trim() || isSavingPreset}
                  className="btn btn-sm btn-primary flex-1 h-10 rounded-none uppercase font-black text-[10px] tracking-widest btn-snake-primary"
                >
                  <span/><span/><span/><span/>
                  {isSavingPreset ? <LoadingSpinner size={16} /> : 'Save Preset'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};