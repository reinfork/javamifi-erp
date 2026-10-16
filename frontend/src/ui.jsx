import { useEffect, useRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from './lib.js';

const btn = cva('inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50', {
  variants: { variant: { default: 'bg-slate-900 text-white hover:bg-slate-700', outline: 'border border-slate-300 hover:bg-slate-100' } },
  defaultVariants: { variant: 'default' },
});
export const Button = ({ variant, className, ...p }) => <button className={cn(btn({ variant }), className)} {...p} />;
export const Card = ({ className, ...p }) => <div className={cn('rounded-lg border bg-white p-4 shadow-sm', className)} {...p} />;
export const Input = ({ className, ...p }) => <input className={cn('w-full rounded-md border border-slate-300 px-3 py-2 text-sm', className)} {...p} />;
export const Select = ({ className, ...p }) => <select className={cn('w-full rounded-md border border-slate-300 px-3 py-2 text-sm', className)} {...p} />;

const colors = {
  AVAILABLE: 'bg-green-100 text-green-800', RESERVED: 'bg-amber-100 text-amber-800', RENTED: 'bg-blue-100 text-blue-800',
  PENDING_PAYMENT: 'bg-amber-100 text-amber-800', RETURNED: 'bg-slate-200 text-slate-700', CANCELLED: 'bg-red-100 text-red-800',
  PENDING: 'bg-amber-100 text-amber-800', PAID: 'bg-green-100 text-green-800', FAILED: 'bg-red-100 text-red-800', EXPIRED: 'bg-slate-200 text-slate-700',
};
export const Badge = ({ status }) => <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', colors[status] || 'bg-slate-100')}>{status}</span>;

// ponytail: native <dialog> = free modal, Esc, focus trap; ceiling = one size, style per use via className
export function Modal({ onClose, className, children }) {
  const ref = useRef(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
      className={cn('w-full max-w-lg rounded-lg border bg-white p-4 shadow-xl backdrop:bg-black/40', className)}
    >
      <div className="flex justify-end">
        <Button variant="outline" onClick={(e) => e.currentTarget.closest('dialog').close()}>✕</Button>
      </div>
      {children}
    </dialog>
  );
}
