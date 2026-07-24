'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Hierarchy } from '@/lib/api';
import { ANCHOR_BOUNDS, ANCHOR_PATHS } from './Anchor';

// The Armada fleet diagram: anchor at center, dark leader nodes on a ring with
// their names inside, grey disciple satellites orbiting each leader.
//
// Layout rule: every group owns an angular SECTOR sized by how many disciples
// it has, and the rings are sized so the arc length inside each sector is
// always wide enough for the nodes that sit in it. That is what keeps nodes
// from overlapping — a fixed ring with a fixed fan-out cannot, because a leader
// with nine disciples needs nine times the arc of a leader with one.
const INK = '#141821';
const GREY = '#b9c0c8';
const GREY_INK = '#20303b';
const OLIVE = '#6f704d';
const SPOKE = '#3a4048';
const CREAM = '#f4efe7';

const LEADER_FS = 12;
const SAT_FS = 11;
const LINE_H = 13.5;
/** Semibold Archivo runs a shade under 0.56em per character. */
const CHAR_W = 0.56;

/** "Christopher Vanderbilt" -> "Christopher V." so long names still fit. */
function shortName(name: string, max: number): string {
  const t = name.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const parts = t.split(' ');
  if (parts.length < 2) return t;
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  const two = `${first} ${last}`;
  if (two.length <= max) return two;
  return `${first} ${last[0]}.`;
}

/** Smallest radius that fits the label's bounding box inside the circle. */
function radiusFor(lines: string[], fs: number, min: number): number {
  const maxLen = Math.max(...lines.map((l) => l.length), 1);
  const w = maxLen * fs * CHAR_W;
  const h = (lines.length - 1) * LINE_H + fs;
  return Math.max(min, Math.hypot(w / 2, h / 2) + 9);
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
  const dragRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);
  const draggedRef = useRef(false);

  const focus = focusId ? (hierarchy.groups.find((g) => g.id === focusId) ?? null) : null;

  const { size, center, nodes, links, rings } = useMemo(() => {
    const nodes: RNode[] = [];
    const links: RLink[] = [];

    // ---- Drilled into one group: it sits at center, members orbit ----
    if (focus) {
      const leaderLines = focus.leaders.length
        ? focus.leaders.map((l) => shortName(l.name, 15))
        : ['Unassigned'];
      const centerR = Math.max(76, radiusFor(leaderLines, LEADER_FS + 1, 76));
      const members = focus.disciples;
      const memberLines = members.map((d) => [shortName(d.name, 14)]);
      const memberR = memberLines.map((l) => radiusFor(l, SAT_FS, 28));
      const maxMemberR = Math.max(30, ...memberR);

      // Ring wide enough that every member circle has breathing room on the arc.
      const fitRing = (members.length * (2 * maxMemberR + 16)) / (2 * Math.PI);
      const ring = Math.max(centerR + maxMemberR + 90, fitRing);
      const canvasR = ring + maxMemberR + 56;
      const cx = canvasR;
      const cy = canvasR;

      members.forEach((d, i) => {
        const theta = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(members.length, 1);
        const x = cx + ring * Math.cos(theta);
        const y = cy + ring * Math.sin(theta);
        links.push({ x1: cx, y1: cy, x2: x, y2: y });
        nodes.push({
          x,
          y,
          r: memberR[i]!,
          lines: memberLines[i]!,
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

      return {
        size: canvasR * 2,
        center: { cx, cy },
        nodes,
        links,
        rings: members.length ? [ring] : [],
      };
    }

    // ---- Whole fleet ----
    const groups = hierarchy.groups;

    const shaped = groups.map((g) => {
      const lines = g.leaders.length ? g.leaders.map((l) => shortName(l.name, 15)) : ['Unassigned'];
      const dLines = g.disciples.map((d) => [shortName(d.name, 13)]);
      return {
        g,
        lines,
        r: radiusFor(lines, LEADER_FS, 40),
        dLines,
        dR: dLines.map((l) => radiusFor(l, SAT_FS, 27)),
      };
    });

    const maxSatR = Math.max(28, ...shaped.flatMap((s) => s.dR));
    const maxLeaderR = Math.max(40, ...shaped.map((s) => s.r));
    const satPitch = 2 * maxSatR + 8; // arc a satellite needs on its row
    const rowGap = 2 * maxSatR + 10; // radial gap between satellite rows

    /**
     * Solve for the smallest leader ring that still fits everything.
     *
     * Each group needs an angular sector wide enough for BOTH its leader circle
     * and its satellites, and the sectors must sum to a full turn. Both needs
     * shrink as the ring grows, so the total is monotonic — a binary search
     * lands on the tightest ring rather than a guessed constant. Guessing is
     * what left the huge empty middle: the ring was sized for the worst case
     * everywhere instead of for what each group actually needs.
     */
    function needsAt(ring: number, rows: number): number[] {
      const r1 = ring + maxLeaderR + maxSatR + 22;
      return shaped.map((s) => {
        const leaderNeed = (2 * s.r + 16) / ring;
        const perRow = Math.ceil(s.dLines.length / rows);
        const satNeed = (perRow * satPitch) / r1;
        return Math.max(leaderNeed, satNeed);
      });
    }
    function solveRing(rows: number): number {
      let lo = 160;
      let hi = 6000;
      for (let i = 0; i < 44; i++) {
        const mid = (lo + hi) / 2;
        const total = needsAt(mid, rows).reduce((a, b) => a + b, 0);
        if (total > 2 * Math.PI) lo = mid;
        else hi = mid;
      }
      return hi;
    }

    // More satellite rows means a tighter ring but a deeper fringe. Pick the
    // row count that yields the most compact drawing overall.
    const maxRows = Math.min(4, Math.max(1, ...shaped.map((s) => s.dLines.length)));
    let rows = 1;
    let ring = solveRing(1);
    let best = ring + maxLeaderR + maxSatR + 22 + (1 - 1) * rowGap + maxSatR;
    for (let r = 2; r <= maxRows; r++) {
      const cand = solveRing(r);
      const outer = cand + maxLeaderR + maxSatR + 22 + (r - 1) * rowGap + maxSatR;
      if (outer < best) {
        best = outer;
        ring = cand;
        rows = r;
      }
    }

    const r1 = ring + maxLeaderR + maxSatR + 22;
    const needs = needsAt(ring, rows);
    const needTotal = needs.reduce((a, b) => a + b, 0);
    // Distribute the leftover arc proportionally so the ring is evenly filled.
    const spans = needs.map((n) => (n / needTotal) * 2 * Math.PI);

    // Breathing room so the outermost circles never graze the frame.
    const canvasR = best + 56;
    const cx = canvasR;
    const cy = canvasR;
    const leaderPos = new Map<string, { x: number; y: number }>();

    // Walk the sectors so each group starts where the previous one ended.
    let cursor = -Math.PI / 2 - spans[0]! / 2;
    shaped.forEach((s, i) => {
      const span = spans[i]!;
      const theta = cursor + span / 2;
      cursor += span;

      const lx = cx + ring * Math.cos(theta);
      const ly = cy + ring * Math.sin(theta);
      links.push({ x1: cx, y1: cy, x2: lx, y2: ly });
      nodes.push({ x: lx, y: ly, r: s.r, lines: s.lines, kind: 'leader', drillGroupId: s.g.id });
      for (const l of s.g.leaders) leaderPos.set(l.personId, { x: lx, y: ly });

      // Satellites fan outward from their own leader, wrapping onto extra rows
      // so a nine-disciple group reads as a cluster rather than a long arc.
      const k = s.dLines.length;
      if (k === 0) return;
      const usedRows = Math.min(rows, k);
      const byRow: number[][] = Array.from({ length: usedRows }, () => []);
      s.dLines.forEach((_, j) => byRow[j % usedRows]!.push(j));

      byRow.forEach((idxs, row) => {
        const rr = r1 + row * rowGap;
        // Keep the fan inside this group's own sector, never into a neighbour's.
        const step = Math.min((span * 0.94) / idxs.length, (satPitch * 1.25) / rr);
        idxs.forEach((j, pos) => {
          const dt = theta + (pos - (idxs.length - 1) / 2) * step;
          const dx = cx + rr * Math.cos(dt);
          const dy = cy + rr * Math.sin(dt);
          links.push({ x1: lx, y1: ly, x2: dx, y2: dy });
          nodes.push({
            x: dx,
            y: dy,
            r: s.dR[j]!,
            lines: s.dLines[j]!,
            kind: 'disciple',
            drillGroupId: s.g.id,
          });
        });
      });
    });

    // Mentors sit INSIDE the leader ring: their dashed links to the leaders they
    // mentor stay short instead of crossing the whole diagram from outside.
    if (showMentors && hierarchy.mentors.length) {
      const mentorRing = ring * 0.44;
      hierarchy.mentors.forEach((m, i) => {
        const theta = -Math.PI / 2 + (i * 2 * Math.PI) / hierarchy.mentors.length;
        const mLines = [shortName(m.name, 14)];
        const mx = cx + mentorRing * Math.cos(theta);
        const my = cy + mentorRing * Math.sin(theta);
        nodes.push({
          x: mx,
          y: my,
          r: radiusFor(mLines, SAT_FS, 30),
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

    return { size: canvasR * 2, center: { cx, cy }, nodes, links, rings: [ring, r1] };
  }, [hierarchy, showMentors, focus]);

  // Anchor scales with the drawing so the hub never floats in empty space.
  const anchorR = focus ? 0 : Math.max(70, Math.min(150, size * 0.055));
  // Centre on the mark's real ink bounds, not its artboard, so it sits dead
  // centre in the hub disc.
  const anchorScale = (anchorR * 1.25) / ANCHOR_BOUNDS.height;
  const anchorTransform = `translate(${
    center.cx - (ANCHOR_BOUNDS.x + ANCHOR_BOUNDS.width / 2) * anchorScale
  } ${center.cy - (ANCHOR_BOUNDS.y + ANCHOR_BOUNDS.height / 2) * anchorScale}) scale(${anchorScale})`;

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
    <div>
      {/* Controls sit ABOVE the canvas, not over it — floating them on top of
          the drawing clipped the outermost nodes behind the chips. */}
      <div className="mb-2 flex items-center justify-between gap-2">
        {focus ? (
          <button
            onClick={() => {
              setFocusId(null);
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-soft"
          >
            ← All Groups
          </button>
        ) : (
          <span className="text-xs text-muted">Tap A Group · Drag To Move</span>
        )}
        <div className="flex items-center gap-1 rounded-full border border-line bg-surface px-1 py-1">
          <button
            onClick={() => {
              const nz = Math.max(1, +(zoom - 0.5).toFixed(1));
              setZoom(nz);
              if (nz === 1) setPan({ x: 0, y: 0 });
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-ink-soft hover:bg-sand"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="px-2 text-xs font-medium text-muted hover:text-ink"
          >
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

      {/* The diagram always fits its box; zoom narrows the viewBox. The drawing
          is square, so a square box on mobile wastes no cream above and below. */}
      <div className="overflow-hidden rounded-hero border border-line bg-[#f4efe7]">
        <svg
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ touchAction: 'none', cursor: zoom > 1 ? 'grab' : 'default' }}
          className="block aspect-square w-full md:aspect-auto md:h-[74vh]"
        >
          <defs>
            <radialGradient id="fleetGlow">
              <stop offset="0%" stopColor="#e6ddcd" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#e6ddcd" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Warm halo behind the anchor, then faint guide rings for each orbit. */}
          {!focus && <circle cx={center.cx} cy={center.cy} r={size * 0.3} fill="url(#fleetGlow)" />}
          {rings.map((r, i) => (
            <circle
              key={i}
              cx={center.cx}
              cy={center.cy}
              r={r}
              fill="none"
              stroke={SPOKE}
              strokeWidth={1}
              opacity={0.09}
            />
          ))}

          {links.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke={l.mentor ? OLIVE : SPOKE}
              strokeWidth={l.mentor ? 1.6 : 1.2}
              strokeDasharray={l.mentor ? '5 5' : undefined}
              opacity={l.mentor ? 0.65 : 0.28}
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
              <circle
                cx={center.cx}
                cy={center.cy}
                r={anchorR + 12}
                fill="none"
                stroke={OLIVE}
                strokeWidth={1.5}
                opacity={0.35}
              />
              <circle cx={center.cx} cy={center.cy} r={anchorR} fill="#0f1218" />
              {/* The real Armada mark, scaled to sit inside the hub disc. */}
              <g transform={anchorTransform} fill={CREAM}>
                {ANCHOR_PATHS.map((d) => (
                  <path key={d.slice(0, 12)} d={d} />
                ))}
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
    </div>
  );
}

function NodeG({ n, onClick }: { n: RNode; onClick: () => void }) {
  const fill = n.kind === 'mentor' ? OLIVE : n.kind === 'leader' ? INK : GREY;
  const textColor = n.kind === 'disciple' ? GREY_INK : CREAM;
  const fs = n.kind === 'leader' ? LEADER_FS : SAT_FS;
  const startY = -((n.lines.length - 1) / 2) * LINE_H;
  return (
    <g transform={`translate(${n.x} ${n.y})`} onClick={onClick} style={{ cursor: 'pointer' }}>
      {/* Cream rim keeps neighbouring circles legible where they nearly touch. */}
      <circle r={n.r} fill={fill} stroke={CREAM} strokeWidth={2} />
      <text
        textAnchor="middle"
        fontSize={fs}
        fontWeight={600}
        fill={textColor}
        style={{ pointerEvents: 'none' }}
      >
        {n.lines.map((line, i) => (
          <tspan key={i} x={0} y={startY + i * LINE_H} dominantBaseline="middle">
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}
