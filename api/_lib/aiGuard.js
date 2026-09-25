import { verifyIdToken } from './verifyAuth.js';
import { isRateLimited } from './rateLimit.js';
import { addDailyUsage } from './dailyUsage.js';

/**
 * Shared gate for every endpoint that spends money on the Anthropic API:
 * a verified Firebase sign-in, a short-window per-account rate limit, and a
 * per-account daily cap (dailyUsage.js). Sends the error response itself and
 * returns null when the request should stop; otherwise returns the account.
 */
export async function guardAiRequest(req, res, { key, units, limit, windowMs, account: known }) {
  const account = known || (await verifyIdToken(req));
  if (!account) {
    res.status(401).json({ code: 'sign-in-required', error: 'Sign in to use the AI features.' });
    return null;
  }
  if (isRateLimited(req, key, { limit, windowMs, id: account.uid })) {
    res.status(429).json({ error: 'Too many requests in a row — take a short break and try again.' });
    return null;
  }
  const usage = await addDailyUsage(account, units);
  if (usage.unavailable) {
    res.status(503).json({ error: 'AI is temporarily unavailable. Please try again later.' });
    return null;
  }
  if (!usage.ok) {
    res.status(429).json({ code: 'daily-limit', error: "You've reached today's AI limit. It resets at midnight UTC." });
    return null;
  }
  return account;
}
