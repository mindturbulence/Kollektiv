import React, { useRef, useEffect, useLayoutEffect } from "react";
import { gsap } from "gsap";
import { useSettings } from "../contexts/SettingsContext";
import { AVAILABLE_LLM_MODELS } from "../constants";
import { CloseIcon, SparklesIcon } from "./icons";
import { audioService } from "../services/audioService";

interface LlmStatusPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const LlmStatusPanel: React.FC<LlmStatusPanelProps> = ({ isOpen, onClose }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const {
    settings,
    updateSettings,
    availableOllamaModels,
    availableOllamaCloudModels,
  } = useSettings();

  useLayoutEffect(() => {
    if (!panelRef.current) return;

    if (isOpen) {
      gsap.killTweensOf(panelRef.current);
      gsap.to(panelRef.current, {
        x: 0,
        duration: 1.0,
        ease: "expo.out",
        visibility: "visible",
        pointerEvents: "auto",
        opacity: 1,
      });
    } else {
      gsap.killTweensOf(panelRef.current);
      gsap.to(panelRef.current, {
        x: "-100%",
        duration: 0.6,
        ease: "expo.in",
        pointerEvents: "none",
        opacity: 0,
        onComplete: () => {
          if (panelRef.current && !isOpen) {
            panelRef.current.style.visibility = "hidden";
          }
        },
      });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !(panelRef.current as any).contains(event.target as any)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleProviderAndModelSelect = (
    provider: "gemini" | "ollama" | "ollama_cloud",
    modelId?: string,
  ) => {
    audioService.playClick();
    if (provider === "gemini" && modelId) {
      updateSettings({ ...settings, activeLLM: "gemini", llmModel: modelId });
    } else if (provider === "ollama" && modelId) {
      updateSettings({
        ...settings,
        activeLLM: "ollama",
        ollamaModel: modelId,
      });
    } else if (provider === "ollama_cloud" && modelId) {
      updateSettings({
        ...settings,
        activeLLM: "ollama_cloud",
        ollamaCloudModel: modelId,
      });
    }
    onClose();
  };

  return (
    <div
      ref={panelRef}
      className="absolute top-0 left-0 bottom-0 w-full md:w-[400px] bg-transparent z-[55] -translate-x-full pointer-events-none"
      style={{ visibility: "hidden" }}
      aria-hidden={!isOpen}
    >
      <div className="w-full h-full relative corner-frame overflow-visible flex flex-col pointer-events-auto">
        <div className="bg-base-100/60 backdrop-blur-3xl rounded-none w-[calc(100%-6px)] h-[calc(100%-6px)] m-[3px] flex flex-col overflow-hidden relative z-10">
          {/* Header */}
          <div className="flex justify-between items-center h-16 px-6 bg-base-100/20 flex-shrink-0 border-b border-base-300/10 relative">
            <div className="flex items-center gap-3">
              <h3 className="font-black text-[10px] font-jardhani uppercase tracking-[0.2em]">
                Intelligence Models
              </h3>
            </div>
            <button
              onClick={() => {
                audioService.playClick();
                onClose();
              }}
              className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100 btn-snake"
              aria-label="Close intelligence panel"
            >
              <span />
              <span />
              <span />
              <span />
              <CloseIcon className="w-5 h-5" />
            </button>
            <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          </div>

          {/* Body */}
          <div className="flex-grow overflow-y-auto scrollbar-thin">
            <ul className="menu p-0 flex flex-col flex-nowrap py-4">
              {/* Google Gemini Section */}
              <li className="menu-title px-8 py-4 text-[12px] uppercase tracking-[0.1em] opacity-40 font-bold text-primary">
                <span>Google Models (Gemini)</span>
              </li>
              {AVAILABLE_LLM_MODELS.map((model) => (
                <li key={model.id} className="w-full">
                  <button
                    onClick={() =>
                      handleProviderAndModelSelect("gemini", model.id)
                    }
                    className={`rounded-none text-[10px] font-jardhani uppercase tracking-widest py-2 w-full text-left px-8 border-l-2 transition-all ${settings.llmModel === model.id && settings.activeLLM === "gemini" ? "text-primary bg-primary/5 border-primary shadow-[inset_10px_0_20px_-10px_rgba(var(--p),0.1)]" : "text-base-content/40 hover:text-base-content hover:bg-base-content/5 border-transparent"}`}
                  >
                    {model.name}
                  </button>
                </li>
              ))}

              <div className="h-px bg-base-content/5 mx-8 my-6" />

              {/* Ollama Model Section */}
              <li className="menu-title px-8 py-4 text-[12px] uppercase tracking-[0.1em] opacity-40 font-bold text-primary">
                <span>OpenSource Models (Ollama)</span>
              </li>

              {/* Local Models */}
              {availableOllamaModels.length > 0
                ? availableOllamaModels.map((model) => (
                  <li key={`local-${model}`} className="w-full">
                    <button
                      onClick={() =>
                        handleProviderAndModelSelect("ollama", model)
                      }
                      className={`rounded-none text-[10px] font-jardhani uppercase tracking-widest py-2 w-full text-left px-8 border-l-2 transition-all ${settings.ollamaModel === model && settings.activeLLM === "ollama" ? "text-secondary bg-secondary/5 border-secondary shadow-[inset_10px_0_20px_-10px_rgba(var(--s),0.1)]" : "text-base-content/40 hover:text-base-content hover:bg-base-content/5 border-transparent"}`}
                    >
                      {model}
                    </button>
                  </li>
                ))
                : null}

              {/* Cloud Models */}
              {availableOllamaCloudModels.length > 0
                ? availableOllamaCloudModels.map((model) => (
                  <li key={`cloud-${model}`} className="w-full">
                    <button
                      onClick={() =>
                        handleProviderAndModelSelect("ollama_cloud", model)
                      }
                      className={`rounded-none text-[10px] font-jardhani uppercase tracking-widest py-2 w-full text-left px-8 border-l-2 transition-all ${settings.ollamaCloudModel === model && settings.activeLLM === "ollama_cloud" ? "text-primary bg-primary/5 border-primary shadow-[inset_10px_0_20px_-10px_rgba(var(--p),0.1)]" : "text-base-content/40 hover:text-base-content hover:bg-base-content/5 border-transparent"}`}
                    >
                      {model}
                    </button>
                  </li>
                ))
                : null}

              {availableOllamaModels.length === 0 &&
                availableOllamaCloudModels.length === 0 && (
                  <li className="disabled w-full">
                    <span className="text-[10px] italic opacity-20 py-12 block text-center font-mono uppercase tracking-[0.4em]">
                      NO LOCAL INTERFACES DETECTED
                    </span>
                  </li>
                )}
            </ul>
          </div>
        </div>
        {/* Corner Accents */}
        <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
        <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
        <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
        <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
      </div>
    </div>
  );
};

export default LlmStatusPanel;
