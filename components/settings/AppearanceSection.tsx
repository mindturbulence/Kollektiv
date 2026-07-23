import React from 'react';
import type { LLMSettings } from '../../types';
import { SettingRow, SettingsGroup } from './primitives';
import { audioService } from '../../services/audioService';
import { DAISYUI_DARK_THEMES } from '../../constants';
import { defaultLLMSettings } from '../../utils/settingsStorage';
import { RefreshIcon } from '../icons';

interface AppearanceSectionProps {
    activeSubTab: string;
    settings: LLMSettings;
    handleSettingsChange: (field: keyof LLMSettings, value: any) => void;
    handleMultipleSettingsChange: (updates: Partial<LLMSettings>) => void;
}

const AppearanceSection: React.FC<AppearanceSectionProps> = ({
    activeSubTab,
    settings,
    handleSettingsChange,
    handleMultipleSettingsChange,
}) => {
    const renderStyling = () => (
        <div className="flex flex-col animate-fade-in">
            <SettingsGroup title="Theming">
            <SettingRow label="Obscure Cycle Theme" desc="Visual palette used when in dark mode.">
                <select value={settings.darkTheme} onChange={(e) => handleSettingsChange('darkTheme', (e.currentTarget as any).value)} className="form-select w-64">
                    {DAISYUI_DARK_THEMES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                </select>
            </SettingRow>
            <SettingRow label="Interface Scale" desc="Global font sizing for the dashboard and workspaces.">
                <div className="flex items-center gap-4 w-48">
                    <input type="range" min={10} max={18} value={settings.fontSize} onChange={(e) => handleSettingsChange('fontSize', Number((e.currentTarget as any).value))} className="range range-xs range-primary" />                                <span className="text-[10px] font-mono font-bold text-primary">{settings.fontSize}PX</span>
                             </div>
                        </SettingRow>
                    </SettingsGroup>
                    </div>
    );

    const renderBackground = () => (
        <div className="flex flex-col animate-fade-in">
            <SettingsGroup title="Background">
            <SettingRow label="Background Type" desc="Choose the visual background for the application.">
                <select
                    value={settings.dashboardBackgroundType || (settings.isDashboardVideoEnabled ? 'video' : 'color')}
                    onChange={(e) => {
                        const val = e.target.value as 'video' | 'image' | 'color';
                        const updates: Partial<LLMSettings> = { dashboardBackgroundType: val };
                        if (val === 'video') updates.isDashboardVideoEnabled = true;
                        if (val === 'color') updates.isDashboardVideoEnabled = false;
                        handleMultipleSettingsChange(updates);
                    }}
                    className="form-select w-64"
                >
                    <option value="color">Theme solid color background</option>
                    <option value="video">Cinematic Video</option>
                    <option value="image">Static Image</option>
                </select>
            </SettingRow>

            {(settings.dashboardBackgroundType === 'video' || (!settings.dashboardBackgroundType && settings.isDashboardVideoEnabled)) && (
                <SettingRow label="Dashboard Video URL" desc="Direct MP4 URL for the cinematic background.">
                    <div className="flex w-full md:w-96">
                        <input
                            type="text"
                            value={settings.dashboardVideoUrl}
                            onChange={(e) => handleSettingsChange('dashboardVideoUrl', e.target.value)}
                            className="form-input flex-1"
                            placeholder="https://..."
                        />
                        <button
                            onClick={() => { audioService.playClick(); handleSettingsChange('dashboardVideoUrl', defaultLLMSettings.dashboardVideoUrl); }}
                            className="form-btn px-4 border-l-0"
                            title="Reset to Default"
                        >
                            <RefreshIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </SettingRow>
            )}

            <SettingRow label="Ambient Music URL" desc="YouTube URL played as background music. Toggle music on/off from the dashboard footer.">
                <div className="flex w-full md:w-96">
                    <input
                        type="text"
                        value={settings.musicYoutubeUrl}
                        onChange={(e) => handleSettingsChange('musicYoutubeUrl', e.target.value)}
                        className="form-input flex-1"
                        placeholder="https://www.youtube.com/watch?v=..."
                    />
                    <button
                        onClick={() => { audioService.playClick(); handleSettingsChange('musicYoutubeUrl', defaultLLMSettings.musicYoutubeUrl); }}
                        className="form-btn px-4 border-l-0"
                        title="Reset to Default"
                    >
                        <RefreshIcon className="w-3.5 h-3.5" />
                    </button>
                </div>
            </SettingRow>

            {settings.dashboardBackgroundType === 'image' && (
                <SettingRow label="Dashboard Image" desc="Select a static image background.">
                    <select
                        value={settings.dashboardImageUrl || '/background-large.jpg'}
                        onChange={(e) => handleSettingsChange('dashboardImageUrl', e.target.value)}
                        className="form-select w-64 md:w-96"
                    >
                        <option value="/background-large.jpg">Large Background</option>
                        <option value="/background-medium.jpg">Medium Background</option>
                        <option value="/background-small.jpg">Small Background</option>                        </select>
                                </SettingRow>
                            )}
                    </SettingsGroup>
                    <SettingsGroup title="Standby">
            <SettingRow label="Standby Mode" desc="Enable or disable the system idle protection screen.">
                <input
                    type="checkbox"
                    checked={settings.isIdleEnabled}
                    onChange={(e) => { audioService.playClick(); handleSettingsChange('isIdleEnabled', e.target.checked); }}
                    className="toggle toggle-primary toggle-sm"
                />
            </SettingRow>
            {settings.isIdleEnabled && (
                <>
                    <SettingRow label="Standby Experience" desc="Choose the visual experience shown during system idle state.">
                        <div className="flex bg-white/5 p-1 rounded-none border border-white/10">
                            <button
                                onClick={() => { audioService.playClick(); handleSettingsChange('idleScreenType', 'matrix'); }}
                                className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${settings.idleScreenType === 'matrix' ? 'bg-primary text-primary-content shadow-lg' : 'text-white/40 hover:text-white'}`}
                            >
                                Falling Codes
                            </button>
                            <button
                                onClick={() => { audioService.playClick(); handleSettingsChange('idleScreenType', 'gallery'); }}
                                className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${settings.idleScreenType === 'gallery' ? 'bg-primary text-primary-content shadow-lg' : 'text-white/40 hover:text-white'}`}
                            >
                                Neural Gallery
                            </button>
                        </div>
                    </SettingRow>
                    <SettingRow label="Standby Delay" desc="Time of inactivity forced before the system enters standby (Minutes).">
                        <div className="flex items-center gap-4">
                            <input
                                type="number"
                                min={1}
                                max={60}
                                value={settings.idleTimeoutMinutes}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value) || 1;
                                    handleSettingsChange('idleTimeoutMinutes', Math.max(1, Math.min(60, val)));
                                }}
                                className="form-input w-20 text-center font-mono font-bold bg-base-300"
                            />                                <span className="text-[10px] font-black uppercase tracking-widest text-base-content/40">Min</span>
                                    </div>
                                </SettingRow>
                            </>
                        )}
                    </SettingsGroup>
                    </div>
    );

    switch (activeSubTab) {
        case 'styling': return renderStyling();
        case 'background': return renderBackground();
        default: return null;
    }
};

export default AppearanceSection;
