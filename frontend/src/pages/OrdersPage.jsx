import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, Button, Card, Modal } from '../ui.jsx';

const idr = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;
const dt = (v) => (v ? new Date(v).toLocaleString('id-ID') : '—');

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [state, setState] = useState({ loading: true, error: '' });

  const load = async () => {
    setState({ loading: true, error: '' });
    try {
      setOrders(await api('/api/orders'));
      setState({ loading: false, error: '' });
    } catch (e) { setState({ loading: false, error: e.message }); }
  };
  useEffect(() => { load(); }, []);

  async function view(id) {
    try { setSelected(await api(`/api/orders/${id}`)); }
    catch (e) { setState((s) => ({ ...s, error: e.message })); }
  }

  async function returnDevice() {
    try {
      await api(`/api/orders/${selected.id}/return`, { method: 'POST' });
      setSelected(null); load();
    } catch (e) { setState((s) => ({ ...s, error: e.message })); }
  }

  if (state.loading) return <p>Loading orders…</p>;

  return (
    <div className="space-y-4">
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {!orders.length && <p className="text-sm text-slate-500">No orders yet.</p>}
      <div className="grid gap-2">
        {orders.map((o) => (
          <Card key={o.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium">{o.orderNumber} <Badge status={o.status} /></p>
              <p className="text-sm text-slate-500">{o.customer?.name} · {o.device?.serialNumber} · {idr(o.amount)}</p>
              <p className="text-xs text-slate-400">created {dt(o.createdAt)} · rented {dt(o.rentedAt)} · due {dt(o.dueAt)} · returned {dt(o.returnedAt)}</p>
            </div>
            <Button variant="outline" onClick={() => view(o.id)}>Details</Button>
          </Card>
        ))}
      </div>
      {selected && (
        <Modal onClose={() => setSelected(null)}>
          <h3 className="font-semibold">{selected.orderNumber} <Badge status={selected.status} /></h3>
          <p className="text-sm">Customer: {selected.customer?.name} ({selected.customer?.email}{selected.customer?.phone ? ` · ${selected.customer.phone}` : ''})</p>
          <p className="text-sm">Device: {selected.device?.serialNumber} · {idr(selected.amount)} · {selected.rentalDurationDays} days</p>
          <div className="text-sm text-slate-600">
            <p>Created: {dt(selected.createdAt)}</p>
            <p>Rented: {dt(selected.rentedAt)}</p>
            <p>Due: {dt(selected.dueAt)}</p>
            <p>Returned: {dt(selected.returnedAt)}</p>
          </div>
          {selected.status === 'RENTED' && <Button className="mt-2" onClick={returnDevice}>Mark returned</Button>}
        </Modal>
      )}
    </div>
  );
}
