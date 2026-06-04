import type { VercelRequest, VercelResponse } from '@vercel/node';

const RENDER_API = 'https://projectgg-api-ch95.onrender.com/api';

export default async function handler(
  _req: VercelRequest,
  res: VercelResponse,
) {
  const start = Date.now();

  try {
    const response = await fetch(RENDER_API, {
      signal: AbortSignal.timeout(25000),
    });

    const elapsed = Date.now() - start;

    res.status(200).json({
      ok: true,
      upstream: response.status,
      ms: elapsed,
      message: `Render backend responded in ${elapsed}ms (HTTP ${response.status})`,
    });
  } catch (err) {
    const elapsed = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('timeout') || message.includes('aborted')) {
      res.status(200).json({
        ok: true,
        upstream: null,
        ms: elapsed,
        message: `Render backend is warming up (timed out after ${elapsed}ms)`,
      });
    } else {
      res.status(200).json({
        ok: false,
        upstream: null,
        ms: elapsed,
        message,
      });
    }
  }
}
