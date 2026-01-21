import React, { useState, useCallback, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { dissectPrompt, generateFocusedVariations } from '../services/llmService';
import { Atom2Icon, GitBranchIcon, RefreshIcon, EditIcon, CheckIcon, ChevronDownIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';

interface PromptAnatomyPanelProps {
  promptToAnalyze: string | null;
  onReconstructFromComponents: (newComponents: { [key: string]: string }) => Promise<void>;
  onReplaceVariation: (key: string, value: string) => Promise<void>;
  analysisTrigger: number;
  isProcessing: boolean;
}

export const PromptAnatomyPanel: React.FC<PromptAnatomyPanelProps> = ({ promptToAnalyze, onReconstructFromComponents, onReplaceVariation, analysisTrigger, isProcessing }) => {
  const { settings } = useSettings();
  const [components, setComponents] = useState<{[key: string]: string} | null>(null);
  const [variations, setVariations] = useState<{[key: string]: string[]} | null>(null);
  
  const [loadingState, setLoadingState] = useState<'idle' | 'dissecting' | 'variating'>('idle');
  const [error, setError] = useState<string | null>(null);

  const [editingComponent, setEditingComponent] = useState<{key: string, value: string} | null>(null);
  const [isReconstructing, setIsReconstructing] = useState(false);
  const [processingVariation, setProcessingVariation] = useState<{key: string, value: string} | null>(null);
  const [expandedVariations, setExpandedVariations] = useState<Record<string, boolean>>({});

  const [isComponentsSectionExpanded, setIsComponentsSectionExpanded] = useState(true);
  const [isVariationsSectionExpanded, setIsVariationsSectionExpanded] = useState(true);

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
      const dissected = await dissectPrompt(promptToAnalyze, settings);
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

  return (
    <div className="bg-base-100 flex flex-col h-full overflow-hidden">
      <header className="p-6 border-b border-base-300 bg-base-200/10 flex justify-between items-center flex-shrink-0">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Prompt Analysis</h3>
      </header>
      <main className="p-6 overflow-y-auto space-y-8 flex-grow custom-scrollbar">
        {error && <div className="alert alert-error rounded-none text-xs p-2"><span>{error}</span></div>}
        
        {loadingState !== 'idle' && (
            <div className="text-center py-12">
                <LoadingSpinner size={48} />
                <p className="text-[9px] font-black uppercase tracking-[0.4em] text-primary animate-pulse -mt-4">
                    {loadingState === 'dissecting' && 'Analyzing prompt...'}
                    {loadingState === 'variating' && 'Suggesting variations...'}
                </p>
            </div>
        )}

        {loadingState === 'idle' && !components && (
             <div className="text-center py-32 opacity-10 uppercase font-black tracking-widest text-xs">
                Ready to analyze
            </div>
        )}

        {loadingState !== 'dissecting' && components && (
            <div className="animate-fade-in space-y-12">
                <section>
                    <summary 
                        className="list-none flex items-center cursor-pointer font-black text-[10px] uppercase tracking-widest text-base-content/30 mb-6"
                        onClick={(e) => { e.preventDefault(); setIsComponentsSectionExpanded(p => !p); }}
                    >
                         <ChevronDownIcon className={`w-3.5 h-3.5 mr-2 transition-transform duration-200 ${!isComponentsSectionExpanded ? '-rotate-90' : ''}`} />
                        Components Found
                    </summary>
                    {isComponentsSectionExpanded && (
                        <div className="space-y-6">
                        {Object.keys(components).length > 0 ? (
                            <>
                                {(Object.entries(components) as [string, string][]).map(([key, value]) => (
                                    <div key={key} className="group relative border-b border-base-300/30 pb-4 last:border-0">
                                        <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 mb-2">{key}</h4>
                                        <div className="flex justify-between items-start gap-4">
                                            {editingComponent?.key === key ? (
                                                <input 
                                                    type="text" 
                                                    value={editingComponent.value}
                                                    onChange={(e) => setEditingComponent({...editingComponent, value: (e.currentTarget as any).value})}
                                                    onKeyDown={e => e.key === 'Enter' && handleComponentSave()}
                                                    onBlur={handleComponentSave}
                                                    className="input input-xs w-full font-bold uppercase tracking-tighter rounded-none bg-base-200"
                                                    autoFocus
                                                    disabled={isProcessing || isReconstructing}
                                                />
                                            ) : (
                                                <p className="text-sm font-medium leading-relaxed text-base-content/80">{value}</p>
                                            )}
                                            
                                            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {editingComponent?.key === key ? (
                                                    <button onClick={handleComponentSave} disabled={isProcessing || isReconstructing} className="btn btn-xs btn-ghost btn-square">
                                                        {isReconstructing ? <LoadingSpinner size={16} /> : <CheckIcon className="w-4 h-4 text-success"/>}
                                                    </button>
                                                ) : (
                                                    <button onClick={() => handleComponentEdit(key, value)} disabled={isProcessing || isReconstructing || !!processingVariation} className="btn btn-xs btn-ghost btn-square"><EditIcon className="w-3.5 h-3.5"/></button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </>
                        ) : (
                            <p className="text-[10px] font-black uppercase tracking-widest text-base-content/20 text-center py-12">No components mapped.</p>
                        )}
                        </div>
                    )}
                </section>
                
                {variations && Object.keys(variations).length > 0 && (
                    <section className="border-t border-base-300 pt-8">
                        <summary 
                            className="list-none flex items-center cursor-pointer font-black text-[10px] uppercase tracking-widest text-base-content/30 mb-6"
                            onClick={(e) => { e.preventDefault(); setIsVariationsSectionExpanded(p => !p); }}
                        >
                            <ChevronDownIcon className={`w-3.5 h-3.5 mr-2 transition-transform duration-200 ${!isVariationsSectionExpanded ? '-rotate-90' : ''}`} />
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
                                                <ChevronDownIcon className={`w-3 h-3 transition-transform duration-200 ${!expandedVariations[key] ? '-rotate-90' : ''} text-base-content/20`} />
                                                <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-base-content/40">{key}</h4>
                                            </div>
                                            {expandedVariations[key] && (
                                                <div className="flex flex-wrap gap-2 pl-5">
                                                    {values.map((v, i) => {
                                                        const isThisOneProcessing = processingVariation?.key === key && processingVariation?.value === v;
                                                        return (
                                                            <button 
                                                                key={i} 
                                                                onClick={() => handleVariationClick(key, v)}
                                                                className="badge badge-outline rounded-none border-base-300/50 hover:border-primary hover:text-primary transition-all cursor-pointer h-auto py-1.5 px-3 text-left whitespace-normal text-[11px] font-bold tracking-tight disabled:opacity-30"
                                                                disabled={isProcessing || isReconstructing || isAnyVariationProcessing}
                                                            >
                                                                {isThisOneProcessing ? <LoadingSpinner size={12} /> : v}
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
    </div>
  );
};