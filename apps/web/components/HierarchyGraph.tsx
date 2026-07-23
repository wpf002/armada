'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Hierarchy } from '@/lib/api';

// Matches the Armada org diagram: an anchor at center, dark leader nodes on a
// ring with their names inside, grey disciple satellites orbiting each leader.
const INK = '#141821';
const GREY = '#b7bec6';
const GREY_INK = '#20303b';
const OLIVE = '#6f7051';
const SPOKE = '#3a4048';
const LEAF = '#9aa3ac';

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
  leader: boolean;
  mentor?: boolean;
  href: string;
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

  const { size, center, nodes, links } = useMemo(() => {
    const groups = hierarchy.groups;
    const N = Math.max(groups.length, 1);

    const leaderLinesOf = (g: Hierarchy['groups'][number]) =>
      g.leaders.length ? g.leaders.flatMap((l) => wrapWords(l.name, 11)) : wrapWords('Unassigned', 11);

    const maxLeaderR = Math.max(
      44,
      ...groups.map((g) => nodeRadius(leaderLinesOf(g), true)),
    );
    const ring = Math.max(300, (N * (2 * maxLeaderR + 26)) / (2 * Math.PI));
    const canvasR = ring + maxLeaderR + 210;
    const cx = canvasR;
    const cy = canvasR;

    const nodes: RNode[] = [];
    const links: RLink[] = [];
    const leaderPos = new Map<string, { x: number; y: number }>();

    groups.forEach((g, i) => {
      const theta = -Math.PI / 2 + (i * 2 * Math.PI) / N;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const lLines = leaderLinesOf(g);
      const lr = nodeRadius(lLines, true);
      const lx = cx + ring * cos;
      const ly = cy + ring * sin;
      links.push({ x1: cx, y1: cy, x2: lx, y2: ly });
      nodes.push({ x: lx, y: ly, r: lr, lines: lLines, leader: true, href: `/groups/${g.id}` });
      for (const l of g.leaders) leaderPos.set(l.personId, { x: lx, y: ly });

      // Disciples fan outward beyond the leader node.
      const k = g.disciples.length;
      const rd = ring + lr + 78;
      const step = k > 1 ? (2 * 34 + 8) / rd : 0;
      g.disciples.forEach((d, j) => {
        const dt = theta + (j - (k - 1) / 2) * step;
        const dx = cx + rd * Math.cos(dt);
        const dy = cy + rd * Math.sin(dt);
        const dLines = wrapWords(d.name, 10);
        const dr = nodeRadius(dLines, false);
        links.push({ x1: lx, y1: ly, x2: dx, y2: dy });
        nodes.push({ x: dx, y: dy, r: dr, lines: dLines, leader: false, href: `/people/${d.personId}` });
      });
    });

    if (showMentors) {
      const mentorRing = ring + maxLeaderR + 170;
      hierarchy.mentors.forEach((m, i) => {
        const theta = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(hierarchy.mentors.length, 1);
        const mx = cx + mentorRing * Math.cos(theta);
        const my = cy + mentorRing * Math.sin(theta);
        const mLines = wrapWords(m.name, 11);
        const mr = nodeRadius(mLines, false);
        nodes.push({ x: mx, y: my, r: mr, lines: mLines, leader: false, mentor: true, href: `/people/${m.personId}` });
        for (const menteeId of m.menteeIds) {
          const p = leaderPos.get(menteeId);
          if (p) links.push({ x1: mx, y1: my, x2: p.x, y2: p.y, mentor: true });
        }
      });
    }

    return { size: canvasR * 2, center: { cx, cy }, nodes, links };
  }, [hierarchy, showMentors]);

  return (
    <div className="relative overflow-hidden rounded-hero border border-line bg-[#f4efe7]">
      {/* Zoom controls — the diagram fits by default, zoom in to read names. */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full border border-line bg-cream/90 px-1 py-1 backdrop-blur">
        <button
          onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))}
          className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-ink-soft hover:bg-sand"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          onClick={() => setZoom(1)}
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

      <div className="flex h-[78vh] items-start justify-center overflow-auto">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ height: `${zoom * 100}%`, width: 'auto', aspectRatio: '1 / 1' }}
          className="block shrink-0"
        >
        {/* spokes */}
        {links.map((l, i) => (
          <line
            key={i}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke={l.mentor ? OLIVE : l.mentor === undefined && Math.hypot(l.x2 - center.cx, l.y2 - center.cy) < size / 2 ? SPOKE : LEAF}
            strokeWidth={l.mentor ? 1.5 : 1.4}
            strokeDasharray={l.mentor ? '4 4' : undefined}
            opacity={0.65}
          />
        ))}

        {/* satellite + mentor nodes */}
        {nodes
          .filter((n) => !n.leader)
          .map((n, i) => (
            <NodeG key={`s${i}`} n={n} onClick={() => router.push(n.href)} />
          ))}

        {/* leader nodes on top */}
        {nodes
          .filter((n) => n.leader)
          .map((n, i) => (
            <NodeG key={`l${i}`} n={n} onClick={() => router.push(n.href)} />
          ))}

        {/* center anchor */}
        <circle cx={center.cx} cy={center.cy} r={108} fill="#0f1218" />
        <g transform={`translate(${center.cx - 68} ${center.cy - 68}) scale(0.266)`} fill="#f9f5f1">
          <path d="M256 40c-31 0-56 25-56 56 0 25 16 46 38 53v31h-44v44h44v150c-60-10-107-58-113-120h35l-60-80-60 80h39c7 100 90 179 191 179s184-79 191-179h39l-60-80-60 80h35c-6 62-53 110-113 120V224h44v-44h-44v-31c22-7 38-28 38-53 0-31-25-56-56-56zm0 44c7 0 13 6 13 13s-6 13-13 13-13-6-13-13 6-13 13-13z" />
          </g>
        </svg>
      </div>
    </div>
  );
}

function NodeG({ n, onClick }: { n: RNode; onClick: () => void }) {
  const fill = n.mentor ? OLIVE : n.leader ? INK : GREY;
  const textColor = n.leader || n.mentor ? '#f4efe7' : GREY_INK;
  const lh = 12.5;
  const startY = -((n.lines.length - 1) / 2) * lh;
  return (
    <g transform={`translate(${n.x} ${n.y})`} onClick={onClick} style={{ cursor: 'pointer' }}>
      <circle r={n.r} fill={fill} />
      <text
        textAnchor="middle"
        fontSize={n.leader ? 12.5 : 11.5}
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
