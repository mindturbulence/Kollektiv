import React from 'react';
import { AssistantAvatarPanel } from './AssistantAvatarPanel';

/**
 * Entry component for the '#avatar-panel' embed surface (index.tsx routes it).
 * Rendered inside an iframe hosted by the Kollektiv browser extension's side
 * panel — a cross-realm surface that receives avatar snapshots over the
 * BroadcastChannel relay and sends commands back the same way.
 */
const AssistantAvatarPanelEmbed: React.FC = () => <AssistantAvatarPanel surface="embed" />;

export default AssistantAvatarPanelEmbed;
