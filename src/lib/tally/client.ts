const DEFAULT_TALLY_URL = 'http://localhost:9000';
const DEFAULT_TIMEOUT_MS = 30000;

export class TallyConnectionError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'TallyConnectionError';
  }
}

export async function queryTally(xmlBody: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  const url = process.env.TALLY_URL || DEFAULT_TALLY_URL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: xmlBody,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new TallyConnectionError(`Tally gateway responded with HTTP ${res.status}`);
    }

    return await res.text();
  } catch (err: unknown) {
    if (err instanceof TallyConnectionError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new TallyConnectionError(`Tally gateway at ${url} did not respond within ${timeoutMs}ms`, err);
    }
    throw new TallyConnectionError(
      `Could not reach Tally gateway at ${url}. Is Tally running with the ODBC/XML server enabled?`,
      err
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function getTallyCompany(): string {
  const company = process.env.TALLY_COMPANY;
  if (!company) {
    throw new TallyConnectionError('TALLY_COMPANY environment variable is not set.');
  }
  return company;
}
