// OWNED BY: shell-ui agent. Stub — page shell (preview, media bin, inspector, export).
import React from 'react';
import type { VideoEditorOpenPayload } from '../core/types';

export interface VideoEditorPageProps {
  openPayload?: VideoEditorOpenPayload;
  showGlobalFeedback?: (message: string, isError?: boolean) => void;
  isExiting?: boolean;
}

const VideoEditorPage: React.FC<VideoEditorPageProps> = () => <div data-testid="ve-page" />;

export default VideoEditorPage;
