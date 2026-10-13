// Minimal CrawlerData API client for Node 18+: live requests, async jobs, retries. No packages.
// Docs: https://app.crawlerdata.com/docs
const API_URL = 'https://api.crawlerdata.com/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HINTS = {
  401: 'Invalid or missing API key. Check CRAWLERDATA_API_KEY.',
  402: 'Out of credits. Top up at https://app.crawlerdata.com.',
};

export class CrawlerDataError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export class CrawlerData {
  constructor({ apiKey = process.env.CRAWLERDATA_API_KEY, timeoutMs = 200_000, maxRetries = 4, failedJobRetries = 2 } = {}) {
    if (!apiKey) {
      throw new CrawlerDataError(
        'Set the CRAWLERDATA_API_KEY environment variable. Get a key (free trial credits for company emails) at https://app.crawlerdata.com/register',
      );
    }
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.failedJobRetries = failedJobRetries;
    this.creditsUsed = 0;
    this.lastJob = null;
  }

  async request(method, path, body) {
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(API_URL + path, {
          method,
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        if (attempt >= this.maxRetries) throw err;
        await sleep(2 ** attempt * 1000 + Math.random() * 1000);
        continue;
      }
      // 429 = rate limited (100/min, 20/s per key), 5xx = temporary. Wait and retry.
      if ((res.status === 429 || res.status >= 500) && attempt < this.maxRetries) {
        const reset = Number(res.headers.get('x-ratelimit-reset'));
        const waitS = reset ? Math.max(1, reset - Math.floor(Date.now() / 1000)) : 2 ** attempt;
        await sleep(Math.min(waitS, 60) * 1000 + Math.random() * 1000);
        continue;
      }
      // 400 bad params, 401 bad key, 402 out of credits: retrying will not help.
      if (!res.ok) {
        const text = (await res.text()).slice(0, 300);
        throw new CrawlerDataError(`HTTP ${res.status}: ${text} ${HINTS[res.status] ?? ''}`.trim(), res.status);
      }
      return res.json();
    }
  }

  /** Submit a job. On the live queue the response holds the result. */
  run(endpoint, params, { queue = 'live', postbackUrl } = {}) {
    return this.request('POST', '/jobs', { endpoint, params, queue, ...(postbackUrl && { postbackUrl }) });
  }

  /** Run a live request and return the result. Failed jobs cost 0 credits, so they are retried. */
  async live(endpoint, params) {
    let job;
    for (let attempt = 0; attempt <= this.failedJobRetries; attempt++) {
      const data = await this.run(endpoint, params);
      job = data.job;
      if (job.status === 'completed') {
        this.lastJob = job;
        this.creditsUsed += job.credits ?? 0;
        return data.result;
      }
      if (attempt < this.failedJobRetries) await sleep(5000 * (attempt + 1));
    }
    throw new CrawlerDataError(`job ${job.id} failed: ${job.error}`);
  }

  /** Queue a job on fast or regular and return its id. */
  async submit(endpoint, params, { queue = 'fast', postbackUrl } = {}) {
    const { job } = await this.run(endpoint, params, { queue, postbackUrl });
    return job.id;
  }

  /** Poll a job until it completes or fails. */
  async wait(id, { intervalMs = 5000, maxWaitMs = 600_000 } = {}) {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      const { job, result } = await this.request('GET', `/jobs/${id}`);
      if (job.status === 'completed') {
        this.creditsUsed += job.credits ?? 0;
        return result;
      }
      if (job.status === 'failed') throw new CrawlerDataError(`job ${id} failed: ${job.error}`);
      await sleep(intervalMs);
    }
    throw new Error(`job ${id} still running after ${maxWaitMs / 1000}s`);
  }
}
