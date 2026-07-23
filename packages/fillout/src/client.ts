/**
 * Minimal Fillout API client. Auth via `Authorization: Bearer <FILLOUT_API_KEY>`.
 * Base: https://api.fillout.com/v1/api  (§7)
 *
 * PHASE 0: typed surface only. Phase 5 wires the webhook receiver, backfill, and
 * nightly reconcile in apps/worker against these methods.
 */

// Verified against https://fillout.com/help/openapi.json (US region; the EU
// base URL is https://eu-api.fillout.com/v1/api). Auth: `Bearer <api key>`.
const BASE_URL = 'https://api.fillout.com/v1/api';

export interface FilloutClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface FilloutSubmission {
  submissionId: string;
  submissionTime: string;
  questions: Array<{ id: string; name: string; value: unknown }>;
}

export class FilloutClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: FilloutClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** Fillout allows 5 requests/second per API key, so space calls out and back
   *  off on 429 rather than hammering and losing whole forms. */
  private lastRequestAt = 0;
  private static readonly MIN_GAP_MS = 250;

  private async throttle(): Promise<void> {
    const wait = this.lastRequestAt + FilloutClient.MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
  }

  private async get<T>(path: string, attempt = 0): Promise<T> {
    await this.throttle();
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (res.status === 429 && attempt < 4) {
      const backoff = 600 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, backoff));
      return this.get<T>(path, attempt + 1);
    }

    if (!res.ok) {
      let detail = '';
      try {
        const body = (await res.json()) as { message?: string };
        if (body?.message) detail = `: ${body.message}`;
      } catch {
        /* non-JSON error body */
      }
      throw new Error(`Fillout ${path} -> ${res.status} ${res.statusText}${detail}`);
    }
    return (await res.json()) as T;
  }

  listForms<T = unknown>(): Promise<T> {
    return this.get<T>('/forms');
  }

  /** Form metadata (name + questions). Verified against Fillout's OpenAPI spec:
   *  the path is `/forms/{formId}` — `/forms/{formId}/metadata` returns 404. */
  getFormMetadata<T = unknown>(formId: string): Promise<T> {
    return this.get<T>(`/forms/${formId}`);
  }

  /** `limit` is capped at 150 by the API; default 50. */
  getSubmissions(
    formId: string,
    params?: { limit?: number; afterDate?: string; offset?: number },
  ): Promise<{ responses: FilloutSubmission[]; totalResponses: number; pageCount: number }> {
    const q = new URLSearchParams();
    if (params?.limit) q.set('limit', String(Math.min(params.limit, 150)));
    if (params?.afterDate) q.set('afterDate', params.afterDate);
    if (params?.offset) q.set('offset', String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return this.get(`/forms/${formId}/submissions${suffix}`);
  }
}
