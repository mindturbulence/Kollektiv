import React from 'react';
import type { ActiveSettingsTab } from '../../types';
import { Cog6ToothIcon, CpuChipIcon, AppIcon, PromptIcon, PhotoIcon, FolderClosedIcon, PaintBrushIcon, LinkIcon, PlayIcon, UploadIcon, ChatBubbleIcon, MonitorIcon } from '../icons';

export const subMenuConfig: Record<string, { id: string; label: string, icon: React.ReactNode, description: string }[]> = {
    app: [
        { id: 'general', label: 'General', icon: <Cog6ToothIcon className="w-4 h-4" />, description: "Storage and engine lifecycle." },
        { id: 'data', label: 'Import & Export', icon: <FolderClosedIcon className="w-4 h-4" />, description: "System data management." },
        { id: 'migration', label: 'Migration', icon: <UploadIcon className="w-4 h-4" />, description: "Migrate library from local to Google Drive." }
    ],
    appearance: [
        { id: 'styling', label: 'Themes & Scale', icon: <PaintBrushIcon className="w-4 h-4" />, description: "Color palettes and typography sizing." },
        { id: 'background', label: 'Background', icon: <PhotoIcon className="w-4 h-4" />, description: "Dashboard cinematic assets and standby visuals." }
    ],
    integrations: [
        { id: 'llm', label: 'AI Engine', icon: <CpuChipIcon className="w-4 h-4" />, description: "AI models and local/cloud API connections." },
        { id: 'assistant', label: 'Assistant', icon: <ChatBubbleIcon className="w-4 h-4" />, description: "Name, voice, language, and personality of the AI assistant." },
        { id: 'mcp', label: 'MCP Servers', icon: <CpuChipIcon className="w-4 h-4" />, description: "Connect to Model Context Protocol servers for extended AI tools." },
        { id: 'google', label: 'Cloud Identity', icon: <LinkIcon className="w-4 h-4" />, description: "Link your Google account for Cloud AI." },
        { id: 'youtube', label: 'YouTube', icon: <PlayIcon className="w-4 h-4" />, description: "Manage YouTube API credentials." },
        { id: 'cdp', label: 'Browser Bridge', icon: <MonitorIcon className="w-4 h-4" />, description: "External browser control via Chrome DevTools Protocol." }
    ],
    prompt: [
        { id: 'categories', label: 'Prompt Folders', icon: <FolderClosedIcon className="w-4 h-4" />, description: "Organize prompt hierarchies." },
        { id: 'data', label: 'Import & Export', icon: <FolderClosedIcon className="w-4 h-4" />, description: "Import and export prompt text." }
    ],
    gallery: [
        { id: 'categories', label: 'Gallery Folders', icon: <FolderClosedIcon className="w-4 h-4" />, description: "Organize image hierarchies." },
        { id: 'data', label: 'Import & Export', icon: <FolderClosedIcon className="w-4 h-4" />, description: "Export and manage gallery files." }
    ],
};

export const mainCategories: { id: ActiveSettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'app', label: 'APPLICATION', icon: <AppIcon className="w-5 h-5" /> },
    { id: 'appearance', label: 'APPEARANCE', icon: <PaintBrushIcon className="w-5 h-5" /> },
    { id: 'integrations', label: 'INTEGRATIONS', icon: <LinkIcon className="w-5 h-5" /> },
    { id: 'prompt', label: 'PROMPTS', icon: <PromptIcon className="w-5 h-5" /> },
    { id: 'gallery', label: 'GALLERY', icon: <PhotoIcon className="w-5 h-5" /> },
];
