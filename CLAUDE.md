# CLAUDE.md — Armada

Discipleship relationship management for **Armada Discipleship** (Dallas, TX).
Armada is not a directory and not a CRM. It is a **relationship graph with time**.
Every real question the org needs answered is a graph traversal.

## Locked invariants — NOT up for renegotiation mid-build

1. **One `Person` per human.** Roles are edges. No `Leader`/`Disciple`/`Mentor` tables.
2. **No hard deletes.** Membership and mentorship end by setting `endedAt` / `leftAt`, never by
   deleting the row. History is the product.
3. **A person may hold multiple simultaneous roles.** Never validate against
   leader-and-disciple, mentor-and-leader, etc.
4. **Fillout submissions are immutable.** Store raw JSON verbatim. `Person` records are
   *derived*. A re-sync never overwrites a hand-edited person field.
5. **Identity resolution is always human-confirmed.** Fuzzy matching proposes; an admin
   decides. No silent auto-merge above any confidence threshold.
6. **Prayer requests default to private.** Visible to the person, their group leader, that
   leader's mentor, and admins. Never in the public directory, never in a list view, never
   in an export.
7. **Every write goes through an audit log** with actor, entity, before/after.
8. **A group is identified by its leaders.** UUID PKs; display name derived from active
   leader memberships, computed in exactly one place (`packages/shared`).
9. **Co-leadership is the default assumption.** Every leader lookup returns an array. Never
   write code that assumes one leader per group.
10. **A leader with zero disciples is valid and must stay visible** in every list, count,
    and graph. It is the single most actionable signal the app produces.
11. **There is no Pod concept.** Do not add one, do not import the stale column, do not leave
    a nullable field "just in case."
12. **Mobile-first.** Every screen designed at 375px, then widened. Not the reverse.

## Permission model

Scope is a single function: `visibleFieldsFor(viewer, subject) -> Set<field>`, called by every
serializer. **Never enforce visibility in the UI layer.** "Mentor" is not a stored role — it is
derived from having an active `MentorRelationship`.

## Stack

- Monorepo: pnpm + Turborepo
- Web: Next.js (App Router), Tailwind, mobile-first, installable PWA
- API: Fastify, Zod at every boundary
- DB: Postgres + Prisma
- Auth: Better Auth (email/password, reset, sessions)
- Host: Railway
- Jobs: node-cron in `apps/worker` for the nightly Fillout reconcile

## Layout

```
apps/web        Next.js web app + PWA
apps/api        Fastify API (Zod at every boundary)
apps/worker     node-cron worker (Fillout reconcile)
packages/db     Prisma schema + client + seed
packages/shared Zod schemas, shared types, permission function
packages/ui     Design tokens + primitives (match armadadiscipleship.org)
packages/fillout Fillout API client + versioned field map
```

## Out of scope for v1

Messaging/chat. Attendance. Curriculum. Giving (Donorbox handles it). Native apps.
Multi-org tenancy. AI anything. Do not build these before the graph is correct and populated.
