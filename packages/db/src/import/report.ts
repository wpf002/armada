/**
 * Import report (§ Phase 2 gate): created / matched / needs-review / conflicts.
 * Written to disk and summarized to the console. The needs-review + conflicts
 * lists are the "review list" the roadmap requires the gate to produce.
 */
import { writeFileSync } from 'node:fs';

export interface ReviewItem {
  kind:
    | 'fuzzy-duplicate'
    | 'parked-collision'
    | 'orphaned-mentee'
    | 'placeholder'
    | 'self-referential'
    | 'duplicate-membership'
    | 'three-part-name'
    | 'unresolved-mentor';
  detail: string;
  names?: string[];
  score?: number;
}

export class ImportReport {
  createdPeople: string[] = [];
  matchedPeople: Array<{ name: string; matchedTo: string; reason: string }> = [];
  needsReview: ReviewItem[] = [];
  conflicts: ReviewItem[] = [];
  counts: Record<string, number> = {};

  created(name: string) {
    this.createdPeople.push(name);
  }
  matched(name: string, matchedTo: string, reason: string) {
    this.matchedPeople.push({ name, matchedTo, reason });
  }
  review(item: ReviewItem) {
    this.needsReview.push(item);
  }
  conflict(item: ReviewItem) {
    this.conflicts.push(item);
  }
  count(key: string, n = 1) {
    this.counts[key] = (this.counts[key] ?? 0) + n;
  }

  write(path: string) {
    const payload = {
      generatedAt: new Date().toISOString(),
      counts: this.counts,
      summary: {
        created: this.createdPeople.length,
        matched: this.matchedPeople.length,
        needsReview: this.needsReview.length,
        conflicts: this.conflicts.length,
      },
      createdPeople: this.createdPeople.sort(),
      matchedPeople: this.matchedPeople,
      needsReview: this.needsReview,
      conflicts: this.conflicts,
    };
    writeFileSync(path, JSON.stringify(payload, null, 2));
  }

  printSummary() {
    console.log('\n===== Armada import report =====');
    console.log('Counts:', this.counts);
    console.log(
      `People: ${this.createdPeople.length} created, ${this.matchedPeople.length} matched to existing`,
    );
    console.log(`Needs review: ${this.needsReview.length}`);
    for (const r of this.needsReview) {
      console.log(`  · [${r.kind}] ${r.detail}${r.score ? ` (score ${r.score.toFixed(2)})` : ''}`);
    }
    console.log(`Conflicts: ${this.conflicts.length}`);
    for (const c of this.conflicts) {
      console.log(`  ! [${c.kind}] ${c.detail}`);
    }
    console.log('================================\n');
  }
}
