'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL, getHeaders } from '@/lib/api';
import {
  GraphCanvas,
  darkTheme,
  type GraphNode,
  type GraphEdge,
} from 'reagraph';
import { sectorColors } from '@/lib/colors';

type RawNode = {
  id: string;
  degree: number;
};

type RawLink = {
  source: string;
  target: string;
  weight: number;
};

type GraphData = {
  nodes: RawNode[];
  links: RawLink[];
};

type DetailedNodeInfo = {
  node_memory_id: string;
  outgoing_edges_count: number;
  connected_targets?: {
    target_memory_id: string;
    link_weight: number;
  }[];
};

type GraphSummaryStatistics = {
  total_nodes_in_graph?: number;
  total_edges_across_all_nodes?: number;
  average_edges_per_node?: number;
};

type GraphApiResponse = {
  detailed_node_information?: DetailedNodeInfo[];
  graph_summary_statistics?: GraphSummaryStatistics;
};

export default function GraphExplorer() {
  const [data, setData] = useState<GraphData | null>(null);
  const [minWeight, setMinWeight] = useState(0);
  const [charge, setCharge] = useState(-600);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<GraphSummaryStatistics>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [sectors, setSectors] = useState<Record<string, string>>({});
  const [nodeMetadata, setNodeMetadata] = useState<
    Record<
      string,
      {
        fullContent?: string;
        createdAt?: number;
        userId?: string;
        tags?: string[];
      }
    >
  >({});
  const [spread, setSpread] = useState(1.6);
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [hiddenSectors, setHiddenSectors] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  // const [timeFilter, setTimeFilter] = useState<number | null>(null);
  const [is3D, setIs3D] = useState(false);
  const [showEdgeList, setShowEdgeList] = useState(false);
  const [cameraPosition, setCameraPosition] = useState<
    { x: number; y: number; z: number } | undefined
  >(undefined);
  const [filterUserId, setFilterUserId] = useState<string>('');
  const [activeClusterIndex, setActiveClusterIndex] = useState<number>(0);
  const [pathStart, setPathStart] = useState<string>('');
  const [pathEnd, setPathEnd] = useState<string>('');
  const [highlightedPathIds, setHighlightedPathIds] = useState<string[]>([]);
  const [pathError, setPathError] = useState<string>('');
  const [pathInfo, setPathInfo] = useState<string>('');
  const [copiedIdMsg, setCopiedIdMsg] = useState<string>('');

  /*
  const timeRange = useMemo(() => {
    const dates = Object.values(nodeMetadata)
      .map((m) => m.createdAt)
      .filter((d): d is number => typeof d === 'number');
    if (dates.length === 0) return null;
    const min = Math.min(...dates);
    const max = Math.max(...dates);
    // Ensure min != max to avoid slider issues
    return { min, max: max === min ? min + 1 : max };
  }, [nodeMetadata]);
  */

  const handleSearch = () => {
    if (!searchQuery.trim()) return;

    const query = searchQuery.toLowerCase();
    const foundNode = graphNodes.find(
      (n) =>
        n.id.toLowerCase() === query || n.label?.toLowerCase().includes(query),
    );

    if (foundNode) {
      setSelectedNode(foundNode);
      setActiveIds([foundNode.id]);
      // reagraph doesn't expose direct camera control easily without ref,
      // but selecting the node usually centers it or we can highlight it.
      // We will rely on 'activeIds' and 'selectedNode' to highlight.
    } else {
      alert('Node not found');
    }
  };

  const tracePath = () => {
    setPathError('');
    const start = pathStart.trim();
    const end = pathEnd.trim();
    if (!start || !end) {
      setPathError('Start and Target IDs are required');
      return;
    }
    const ids = new Set(visibleNodes.map((n) => n.id));
    if (!ids.has(start) || !ids.has(end)) {
      setPathError('IDs must exist in current graph view');
      return;
    }
    const adj = new Map<string, string[]>();
    for (const e of visibleEdges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
    }
    const q: Array<{ id: string; path: string[] }> = [
      { id: start, path: [start] },
    ];
    const seen = new Set<string>([start]);
    const maxDepth = 5;
    while (q.length) {
      const cur = q.shift()!;
      if (cur.id === end) {
        setHighlightedPathIds(cur.path);
        setActiveIds(cur.path);
        setPathInfo(`Path length: ${cur.path.length}`);
        return;
      }
      if (cur.path.length > maxDepth) continue;
      for (const nb of adj.get(cur.id) || []) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        q.push({ id: nb, path: [...cur.path, nb] });
      }
    }
    setPathError('No path found within depth');
    setPathInfo('');
  };

  const fetchData = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (filterUserId) qs.set('user_id', filterUserId);
      const url = `${API_BASE_URL}/dynamics/waypoints/graph${
        qs.toString() ? `?${qs.toString()}` : ''
      }`;
      const res = await fetch(url, {
        headers: getHeaders(),
      });

      if (!res.ok) {
        console.error('Failed to load graph:', res.status);
        setData(null);
        setStats({});
        return;
      }

      const payload: GraphApiResponse = await res.json();

      const nodesMap = new Map<string, RawNode>();
      const links: RawLink[] = [];

      const details = payload.detailed_node_information ?? [];

      for (const d of details) {
        const degree = d.outgoing_edges_count ?? 0;

        // Основний вузол
        if (!nodesMap.has(d.node_memory_id)) {
          nodesMap.set(d.node_memory_id, {
            id: d.node_memory_id,
            degree,
          });
        } else {
          const existing = nodesMap.get(d.node_memory_id)!;
          nodesMap.set(d.node_memory_id, {
            ...existing,
            degree,
          });
        }

        // Звʼязані таргети
        for (const c of d.connected_targets ?? []) {
          if (
            !c ||
            typeof c.target_memory_id !== 'string' ||
            !c.target_memory_id
          ) {
            continue;
          }

          if (!nodesMap.has(c.target_memory_id)) {
            nodesMap.set(c.target_memory_id, {
              id: c.target_memory_id,
              degree: 0,
            });
          }

          links.push({
            source: d.node_memory_id,
            target: c.target_memory_id,
            weight: c.link_weight,
          });
        }
      }

      const nodes = Array.from(nodesMap.values());
      setData({ nodes, links });
      setStats(payload.graph_summary_statistics ?? {});

      // Підвантажуємо лейбли/сектори для топ-вузлів
      const sorted = nodes
        .slice()
        .sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0));

      const toFetch = sorted.slice(0, 200);
      const pool = 8;
      let idx = 0;
      let cancelled = false;

      async function runBatch() {
        if (cancelled) return;

        const batch = toFetch.slice(idx, idx + pool);
        if (!batch.length) return;

        idx += pool;

        const results = await Promise.all(
          batch.map(async (n) => {
            try {
              const r = await fetch(`${API_BASE_URL}/memory/${n.id}`, {
                headers: getHeaders(),
              });
              if (!r.ok) {
                return {
                  id: n.id,
                  label: n.id,
                } as {
                  id: string;
                  label: string;
                  primary_sector?: string;
                };
              }

              const m = await r.json();
              const txt = String(m.content ?? '')
                .replace(/\s+/g, ' ')
                .trim();
              const preview = txt.length > 42 ? `${txt.slice(0, 42)}…` : txt;
              const sector = m.primary_sector ? `[${m.primary_sector}] ` : '';
              const createdAt = m.created_at
                ? new Date(m.created_at).getTime()
                : Date.now();

              return {
                id: n.id,
                label: sector + preview,
                primary_sector: m.primary_sector as string | undefined,
                fullContent: m.content,
                createdAt: createdAt,
                user_id: m.user_id as string | undefined,
                tags: Array.isArray(m.tags)
                  ? (m.tags as string[])
                  : (() => {
                      try {
                        return JSON.parse(m.tags || '[]') as string[];
                      } catch {
                        return [];
                      }
                    })(),
              };
            } catch {
              return {
                id: n.id,
                label: n.id,
                primary_sector: undefined,
                fullContent: undefined,
                createdAt: undefined,
              } as {
                id: string;
                label: string;
                primary_sector?: string;
                fullContent?: string;
                createdAt?: number;
              };
            }
          }),
        );

        if (cancelled) return;

        setLabels((prev) => {
          const next = { ...prev };
          for (const r of results) {
            next[r.id] = r.label;
          }
          return next;
        });

        setSectors((prev) => {
          const next: Record<string, string> = { ...prev };
          for (const r of results) {
            if (r.primary_sector) {
              next[r.id] = r.primary_sector;
            }
          }
          return next;
        });

        setNodeMetadata((prev) => {
          const next = { ...prev };
          for (const r of results) {
            const createdAt = (r as any).createdAt || Date.now();
            next[r.id] = {
              fullContent: (r as any).fullContent,
              createdAt,
              userId: (r as any).user_id,
              tags: (r as any).tags || [],
            };
          }
          return next;
        });

        if (idx < toFetch.length) {
          await runBatch();
        }
      }

      void runBatch();

      // cleanup, якщо компонент анмаунтиться
      return () => {
        cancelled = true;
      };
    } catch (e) {
      console.error('Error while loading graph', e);
      setData(null);
      setStats({});
    } finally {
      setLoading(false);
    }
  }, [filterUserId]);

  // первинний лоад + оновлення раз на хвилину
  useEffect(() => {
    const cleanup = fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => {
      clearInterval(interval);
      if (cleanup && typeof cleanup === 'function') (cleanup as () => void)();
    };
  }, [fetchData]);

  // Перетворюємо сирі ноди у GraphNode[]
  const graphNodes = useMemo<GraphNode[]>(() => {
    if (!data?.nodes) return [];

    return data.nodes
      .filter((n) => n && typeof n.id === 'string' && n.id.length > 0)
      .filter((n) => {
        const sector = (sectors[n.id] ?? 'unknown').toLowerCase();
        const meta = nodeMetadata[n.id] || {};
        if (hiddenSectors.has(sector)) return false;
        if (
          filterUserId &&
          (meta.userId || '').toLowerCase() !== filterUserId.toLowerCase()
        )
          return false;
        /*
        // Filter by time (Time Travel)
        const createdAt = nodeMetadata[n.id]?.createdAt;
        if (
          timeFilter !== null &&
          createdAt &&
          createdAt > timeFilter
        ) {
          return false;
        }
        */
        return true;
      })
      .map((n) => ({
        id: n.id,
        label: String(labels[n.id] ?? String(n.id).slice(0, 6)),
        data: {
          degree: n.degree ?? 0,
          sector: sectors[n.id] ?? 'unknown',
          fullContent: nodeMetadata[n.id]?.fullContent,
          createdAt: nodeMetadata[n.id]?.createdAt,
          userId: nodeMetadata[n.id]?.userId,
          tags: nodeMetadata[n.id]?.tags || [],
        },
      }));
  }, [data, labels, sectors, nodeMetadata, hiddenSectors]);

  // Перетворюємо сирі ребра у GraphEdge[]
  const graphEdges = useMemo<GraphEdge[]>(() => {
    if (!data?.links || !data.nodes) return [];

    const nodeIds = new Set(graphNodes.map((n) => n.id));

    const edges: GraphEdge[] = [];

    data.links.forEach((l, idx) => {
      if (!l) return;

      const src = l.source;
      const tgt = l.target;

      if (typeof src !== 'string' || typeof tgt !== 'string' || !src || !tgt) {
        return;
      }

      // тільки ребра між існуючими нодами
      if (!nodeIds.has(src) || !nodeIds.has(tgt)) return;

      // прибираємо петлі на себе
      if (src === tgt) return;

      // фільтр по вазі
      if ((l.weight ?? 0) < minWeight) return;

      edges.push({
        id: `${src}->${tgt}-${idx}`,
        source: src,
        target: tgt,
        data: { weight: l.weight ?? 0 },
      });
    });

    // додаткова страховка від undefined
    return edges.filter(
      (e): e is GraphEdge =>
        !!e &&
        typeof e.id === 'string' &&
        typeof e.source === 'string' &&
        typeof e.target === 'string',
    );
  }, [data, minWeight, graphNodes]);

  const components = useMemo<string[][]>(() => {
    const ids = new Set(graphNodes.map((n) => n.id));
    const adj = new Map<string, Set<string>>();
    for (const id of ids) adj.set(id, new Set());
    for (const l of data?.links || []) {
      const a = l.source,
        b = l.target;
      if (!ids.has(a) || !ids.has(b) || a === b) continue;
      adj.get(a)?.add(b);
      adj.get(b)?.add(a);
    }
    const seen = new Set<string>();
    const comps: string[][] = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      const q = [id];
      const comp: string[] = [];
      seen.add(id);
      while (q.length) {
        const cur = q.pop()!;
        comp.push(cur);
        for (const nb of adj.get(cur) || []) {
          if (!seen.has(nb)) {
            seen.add(nb);
            q.push(nb);
          }
        }
      }
      comps.push(comp);
    }
    comps.sort((a, b) => b.length - a.length);
    return comps;
  }, [graphNodes, data]);

  const activeComp = components[activeClusterIndex] || [];
  useEffect(() => {
    if (activeClusterIndex >= components.length) setActiveClusterIndex(0);
  }, [components.length]);
  const effectiveVisibleNodeIds = useMemo(() => {
    const base = new Set(activeComp);
    if (!focusNodeId) return base;
    const neighbors = new Set<string>([focusNodeId]);
    for (const e of graphEdges) {
      if (e.source === focusNodeId) neighbors.add(e.target);
      else if (e.target === focusNodeId) neighbors.add(e.source);
    }
    return new Set(Array.from(neighbors).filter((id) => base.has(id)));
  }, [focusNodeId, graphEdges, activeComp]);
  const visibleNodes = useMemo(
    () => graphNodes.filter((n) => effectiveVisibleNodeIds.has(n.id)),
    [graphNodes, effectiveVisibleNodeIds],
  );
  const visibleEdges = useMemo(
    () =>
      graphEdges.filter(
        (e) =>
          effectiveVisibleNodeIds.has(e.source) &&
          effectiveVisibleNodeIds.has(e.target),
      ),
    [graphEdges, effectiveVisibleNodeIds],
  );

  const hasGraph = visibleNodes.length > 0;

  const validActiveIds = useMemo<string[]>(() => {
    const set = new Set(visibleNodes.map((n) => n.id));
    return activeIds.filter(
      (id): id is string => typeof id === 'string' && set.has(id),
    );
  }, [activeIds, visibleNodes]);

  const toggleSector = (sector: string) => {
    const next = new Set(hiddenSectors);
    if (next.has(sector)) {
      next.delete(sector);
    } else {
      next.add(sector);
    }
    setHiddenSectors(next);
  };

  return (
    <div className="min-h-screen bg-black text-[#e6e6e6]">
      <div>
        {loading ? (
          <div className="fixed inset-0 flex items-center justify-center text-stone-400">
            Loading graph…
          </div>
        ) : hasGraph ? (
          <div className="fixed inset-y-0 right-0 left-0">
            <GraphCanvas
              theme={{
                ...darkTheme,
                node: {
                  ...darkTheme.node,
                  label: { ...darkTheme.node.label, color: '#cbd5e1' },
                },
                edge: {
                  ...darkTheme.edge,
                  activeFill: '#f59e0b',
                },
                canvas: { ...darkTheme.canvas, background: '#000000' },
              }}
              layoutType={is3D ? 'forceDirected3d' : 'forceDirected2d'}
              layoutOverrides={{
                linkDistance: Math.round(450 * spread),
                nodeStrength: charge,
              }}
              edgeInterpolation="curved"
              cameraMode={is3D ? 'orbit' : 'pan'}
              actives={validActiveIds.length ? validActiveIds : undefined}
              onNodeClick={(node) => {
                if (node) {
                  setSelectedNode(node);
                  setActiveIds([node.id]);
                  setFocusNodeId(node.id);
                } else {
                  setSelectedNode(null);
                  setActiveIds([]);
                  setFocusNodeId(null);
                }
              }}
              onNodePointerOver={(node) => {
                if (node?.id && !selectedNode) setActiveIds([node.id]);
              }}
              onNodePointerOut={() => {
                if (!selectedNode && highlightedPathIds.length === 0)
                  setActiveIds([]);
              }}
              defaultNodeSize={8}
              nodes={visibleNodes}
              edges={visibleEdges}
              renderNode={({ node, color, opacity }) => {
                if (!node || !node.id) return null;
                const sectorKey = String(
                  (node.data as any)?.sector ?? '',
                ).toLowerCase() as keyof typeof sectorColors;

                const fill =
                  (sectorColors as any)[sectorKey] ?? color ?? '#60a5fa';

                // Dynamic size based on degree
                const degree = (node.data as any)?.degree ?? 0;
                const isImportant = degree > 5;

                // Base size 4, add degree factor. Cap at 30.
                const size = Math.min(4 + degree * 1.5, 30);

                // @ts-ignore three-fiber JSX
                return (
                  <group>
                    {/* Main Sphere (Always use sphere to avoid oval distortion in 2D perspective) */}
                    {/* @ts-ignore */}
                    <mesh>
                      {/* @ts-ignore */}
                      <sphereGeometry attach="geometry" args={[size, 32, 32]} />
                      {/* @ts-ignore */}
                      <meshBasicMaterial
                        attach="material"
                        color={fill}
                        opacity={opacity}
                        transparent
                        depthTest={false}
                      />
                    </mesh>

                    {/* Halo for important nodes */}
                    {isImportant && (
                      /* @ts-ignore */
                      <mesh>
                        {/* @ts-ignore */}
                        <sphereGeometry
                          attach="geometry"
                          args={[size * 1.4, 32, 32]}
                        />
                        {/* @ts-ignore */}
                        <meshBasicMaterial
                          attach="material"
                          color={fill}
                          opacity={0.15}
                          transparent
                          depthWrite={false}
                        />
                      </mesh>
                    )}
                  </group>
                );
              }}
            />
          </div>
        ) : (
          <div className="fixed inset-0 flex items-center justify-center text-stone-400">
            No data
          </div>
        )}

        {/* Legend */}
        <div className="fixed bottom-6 left-6 z-10 bg-stone-950/80 backdrop-blur border border-stone-800 rounded-lg p-3 shadow-xl animate-in fade-in slide-in-from-bottom-4">
          <div className="text-xs font-semibold text-stone-300 mb-2">
            Sectors{' '}
            <span className="text-[10px] font-normal text-stone-500 ml-1">
              (Click to toggle)
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {Object.entries(sectorColors).map(([sector, color]) => {
              const isHidden = hiddenSectors.has(sector);
              return (
                <button
                  key={sector}
                  onClick={() => toggleSector(sector)}
                  className={`flex items-center gap-2 px-2 py-1 rounded transition-colors ${
                    isHidden
                      ? 'opacity-40 grayscale hover:opacity-60'
                      : 'hover:bg-stone-900'
                  }`}
                >
                  <div
                    className="w-3 h-3 rounded-full shadow-[0_0_6px_rgba(0,0,0,0.5)]"
                    style={{
                      backgroundColor: color,
                      boxShadow: isHidden ? 'none' : `0 0 8px ${color}`,
                    }}
                  />
                  <span
                    className={`text-xs capitalize ${
                      isHidden
                        ? 'text-stone-600 line-through'
                        : 'text-stone-300'
                    }`}
                  >
                    {sector}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Node Details */}
        {selectedNode && (
          <div className="fixed top-20 right-6 z-20 w-96 bg-stone-950/90 backdrop-blur border border-stone-800 rounded-xl p-5 shadow-2xl transition-all animate-in fade-in slide-in-from-right-4 overflow-y-auto max-h-[80vh]">
            <div className="flex justify-between items-start mb-4 border-b border-stone-800/50 pb-3">
              <div>
                <h3 className="text-base font-semibold text-stone-100">
                  Memory Details
                </h3>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-xs text-stone-500 font-mono">
                    {selectedNode.id}
                  </p>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(String(selectedNode.id));
                      setCopiedIdMsg('Copied!');
                      setTimeout(() => setCopiedIdMsg(''), 1500);
                    }}
                    className="text-stone-500 hover:text-stone-300 p-1 hover:bg-stone-900 rounded-md transition-colors"
                    title="Copy ID"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                      stroke="currentColor"
                      className="size-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8 7h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16 7V5a2 2 0 0 0-2-2H8A2 2 0 0 0 6 5v2"
                      />
                    </svg>
                  </button>
                  {copiedIdMsg && (
                    <span className="text-[10px] text-emerald-400">
                      {copiedIdMsg}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedNode(null);
                  setActiveIds([]);
                  setFocusNodeId(null);
                }}
                className="text-stone-500 hover:text-stone-300 p-1 hover:bg-stone-900 rounded-md transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  className="size-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <div className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-2">
                  Content
                </div>
                <div className="text-sm text-stone-300 leading-relaxed bg-stone-900/30 p-3 rounded-lg border border-stone-800/50">
                  {selectedNode.data?.fullContent || selectedNode.label}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">
                    Sector
                  </div>
                  <div className="text-xs text-stone-300 capitalize px-2.5 py-1.5 rounded-md bg-stone-900 border border-stone-800 inline-flex items-center gap-2 w-full">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          (sectorColors as any)[selectedNode.data?.sector] ||
                          '#666',
                      }}
                    />
                    <span className="truncate">
                      {selectedNode.data?.sector || 'Unknown'}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">
                    Created
                  </div>
                  <div className="text-xs text-stone-300 px-2.5 py-1.5 rounded-md bg-stone-900 border border-stone-800 w-full">
                    {selectedNode.data?.createdAt
                      ? new Date(
                          selectedNode.data.createdAt,
                        ).toLocaleDateString()
                      : 'Unknown'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">
                    Degree
                  </div>
                  <div className="text-xs text-stone-300 px-2.5 py-1.5 rounded-md bg-stone-900 border border-stone-800 w-full">
                    {selectedNode.data?.degree ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">
                    User
                  </div>
                  <div className="text-xs text-stone-300 px-2.5 py-1.5 rounded-md bg-stone-900 border border-stone-800 w-full">
                    {selectedNode.data?.userId || 'Unknown'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">
                    Outgoing
                  </div>
                  <div className="text-[10px] text-stone-300 px-2.5 py-1.5 rounded-md bg-stone-900 border border-stone-800 w-full">
                    {
                      graphEdges.filter((e) => e.source === selectedNode.id)
                        .length
                    }{' '}
                    edges
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">
                    Incoming
                  </div>
                  <div className="text-[10px] text-stone-300 px-2.5 py-1.5 rounded-md bg-stone-900 border border-stone-800 w-full">
                    {
                      graphEdges.filter((e) => e.target === selectedNode.id)
                        .length
                    }{' '}
                    edges
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">
                  Tags
                </div>
                {Array.isArray(selectedNode.data?.tags) &&
                selectedNode.data?.tags.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedNode.data.tags.map((t: string) => (
                      <span
                        key={t}
                        className="text-[10px] text-stone-400 bg-stone-900 border border-stone-800 px-2 py-1 rounded"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-[10px] text-stone-600">No tags</div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Connections ({selectedNode.data?.degree ?? 0})
                  </div>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                  {graphEdges
                    .filter(
                      (e) =>
                        e.source === selectedNode.id ||
                        e.target === selectedNode.id,
                    )
                    .map((e) => {
                      const isSource = e.source === selectedNode.id;
                      const otherId = isSource ? e.target : e.source;
                      const otherNode = graphNodes.find(
                        (n) => n.id === otherId,
                      );
                      const otherLabel =
                        otherNode?.label || otherId.slice(0, 8);

                      return (
                        <div
                          key={e.id}
                          className="group flex items-center justify-between p-2 rounded-md bg-stone-900/30 hover:bg-stone-800 border border-stone-800/50 cursor-pointer transition-colors"
                          onClick={() => {
                            if (otherNode) {
                              setSelectedNode(otherNode);
                              setActiveIds([otherNode.id]);
                              setFocusNodeId(otherNode.id);
                            }
                          }}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <div
                              className={`w-1.5 h-1.5 rounded-full ${
                                isSource ? 'bg-emerald-500' : 'bg-blue-500'
                              }`}
                            />
                            <span className="text-xs text-stone-400 truncate max-w-[160px] group-hover:text-stone-200 transition-colors">
                              {otherLabel}
                            </span>
                          </div>
                          {e.data?.weight && (
                            <span className="text-[10px] font-mono text-stone-600 group-hover:text-stone-500">
                              {(e.data.weight as number).toFixed(2)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  {selectedNode.data?.degree === 0 && (
                    <div className="text-xs text-stone-600 italic p-2">
                      No visible connections
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Controls Panel */}
        <div className="fixed bottom-6 right-6 z-10 pointer-events-none">
          <div className="bg-stone-950/90 backdrop-blur-xl border border-[#27272a] rounded-xl p-4 flex flex-col gap-4 pointer-events-auto shadow-2xl w-64 animate-in fade-in slide-in-from-bottom-4">
            {/* Header & Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#f4f4f5]">
                Graph Controls
              </span>
              <button
                onClick={() => setIs3D(!is3D)}
                className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors border ${
                  is3D
                    ? 'bg-stone-100 text-black border-stone-100'
                    : 'bg-stone-900 text-stone-400 border-stone-800 hover:text-stone-200'
                }`}
              >
                {is3D ? '3D Mode' : '2D Mode'}
              </button>
            </div>

            {/* Time Travel Slider (Commented out) */}
            {/* 
            {timeRange && (
              <div className="space-y-2 pb-2 border-b border-stone-800/50">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-stone-500 font-medium">Time Travel</span>
                  <span className="text-stone-300 font-mono bg-stone-900 px-1.5 py-0.5 rounded text-[10px]">
                    {timeFilter
                      ? new Date(timeFilter).toLocaleString()
                      : 'Present'}
                  </span>
                </div>
                <input
                  type="range"
                  min={timeRange.min}
                  max={timeRange.max}
                  step={1000} // 1 second resolution for better precision
                  value={timeFilter ?? timeRange.max}
                  onChange={(e) => setTimeFilter(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400"
                />
              </div>
            )}
            */}

            {/* Search */}
            <div className="relative group">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search node..."
                className="w-full bg-stone-900/50 border border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-stone-600 transition-colors"
              />
              <button
                onClick={handleSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  className="size-3.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                  />
                </svg>
              </button>
            </div>

            {/* Path Trace */}
            <div className="space-y-2">
              <div className="text-xs text-stone-400">Trace Path</div>
              <input
                type="text"
                placeholder="Start ID"
                value={pathStart}
                onChange={(e) => setPathStart(e.target.value)}
                className="w-full bg-stone-900/50 border border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-stone-600 transition-colors"
              />
              <input
                type="text"
                placeholder="Target ID"
                value={pathEnd}
                onChange={(e) => setPathEnd(e.target.value)}
                className="w-full bg-stone-900/50 border border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-stone-600 transition-colors"
              />
              <button
                onClick={tracePath}
                className="px-2 py-1 rounded bg-emerald-600 text-white text-[10px] uppercase tracking-wider hover:bg-emerald-500 border border-emerald-700"
              >
                Highlight Path
              </button>
              {pathError && (
                <div className="text-[10px] text-red-500">{pathError}</div>
              )}
              {pathInfo && (
                <div className="text-[10px] text-emerald-400">{pathInfo}</div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs text-stone-400">User</div>
              <input
                type="text"
                placeholder="User ID"
                value={filterUserId}
                onChange={(e) => {
                  setFilterUserId(e.target.value);
                  setActiveClusterIndex(0);
                }}
                className="w-full bg-stone-900/50 border border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-stone-600 transition-colors"
              />
            </div>
            <div className="h-px bg-stone-800/50" />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-400">Cluster</span>
                <span className="text-[10px] text-stone-500 font-mono">
                  {activeClusterIndex + 1}/{Math.max(components.length, 1)}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setActiveClusterIndex((i) => Math.max(0, i - 1))
                  }
                  className="px-2 py-1 rounded bg-stone-900 text-stone-300 border border-stone-800 hover:bg-stone-800 text-[10px]"
                >
                  Prev
                </button>
                <button
                  onClick={() =>
                    setActiveClusterIndex((i) =>
                      Math.min(Math.max(0, components.length - 1), i + 1),
                    )
                  }
                  className="px-2 py-1 rounded bg-stone-900 text-stone-300 border border-stone-800 hover:bg-stone-800 text-[10px]"
                >
                  Next
                </button>
                <button
                  onClick={() => setActiveIds(activeComp)}
                  className="px-2 py-1 rounded bg-amber-600 text-white border border-amber-700 hover:bg-amber-500 text-[10px]"
                >
                  Highlight
                </button>
              </div>
              <div className="text-[10px] text-stone-500 font-mono">
                Size: {activeComp.length}
              </div>
              {components.length <= 1 && (
                <div className="text-[10px] text-stone-600">
                  Only one cluster loaded — navigation has no effect
                </div>
              )}
            </div>
            <div className="h-px bg-stone-800/50" />

            {/* Sliders */}
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-stone-500">Min weight</span>
                  <span className="text-stone-300 font-mono bg-stone-900 px-1.5 py-0.5 rounded">
                    {minWeight.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={minWeight}
                  onChange={(e) => setMinWeight(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-stone-500 hover:accent-stone-400"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-stone-500">Repulsion</span>
                  <span className="text-stone-300 font-mono bg-stone-900 px-1.5 py-0.5 rounded">
                    {charge}
                  </span>
                </div>
                <input
                  type="range"
                  min={-800}
                  max={-10}
                  step={10}
                  value={charge}
                  onChange={(e) => setCharge(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-stone-500 hover:accent-stone-400"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-stone-500">Spread</span>
                  <span className="text-stone-300 font-mono bg-stone-900 px-1.5 py-0.5 rounded">
                    {spread.toFixed(1)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.8}
                  max={2}
                  step={0.1}
                  value={spread}
                  onChange={(e) => setSpread(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-stone-500 hover:accent-stone-400"
                />
              </div>
            </div>

            {stats && (
              <>
                <div className="h-px bg-stone-800/50" />
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-stone-900/30 rounded p-2 border border-stone-800/50">
                    <div className="text-stone-500 mb-1">Nodes</div>
                    <div className="text-stone-200 font-mono font-semibold">
                      {stats.total_nodes_in_graph ?? 0}
                    </div>
                  </div>
                  <div
                    className="bg-stone-900/30 rounded p-2 border border-stone-800/50 cursor-pointer hover:bg-stone-900/50 transition-colors"
                    onClick={() => setShowEdgeList(!showEdgeList)}
                    title="Click to view edge list"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <div className="text-stone-500">Edges</div>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="1.5"
                        stroke="currentColor"
                        className="size-3 text-stone-500"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                        />
                      </svg>
                    </div>
                    <div className="text-stone-200 font-mono font-semibold">
                      {graphEdges.length}
                      <span className="text-[10px] text-stone-500 font-normal ml-1.5">
                        / {stats.total_edges_across_all_nodes ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Edges List Modal */}
        {showEdgeList && data && (
          <div className="fixed top-20 right-72 z-20 w-96 bg-stone-950/90 backdrop-blur border border-stone-800 rounded-xl p-4 shadow-2xl animate-in fade-in slide-in-from-right-4 overflow-y-auto max-h-[80vh]">
            <div className="flex justify-between items-center mb-3 border-b border-stone-800/50 pb-2">
              <div>
                <h3 className="text-sm font-semibold text-stone-100">
                  Edges Inspector
                </h3>
                <div className="text-[10px] text-stone-500 font-mono mt-0.5">
                  Stats: {stats.total_edges_across_all_nodes ?? '?'} | Raw:{' '}
                  {data.links.length} | Visible: {graphEdges.length}
                </div>
              </div>
              <button
                onClick={() => setShowEdgeList(false)}
                className="text-stone-500 hover:text-stone-300"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  className="size-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="space-y-2">
              {data.links.length === 0 ? (
                <div className="text-xs text-stone-500 italic">
                  No links in data
                </div>
              ) : (
                data.links.map((l, idx) => {
                  const srcLabel = labels[l.source] || l.source.slice(0, 6);
                  const tgtLabel = labels[l.target] || l.target.slice(0, 6);
                  const isSelfLoop = l.source === l.target;
                  const nodeIds = new Set(graphNodes.map((n) => n.id));
                  const isOrphan =
                    !nodeIds.has(l.source) || !nodeIds.has(l.target);
                  const isLowWeight = (l.weight ?? 0) < minWeight;
                  const isVisible = !isSelfLoop && !isOrphan && !isLowWeight;

                  let status = 'Visible';
                  let statusColor = 'text-emerald-500';

                  if (isSelfLoop) {
                    status = 'Self-loop';
                    statusColor = 'text-amber-500';
                  } else if (isOrphan) {
                    status = 'Node hidden';
                    statusColor = 'text-red-500';
                  } else if (isLowWeight) {
                    status = 'Low weight';
                    statusColor = 'text-stone-500';
                  }

                  return (
                    <div
                      key={`${l.source}-${l.target}-${idx}`}
                      className={`flex flex-col gap-1 text-xs p-2 rounded border ${
                        isVisible
                          ? 'bg-stone-900/30 border-stone-800/30'
                          : 'bg-stone-900/10 border-stone-800/10 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span
                            className="text-stone-300 truncate max-w-[80px]"
                            title={l.source}
                          >
                            {srcLabel}
                          </span>
                          <span className="text-stone-600">→</span>
                          <span
                            className="text-stone-300 truncate max-w-[80px]"
                            title={l.target}
                          >
                            {tgtLabel}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] ${statusColor} font-medium`}
                        >
                          {status}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px] text-stone-600 font-mono">
                        <span>w: {l.weight?.toFixed(2)}</span>
                        {!isVisible && (
                          <span>
                            {isOrphan
                              ? `Missing: ${
                                  !nodeIds.has(l.source) ? 'Source' : 'Target'
                                }`
                              : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
