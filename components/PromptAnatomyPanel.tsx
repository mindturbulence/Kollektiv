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
      setIsComponentsSectionExpanded(true); // Expand on new analysis
      setIsVariationsSectionExpanded(true); // Expand on new analysis

      if (Object.keys(dissected).length > 0) {
        setLoadingState('variating');
        const componentVariations = await generateFocusedVariations(promptToAnalyze, dissected, settings);
        setVariations(componentVariations);
        const initialExpanded: Record<string, boolean> = {};
        Object.keys(componentVariations).forEach(key => {
            initialExpanded[key] = false; // Start with variation items collapsed
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
    // Cleanup effect when the prompt is cleared from the parent
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
    <div className="card bg-base-100 shadow-lg flex flex-col h-full">
      <header className="card-title p-4 text-base justify-between flex-shrink-0 border-b border-base-300">
        <span>Prompt Composer</span>
        <button onClick={handleDissect} disabled={true} className="btn btn-sm btn-ghost btn-square opacity-0">
            <RefreshIcon className={`w-4 h-4`} />
        </button>
      </header>
      <main className="card-body p-4 overflow-y-auto space-y-4">
        {error && <div className="alert alert-error text-sm p-2"><span>{error}</span></div>}
        
        {loadingState !== 'idle' && (
            <div className="text-center">
                <LoadingSpinner />
                <p className="text-sm text-base-content/70 -mt-4">
                    {loadingState === 'dissecting' && 'Analyzing components...'}
                    {loadingState === 'variating' && 'Generating variations...'}
                </p>
            </div>
        )}

        {loadingState === 'idle' && !components && (
             <div className="text-center p-4 text-sm text-base-content/70">
                Click "Analyze" on a generated result to see its components here.
            </div>
        )}

        {loadingState !== 'dissecting' && components && (
            <>
                <details open={isComponentsSectionExpanded}>
                    <summary 
                        className="list-none flex items-center cursor-pointer font-semibold text-sm uppercase tracking-wider text-base-content/60 mb-2"
                        onClick={(e) => { e.preventDefault(); setIsComponentsSectionExpanded(p => !p); }}
                    >
                         <ChevronDownIcon className={`w-4 h-4 mr-1 transition-transform duration-200 ${!isComponentsSectionExpanded ? '-rotate-90' : ''}`} />
                        Dissected Components
                    </summary>
                    <div className="pl-5 space-y-2 text-sm">
                     {Object.keys(components).length > 0 ? (
                        <>
                            {Object.entries(components).map(([key, value]) => (
                                <div key={key} className="flex justify-between items-center group">
                                    <div className="flex-grow">
                                        <h4 className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">{key}</h4>
                                        {editingComponent?.key === key ? (
                                             <input 
                                                type="text" 
                                                value={editingComponent.value}
                                                onChange={(e) => setEditingComponent({...editingComponent, value: (e.currentTarget as any).value})}
                                                onKeyDown={e => e.key === 'Enter' && handleComponentSave()}
                                                onBlur={handleComponentSave}
                                                className="input input-xs w-full"
                                                autoFocus
                                                disabled={isProcessing || isReconstructing}
                                            />
                                        ) : (
                                            <p className="text-base-content">{value}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center">
                                        {editingComponent?.key === key ? (
                                            <button onClick={handleComponentSave} disabled={isProcessing || isReconstructing} className="btn btn-xs btn-ghost btn-square">
                                                {isReconstructing ? <span className="loading loading-spinner loading-xs" /> : <CheckIcon className="w-4 h-4 text-success"/>}
                                            </button>
                                        ) : (
                                            <button onClick={() => handleComponentEdit(key, value)} disabled={isProcessing || isReconstructing || !!processingVariation} className="btn btn-xs btn-ghost btn-square opacity-0 group-hover:opacity-100"><EditIcon className="w-4 h-4"/></button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </>
                    ) : (
                        <p className="text-sm text-base-content/70">No distinct components were identified.</p>
                    )}
                    </div>
                </details>
                
                {variations && Object.keys(variations).length > 0 && (
                    <div className="border-t border-base-300 pt-4">
                        <details open={isVariationsSectionExpanded}>
                            <summary 
                                className="list-none flex items-center cursor-pointer font-semibold text-sm uppercase tracking-wider text-base-content/60 mb-2"
                                onClick={(e) => { e.preventDefault(); setIsVariationsSectionExpanded(p => !p); }}
                            >
                                <ChevronDownIcon className={`w-4 h-4 mr-1 transition-transform duration-200 ${!isVariationsSectionExpanded ? '-rotate-90' : ''}`} />
                                Variations
                            </summary>
                            <div className="pl-5 space-y-2">
                                {Object.entries(variations).map(([key, values]) => {
                                    const isAnyVariationProcessing = !!processingVariation;

                                    return (
                                        <details key={key} open={expandedVariations[key]} className="group">
                                            <summary 
                                                className="list-none flex items-center cursor-pointer p-1 -ml-1 rounded-md hover:bg-base-200"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setExpandedVariations(prev => ({ ...prev, [key]: !prev[key] }));
                                                }}
                                            >
                                                <ChevronDownIcon className={`w-4 h-4 mr-1 transition-transform duration-200 ${!expandedVariations[key] ? '-rotate-90' : ''}`} />
                                                <h4 className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">{key}</h4>
                                            </summary>
                                            <div className="flex flex-wrap gap-1.5 mt-2 pl-4 items-start">
                                                {values.map((v, i) => {
                                                    const isThisOneProcessing = processingVariation?.key === key && processingVariation?.value === v;
                                                    return (
                                                        <button 
                                                            key={i} 
                                                            onClick={() => handleVariationClick(key, v)}
                                                            className="badge badge-outline h-auto py-1 text-left whitespace-normal hover:badge-primary cursor-pointer disabled:cursor-not-allowed disabled:bg-base-200 disabled:border-base-300"
                                                            title={`Replace "${components[key]}" with "${v}" in your result`}
                                                            disabled={isProcessing || isReconstructing || isAnyVariationProcessing}
                                                        >
                                                            {isThisOneProcessing ? <span className="loading loading-spinner loading-xs" /> : v}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </details>
                                    )
                                })}
                            </div>
                        </details>
                    </div>
                )}
            </>
        )}
      </main>
    </div>
  );
};