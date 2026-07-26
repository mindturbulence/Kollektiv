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
    }));

    handlers['playVideo'][0]({ url: 'https://example.com/video.mp4' });
    expect(setVideoPlayerUrl).toHaveBeenCalledWith('https://example.com/video.mp4');
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
    }));

    handlers['clipIdea'][0]({});
    expect(handleClipIdea).not.toHaveBeenCalled();
  });
});
