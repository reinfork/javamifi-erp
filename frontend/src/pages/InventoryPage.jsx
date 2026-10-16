import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, Button, Card, Input, Modal } from '../ui.jsx';

const idr = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;
const blank = { serialNumber: '', modelName: '', price: '' };

export default function InventoryPage() {
  const [devices, setDevices] = useState([]);
  const [form, setForm] = useState(blank);
  const [edit, setEdit] = useState(null);
  const [state, setState] = useState({ loading: true, error: '', msg: '' });

  const load = async () => {
    try {
      setDevices(await api('/api/devices'));
      setState((s) => ({ ...s, loading: false, error: '' }));
    } catch (e) { setState((s) => ({ ...s, loading: false, error: e.message })); }
  };
  useEffect(() => { load(); }, []);

  const body = (f) => ({ serialNumber: f.serialNumber, modelName: f.modelName, price: Number(f.price) });

  async function add(e) {
    e.preventDefault();
    setState((s) => ({ ...s, error: '', msg: '' }));
    try {
      await api('/api/devices', { method: 'POST', body: body(form) });
      setForm(blank); setState((s) => ({ ...s, msg: 'Device added' })); load();
    } catch (e2) { setState((s) => ({ ...s, error: e2.message })); }
  }

  async function save() {
    setState((s) => ({ ...s, error: '', msg: '' }));
    try {
      await api(`/api/devices/${edit.id}`, { method: 'PATCH', body: body(edit) });
      setEdit(null); setState((s) => ({ ...s, msg: 'Device updated' })); load();
    } catch (e) { setState((s) => ({ ...s, error: e.message })); }
  }

  async function remove(d) {
    if (!window.confirm(`Delete ${d.serialNumber}?`)) return;
    setState((s) => ({ ...s, error: '', msg: '' }));
    try {
      await api(`/api/devices/${d.id}`, { method: 'DELETE' });
      setState((s) => ({ ...s, msg: 'Device deleted' })); load();
    } catch (e) { setState((s) => ({ ...s, error: e.message })); }
  }

  if (state.loading) return <p>Loading devices…</p>;

  return (
    <div className="space-y-4">
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.msg && <p className="text-sm text-green-700">{state.msg}</p>}
      <Card>
        <h2 className="mb-2 font-semibold">Add device</h2>
        <form onSubmit={add} className="flex flex-wrap gap-2">
          <Input placeholder="Code (JM-WIFI-006)" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} className="max-w-xs" />
          <Input placeholder="Name" value={form.modelName} onChange={(e) => setForm({ ...form, modelName: e.target.value })} className="max-w-xs" />
          <Input placeholder="Price" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="max-w-[8rem]" />
          <Button>Add</Button>
        </form>
      </Card>
      {!devices.length && <p className="text-sm text-slate-500">No devices.</p>}
      <div className="grid gap-2">
        {devices.map((d) => (
          <Card key={d.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium">{d.serialNumber} <Badge status={d.status} /></p>
              <p className="text-sm text-slate-500">{d.modelName} · {idr(d.price)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEdit({ id: d.id, serialNumber: d.serialNumber, modelName: d.modelName, price: d.price })}>Edit</Button>
              <Button variant="outline" onClick={() => remove(d)}>Delete</Button>
            </div>
          </Card>
        ))}
      </div>
      {edit && (
        <Modal onClose={() => setEdit(null)}>
          <h2 className="mb-2 font-semibold">Edit device</h2>
          <div className="flex flex-wrap gap-2">
            <Input value={edit.serialNumber} onChange={(e) => setEdit({ ...edit, serialNumber: e.target.value })} className="max-w-[10rem]" />
            <Input value={edit.modelName} onChange={(e) => setEdit({ ...edit, modelName: e.target.value })} className="max-w-[12rem]" />
            <Input type="number" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} className="max-w-[8rem]" />
            <Button onClick={save}>Save</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
