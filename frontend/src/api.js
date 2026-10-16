const base = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export const token = {
  get: () => sessionStorage.getItem('jm_token') || '',
  set: (t) => (t ? sessionStorage.setItem('jm_token', t) : sessionStorage.removeItem('jm_token')),
};

export async function api(path, opts = {}) {
  const res = await fetch(base + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token.get() ? { Authorization: `Bearer ${token.get()}` } : {}), ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ponytail: dynamic Snap.js load, one instance; ceiling = no offline fallback, fine for sandbox demo
let snapLoaded = false;
export function loadSnap(clientKey) {
  if (!clientKey || snapLoaded) return Promise.resolve(!!window.snap);
  snapLoaded = true;
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://app.sandbox.midtrans.com/snap/snap.js';
    s.setAttribute('data-client-key', clientKey);
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}
