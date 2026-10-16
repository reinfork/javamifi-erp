import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, Card } from '../ui.jsx';

const idr = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;

export default function FinancePage() {
  const [payments, setPayments] = useState([]);
  const [state, setState] = useState({ loading: true, error: '' });
  useEffect(() => {
    api('/api/payments')
      .then((p) => { setPayments(p); setState({ loading: false, error: '' }); })
      .catch((e) => setState({ loading: false, error: e.message }));
  }, []);
  if (state.loading) return <p>Loading payments…</p>;
  if (state.error) return <p className="text-sm text-red-600">{state.error}</p>;
  if (!payments.length) return <p className="text-sm text-slate-500">No payments yet.</p>;
  return (
    <div className="grid gap-2">
      {payments.map((p) => (
        <Card key={p.id} className="flex items-center justify-between">
          <div>
            <p className="font-medium">{p.order?.orderNumber} · {idr(p.amount)} <Badge status={p.status} /></p>
            <p className="text-sm text-slate-500">provider: {p.providerOrderId}{p.midtransTransactionId ? ` · txn: ${p.midtransTransactionId}` : ''}{p.paymentType ? ` · ${p.paymentType}` : ''}</p>
            <p className="text-xs text-slate-400">created {new Date(p.createdAt).toLocaleString('id-ID')}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}
