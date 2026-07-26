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
    <div className="bg-base-100/40 backdrop-blur-xl border border-base-content/10 p-4 relative corner-frame h-full flex flex-col">
      <div className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 mb-3 flex-shrink-0">Integrations</div>
      <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
        {integrations.map(inte => (
          <button
            key={inte.key}
            onClick={() => appEventBus.emit('navigate', 'settings' as any)}
            className={`flex items-center gap-3 px-3 py-2.5 text-xs font-mono uppercase tracking-wider border transition-colors w-full text-left ${
              inte.connected
                ? 'text-emerald-400/70 border-emerald-400/20 bg-emerald-400/5 hover:bg-emerald-400/10'
                : 'text-base-content/30 border-base-content/10 bg-base-content/5 hover:bg-base-content/10'
            }`}
          >
            <span className="text-sm">{inte.connected ? '✅' : '❌'}</span>
            <span>{inte.label}</span>
          </button>
        ))}
      </div>
      <div className="absolute -top-[1px] -left-[1px] w-2 h-2 border-t border-l border-primary/20 pointer-events-none" />
      <div className="absolute -top-[1px] -right-[1px] w-2 h-2 border-t border-r border-primary/20 pointer-events-none" />
    </div>
  );
};

export default IntegrationHealthWidget;
