'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchApi, invalidateApiCache } from '@/lib/client/fetch-api';

type FoodOrder = {
  id: number;
  order_type: string;
  room_number: string | null;
  status: string;
  total_amount: number;
  notes: string | null;
  created_at: string;
  guest_name: string | null;
  payment_status?: string;
  payment_method?: string | null;
};

const STATUSES = ['pending', 'preparing', 'ready', 'delivered', 'cancelled'] as const;

export default function FoodOrdersPanel() {
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi<FoodOrder[]>('/api/food-orders', { skipCache: true });
      if (res.success && res.data) setOrders(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function updateStatus(id: number, status: string) {
    const res = await fetchApi('/api/food-orders', {
      method: 'PATCH',
      body: JSON.stringify({ id, status }),
    });
    if (res.success) {
      invalidateApiCache('/api/food-orders');
      void load();
    }
  }

  async function markPaid(id: number) {
    const res = await fetchApi('/api/food-orders', {
      method: 'PATCH',
      body: JSON.stringify({ id, action: 'mark_paid' }),
    });
    if (res.success) {
      invalidateApiCache('/api/food-orders');
      void load();
    } else {
      window.alert(res.message || 'Could not record payment.');
    }
  }

  const active = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status));

  return (
    <div className="mt-2">
      {loading && orders.length === 0 ? (
        <p className="text-muted small mb-0">Loading food orders…</p>
      ) : active.length === 0 ? (
        <p className="text-muted small mb-0">No open food orders.</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm align-middle mb-0 premium-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Type</th>
                <th>Guest</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {active.map((order) => {
                const paymentStatus = order.payment_status || 'pending';
                const method = (order.payment_method || 'cash').replace(/_/g, ' ');
                const canMarkPaid =
                  paymentStatus !== 'paid' && (order.payment_method || 'cash') !== 'paystack';
                return (
                  <tr key={order.id}>
                    <td>{order.id}</td>
                    <td>
                      {order.order_type === 'room_service'
                        ? `Room ${order.room_number || '—'}`
                        : 'Restaurant'}
                    </td>
                    <td>{order.guest_name || 'Guest'}</td>
                    <td>{Number(order.total_amount).toFixed(2)}</td>
                    <td>
                      <span
                        className={`badge ${paymentStatus === 'paid' ? 'bg-success' : 'bg-warning text-dark'}`}
                      >
                        {paymentStatus === 'paid' ? 'Paid' : 'Unpaid'} · {method}
                      </span>
                    </td>
                    <td>
                      <select
                        className="form-select form-select-sm"
                        value={order.status}
                        onChange={(e) => void updateStatus(order.id, e.target.value)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {canMarkPaid ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => void markPaid(order.id)}
                        >
                          Mark cash paid
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
