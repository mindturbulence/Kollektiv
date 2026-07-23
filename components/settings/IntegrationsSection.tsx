import React from 'react';
import type { LLMSettings } from '../../types';
import { SettingRow, SettingsGroup, ProviderTab } from './primitives';
import { audioService } from '../../services/audioService';
import AutocompleteSelect from '../AutocompleteSelect';
import { DEFAULT_ANTHROPIC_MODEL } from '../../constants/llmDefaults';
import { InformationCircleIcon, SparklesIcon } from '../icons';
import { isGoogleAuthValid } from '../../utils/googleAuth';
import McpSection from './McpSection';
import CdpSection from './CdpSection';
import AssistantSection from './AssistantSection';

interface IntegrationsSectionProps {
    activeSubTab: string;
    settings: LLMSettings;
    handleSettingsChange: (field: keyof LLMSettings, value: any) => void;
    handleAuthConnect: (mode: 'youtube' | 'google' | 'spotify') => void;
    handleGoogleDisconnect: () => void;
    handleSpotifyDisconnect: () => void;
    isTestingOllama: boolean;
    ollamaTestResult: { success: boolean; message: string } | null;
    isTestingLlamaCpp: boolean;
    llamacppTestResult: { success: boolean; message: string } | null;
    handleTestOllamaConnection: (isCloud?: boolean) => Promise<void>;
    handleTestLlamaCppConnection: () => Promise<void>;
    localModelOptions: { label: string; value: string }[];
    cloudModelOptions: { label: string; value: string }[];
    llamacppModelOptions: { label: string; value: string }[];
    currentOrigin: string;
    siblingOrigin: string;
}

const IntegrationsSection: React.FC<IntegrationsSectionProps> = ({
    activeSubTab,
    settings,
    handleSettingsChange,
    handleAuthConnect,
    handleGoogleDisconnect,
    handleSpotifyDisconnect,
    isTestingOllama,
    ollamaTestResult,
    isTestingLlamaCpp,
    llamacppTestResult,
    handleTestOllamaConnection,
    handleTestLlamaCppConnection,
    localModelOptions,
    cloudModelOptions,
    llamacppModelOptions,
    currentOrigin,
    siblingOrigin,
}) => {
    const renderLLM = () => (
        <div className="flex flex-col animate-fade-in pb-12">
            <SettingRow label="Neural Intelligence Core" desc="Choose the primary processing engine for prompt construction. Every engine is optimized with custom directives.">
                <div className="tab-group">
                    <ProviderTab label="Gemini" isActive={settings.activeLLM === 'gemini'} onClick={() => handleSettingsChange('activeLLM', 'gemini')} />
                    <ProviderTab label="Anthropic" isActive={settings.activeLLM === 'anthropic'} onClick={() => handleSettingsChange('activeLLM', 'anthropic')} />
                    <ProviderTab label="Ollama" isActive={settings.activeLLM === 'ollama'} onClick={() => handleSettingsChange('activeLLM', 'ollama')} />
                    <ProviderTab label="Cloud Ollama" isActive={settings.activeLLM === 'ollama_cloud'} onClick={() => handleSettingsChange('activeLLM', 'ollama_cloud')} />
                    <ProviderTab label="OpenRouter" isActive={settings.activeLLM === 'openrouter'} onClick={() => handleSettingsChange('activeLLM', 'openrouter')} />
                    <ProviderTab label="Llama.cpp" isActive={settings.activeLLM === 'llamacpp'} onClick={() => handleSettingsChange('activeLLM', 'llamacpp')} />
                </div>
            </SettingRow>

            <SettingRow label="Master Role Concept" desc="Global persona applied to every LLM request, including the AI Assistant (Settings > Assistant). Prevents repeating role instructions to save tokens and maintain consistent AI behavior.">
                <textarea
                    value={settings.masterRolePrompt || ''}
                    onChange={(e) => handleSettingsChange('masterRolePrompt', e.target.value)}
                    className="textarea textarea-bordered w-full md:w-[620px] min-h-[120px] leading-relaxed text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 rounded-none bg-base-300/30 font-mono"
                    placeholder="You are an expert AI prompt engineer and creative director. You excel at extracting precise visual, atmospheric, and conceptual details."
                />
            </SettingRow>

            {settings.activeLLM === 'anthropic' && (
                <div className="animate-fade-in flex flex-col bg-transparent">
                    <SettingsGroup title="Anthropic Configuration">
                    <SettingRow label="Connection Mode" desc="Choose between using your own Anthropic API Key or a customized Subscription Proxy/Tunnel.">
                        <div className="tab-group">
                            <ProviderTab label="API Key Mode" isActive={settings.anthropicConnectionMode !== 'subscription'} onClick={() => handleSettingsChange('anthropicConnectionMode', 'api_key')} />
                            <ProviderTab label="Subscription Mode" isActive={settings.anthropicConnectionMode === 'subscription'} onClick={() => handleSettingsChange('anthropicConnectionMode', 'subscription')} />
                        </div>
                    </SettingRow>
                    {settings.anthropicConnectionMode !== 'subscription' ? (
                        <>
                            <SettingRow label="Anthropic API Key" desc="Get your developer API key from the Anthropic Console.">
                                <input type="password" value={settings.anthropicApiKey || ''} onChange={(e) => handleSettingsChange('anthropicApiKey', e.target.value)} className="form-input w-full md:w-[620px]" placeholder="sk-ant-api03-..." />
                            </SettingRow>
                            <SettingRow label="Model Target" desc="The Anthropic Claude model to invoke.">
                                <select value={settings.anthropicModel || DEFAULT_ANTHROPIC_MODEL} onChange={(e) => handleSettingsChange('anthropicModel', e.target.value)} className="form-select w-full md:w-[620px]">
                                    <option value="claude-3-7-sonnet-20250219">Claude 3.7 Sonnet (Latest)</option>
                                    <option value="claude-3-5-sonnet-latest">Claude 3.5 Sonnet</option>
                                    <option value="claude-3-5-haiku-latest">Claude 3.5 Haiku (Fast)</option>
                                    <option value="claude-3-opus-latest">Claude 3 Opus (Complex reasoning)</option>
                                </select>
                            </SettingRow>
                        </>
                    ) : (
                        <>
                            <SettingRow label="Custom Proxy Endpoint" desc="The custom reverse proxy, tunnel, or endpoint URL (e.g. http://localhost:8000 or custom Claude.ai wrappers).">
                                <input type="text" value={settings.anthropicSubscriptionUrl || ''} onChange={(e) => handleSettingsChange('anthropicSubscriptionUrl', e.target.value)} className="form-input w-full md:w-[620px]" placeholder="http://localhost:8000" />
                            </SettingRow>
                            <SettingRow label="Custom Proxy / Session Token" desc="If your proxy requires authentication (e.g., sk-ant-sid-... session cookie, or a bearer token).">
                                <input type="password" value={settings.anthropicSubscriptionKey || ''} onChange={(e) => handleSettingsChange('anthropicSubscriptionKey', e.target.value)} className="form-input w-full md:w-[620px]" placeholder="TOKEN_OR_SESSION_KEY" />
                            </SettingRow>
                            <SettingRow label="Model Target" desc="The Claude model identification to send to the custom proxy.">
                                <select value={settings.anthropicModel || DEFAULT_ANTHROPIC_MODEL} onChange={(e) => handleSettingsChange('anthropicModel', e.target.value)} className="form-select w-full md:w-[620px]">
                                    <option value="claude-3-7-sonnet">Claude 3.7 Sonnet</option>
                                    <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                                    <option value="claude-3-5-haiku">Claude 3.5 Haiku</option>
                                    <option value="claude-3-opus">Claude 3 Opus</option>
                                </select>
                            </SettingRow>
                        </>
                    )}
                    </SettingsGroup>
                </div>
            )}

            {settings.activeLLM === 'gemini' && (
                <div className="animate-fade-in flex flex-col bg-transparent">
                    <SettingsGroup title="Gemini Configuration">
                    <SettingRow label="Gemini API Key" desc="To unlock Pro capabilities (e.g. Nano Banana, Veo Work), furnish your unique Gemini API Key.">
                        <input type="password" value={settings.geminiApiKey || ''} onChange={(e) => handleSettingsChange('geminiApiKey', e.target.value)} className="form-input w-full md:w-[620px]" placeholder="AIza..." />
                    </SettingRow>
                    <SettingRow label="Model Target" desc="The core AI iteration powering standard generations. Ensure this model is accessible by your API key.">
                        <select value={settings.llmModel} onChange={(e) => handleSettingsChange('llmModel', e.target.value)} className="form-select w-full md:w-[620px]">
                            <option value="gemini-3-flash-preview">Gemini 3 Flash (High-Speed)</option>
                            <option value="gemini-3-pro-preview">Gemini 3 Pro (High-Reasoning)</option>
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                        </select>
                    </SettingRow>
                    </SettingsGroup>
                </div>
            )}
            {settings.activeLLM === 'ollama_cloud' && (
                <div className="animate-fade-in flex flex-col bg-transparent">
                    <SettingsGroup title="Ollama Cloud Configuration">
                    <SettingRow label="Remote Endpoint" desc="HTTPS URL of your hosted Ollama server.">
                        <div className="space-y-4">
                            <div className="flex w-full md:w-[620px]">
                                <input type="text" value={settings.ollamaCloudBaseUrl} onChange={(e) => handleSettingsChange('ollamaCloudBaseUrl', (e.currentTarget as any).value)} className="form-input flex-1" placeholder="https://api.ollama-host.com" />
                                <button onClick={() => { audioService.playClick(); handleTestOllamaConnection(true); }} disabled={isTestingOllama} className="form-btn px-4 border-l-0">{isTestingOllama ? '...' : 'PING'}</button>
                            </div>
                            {ollamaTestResult && (
                                <div className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 border ${ollamaTestResult.success ? 'bg-success/5 border-success/30 text-success' : 'bg-error/5 border-error/30 text-error'} animate-fade-in md:w-[620px]`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${ollamaTestResult.success ? 'bg-success' : 'bg-error'} animate-pulse`}></span>
                                    {ollamaTestResult.message}
                                </div>
                            )}
                        </div>
                    </SettingRow>
                    <SettingRow label="Cloud Model" desc="The exact model tag to invoke on the remote server.">
                        <AutocompleteSelect value={settings.ollamaCloudModel} onChange={(v) => handleSettingsChange('ollamaCloudModel', v)} options={cloudModelOptions} placeholder="SELECT CLOUD MODEL..." className="w-full md:w-[620px]" />
                    </SettingRow>
                    <SettingRow label="Remote Authorization" desc="Inject a Bearer token automatically via Google Identity or manual key.">
                        <div className="flex flex-col gap-4">
                            <label className="label cursor-pointer justify-start gap-4 p-0">
                                <input type="checkbox" checked={settings.ollamaCloudUseGoogleAuth} onChange={e => handleSettingsChange('ollamaCloudUseGoogleAuth', e.target.checked)} className="toggle toggle-primary toggle-xs" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Use Linked Google Token</span>
                            </label>
                            {!settings.ollamaCloudUseGoogleAuth && (
                                <input type="password" value={settings.ollamaCloudApiKey} onChange={(e) => handleSettingsChange('ollamaCloudApiKey', (e.currentTarget as any).value)} className="form-input w-full md:w-[620px]" placeholder="SECRET_API_TOKEN" />
                            )}
                        </div>
                    </SettingRow>
                    </SettingsGroup>
                </div>
            )}
            {settings.activeLLM === 'ollama' && (
                <div className="animate-fade-in flex flex-col bg-transparent">
                    <SettingsGroup title="Ollama (Local) Configuration">
                    <SettingRow label="Host Address" desc="Local server URL (Default: http://localhost:11434).">
                        <div className="space-y-4">
                            <div className="flex w-full md:w-[620px]">
                                <input type="text" value={settings.ollamaBaseUrl} onChange={(e) => handleSettingsChange('ollamaBaseUrl', (e.currentTarget as any).value)} className="form-input flex-1" />
                                <button onClick={() => { audioService.playClick(); handleTestOllamaConnection(false); }} disabled={isTestingOllama} className="form-btn px-4 border-l-0">PING</button>
                            </div>
                            {ollamaTestResult && (
                                <div className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 border ${ollamaTestResult.success ? 'bg-success/5 border-success/30 text-success' : 'bg-error/5 border-error/30 text-error'} animate-fade-in md:w-[620px]`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${ollamaTestResult.success ? 'bg-success' : 'bg-error'} animate-pulse`}></span>
                                    {ollamaTestResult.message}
                                </div>
                            )}
                            <div className="p-4 bg-info/5 border border-info/20 rounded-none space-y-3 md:w-[620px]">
                                <h5 className="text-[10px] font-black uppercase tracking-widest text-info flex items-center gap-2">
                                    <InformationCircleIcon className="w-3.5 h-3.5" /> CORS POLICY GUIDE
                                </h5>
                                <p className="text-[10px] font-bold uppercase tracking-tight text-base-content/60 leading-relaxed">
                                    For local access, set <code className="text-primary px-1 bg-base-100">OLLAMA_ORIGINS</code> to <code className="text-primary">*</code> or <code className="text-primary">{currentOrigin}</code> in your system variables.
                                </p>
                            </div>
                        </div>
                    </SettingRow>
                    <SettingRow label="Local Model Tag" desc="The model tag currently downloaded to your machine.">
                        <AutocompleteSelect value={settings.ollamaModel} onChange={(v) => handleSettingsChange('ollamaModel', v)} options={localModelOptions} placeholder="SELECT LOCAL MODEL..." className="w-full md:w-[620px]" />
                    </SettingRow>
                    </SettingsGroup>
                </div>
            )}
            {settings.activeLLM === 'llamacpp' && (
                <div className="animate-fade-in flex flex-col bg-transparent">
                    <SettingsGroup title="Llama.cpp Configuration">
                    <SettingRow label="Host Address" desc="Local llama.cpp (Default: http://localhost:8080).">
                        <div className="space-y-4">
                            <div className="flex w-full md:w-[620px]">
                                <input type="text" value={settings.llamacppBaseUrl || ''} onChange={(e) => handleSettingsChange('llamacppBaseUrl', (e.currentTarget as any).value)} className="form-input flex-1" />
                                <button onClick={() => { audioService.playClick(); handleTestLlamaCppConnection(); }} disabled={isTestingLlamaCpp} className="form-btn px-4 border-l-0">{isTestingLlamaCpp ? '...' : 'PING'}</button>
                            </div>
                            {llamacppTestResult && (
                                <div className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 border ${llamacppTestResult.success ? 'bg-success/5 border-success/30 text-success' : 'bg-error/5 border-error/30 text-error'} animate-fade-in md:w-[620px]`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${llamacppTestResult.success ? 'bg-success' : 'bg-error'} animate-pulse`}></span>
                                    {llamacppTestResult.message}
                                </div>
                            )}
                            <div className="p-4 bg-info/5 border border-info/20 rounded-none space-y-3 md:w-[620px]">
                                <h5 className="text-[10px] font-black uppercase tracking-widest text-info flex items-center gap-2">
                                    <InformationCircleIcon className="w-3.5 h-3.5" /> CORS POLICY GUIDE
                                </h5>
                                <p className="text-[10px] font-bold uppercase tracking-tight text-base-content/60 leading-relaxed">
                                    To allow web access, ensure llama.cpp is compiled and running with the <code className="text-primary px-1 bg-base-100">--cors</code> flag.
                                </p>
                            </div>
                        </div>
                    </SettingRow>
                    <SettingRow label="Llama.cpp API Key" desc="Ensure to insert custom authorize bearer token key if your llama.cpp server requires authentication.">
                        <input type="password" value={settings.llamacppApiKey || ''} onChange={(e) => handleSettingsChange('llamacppApiKey', e.target.value)} className="form-input w-full md:w-[620px]" placeholder="SECRET_API_TOKEN" />
                    </SettingRow>
                    <SettingRow label="Model Tag" desc="The model identification string on your llama.cpp server (e.g. default, custom-model).">
                        <AutocompleteSelect value={settings.llamacppModel || 'default'} onChange={(v) => handleSettingsChange('llamacppModel', v)} options={llamacppModelOptions} placeholder="SELECT LLAMACPP MODEL..." className="w-full md:w-[620px]" />
                    </SettingRow>
                    </SettingsGroup>
                </div>
            )}
        </div>
    );

    const renderGoogleCloud = () => {
        const isConnected = isGoogleAuthValid(settings.googleIdentity);
        return (
        <div className="flex flex-col animate-fade-in">
            <SettingsGroup title="Credentials">
            <SettingRow label="Client ID" desc="Google Cloud OAuth 2.0 Client ID for all Google services.">
                <div className="flex flex-col gap-2 w-full max-w-md">
                    <input type="text" value={settings.youtube?.customClientId || ''} onChange={(e) => handleSettingsChange('youtube', { ...settings.youtube, customClientId: e.target.value })} className="form-input w-full" placeholder="407408718192-..." />
                    <div className="p-4 bg-primary/5 border border-primary/20 space-y-2">
                        <p className="text-[9px] font-black uppercase text-primary tracking-widest leading-tight">AUTHORIZED ORIGINS</p>
                        <p className="text-[10px] font-mono text-base-content/60 break-all select-all py-1 bg-black/20 px-2">{currentOrigin}</p>
                        {siblingOrigin && (
                            <>
                                <p className="text-[8px] font-bold text-base-content/40 uppercase tracking-wider mt-1">SHARED PREVIEW ORIGIN</p>
                                <p className="text-[10px] font-mono text-base-content/60 break-all select-all py-1 bg-black/20 px-2">{siblingOrigin}</p>
                            </>
                        )}
                        <p className="text-[8px] font-bold text-base-content/30 uppercase leading-relaxed mt-2">Add both URLs to 'Authorized JavaScript origins' in your Google Cloud Console.</p>
                    </div>
                </div>
            </SettingRow>
            <SettingRow label="API Key" desc="API Key (Developer Key) for browser-level Google services.">
                <input type="password" value={settings.googleApiKey || ''} onChange={(e) => handleSettingsChange('googleApiKey', e.target.value)} className="form-input w-full max-w-md" placeholder="AIzaSy..." />
            </SettingRow>
            <SettingRow label="OpenAI API Key" desc="Required for the OpenAI Realtime voice engine. Set as OPENAI_API_KEY in your environment, or enter it here.">
                <input type="password" value={settings.openaiApiKey || ''} onChange={(e) => handleSettingsChange('openaiApiKey', e.target.value)} className="form-input w-full max-w-md" placeholder="sk-..." />
            </SettingRow>
            <SettingRow label="ElevenLabs API Key" desc="Required for the ElevenLabs Conversational AI voice engine.">
                <input type="password" value={settings.elevenlabsApiKey || ''} onChange={(e) => handleSettingsChange('elevenlabsApiKey', e.target.value)} className="form-input w-full max-w-md" placeholder="sk_..." />
            </SettingRow>
            <SettingRow label="ElevenLabs Agent ID" desc="The agent ID from your ElevenLabs Conversational AI agent. Create one in the ElevenLabs dashboard first.">
                <input type="text" value={settings.elevenlabsAgentId || ''} onChange={(e) => handleSettingsChange('elevenlabsAgentId', e.target.value)} className="form-input w-full max-w-md" placeholder="agent_..." />
            </SettingRow>
            </SettingsGroup>

            <SettingsGroup title="Account">
            <SettingRow label="Google Account" desc="Connect once — used for Cloud AI, Drive, YouTube, and Gmail.">
                {isConnected ? (
                    <div className="flex flex-col gap-4 w-full max-w-lg">
                        <div className="flex items-center gap-4 p-4">
                            <img src={settings.googleIdentity!.picture} className="w-12 h-12 rounded-full bg-black" alt="profile" />
                            <div className="min-w-0">
                                <p className="text-sm font-black uppercase truncate">{settings.googleIdentity!.name}</p>
                                <p className="text-[10px] font-mono opacity-40 truncate">{settings.googleIdentity!.email}</p>
                            </div>
                            <span className="text-[9px] font-black uppercase px-2 py-1 border bg-success/5 border-success/30 text-success ml-auto">ACTIVE</span>
                        </div>

                        {settings.youtube?.isConnected && (
                            <div className="flex items-center gap-4 p-4 bg-base-200/30 border border-base-300/10">
                                <img src={settings.youtube.thumbnailUrl} className="w-10 h-10 rounded-none bg-black" alt="channel" />
                                <div className="min-w-0">
                                    <p className="text-xs font-black uppercase truncate">{settings.youtube.channelName}</p>
                                    <p className="text-[9px] font-mono opacity-40 uppercase">{settings.youtube.subscriberCount} subscribers · {settings.youtube.videoCount} videos</p>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button onClick={() => { audioService.playClick(); handleGoogleDisconnect(); }} className="form-btn text-error px-4">Revoke Access</button>
                            {!settings.youtube?.isConnected && (
                                <button onClick={() => { audioService.playClick(); handleAuthConnect('youtube'); }} className="form-btn px-4">Link YouTube Channel</button>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        <p className="text-[10px] font-mono text-base-content/40">
                            One authentication enables Drive sync, YouTube publishing, and Gmail tools.
                        </p>
                        <button onClick={() => { audioService.playClick(); handleAuthConnect('google'); }} className="form-btn px-6 self-start">AUTHENTICATE WITH GOOGLE</button>
                    </div>
                )}
            </SettingRow>
            </SettingsGroup>
        </div>
    );}

    const renderSpotify = () => {
        const spotify = settings.spotify;
        const isTokenExpired = spotify?.expiresAt ? Date.now() > spotify.expiresAt : false;
        const connectionStatus = spotify?.isConnected
            ? isTokenExpired
                ? { label: 'TOKEN EXPIRED', cls: 'text-warning border-warning/30 bg-warning/10' }
                : { label: 'CONNECTED', cls: 'text-success border-success/30 bg-success/10' }
            : { label: 'DISCONNECTED', cls: 'text-neutral border-neutral/30 bg-neutral/10' };

        return (
        <div className="flex flex-col animate-fade-in">
            <SettingsGroup title="OAuth Configuration">
            <SettingRow label="Client ID" desc="Spotify Developer Dashboard OAuth Client ID.">
                <input type="text" value={spotify?.customClientId || ''} onChange={(e) => handleSettingsChange('spotify', { ...spotify, customClientId: e.target.value })} className="form-input w-full max-w-md" placeholder="abc123..." />
            </SettingRow>
            <SettingRow label="Client Secret" desc="Spotify Developer Dashboard OAuth Client Secret.">
                <input type="password" value={spotify?.customClientSecret || ''} onChange={(e) => handleSettingsChange('spotify', { ...spotify, customClientSecret: e.target.value })} className="form-input w-full max-w-md" placeholder="..." />
            </SettingRow>
            <div className="px-4 py-3 mb-2 rounded-md border border-warning/30 bg-warning/5 text-[11px] font-mono leading-relaxed">
                <span className="font-bold text-warning uppercase tracking-wider">⚠ Requires Spotify Premium</span>
                <br />
                The Spotify Developer app owner must have an active <strong>Spotify Premium</strong> subscription.
                Free-tier accounts cannot access playback, streaming, or user profile APIs
                (<code>403 Active premium subscription required</code>).
                If you see this error after linking, upgrade the account that owns the app in the
                <a className="underline text-warning/80 hover:text-warning" href="https://developer.spotify.com/dashboard" target="_blank"> Spotify Developer Dashboard</a> to Premium.
                Changes can take a few hours to propagate.
            </div>
            <SettingRow label="Account Integration" desc="Connect to your Spotify account for playlist access and playback.">
                <div className="flex flex-col gap-4 w-full max-w-lg">
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider border ${connectionStatus.cls}`}>
                        <span className={`w-2 h-2 rounded-full ${isTokenExpired ? 'bg-warning' : spotify?.isConnected ? 'bg-success' : 'bg-neutral'}`} />
                        {connectionStatus.label}
                    </div>

                    {spotify?.isConnected ? (
                        <>
                            <div className="flex items-center gap-4 p-4">
                                <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-xl shrink-0">
                                    {spotify.displayName?.charAt(0).toUpperCase() || 'S'}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-black uppercase truncate">{spotify.displayName || 'Spotify User'}</p>
                                    <p className="text-[10px] font-mono opacity-40 uppercase">{spotify.email || 'Connected'}</p>
                                    {isTokenExpired && (
                                        <p className="text-[10px] font-mono text-warning mt-1">Token expired — click Re-link to refresh</p>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => { audioService.playClick(); handleAuthConnect('spotify'); }} className="form-btn px-4">
                                    Re-link Spotify
                                </button>
                                <button onClick={() => { audioService.playClick(); handleSpotifyDisconnect(); }} className="form-btn text-error px-4">
                                    Unlink
                                </button>
                            </div>
                        </>
                    ) : (
                        <button onClick={() => { audioService.playClick(); handleAuthConnect('spotify'); }} className="form-btn px-6">LINK SPOTIFY</button>
                    )}
                </div>
            </SettingRow>
        </SettingsGroup>
        </div>
    );}

    const renderTensorArt = () => (
        <div className="flex flex-col animate-fade-in">
            <SettingsGroup title="Tensor Art Configuration">
                <SettingRow label="API Access Key" desc="Your Tensor Art Access Key from tensor.art/settings/access-key. Starts with ak_tensor (global) or ak_tusi (China).">
                    <input
                        type="password"
                        value={settings.tensorartApiKey || ''}
                        onChange={(e) => handleSettingsChange('tensorartApiKey', e.target.value)}
                        className="form-input w-full md:w-[620px]"
                        placeholder="ak_tensor_..."
                    />
                </SettingRow>
                <SettingRow label="Available Models" desc="Browse available generation models on Tensor Art.">
                    <a
                        href="https://tensor.art/models"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="form-btn px-6 inline-flex items-center gap-2"
                        onClick={() => audioService.playClick()}
                    >
                        <SparklesIcon className="w-4 h-4" />
                        BROWSE MODELS
                    </a>
                </SettingRow>
            </SettingsGroup>
            <SettingsGroup title="Usage">
                <div className="p-4 bg-info/5 border border-info/20 space-y-2">
                    <p className="text-[10px] font-black uppercase text-info tracking-widest leading-tight">HOW IT WORKS</p>
                    <p className="text-[10px] font-bold leading-relaxed text-base-content/60">
                        Once configured, the AI assistant can generate images and videos by calling Tensor Art models.
                        Just tell the assistant what you want — it will pick the right model, write the prompt, and deliver the result.
                    </p>
                    <p className="text-[10px] font-bold leading-relaxed text-base-content/60 mt-2">
                        Examples: <em>"Create an image of a cyberpunk city using Flux"</em> or <em>"Make a video of a waterfall"</em>.
                    </p>
                </div>
            </SettingsGroup>
        </div>
    );

    switch (activeSubTab) {
        case 'llm': return renderLLM();
        case 'assistant': return <AssistantSection activeSubTab={activeSubTab} settings={settings} handleSettingsChange={handleSettingsChange} />;
        case 'mcp': return <McpSection activeSubTab={activeSubTab} settings={settings} handleSettingsChange={handleSettingsChange} />;
        case 'google': return renderGoogleCloud();
        case 'spotify': return renderSpotify();
        case 'cdp': return <CdpSection activeSubTab={activeSubTab} />;
        case 'tensorart': return renderTensorArt();
        default: return null;
    }
};

export default IntegrationsSection;
