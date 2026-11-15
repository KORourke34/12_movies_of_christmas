// api.js – tiny helper for talking to the server. Usage: await api('/doors')
async function api(path, opts = {}) {
  const r = await fetch('/api' + path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'Something went wrong'), { status: r.status });
  return d;
}
