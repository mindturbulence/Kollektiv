import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { CDPTarget } from '../../services/externalBrowserService';
import { externalBrowserService } from '../../services/externalBrowserService';
import { audioService } from '../../services/audioService';
import { SettingRow, SettingsGroup } from './primitives';
import { InformationCircleIcon, PowerIcon, RefreshIcon, CopyIcon } from '../icons';

interface CdpSectionProps {
    activeSubTab: string;
}

type ConnectionState = 'unknown' | 'connected' | 'disconnected' | 'error';

export const CdpSection: React.FC<CdpSectionProps> = ({ activeSubTab }) => {
    if (activeSubTab !== 'cdp') return null;

    const [port, setPort] = useState(9222);
    const [connState, setConnState] = useState<ConnectionState>('unknown');
    const [connecting, setConnecting] = useState(false);
    const [browserInfo, setBrowserInfo] = useState<string | null>(null);
    const [targets, setTargets] = useState<CDPTarget[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
    const [copied, setCopied] = useState(false);

    // Track whether Chrome was explicitly verified reachable by the user.
    // This is our source of truth for showing the targets list — the server's
    // `cdpConnected` flag only becomes true AFTER a target WebSocket opens,
    // so we can't rely on polling to determine "Chrome reachable" state.
    const chromeAvailableRef = useRef(false);

    const showFeedback = (ok: boolean, msg: string) => {
        setFeedback({ ok, msg });
        setTimeout(() => setFeedback(null), 4000);
    };

    // Poll the server for CDP target connection status only.
    // Never downgrades "chromeAvailable" state — that's only cleared by
    // explicit user disconnect. This prevents the 3s poll from reverting
    // the UI to "disconnected" between Connect and target selection.
    const refreshStatus = useCallback(async () => {
        try {
            const st = await externalBrowserService.status();
            if (st.connected) {
                // Full CDP WebSocket to a target is active.
                chromeAvailableRef.current = true;
                setConnState('connected');
                setSelectedId(st.targetId);
            } else if (chromeAvailableRef.current && selectedId) {
                // We had a target selected but the WebSocket dropped.
                // Chrome is still reachable — keep connected state, just
                // clear the active target.
                setSelectedId(null);
                showFeedback(false, 'Browser tab disconnected. Select a new target.');
            } else if (!chromeAvailableRef.current && !st.chromeAvailable) {
                // Never connected and Chrome not reachable — idle.
                setConnState('disconnected');
            }
        } catch {
            if (!chromeAvailableRef.current) {
                setConnState('disconnected');
            }
        }
    }, [selectedId]);

    useEffect(() => {
        refreshStatus();
        const iv = setInterval(refreshStatus, 3000);
        return () => clearInterval(iv);
    }, [refreshStatus]);

    const handleConnect = async () => {
        setConnecting(true);
        setFeedback(null);
        try {
            const result = await externalBrowserService.connect(port);
            if (result.success) {
                chromeAvailableRef.current = true;
                setConnState('connected');
                setBrowserInfo(result.browser || null);
                showFeedback(true, `Connected — ${result.browser || 'Chrome instance'}`);
                const tResult = await externalBrowserService.getTargets(port);
                if (tResult.success) setTargets(tResult.targets || []);
            } else {
                chromeAvailableRef.current = false;
                setConnState('disconnected');
                showFeedback(false, result.error || 'Connection failed');
            }
        } catch (e: any) {
            chromeAvailableRef.current = false;
            setConnState('disconnected');
            showFeedback(false, e.message || 'Connection error');
        }
        setConnecting(false);
    };

    const handleSelectTarget = async (t: CDPTarget) => {
        try {
            const result = await externalBrowserService.selectTarget(t.id, t.wsUrl, t.title);
            if (result.success) {
                setSelectedId(t.id);
                showFeedback(true, `Tab selected: ${t.title || 'untitled'}`);
            } else {
                showFeedback(false, result.error || 'Failed to select tab');
            }
        } catch (e: any) {
            showFeedback(false, e.message || 'Selection error');
        }
    };

    const handleDisconnect = async () => {
        try {
            await externalBrowserService.disconnect();
            chromeAvailableRef.current = false;
            setConnState('disconnected');
            setBrowserInfo(null);
            setTargets([]);
            setSelectedId(null);
            showFeedback(true, 'Disconnected');
        } catch (e: any) {
            showFeedback(false, e.message || 'Disconnect error');
        }
    };

    const handleRefreshTargets = async () => {
        try {
            const tResult = await externalBrowserService.getTargets(port);
            if (tResult.success) setTargets(tResult.targets || []);
        } catch { /* ignore */ }
    };

    const chromeCmd = `chrome.exe --remote-debugging-port=${port}`;
    const vivaldiCmd = `vivaldi.exe --remote-debugging-port=${port}`;

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    // Determine which status badge to show.
    // 'connected' can mean either Chrome is reachable (no target yet) or
    // a full CDP target WebSocket is active.
    const statusText = (() => {
        if (connState === 'connected' && selectedId) return 'TARGET ACTIVE';
        if (connState === 'connected') return 'CHROME READY';
        if (connState === 'error') return 'ERROR';
        if (connState === 'unknown') return 'CHECKING...';
        return 'DISCONNECTED';
    })();

    const isConnected = connState === 'connected';

    return (
        <div className="flex flex-col animate-fade-in pb-12">
            <SettingsGroup title="Connection">
                <SettingRow label="Status" desc="Live connection state to the Chrome DevTools Protocol endpoint.">
                    <div className="flex items-center gap-3">
                        <span className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 border ${
                            isConnected ? (selectedId ? 'bg-success/5 border-success/30 text-success' : 'bg-info/5 border-info/30 text-info') :
                            connState === 'error' ? 'bg-error/5 border-error/30 text-error' :
                            connState === 'unknown' ? 'bg-warning/5 border-warning/30 text-warning' :
                            'bg-base-300/30 border-base-content/20 text-base-content/40'
                        }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                                isConnected ? (selectedId ? 'bg-success' : 'bg-info') :
                                connState === 'error' ? 'bg-error' :
                                connState === 'unknown' ? 'bg-warning' :
                                'bg-base-content/30'
                            } ${isConnected ? 'animate-pulse' : ''}`} />
                            {statusText}
                        </span>
                        {browserInfo && (
                            <span className="text-[9px] font-mono text-base-content/40 truncate max-w-[200px]">
                                {browserInfo}
                            </span>
                        )}
                    </div>
                </SettingRow>

                <SettingRow label="Debug Port" desc="The --remote-debugging-port value Chrome was launched with.">
                    <div className="flex gap-2">
                        <input
                            type="number"
                            value={port}
                            onChange={e => setPort(Number(e.target.value))}
                            className="form-input w-28"
                            min={1024}
                            max={65535}
                            disabled={isConnected}
                        />
                        {isConnected ? (
                            <button onClick={() => { audioService.playClick(); handleDisconnect(); }} className="form-btn text-error px-4 flex items-center gap-2">
                                <PowerIcon className="w-3.5 h-3.5" /> DISCONNECT
                            </button>
                        ) : (
                            <button onClick={() => { audioService.playClick(); handleConnect(); }} disabled={connecting} className="form-btn px-4 flex items-center gap-2">
                                {connecting ? '...' : <PowerIcon className="w-3.5 h-3.5" />}
                                {connecting ? 'CONNECTING' : 'CONNECT'}
                            </button>
                        )}
                    </div>
                </SettingRow>
            </SettingsGroup>

            {isConnected && (
                <SettingsGroup title="Browser Tabs">
                    <div className="px-6 py-3 border-b border-base-content/10 flex justify-end">
                        <button onClick={() => { audioService.playClick(); handleRefreshTargets(); }} className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-base-content/30 hover:text-primary transition-colors">
                            <RefreshIcon className="w-3 h-3" /> REFRESH
                        </button>
                    </div>
                    {targets.length === 0 ? (
                        <div className="p-6 text-[10px] font-mono text-base-content/30 uppercase tracking-wider text-center">
                            No browser tabs found.
                        </div>
                    ) : (
                        targets.map(t => (
                            <div
                                key={t.id}
                                onClick={() => { audioService.playClick(); handleSelectTarget(t); }}
                                className={`p-4 flex items-center justify-between gap-4 cursor-pointer transition-all border-b border-base-content/5 hover:bg-base-200/30 ${
                                    selectedId === t.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                                }`}
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-black uppercase tracking-wider truncate text-base-content/80">
                                        {t.title || '(untitled)'}
                                    </p>
                                    <p className="text-[9px] font-mono text-base-content/30 truncate mt-0.5">
                                        {t.url}
                                    </p>
                                </div>
                                {selectedId === t.id && (
                                    <span className="text-[8px] font-black uppercase tracking-widest text-primary shrink-0">ACTIVE</span>
                                )}
                            </div>
                        ))
                    )}
                </SettingsGroup>
            )}

            <SettingsGroup title="Launch Guide">
                <div className="p-6 bg-info/5 border border-info/20 mx-6 my-4 space-y-4">
                    <h5 className="text-sm font-black uppercase tracking-widest text-info flex items-center gap-2">
                        <InformationCircleIcon className="w-4 h-4" /> START CHROME WITH DEBUG FLAG
                    </h5>
                    <p className="text-xs font-bold uppercase tracking-tight text-base-content/70 leading-relaxed">
                        Close all browser windows, then launch with the flag below.
                    </p>

                    <div className="space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-wider text-base-content/40">CHROME</p>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 text-sm font-mono bg-black/30 px-4 py-3 text-primary break-all select-all">
                                {chromeCmd}
                            </code>
                            <button
                                onClick={() => { audioService.playClick(); copyToClipboard(chromeCmd); }}
                                className="shrink-0 p-2.5 hover:text-primary transition-colors border border-white/10 hover:border-primary/40"
                                title="Copy command"
                            >
                                {copied ? <span className="text-[9px] font-black text-success">COPIED</span> : <CopyIcon className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-wider text-base-content/40">VIVALDI</p>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 text-sm font-mono bg-black/30 px-4 py-3 text-primary break-all select-all">
                                {vivaldiCmd}
                            </code>
                            <button
                                onClick={() => { audioService.playClick(); copyToClipboard(vivaldiCmd); }}
                                className="shrink-0 p-2.5 hover:text-primary transition-colors border border-white/10 hover:border-primary/40"
                                title="Copy command"
                            >
                                {copied ? <span className="text-[9px] font-black text-success">COPIED</span> : <CopyIcon className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="p-4 bg-black/20 border border-white/5 space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-wider text-warning">TROUBLESHOOTING</p>
                        <ul className="text-xs font-mono text-base-content/60 space-y-1.5 leading-relaxed">
                            <li>• Fully quit all browser processes before restarting with the flag</li>
                            <li>• Verify the port is not in use: <code className="text-primary px-1 bg-black/30">netstat -ano | findstr :{port}</code></li>
                            <li>• After connecting, open a browser tab for it to appear in the list</li>
                            <li>• The assistant uses CDP when connected, falls back to Playwright otherwise</li>
                        </ul>
                    </div>
                </div>
            </SettingsGroup>

            {feedback && (
                <div className={`mx-6 mb-4 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 border ${feedback.ok ? 'bg-success/5 border-success/30 text-success' : 'bg-error/5 border-error/30 text-error'} animate-fade-in`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${feedback.ok ? 'bg-success' : 'bg-error'} animate-pulse`} />
                    {feedback.msg}
                </div>
            )}
        </div>
    );
};

export default CdpSection;
