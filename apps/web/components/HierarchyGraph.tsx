'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Hierarchy } from '@/lib/api';

// The Armada fleet diagram: anchor at center, dark leader nodes on a ring with
// their names inside, grey disciple satellites orbiting each leader.
const INK = '#141821';
const GREY = '#b7bec6';
const GREY_INK = '#20303b';
const OLIVE = '#6f704d';
const SPOKE = '#3a4048';
const ANCHOR_PATH =
  'M256 40c-31 0-56 25-56 56 0 25 16 46 38 53v31h-44v44h44v150c-60-10-107-58-113-120h35l-60-80-60 80h39c7 100 90 179 191 179s184-79 191-179h39l-60-80-60 80h35c-6 62-53 110-113 120V224h44v-44h-44v-31c22-7 38-28 38-53 0-31-25-56-56-56zm0 44c7 0 13 6 13 13s-6 13-13 13-13-6-13-13 6-13 13-13z';

function wrapWords(text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length <= max) cur = (cur + ' ' + w).trim();
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text];
}

function nodeRadius(lines: string[], leader: boolean): number {
  const maxLen = Math.max(...lines.map((l) => l.length), 1);
  const byWidth = maxLen * 3.7 + 12;
  const byHeight = lines.length * 8.2 + 12;
  const r = Math.max(byWidth, byHeight, leader ? 40 : 26);
  return leader ? Math.min(r, 70) : Math.min(r, 44);
}

interface RNode {
  x: number;
  y: number;
  r: number;
  lines: string[];
  kind: 'leader' | 'disciple' | 'mentor';
  /** Drill into this group instead of navigating away. */
  drillGroupId?: string;
  href?: string;
}
interface RLink {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mentor?: boolean;
}

export function HierarchyGraph({
  hierarchy,
  showMentors,
}: {
  hierarchy: Hierarchy;
  showMentors: boolean;
}) {
  const router = useRouter();
  const [zoom, setZoom] = useState(1);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const draggedRef = useRef(false);

  const focus = focusId ? (hierarchy.groups.find((g) => g.id === focusId) ?? null) : null;

  const { size, center, nodes, links } = useMemo(() => {
    const nodes: RNode[] = [];
    const links: RLink[] = [];

    // ---- Drilled into one group: it sits at center, members orbit ----
    if (focus) {
      const leaderLines = focus.leaders.length
        ? focus.leaders.flatMap((l) => wrapWords(l.name, 12))
        : wrapWords('Unassigned', 12);
      const centerR = Math.max(74, nodeRadius(leaderLines, true));
      const members = focus.disciples;
      const ring = centerR + 150;
      const canvasR = ring + 90;
      const cx = canvasR;
      const cy = canvasR;

      members.forEach((d, i) => {
        const theta = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(members.length, 1);
        const x = cx + ring * Math.cos(theta);
        const y = cy + ring * Math.sin(theta);
        const lines = wrapWords(d.name, 10);
        links.push({ x1: cx, y1: cy, x2: x, y2: y });
        nodes.push({
          x,
          y,
          r: nodeRadius(lines, false),
          lines,
          kind: 'disciple',
          href: `/people/${d.personId}`,
        });
      });

      nodes.push({
        x: cx,
        y: cy,
        r: centerR,
        lines: leaderLines,
        kind: 'leader',
        href: `/groups/${focus.id}`,
      });

      return { size: canvasR * 2, center: { cx, cy }, nodes, links };
    }

    // ---- Whole fleet ----
    const groups = hierarchy.groups;
    const N = Math.max(groups.length, 1);
    const leaderLinesOf = (g: Hierarchy['groups'][number]) =>
      g.leaders.length ? g.leaders.flatMap((l) => wrapWords(l.name, 11)) : wrapWords('Unassigned', 11);

    const maxLeaderR = Math.max(44, ...groups.map((g) => nodeRadius(leaderLinesOf(g), true)));
    const ring = Math.max(300, (N * (2 * maxLeaderR + 26)) / (2 * Math.PI));
    const canvasR = ring + maxLeaderR + 210;
    const cx = canvasR;
    const cy = canvasR;
    const leaderPos = new Map<string, { x: number; y: number }>();

    groups.forEach((g, i) => {
      const theta = -Math.PI / 2 + (i * 2 * Math.PI) / N;
      const lLines = leaderLinesOf(g);
      const lr = nodeRadius(lLines, true);
      const lx = cx + ring * Math.cos(theta);
      const ly = cy + ring * Math.sin(theta);
      links.push({ x1: cx, y1: cy, x2: lx, y2: ly });
      nodes.push({ x: lx, y: ly, r: lr, lines: lLines, kind: 'leader', drillGroupId: g.id });
      for (const l of g.leaders) leaderPos.set(l.personId, { x: lx, y: ly });

      const k = g.disciples.length;
      const rd = ring + lr + 78;
      const step = k > 1 ? (2 * 34 + 8) / rd : 0;
      g.disciples.forEach((d, j) => {
        const dt = theta + (j - (k - 1) / 2) * step;
        const dx = cx + rd * Math.cos(dt);
        const dy = cy + rd * Math.sin(dt);
        const dLines = wrapWords(d.name, 10);
        links.push({ x1: lx, y1: ly, x2: dx, y2: dy });
        nodes.push({
          x: dx,
          y: dy,
          r: nodeRadius(dLines, false),
          lines: dLines,
          kind: 'disciple',
          drillGroupId: g.id,
        });
      });
    });

    if (showMentors) {
      const mentorRing = ring + maxLeaderR + 170;
      hierarchy.mentors.forEach((m, i) => {
        const theta = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(hierarchy.mentors.length, 1);
        const mx = cx + mentorRing * Math.cos(theta);
        const my = cy + mentorRing * Math.sin(theta);
        const mLines = wrapWords(m.name, 11);
        nodes.push({
          x: mx,
          y: my,
          r: nodeRadius(mLines, false),
          lines: mLines,
          kind: 'mentor',
          href: `/people/${m.personId}`,
        });
        for (const menteeId of m.menteeIds) {
          const p = leaderPos.get(menteeId);
          if (p) links.push({ x1: mx, y1: my, x2: p.x, y2: p.y, mentor: true });
        }
      });
    }

    return { size: canvasR * 2, center: { cx, cy }, nodes, links };
  }, [hierarchy, showMentors, focus]);

  // Zoom by shrinking the viewBox around a pannable centre, so the diagram
  // always fits the container and can be dragged around when zoomed in.
  const vb = size / zoom;
  const viewBox = `${center.cx - vb / 2 + pan.x} ${center.cy - vb / 2 + pan.y} ${vb} ${vb}`;

  // Drag/touch panning. Pointer events cover mouse and touch alike; we convert
  // screen movement into viewBox units so panning tracks the finger 1:1.
  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (zoom <= 1) return;
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = dragRef.current;
    if (!d) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const unitsPerPx = vb / Math.min(rect.width, rect.height);
    const dx = (e.clientX - d.x) * unitsPerPx;
    const dy = (e.clientY - d.y) * unitsPerPx;
    if (Math.abs(e.clientX - d.x) > 4 || Math.abs(e.clientY - d.y) > 4) d.moved = true;
    setPan({ x: d.panX - dx, y: d.panY - dy });
  }
  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (dragRef.current) e.currentTarget.releasePointerCapture(e.pointerId);
    // Keep "was this a drag?" briefly so the click handler can ignore it.
    draggedRef.current = dragRef.current?.moved ?? false;
    dragRef.current = null;
  }

  function onNode(n: RNode) {
    if (draggedRef.current) return; // panning, not a tap
    if (n.drillGroupId && !focus) {
      setFocusId(n.drillGroupId);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    if (n.href) router.push(n.href);
  }

  return (
    <div className="relative overflow-hidden rounded-hero border border-line bg-[#f4efe7]">
      {/* Controls */}
      <div className="absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-2">
        {focus ? (
          <button
            onClick={() => {
              setFocusId(null);
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="rounded-full border border-line bg-cream/90 px-3 py-1.5 text-sm font-medium text-ink-soft backdrop-blur"
          >
            ← All Groups
          </button>
        ) : (
          <span className="rounded-full border border-line bg-cream/90 px-3 py-1.5 text-xs text-muted backdrop-blur">
            Tap A Group · Drag To Move
          </span>
        )}
        <div className="flex items-center gap-1 rounded-full border border-line bg-cream/90 px-1 py-1 backdrop-blur">
          <button
            onClick={() => { const nz = Math.max(1, +(zoom - 0.5).toFixed(1)); setZoom(nz); if (nz === 1) setPan({ x: 0, y: 0 }); }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-ink-soft hover:bg-sand"
            aria-label="Zoom out"
          >
            −
          </button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="px-2 text-xs font-medium text-muted hover:text-ink">
            Fit
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(4, +(z + 0.5).toFixed(1)))}
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-ink-soft hover:bg-sand"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      {/* The diagram always fits its box; zoom narrows the viewBox. */}
      <svg
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: 'none', cursor: zoom > 1 ? 'grab' : 'default' }}
        className="block h-[62vh] w-full md:h-[74vh]"
      >
        {links.map((l, i) => (
          <line
            key={i}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke={l.mentor ? OLIVE : SPOKE}
            strokeWidth={1.4}
            strokeDasharray={l.mentor ? '4 4' : undefined}
            opacity={l.mentor ? 0.6 : 0.5}
          />
        ))}

        {nodes
          .filter((n) => n.kind !== 'leader')
          .map((n, i) => (
            <NodeG key={`s${i}`} n={n} onClick={() => onNode(n)} />
          ))}
        {nodes
          .filter((n) => n.kind === 'leader')
          .map((n, i) => (
            <NodeG key={`l${i}`} n={n} onClick={() => onNode(n)} />
          ))}

        {/* Center anchor (fleet view only) */}
        {!focus && (
          <>
            <circle cx={center.cx} cy={center.cy} r={108} fill="#0f1218" />
            <g transform={`translate(${center.cx - 68} ${center.cy - 68}) scale(0.266)`} fill="#f9f5f1">
              <path d={ANCHOR_PATH} />
            </g>
          </>
        )}

        {focus && focus.disciples.length === 0 && (
          <text
            x={center.cx}
            y={center.cy + 150}
            textAnchor="middle"
            fontSize="15"
            fill={OLIVE}
            fontWeight={600}
          >
            Open Capacity — No Disciples Yet
          </text>
        )}
      </svg>
    </div>
  );
}

function NodeG({ n, onClick }: { n: RNode; onClick: () => void }) {
  const fill = n.kind === 'mentor' ? OLIVE : n.kind === 'leader' ? INK : GREY;
  const textColor = n.kind === 'disciple' ? GREY_INK : '#f4efe7';
  const lh = 12.5;
  const startY = -((n.lines.length - 1) / 2) * lh;
  return (
    <g transform={`translate(${n.x} ${n.y})`} onClick={onClick} style={{ cursor: 'pointer' }}>
      <circle r={n.r} fill={fill} />
      <text
        textAnchor="middle"
        fontSize={n.kind === 'leader' ? 12.5 : 11.5}
        fontWeight={600}
        fill={textColor}
        style={{ pointerEvents: 'none' }}
      >
        {n.lines.map((line, i) => (
          <tspan key={i} x={0} y={startY + i * lh} dominantBaseline="middle">
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}
