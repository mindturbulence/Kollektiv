import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAppEventBus } from './useAppEventBus';

// Capture handlers registered with appEventBus.on(name, handler)
const handlers: Record<string, ((p?: any) => void)[]> = {};

vi.mock('../utils/eventBus', () => ({
  appEventBus: {
    on: vi.fn((name: string, h: (p?: any) => void) => {
      (handlers[name] ??= []).push(h);
      return () => {};
    }),
    emit: vi.fn(),
  },
}));

const noopAny = () => {};

describe('useAppEventBus', () => {
  beforeEach(() => {
    for (const k of Object.keys(handlers)) delete handlers[k];
  });

  it('subscribes to navigate, sendToPromptsPage, assistantFeedback on mount', () => {
    renderHook(() => useAppEventBus({
      handleNavigate: noopAny,
      handleSendToPromptsPage: noopAny,
      showGlobalFeedback: noopAny,
      isCommandPaletteOpen: false,
      setIsCommandPaletteOpen: noopAny,
      setIsClippingPanelOpen: noopAny,
      setIsMediaPanelOpen: noopAny,
      setVideoPlayerUrl: noopAny,
      handleClipIdea: noopAny,
      setEditorOpenPayload: noopAny,
      setConverterOpenFiles: noopAny,
    }));
    expect(handlers['navigate'].length).toBeGreaterThanOrEqual(1);
    expect(handlers['sendToPromptsPage'].length).toBe(1);
    expect(handlers['assistantFeedback'].length).toBe(1);
  });

  it('navigate event routes through handleNavigate', () => {
    const handleNavigate = vi.fn();
    renderHook(() => useAppEventBus({
      handleNavigate,
      handleSendToPromptsPage: noopAny,
      showGlobalFeedback: noopAny,
      isCommandPaletteOpen: false,
      setIsCommandPaletteOpen: noopAny,
      setIsClippingPanelOpen: noopAny,
      setIsMediaPanelOpen: noopAny,
      setVideoPlayerUrl: noopAny,
      handleClipIdea: noopAny,
      setEditorOpenPayload: noopAny,
      setConverterOpenFiles: noopAny,
    }));

    handlers['navigate'].forEach((h) => h('dashboard'));
    expect(handleNavigate).toHaveBeenCalledWith('dashboard');
  });

  it('assistantFeedback event throws with isError flag', () => {
    const showGlobalFeedback = vi.fn();
    renderHook(() => useAppEventBus({
      handleNavigate: noopAny,
      handleSendToPromptsPage: noopAny,
      showGlobalFeedback,
      isCommandPaletteOpen: false,
      setIsCommandPaletteOpen: noopAny,
      setIsClippingPanelOpen: noopAny,
      setIsMediaPanelOpen: noopAny,
      setVideoPlayerUrl: noopAny,
      handleClipIdea: noopAny,
      setEditorOpenPayload: noopAny,
      setConverterOpenFiles: noopAny,
    }));

    handlers['assistantFeedback'][0]({ message: 'hello', isError: true });
    expect(showGlobalFeedback).toHaveBeenCalledWith('hello', true);
  });

  it('playVideo event sets the video URL', () => {
    const setVideoPlayerUrl = vi.fn();
    renderHook(() => useAppEventBus({
      handleNavigate: noopAny,
      handleSendToPromptsPage: noopAny,
      showGlobalFeedback: noopAny,
      isCommandPaletteOpen: false,
      setIsCommandPaletteOpen: noopAny,
      setIsClippingPanelOpen: noopAny,
      setIsMediaPanelOpen: noopAny,
      setVideoPlayerUrl,
      handleClipIdea: noopAny,
      setEditorOpenPayload: noopAny,
      setConverterOpenFiles: noopAny,
    }));

    handlers['playVideo'][0]({ url: 'https://example.com/video.mp4' });
    expect(setVideoPlayerUrl).toHaveBeenCalledWith('https://example.com/video.mp4');
  });

  it('openInConverter event queues files and navigates to converter', () => {
    const handleNavigate = vi.fn();
    const setConverterOpenFiles = vi.fn();
    renderHook(() => useAppEventBus({
      handleNavigate,
      handleSendToPromptsPage: noopAny,
      showGlobalFeedback: noopAny,
      isCommandPaletteOpen: false,
      setIsCommandPaletteOpen: noopAny,
      setIsClippingPanelOpen: noopAny,
      setIsMediaPanelOpen: noopAny,
      setVideoPlayerUrl: noopAny,
      handleClipIdea: noopAny,
      setEditorOpenPayload: noopAny,
      setConverterOpenFiles,
    }));

    const files = [new File(['a'], 'a.png'), new File(['b'], 'b.png')];
    handlers['openInConverter'][0]({ files });
    expect(setConverterOpenFiles).toHaveBeenCalledWith(files);
    expect(handleNavigate).toHaveBeenCalledWith('converter');
  });

  it('clipIdea event calls handleClipIdea with synthesized Idea', () => {
    const handleClipIdea = vi.fn();
    renderHook(() => useAppEventBus({
      handleNavigate: noopAny,
      handleSendToPromptsPage: noopAny,
      showGlobalFeedback: noopAny,
      isCommandPaletteOpen: false,
      setIsCommandPaletteOpen: noopAny,
      setIsClippingPanelOpen: noopAny,
      setIsMediaPanelOpen: noopAny,
      setVideoPlayerUrl: noopAny,
      handleClipIdea,
      setEditorOpenPayload: noopAny,
      setConverterOpenFiles: noopAny,
    }));

    handlers['clipIdea'][0]({ prompt: 'A long prompt goes here', title: 'T', lens: 'L', source: 'S' });
    expect(handleClipIdea).toHaveBeenCalledTimes(1);
    const call = handleClipIdea.mock.calls[0][0];
    expect(call.prompt).toBe('A long prompt goes here');
    expect(call.title).toBe('T');
    expect(call.lens).toBe('L');
    expect(call.source).toBe('S');
  });

  it('ignores clipIdea events without a prompt', () => {
    const handleClipIdea = vi.fn();
    renderHook(() => useAppEventBus({
      handleNavigate: noopAny,
      handleSendToPromptsPage: noopAny,
      showGlobalFeedback: noopAny,
      isCommandPaletteOpen: false,
      setIsCommandPaletteOpen: noopAny,
      setIsClippingPanelOpen: noopAny,
      setIsMediaPanelOpen: noopAny,
      setVideoPlayerUrl: noopAny,
      handleClipIdea,
      setEditorOpenPayload: noopAny,
      setConverterOpenFiles: noopAny,
    }));

    handlers['clipIdea'][0]({});
    expect(handleClipIdea).not.toHaveBeenCalled();
  });

  it('cycleTheme event routes through handleCycleTheme (palette "Next Theme")', () => {
    const handleCycleTheme = vi.fn();
    renderHook(() => useAppEventBus({
      handleNavigate: noopAny,
      handleSendToPromptsPage: noopAny,
      showGlobalFeedback: noopAny,
      isCommandPaletteOpen: false,
      setIsCommandPaletteOpen: noopAny,
      setIsClippingPanelOpen: noopAny,
      setIsMediaPanelOpen: noopAny,
      setVideoPlayerUrl: noopAny,
      handleClipIdea: noopAny,
      setEditorOpenPayload: noopAny,
      setConverterOpenFiles: noopAny,
      handleCycleTheme,
    }));

    expect(handlers['cycleTheme'].length).toBe(1);
    handlers['cycleTheme'][0]();
    expect(handleCycleTheme).toHaveBeenCalledTimes(1);
  });

  it('togglePanel routes chat/activity/llm to their shell toggles', () => {
    const handleToggleChatPanel = vi.fn();
    const handleToggleActivityPanel = vi.fn();
    const handleToggleLlmPanel = vi.fn();
    renderHook(() => useAppEventBus({
      handleNavigate: noopAny,
      handleSendToPromptsPage: noopAny,
      showGlobalFeedback: noopAny,
      isCommandPaletteOpen: false,
      setIsCommandPaletteOpen: noopAny,
      setIsClippingPanelOpen: noopAny,
      setIsMediaPanelOpen: noopAny,
      setVideoPlayerUrl: noopAny,
      handleClipIdea: noopAny,
      setEditorOpenPayload: noopAny,
      setConverterOpenFiles: noopAny,
      handleToggleChatPanel,
      handleToggleActivityPanel,
      handleToggleLlmPanel,
    }));

    const toggle = handlers['togglePanel'].at(-1)!;
    toggle('chat');
    toggle('activity');
    toggle('llm');
    expect(handleToggleChatPanel).toHaveBeenCalledTimes(1);
    expect(handleToggleActivityPanel).toHaveBeenCalledTimes(1);
    expect(handleToggleLlmPanel).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe to cycleTheme when handleCycleTheme is omitted', () => {
    renderHook(() => useAppEventBus({
      handleNavigate: noopAny,
      handleSendToPromptsPage: noopAny,
      showGlobalFeedback: noopAny,
      isCommandPaletteOpen: false,
      setIsCommandPaletteOpen: noopAny,
      setIsClippingPanelOpen: noopAny,
      setIsMediaPanelOpen: noopAny,
      setVideoPlayerUrl: noopAny,
      handleClipIdea: noopAny,
      setEditorOpenPayload: noopAny,
      setConverterOpenFiles: noopAny,
    }));

    expect(handlers['cycleTheme']).toBeUndefined();
  });
});
