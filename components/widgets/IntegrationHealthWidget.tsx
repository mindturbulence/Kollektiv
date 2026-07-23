import React from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { isGoogleAuthValid } from '../../utils/googleAuth';
import { appEventBus } from '../../utils/eventBus';

const IntegrationHealthWidget: React.FC = () => {
  const { settings } = useSettings();

  const integrations = [
    {
      label: 'Gemini',
      connected: !!(settings.geminiApiKey || process.env.GEMINI_API_KEY),
      key: 'gemini' as const,
    },
    {
      label: 'Vault',
      connected: true, // Always shown as connected if we reach dashboard
      key: 'vault' as const,
    },
    {
      label: 'Google',
      connected: isGoogleAuthValid(settings.googleIdentity),
      key: 'google' as const,
    },
    {
      label: 'Spotify',
      connected: !!settings.spotify?.isConnected,
      key: 'spotify' as const,
    },
    {
      label: `MCP (${(settings.mcpServers || []).filter(s => s.enabled).length})`,
      connected: (settings.mcpServers || []).filter(s => s.enabled).length > 0,
      key: 'mcp' as const,
    },
  ];

  return (
    <div className="bg-base-100/40 backdrop-blur-xl border border-base-content/10 p-4 relative corner-frame">
      <div className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 mb-3">Integrations</div>
      <div className="flex flex-wrap gap-1.5">
        {integrations.map(inte => (
          <button
            key={inte.key}
            onClick={() => appEventBus.emit('navigate', 'settings' as any)}
            className={`text-[9px] font-mono uppercase tracking-wider px-2 py-1 border transition-colors ${
              inte.connected
                ? 'text-emerald-400/70 border-emerald-400/20 bg-emerald-400/5'
                : 'text-base-content/20 border-base-content/10 bg-base-content/5'
            }`}
          >
            {inte.connected ? '✅' : '❌'} {inte.label}
          </button>
        ))}
      </div>
      <div className="absolute -top-[1px] -left-[1px] w-2 h-2 border-t border-l border-primary/20 pointer-events-none" />
      <div className="absolute -top-[1px] -right-[1px] w-2 h-2 border-t border-r border-primary/20 pointer-events-none" />
    </div>
  );
};

export default IntegrationHealthWidget;
