'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { colors } from '@armada/ui/tokens';
import type { Hierarchy } from '@/lib/api';

type NodeType = 'anchor' | 'group' | 'disciple' | 'mentor';

interface Node extends SimulationNodeDatum {
  id: string;
  type: NodeType;
  label: string;
  href?: string;
  openCapacity?: boolean;
}
type Link = SimulationLinkDatum<Node>;

const R: Record<NodeType, number> = { anchor: 34, group: 20, disciple: 11, mentor: 16 };
const FILL: Record<NodeType, string> = {
  anchor: colors.deep,
  group: colors.inkSoft,
  disciple: colors.slate,
  mentor: colors.olive,
};

export function HierarchyGraph({
  hierarchy,
  showMentors,
  height = 560,
}: {
  hierarchy: Hierarchy;
  showMentors: boolean;
  height?: number;
}) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);
  const [, force] = useState(0);

  useEffect(() => {
    const measure = () => setWidth(wrapRef.current?.clientWidth ?? 700);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const { nodes, links } = useMemo(() => {
    const nodes: Node[] = [{ id: 'anchor', type: 'anchor', label: 'Armada' }];
    const links: Link[] = [];
    const leaderGroupOf = new Map<string, string>(); // personId(leader) -> group node id

    for (const g of hierarchy.groups) {
      const gid = `g:${g.id}`;
      nodes.push({
        id: gid,
        type: 'group',
        label: g.displayName,
        href: `/groups/${g.id}`,
        openCapacity: g.openCapacity,
      });
      links.push({ source: 'anchor', target: gid });
      for (const l of g.leaders) leaderGroupOf.set(l.personId, gid);
      for (const d of g.disciples) {
        const did = `d:${d.personId}:${g.id}`;
        nodes.push({ id: did, type: 'disciple', label: d.name, href: `/people/${d.personId}` });
        links.push({ source: gid, target: did });
      }
    }

    if (showMentors) {
      for (const m of hierarchy.mentors) {
        const mid = `m:${m.personId}`;
        nodes.push({ id: mid, type: 'mentor', label: m.name, href: `/people/${m.personId}` });
        const targets = m.menteeIds.map((id) => leaderGroupOf.get(id)).filter(Boolean) as string[];
        if (targets.length === 0) links.push({ source: mid, target: 'anchor' });
        for (const t of new Set(targets)) links.push({ source: mid, target: t });
      }
    }
    return { nodes, links };
  }, [hierarchy, showMentors]);

  // Run the simulation to rest, pinning the anchor at center.
  useEffect(() => {
    const cx = width / 2;
    const cy = height / 2;
    const anchor = nodes.find((n) => n.id === 'anchor')!;
    anchor.fx = cx;
    anchor.fy = cy;

    const sim = forceSimulation(nodes)
      .force(
        'link',
        forceLink<Node, Link>(links)
          .id((d) => d.id)
          .distance((l) => {
            const t = (l.target as Node).type;
            if (t === 'disciple') return 46;
            if (t === 'mentor' || (l.source as Node).type === 'mentor') return 150;
            return 150;
          })
          .strength(0.6),
      )
      .force('charge', forceManyBody().strength(-160))
      .force('x', forceX(cx).strength(0.05))
      .force('y', forceY(cy).strength(0.05))
      .force('collide', forceCollide<Node>((d) => R[d.type] + 6))
      .stop();

    for (let i = 0; i < 320; i++) sim.tick();
    force((n) => n + 1); // commit positions
    return () => {
      sim.stop();
    };
  }, [nodes, links, width, height]);

  return (
    <div ref={wrapRef} className="w-full">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="touch-none">
        {links.map((l, i) => {
          const s = l.source as Node;
          const t = l.target as Node;
          const isMentor = s.type === 'mentor' || t.type === 'mentor';
          return (
            <line
              key={i}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke={isMentor ? colors.olive : colors.grey300}
              strokeWidth={isMentor ? 1 : 1.25}
              strokeDasharray={isMentor ? '3 3' : undefined}
              opacity={0.7}
            />
          );
        })}
        {nodes.map((n) => (
          <g
            key={n.id}
            transform={`translate(${n.x ?? 0},${n.y ?? 0})`}
            onClick={() => n.href && router.push(n.href)}
            style={{ cursor: n.href ? 'pointer' : 'default' }}
          >
            {n.openCapacity && (
              <circle r={R[n.type] + 5} fill="none" stroke={colors.olive} strokeWidth={2} strokeDasharray="4 3" />
            )}
            <circle r={R[n.type]} fill={FILL[n.type]} />
            {n.type === 'anchor' && (
              <text textAnchor="middle" dy="6" fontSize="22" fill={colors.cream}>
                ⚓
              </text>
            )}
            {(n.type === 'group' || n.type === 'mentor') && (
              <text
                textAnchor="middle"
                y={R[n.type] + 12}
                fontSize="10"
                fill={colors.slateDark}
                style={{ pointerEvents: 'none' }}
              >
                {n.label.length > 24 ? n.label.slice(0, 22) + '…' : n.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
