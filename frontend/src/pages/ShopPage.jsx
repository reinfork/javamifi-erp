import { useEffect, useState } from 'react';
import { api, loadSnap } from '../api.js';
import { Badge, Button, Card, Input } from '../ui.jsx';

const idr = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;

export default function ShopPage({ onOperator }) {
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ loading: true, error: '', msg: '' });

  const load = async () => {
    try {
      setDevices(await api('/api/shop/devices'));
      setState((s) => ({ ...s, loading: false, error: '' }));
    } catch (e) { setState((s) => ({ ...s, loading: false, error: e.message })); }
  };
  useEffect(() => { load(); }, []);

  const selected = devices.find((d) => d.id === deviceId) || null;

  async function checkout(e) {
    e.preventDefault();
    setState((s) => ({ ...s, error: '', msg: '' }));
    try {
      const data = await api('/api/shop/checkout', { method: 'POST', body: { email, name, deviceId } });
      // reopened payment may belong to a different device than the one just clicked
      if (data.reused && data.order?.deviceId) setDeviceId(data.order.deviceId);
      const ok = await loadSnap(import.meta.env.VITE_MIDTRANS_CLIENT_KEY);
      if (ok && window.snap) {
        window.snap.pay(data.snapToken, {
          onSuccess: () => { setState((s) => ({ ...s, msg: 'Payment received, confirming…' })); load(); },
          onPending: () => { setState((s) => ({ ...s, msg: 'Payment pending, finish it in the Snap window.' })); load(); },
          onError: () => setState((s) => ({ ...s, error: 'Payment failed.' })),
          onClose: load,
        });
      } else {
        setState((s) => ({ ...s, msg: `Order ${data.order.orderNumber} ${data.reused ? 'reopened' : 'created'}. Open Snap to pay.` }));
      }
      load();
    } catch (e2) { setState((s) => ({ ...s, error: e2.message })); }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b bg-white px-4 py-3">
        <strong>JavaMifi Rental</strong>
        <Button variant="outline" onClick={onOperator}>Operator / Admin</Button>
      </header>
      <main className="mx-auto grid max-w-5xl gap-4 p-4 lg:grid-cols-[1fr_320px]">
        <section className="space-y-2">
          {state.loading && <p>Loading devices…</p>}
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          {!state.loading && !devices.length && <p className="text-sm text-slate-500">No devices available right now.</p>}
          {devices.map((d) => (
            <Card key={d.id} className={`flex items-center justify-between${d.id === deviceId ? ' ring-2 ring-slate-900' : ''}`}>
              <div>
                <p className="font-medium">{d.serialNumber} <Badge status={d.status} /></p>
                <p className="text-sm text-slate-500">{d.modelName} · {idr(d.price)} · {d.rentalDurationDays} days</p>
              </div>
              <Button disabled={d.status !== 'AVAILABLE'} onClick={() => setDeviceId(d.id)}>
                {d.id === deviceId ? 'Selected' : 'Rent'}
              </Button>
            </Card>
          ))}
        </section>
        <aside>
          <Card>
            <h2 className="mb-2 font-semibold">Payment summary</h2>
            {state.msg && <p className="mb-2 text-sm text-green-700">{state.msg}</p>}
            <form onSubmit={checkout} className="space-y-2">
              <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
              <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              {selected ? (
                <div className="text-sm text-slate-600">
                  <p>{selected.modelName} ({selected.serialNumber})</p>
                  <p>Price: {idr(selected.price)} · {selected.rentalDurationDays} days</p>
                  <p className="font-medium text-slate-900">Total: {idr(selected.price)}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Choose a device to see the total.</p>
              )}
              <Button className="w-full" disabled={!selected}>Pay / Checkout</Button>
            </form>
          </Card>
        </aside>
      </main>
    </div>
  );
}
