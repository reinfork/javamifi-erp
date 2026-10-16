import { useEffect, useState } from 'react';
import { api, token } from './api.js';
import { Button } from './ui.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ShopPage from './pages/ShopPage.jsx';
import OrdersPage from './pages/OrdersPage.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import FinancePage from './pages/FinancePage.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('shop');
  const [page, setPage] = useState('orders');

  useEffect(() => {
    if (!token.get()) return;
    api('/api/auth/me').then((d) => setUser(d.user)).catch(() => token.set(''));
  }, []);

  if (view === 'shop') {
    return <ShopPage onOperator={() => setView(user ? 'modules' : 'login')} />;
  }
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <LoginPage onLogin={(u) => { setUser(u); setView('modules'); }} />
        <p className="mx-auto mt-4 max-w-sm text-center">
          <Button variant="outline" onClick={() => setView('shop')}>Back to shop</Button>
        </p>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b bg-white px-4 py-3">
        <strong>JavaMifi Rental Desk</strong>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setView('shop')}>Shop</Button>
          {[['orders', 'Orders'], ['inventory', 'Inventory'], ['finance', 'Finance']].map(([k, label]) => (
            <Button key={k} variant={page === k ? 'default' : 'outline'} onClick={() => setPage(k)}>{label}</Button>
          ))}
          <Button variant="outline" onClick={() => { token.set(''); setUser(null); setView('shop'); }}>Logout</Button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4">
        {page === 'orders' && <OrdersPage />}
        {page === 'inventory' && <InventoryPage />}
        {page === 'finance' && <FinancePage />}
      </main>
    </div>
  );
}
