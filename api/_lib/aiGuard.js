import { verifyIdToken } from './verifyAuth.js';
import { isRateLimited } from './rateLimit.js';

/**
 * Shared gate for every endpoint that spends money on the Anthropic API:
 * a verified Firebase sign-in and a short-window per-account rate limit (no
 * daily cap). Sends the error response itself and returns null when the
 * request should stop; otherwise returns the account.
 */
export async function guardAiRequest(req, res, { key, limit, windowMs, account: known }) {
  const account = known || (await verifyIdToken(req));
  if (!account) {
    res.status(401).json({ code: 'sign-in-required', error: 'Sign in to use the AI features.' });
    return null;
  }
  if (isRateLimited(req, key, { limit, windowMs, id: account.uid })) {
    res.status(429).json({ error: 'Too many requests in a row — take a short break and try again.' });
    return null;
  }
  return account;
}
