import React, { useEffect, useState, useRef } from 'react';
import { hydrateKnowledgeGraph } from '../services/tools/graphHydration';
import { relationshipGraph } from '../services/relationshipGraph';
import type { GraphEntity, Relation } from '../services/relationshipGraph';

interface VaultMapPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// Ring radii per kind — memory innermost, gallery middle, prompt outermost.
const RING_RADII: Record<string, number> = {
  memory: 60,
  gallery_item: 120,
  prompt: 180,
};

const KIND_COLORS: Record<string, string> = {
  memory: 'oklch(0.6 0.2 260)',      // blue
  gallery_item: 'oklch(0.6 0.2 140)', // green
  prompt: 'oklch(0.6 0.2 40)',       // amber
};

type LayoutNode = { x: number; y: number; entity: GraphEntity };
type LayoutEdge = { from: LayoutNode; to: LayoutNode; weight: number };

function layout(
  entities: GraphEntity[],
  relations: Relation[],
  cx: number,
  cy: number,
  rMax: number,
): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  // Group by kind
  const byKind: Record<string, GraphEntity[]> = {};
  for (const e of entities) {
    if (!byKind[e.kind]) byKind[e.kind] = [];
    byKind[e.kind].push(e);
  }

  // Place on rings
  const nodeMap = new Map<string, LayoutNode>();
  const rMap = new Map<string, number>();

  for (const [kind, items] of Object.entries(byKind)) {
    const radius = Math.min(RING_RADII[kind] ?? 150, rMax - 20);
    rMap.set(kind, radius);
    const n = items.length;
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      nodeMap.set(`${items[i].kind}::${items[i].id}`, { x, y, entity: items[i] });
    }
  }

  // Build edges from relations that have both endpoints positioned
  const seen = new Set<string>();
  const edges: LayoutEdge[] = [];
  for (const r of relations) {
    const key = `${r.source}->${r.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    seen.add(`${r.target}->${r.source}`); // skip reverse
    const from = nodeMap.get(r.source);
    const to = nodeMap.get(r.target);
    if (from && to) edges.push({ from, to, weight: r.weight });
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}

const VaultMapPanel: React.FC<VaultMapPanelProps> = ({ isOpen, onClose }) => {
  const [entities, setEntities] = useState<GraphEntity[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ entities: 0, relations: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgSize, setSvgSize] = useState({ width: 500, height: 500 });

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const s = await hydrateKnowledgeGraph();
        if (cancelled) return;
        setStats(s);
        const allEntities = relationshipGraph.getEntities();
        const allRelations = relationshipGraph.getRelations();
        if (cancelled) return;
        setEntities(allEntities);
        setRelations(allRelations);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen]);

  // Measure the SVG container on mount/resize
  useEffect(() => {
    if (!svgRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) setSvgSize({ width, height });
      }
    });
    ro.observe(svgRef.current);
    return () => ro.disconnect();
  }, [isOpen]);

  const cx = svgSize.width / 2;
  const cy = svgSize.height / 2;
  const rMax = Math.min(cx, cy) - 30;

  const { nodes, edges } = layout(entities, relations, cx, cy, rMax);

  return (
    <div
      className={`fixed inset-0 z-50 transition-all duration-300 ${
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-base-300/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="absolute inset-4 md:inset-10 bg-base-200/95 backdrop-blur-xl border border-base-content/15 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-base-content/10 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold tracking-wide text-base-content/80">Vault Map</h2>
            {!loading && stats.entities > 0 && (
              <span className="text-[10px] font-mono text-base-content/30">
                {stats.entities} items · {stats.relations} links
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-base-content/30 hover:text-base-content/70 transition-colors text-lg leading-none px-1"
            aria-label="Close vault map"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 relative overflow-hidden">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center gap-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-60 animate-ping" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
              </span>
              <span className="text-xs font-mono text-base-content/30 uppercase tracking-widest">
                Hydrating graph…
              </span>
            </div>
          ) : entities.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center max-w-sm px-6">
                <div className="text-3xl mb-3 opacity-30">🕸️</div>
                <p className="text-sm font-medium text-base-content/50 mb-1">
                  Nothing tagged yet
                </p>
                <p className="text-xs font-mono text-base-content/30">
                  Add tags to gallery items or prompts to see connections.
                </p>
              </div>
            </div>
          ) : (
            <svg
              ref={svgRef}
              className="w-full h-full"
              viewBox={`0 0 ${svgSize.width} ${svgSize.height}`}
              style={{ minHeight: 400 }}
            >
              {/* Edges */}
              {edges.map((e, i) => (
                <line
                  key={`edge-${i}`}
                  x1={e.from.x}
                  y1={e.from.y}
                  x2={e.to.x}
                  y2={e.to.y}
                  stroke="currentColor"
                  strokeWidth={Math.max(1, e.weight * 4)}
                  strokeOpacity={Math.max(0.08, e.weight * 0.5)}
                  className="text-base-content/40"
                />
              ))}

              {/* Nodes: kind ring indicator */}
              {nodes.map((n, i) => (
                <g key={`node-${i}`}>
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={4}
                    fill={KIND_COLORS[n.entity.kind] ?? 'currentColor'}
                    className="text-base-content"
                    opacity={0.8}
                  />
                  <text
                    x={n.x + 8}
                    y={n.y + 1}
                    fontSize={9}
                    fill="currentColor"
                    className="text-base-content/60"
                    dominantBaseline="middle"
                  >
                    {n.entity.label.length > 20
                      ? n.entity.label.slice(0, 18) + '…'
                      : n.entity.label}
                  </text>
                </g>
              ))}

              {/* Legend */}
              <g transform={`translate(12, ${svgSize.height - 50})`} fontSize={9} className="text-base-content/40">
                {Object.entries(KIND_COLORS).map(([kind, color], i) => (
                  <g key={kind} transform={`translate(0, ${i * 16})`}>
                    <circle cx={4} cy={-2} r={4} fill={color} opacity={0.8} />
                    <text x={14} y={2} dominantBaseline="middle">{kind.replace('_', ' ')}</text>
                  </g>
                ))}
              </g>
            </svg>
          )}
        </div>
      </div>
    </div>
  );
};

export { VaultMapPanel };
export default VaultMapPanel;
