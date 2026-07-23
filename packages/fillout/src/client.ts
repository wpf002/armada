/**
 * Minimal Fillout API client. Auth via `Authorization: Bearer <FILLOUT_API_KEY>`.
 * Base: https://api.fillout.com/v1/api  (§7)
 *
 * PHASE 0: typed surface only. Phase 5 wires the webhook receiver, backfill, and
 * nightly reconcile in apps/worker against these methods.
 */

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

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      throw new Error(`Fillout ${path} -> ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  listForms<T = unknown>(): Promise<T> {
    return this.get<T>('/forms');
  }

  getFormMetadata<T = unknown>(formId: string): Promise<T> {
    return this.get<T>(`/forms/${formId}/metadata`);
  }

  getSubmissions(
    formId: string,
    params?: { limit?: number; afterDate?: string; offset?: number },
  ): Promise<{ responses: FilloutSubmission[]; totalResponses: number; pageCount: number }> {
    const q = new URLSearchParams();
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.afterDate) q.set('afterDate', params.afterDate);
    if (params?.offset) q.set('offset', String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return this.get(`/forms/${formId}/submissions${suffix}`);
  }
}
