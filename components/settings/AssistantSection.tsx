import React, { useState } from 'react';
import type { LLMSettings } from '../../types';
import { SettingRow, SettingsGroup, ProviderTab } from './primitives';
import AutocompleteSelect from '../AutocompleteSelect';
import { ASSISTANT_VOICES, DEFAULT_MALE_VOICE, DEFAULT_FEMALE_VOICE, voiceGender } from '../../utils/assistantVoices';
import AssistantToolsSection from './AssistantToolsSection';

interface AssistantSectionProps {
    activeSubTab: string;
    settings: LLMSettings;
    handleSettingsChange: (field: keyof LLMSettings, value: any) => void;
}

type AssistantTab = 'persona' | 'tools';

const AssistantSection: React.FC<AssistantSectionProps> = ({ settings, handleSettingsChange }) => {
    const [tab, setTab] = useState<AssistantTab>('persona');
    const voiceOptions = ASSISTANT_VOICES.map(v => ({ label: `${v.name} — ${v.gender}`, value: v.name, description: v.gender }));
    const currentVoiceGender = voiceGender(settings.assistantVoice);

    return (
        <div className="flex flex-col animate-fade-in pb-12">
            <div className="px-6 py-4 border-b border-base-content/10">
                <div className="flex gap-0">
                    <button
                        onClick={() => setTab('persona')}
                        className={`px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] font-logo border border-base-300/30 ${tab === 'persona' ? 'bg-primary/20 text-primary' : 'opacity-50 hover:opacity-100'}`}
                    >
                        Persona
                    </button>
                    <button
                        onClick={() => setTab('tools')}
                        className={`px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] font-logo border border-base-300/30 border-l-0 ${tab === 'tools' ? 'bg-primary/20 text-primary' : 'opacity-50 hover:opacity-100'}`}
                    >
                        Tools
                    </button>
                </div>
            </div>

            {tab === 'persona' && (
                <SettingsGroup title="Assistant Persona">
                    <SettingRow label="Assistant Name" desc="What the assistant calls itself in chat and live voice mode.">
                        <input type="text" value={settings.assistantName || ''} onChange={(e) => handleSettingsChange('assistantName', e.target.value)} className="form-input w-full md:w-[620px]" placeholder="Kollektiv" />
                    </SettingRow>
                    <SettingRow label="Assistant Brain" desc="Which engine the chat assistant reasons and calls tools on. Uses that provider's endpoint/model from the AI Engine tab. GPT (ChatGPT) models are available via OpenRouter. Live voice conversations always run on Gemini Live with the voice below.">
                        <div className="tab-group">
                            <ProviderTab label="Gemini" isActive={(settings.assistantProvider || 'gemini') === 'gemini'} onClick={() => handleSettingsChange('assistantProvider', 'gemini')} />
                            <ProviderTab label="Anthropic" isActive={settings.assistantProvider === 'anthropic'} onClick={() => handleSettingsChange('assistantProvider', 'anthropic')} />
                            <ProviderTab label="Ollama" isActive={settings.assistantProvider === 'ollama'} onClick={() => handleSettingsChange('assistantProvider', 'ollama')} />
                            <ProviderTab label="Cloud Ollama" isActive={settings.assistantProvider === 'ollama_cloud'} onClick={() => handleSettingsChange('assistantProvider', 'ollama_cloud')} />
                            <ProviderTab label="OpenRouter" isActive={settings.assistantProvider === 'openrouter'} onClick={() => handleSettingsChange('assistantProvider', 'openrouter')} />
                            <ProviderTab label="Llama.cpp" isActive={settings.assistantProvider === 'llamacpp'} onClick={() => handleSettingsChange('assistantProvider', 'llamacpp')} />
                        </div>
                    </SettingRow>
                    <SettingRow label="Voice Engine" desc="Which backend powers your live voice conversations. Gemini Live (default) uses the Gemini voice below. OpenAI Realtime uses the OpenAI API key from the AI Engine tab. ElevenLabs runs a Conversational AI agent configured in the ElevenLabs dashboard. The voice setting below only applies to Gemini — OpenAI and ElevenLabs voices are managed in their respective dashboards.">
                        <div className="tab-group">
                            <ProviderTab label="Gemini Live" isActive={(settings.voiceProvider || 'gemini_live') === 'gemini_live'} onClick={() => handleSettingsChange('voiceProvider', 'gemini_live')} />
                            <ProviderTab label="OpenAI Realtime" isActive={settings.voiceProvider === 'openai_realtime'} onClick={() => handleSettingsChange('voiceProvider', 'openai_realtime')} />
                            <ProviderTab label="ElevenLabs" isActive={settings.voiceProvider === 'elevenlabs'} onClick={() => handleSettingsChange('voiceProvider', 'elevenlabs')} />
                        </div>
                    </SettingRow>
                    <SettingRow label="Quick Persona" desc="Jump to a representative male or female voice. Pick any of the 30 voices individually below.">
                        <div className="tab-group">
                            <ProviderTab label="Male" isActive={currentVoiceGender === 'Male'} onClick={() => handleSettingsChange('assistantVoice', DEFAULT_MALE_VOICE)} />
                            <ProviderTab label="Female" isActive={currentVoiceGender === 'Female'} onClick={() => handleSettingsChange('assistantVoice', DEFAULT_FEMALE_VOICE)} />
                        </div>
                    </SettingRow>
                    <SettingRow label="Voice" desc="Exact voice used for spoken replies in Live voice mode (Gemini only). Type to search, e.g. 'female' or a name.">
                        <AutocompleteSelect value={settings.assistantVoice || 'Kore'} onChange={(v) => handleSettingsChange('assistantVoice', v)} options={voiceOptions} placeholder="SELECT VOICE..." className="w-full md:w-[620px]" />
                    </SettingRow>
                    <SettingRow label="Preferred Language" desc="Always reply in this language regardless of what language you write or speak in. Leave blank to match you automatically.">
                        <input type="text" value={settings.assistantLanguage || ''} onChange={(e) => handleSettingsChange('assistantLanguage', e.target.value)} className="form-input w-full md:w-[620px]" placeholder="e.g. English, Japanese, Tagalog" />
                    </SettingRow>
                    <SettingRow label="Personality & Style" desc="Free-form tone, quirks, or backstory — layered on top of the Master Role Concept (AI Engine tab), appended to the assistant's instructions on every provider and in live voice mode.">
                        <textarea
                            value={settings.assistantPersonality || ''}
                            onChange={(e) => handleSettingsChange('assistantPersonality', e.target.value)}
                            className="textarea textarea-bordered w-full md:w-[620px] min-h-[120px] leading-relaxed text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 rounded-none bg-base-300/30 font-mono"
                            placeholder="e.g. Speak like a witty noir detective. Keep answers short and punchy. Never use emoji."
                        />
                    </SettingRow>
                </SettingsGroup>
            )}

            {tab === 'tools' && <AssistantToolsSection settings={settings} />}
        </div>
    );
};

export default AssistantSection;
