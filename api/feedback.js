// Relay between the public feedback page and the Google Sheet behind it.
//
// The Apps Script web app is deployed with "Who has access: Anyone", so its
// /exec URL is the only thing protecting the sheet from anyone who feels like
// filling it with rubbish. Putting that URL in the page would publish it to
// every visitor, so it stays here, in a Vercel environment variable, and the
// page only ever talks to its own origin.
//
// Set FEEDBACK_WEBHOOK_URL in the Vercel project settings to the same /exec URL
// the product already uses. Nothing else is configured.
//
// GET  -> the sheet's rows, newest first
// POST -> a new submission, or a reply / status change on an existing row
//
// The Apps Script contract is documented in the product repository at
// docs/runbooks/Feedback_Webhook_and_Responses.md.

const TIMEOUT_MS = 12000;
const MAX_BODY = 8000; // one comment, generously. Anything larger is not feedback.

/** Apps Script answers 302 to its own googleusercontent host; fetch follows it. */
async function callSheet(url, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...init, redirect: 'follow', signal: ctrl.signal });
    const text = await r.text();
    try {
      return { ok: r.ok, status: r.status, data: JSON.parse(text) };
    } catch {
      // Apps Script returns an HTML error page when the deployment is wrong.
      return { ok: false, status: r.status, data: { ok: false, error: 'the sheet did not answer with data' } };
    }
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  const target = process.env.FEEDBACK_WEBHOOK_URL;

  res.setHeader('Cache-Control', 'no-store');

  if (!target) {
    res.status(503).json({
      ok: false,
      error: 'This site has no feedback store configured yet. Set FEEDBACK_WEBHOOK_URL in the Vercel project settings.',
    });
    return;
  }

  if (req.method === 'GET') {
    try {
      const r = await callSheet(target, { method: 'GET' });
      res.status(r.ok ? 200 : 502).json(r.data);
    } catch {
      res.status(504).json({ ok: false, error: 'the sheet did not answer in time' });
    }
    return;
  }

  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = body.action === 'reply' ? 'reply' : 'submit';

    // Take only the fields the sheet has columns for, so a malformed or hostile
    // body cannot reach the Apps Script with anything it was not written for.
    let payload;
    if (action === 'reply') {
      if (!body.id) { res.status(400).json({ ok: false, error: 'which item is this a reply to?' }); return; }
      payload = {
        action: 'reply',
        id: String(body.id).slice(0, 80),
        text: String(body.text || '').slice(0, MAX_BODY),
        by: String(body.by || 'anonymous').slice(0, 80),
        at: new Date().toISOString(),
      };
      if (body.status) payload.status = String(body.status).slice(0, 40);
      if (!payload.text && !payload.status) {
        res.status(400).json({ ok: false, error: 'nothing to say and no status to change' });
        return;
      }
    } else {
      const comment = String(body.comment || '').trim().slice(0, MAX_BODY);
      if (!comment) { res.status(400).json({ ok: false, error: 'write something first' }); return; }
      payload = {
        screen: String(body.screen || '').slice(0, 80),
        type: String(body.type || '').slice(0, 40),
        priority: String(body.priority || '').slice(0, 40),
        comment,
        name: String(body.name || '').slice(0, 80),
        email: String(body.email || '').slice(0, 120),
        role: String(body.role || '').slice(0, 80),
      };
    }

    try {
      const r = await callSheet(target, {
        method: 'POST',
        // text/plain keeps this a simple request; Apps Script reads the raw body.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
      res.status(r.ok ? 200 : 502).json(r.data);
    } catch {
      res.status(504).json({ ok: false, error: 'the sheet did not answer in time' });
    }
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ ok: false, error: 'method not allowed' });
}
