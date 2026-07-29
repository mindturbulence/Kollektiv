import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ExtraNetworksPanel from './ExtraNetworksPanel';

beforeEach(cleanup);

const SETTINGS = { a1111Url: 'http://127.0.0.1:7860' } as any;
const LORAS = [{ name: 'add_detail.safetensors', alias: 'add_detail', path: 'D:/models/Lora/add_detail.safetensors' }];
const EMBEDDINGS = ['easynegative'];

describe('ExtraNetworksPanel', () => {
  it('shows an explicit unsupported message when the backend has no listing API', () => {
    render(
      <ExtraNetworksPanel
        supported={false}
        settings={SETTINGS}
        loras={[]}
        loadingLoras={false}
        embeddings={[]}
        loadingEmbeddings={false}
        onRefreshLoras={vi.fn()}
        onRefreshEmbeddings={vi.fn()}
        onInsertLora={vi.fn()}
        onInsertEmbedding={vi.fn()}
      />
    );
    expect(screen.getByText(/not available for this backend/i)).toBeTruthy();
  });

  it('defaults to the LoRA tab and switches to Textual Inversion on click', () => {
    render(
      <ExtraNetworksPanel
        supported
        settings={SETTINGS}
        loras={LORAS}
        loadingLoras={false}
        embeddings={EMBEDDINGS}
        loadingEmbeddings={false}
        onRefreshLoras={vi.fn()}
        onRefreshEmbeddings={vi.fn()}
        onInsertLora={vi.fn()}
        onInsertEmbedding={vi.fn()}
      />
    );

    expect(screen.getByText('add_detail')).toBeTruthy();
    expect(screen.queryByText('easynegative')).toBeNull();

    fireEvent.click(screen.getByText(/Textual Inversion/i));

    expect(screen.getByText('easynegative')).toBeTruthy();
    expect(screen.queryByText('add_detail')).toBeNull();
  });

  it('inserts a LoRA and an embedding via their respective callbacks', () => {
    const onInsertLora = vi.fn();
    const onInsertEmbedding = vi.fn();
    render(
      <ExtraNetworksPanel
        supported
        settings={SETTINGS}
        loras={LORAS}
        loadingLoras={false}
        embeddings={EMBEDDINGS}
        loadingEmbeddings={false}
        onRefreshLoras={vi.fn()}
        onRefreshEmbeddings={vi.fn()}
        onInsertLora={onInsertLora}
        onInsertEmbedding={onInsertEmbedding}
      />
    );

    fireEvent.click(screen.getByText('add_detail'));
    expect(onInsertLora).toHaveBeenCalledWith(LORAS[0]);

    fireEvent.click(screen.getByText(/Textual Inversion/i));
    fireEvent.click(screen.getByText('easynegative'));
    expect(onInsertEmbedding).toHaveBeenCalledWith('easynegative');
  });

  it('shows a loading indicator instead of items while the active tab is loading', () => {
    render(
      <ExtraNetworksPanel
        supported
        settings={SETTINGS}
        loras={[]}
        loadingLoras
        embeddings={[]}
        loadingEmbeddings={false}
        onRefreshLoras={vi.fn()}
        onRefreshEmbeddings={vi.fn()}
        onInsertLora={vi.fn()}
        onInsertEmbedding={vi.fn()}
      />
    );
    expect(screen.getByText(/Loading/i)).toBeTruthy();
  });

  it('renders a LoRA thumbnail sourced from its file path, and falls back to the placeholder glyph if every candidate 404s', () => {
    render(
      <ExtraNetworksPanel
        supported
        settings={SETTINGS}
        loras={LORAS}
        loadingLoras={false}
        embeddings={[]}
        loadingEmbeddings={false}
        onRefreshLoras={vi.fn()}
        onRefreshEmbeddings={vi.fn()}
        onInsertLora={vi.fn()}
        onInsertEmbedding={vi.fn()}
      />
    );
    const img = screen.getByRole('img', { name: 'add_detail' }) as HTMLImageElement;
    expect(img.src).toContain('/a1111-local/sd_extra_networks/thumb?filename=');
    expect(decodeURIComponent(img.src)).toContain('add_detail.png');

    // Exhaust every candidate extension via load errors — should fall back to the glyph.
    for (let i = 0; i < 10; i++) fireEvent.error(img);
    expect(screen.queryByRole('img', { hidden: true })).toBeNull();
    expect(screen.getByText('◈')).toBeTruthy();
  });

  it('groups loras by their folder prefix, shows a header per folder, and displays only the leaf name on the card', () => {
    const grouped = [
      { name: 'SDXL/foo', alias: 'SDXL/foo', path: 'D:/models/Lora/SDXL/foo.safetensors' },
      { name: 'SD15/bar', alias: 'SD15/bar', path: 'D:/models/Lora/SD15/bar.safetensors' },
      { name: 'baz', alias: 'baz', path: 'D:/models/Lora/baz.safetensors' },
    ];
    render(
      <ExtraNetworksPanel
        supported
        settings={SETTINGS}
        loras={grouped}
        loadingLoras={false}
        embeddings={[]}
        loadingEmbeddings={false}
        onRefreshLoras={vi.fn()}
        onRefreshEmbeddings={vi.fn()}
        onInsertLora={vi.fn()}
        onInsertEmbedding={vi.fn()}
      />
    );

    expect(screen.getByText('SD15')).toBeTruthy();
    expect(screen.getByText('SDXL')).toBeTruthy();
    expect(screen.getByText('foo')).toBeTruthy();
    expect(screen.getByText('bar')).toBeTruthy();
    expect(screen.getByText('baz')).toBeTruthy();
    // Root-level items (no folder) get no folder header.
    expect(screen.queryByText('(root)')).toBeNull();
    // The full relative path is still used for the actual insertion syntax, not just the leaf.
    expect(screen.getByTitle(/Insert <lora:SDXL\/foo:1>/)).toBeTruthy();
  });

  it('renders a placeholder glyph (no thumbnail probe) for embeddings, which have no file path', () => {
    render(
      <ExtraNetworksPanel
        supported
        settings={SETTINGS}
        loras={[]}
        loadingLoras={false}
        embeddings={EMBEDDINGS}
        loadingEmbeddings={false}
        onRefreshLoras={vi.fn()}
        onRefreshEmbeddings={vi.fn()}
        onInsertLora={vi.fn()}
        onInsertEmbedding={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText(/Textual Inversion/i));
    expect(screen.queryByRole('img', { hidden: true })).toBeNull();
    expect(screen.getByText('◈')).toBeTruthy();
  });
});
