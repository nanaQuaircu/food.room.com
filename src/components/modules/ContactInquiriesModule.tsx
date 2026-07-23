'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import {
  PremiumPage,
  PageHeader,
  PremiumCard,
  LoadingState,
  EmptyState,
  StatusBadge,
} from '@/components/ui/premium';
import { fetchApi, invalidateApiCache } from '@/lib/client/fetch-api';
import TablePagination, { paginateSlice } from '@/components/ui/TablePagination';

type Inquiry = {
  id: number;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  status: 'new' | 'read' | 'archived';
  staff_notes: string | null;
  handled_at: string | null;
  created_at: string;
};

type Filter = 'open' | 'new' | 'read' | 'archived' | 'all';

const PAGE_SIZE = 10;

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ContactInquiriesModule() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Filter>('open');
  const [items, setItems] = useState<Inquiry[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [notes, setNotes] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi<{ items: Inquiry[]; new_count: number }>(
        `/api/contact-inquiries?status=${filter}`,
        { skipCache: true }
      );
      if (!res.success || !res.data) {
        toast.error('Failed to load inquiries', res.message);
        return;
      }
      setItems(res.data.items);
      setNewCount(res.data.new_count);
      setSelected((prev) => {
        if (!prev) return null;
        return res.data!.items.find((i) => i.id === prev.id) ?? null;
      });
    } catch {
      toast.error('Failed to load inquiries');
    } finally {
      setLoading(false);
    }
  }, [filter, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [filter, items.length]);

  useEffect(() => {
    setNotes(selected?.staff_notes || '');
  }, [selected]);

  const pagedItems = useMemo(() => paginateSlice(items, page, PAGE_SIZE), [items, page]);

  async function updateInquiry(
    id: number,
    body: { status?: string; staff_notes?: string },
    opts?: { silent?: boolean }
  ) {
    setSaving(true);
    try {
      const res = await fetchApi('/api/contact-inquiries', {
        method: 'PATCH',
        body: JSON.stringify({ id, ...body }),
      });
      if (!res.success) {
        if (!opts?.silent) toast.error('Update failed', res.message);
        return;
      }
      if (!opts?.silent) toast.success('Inquiry updated');
      invalidateApiCache('/api/contact-inquiries');
      await load();
    } catch {
      if (!opts?.silent) toast.error('Update failed');
    } finally {
      setSaving(false);
    }
  }

  async function openInquiry(item: Inquiry) {
    setSelected(item);
    if (item.status === 'new') {
      await updateInquiry(item.id, { status: 'read' }, { silent: true });
    }
  }

  return (
    <PremiumPage>
      <PageHeader
        title="Contact inquiries"
        subtitle="Messages sent from the guest website contact form."
        actions={
          newCount > 0 ? (
            <span className="premium-badge premium-badge--warning">{newCount} new</span>
          ) : null
        }
      />

      <div className="d-flex flex-wrap gap-2 mb-3">
        {(
          [
            ['open', 'Open'],
            ['new', 'New'],
            ['read', 'Read'],
            ['archived', 'Archived'],
            ['all', 'All'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`btn btn-sm ${filter === id ? 'btn-premium' : 'btn-outline-secondary'}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState label="Loading inquiries…" />
      ) : items.length === 0 ? (
        <EmptyState message="No inquiries yet. Messages from the guest website Contact page will appear here." />
      ) : (
        <div className="row g-3">
          <div className="col-lg-5">
            <PremiumCard title="Inbox" flush>
              <div className="list-group list-group-flush">
                {pagedItems.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`list-group-item list-group-item-action text-start ${
                      selected?.id === item.id ? 'active' : ''
                    }`}
                    onClick={() => void openInquiry(item)}
                  >
                    <div className="d-flex justify-content-between gap-2 align-items-start">
                      <div className="min-w-0">
                        <div className="fw-semibold text-truncate">{item.name}</div>
                        <div className="small opacity-75 text-truncate">
                          {item.subject || 'Website inquiry'}
                        </div>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="small mt-1 opacity-75">{formatWhen(item.created_at)}</div>
                  </button>
                ))}
              </div>
              <TablePagination
                page={pagedItems.safePage}
                pageSize={PAGE_SIZE}
                total={items.length}
                onPageChange={setPage}
              />
            </PremiumCard>
          </div>

          <div className="col-lg-7">
            {selected ? (
              <PremiumCard
                title={selected.subject || 'Website inquiry'}
                actions={
                  <div className="d-flex flex-wrap gap-2">
                    {selected.status !== 'archived' ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={saving}
                        onClick={() => void updateInquiry(selected.id, { status: 'archived' })}
                      >
                        Archive
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={saving}
                        onClick={() => void updateInquiry(selected.id, { status: 'read' })}
                      >
                        Restore
                      </button>
                    )}
                    <a
                      className="btn btn-sm btn-premium"
                      href={`mailto:${selected.email}?subject=${encodeURIComponent(
                        `Re: ${selected.subject || 'Your inquiry'}`
                      )}`}
                    >
                      Reply by email
                    </a>
                  </div>
                }
              >
                <div className="mb-3">
                  <div className="small text-muted text-uppercase fw-semibold mb-1">From</div>
                  <div>
                    <strong>{selected.name}</strong>
                    <br />
                    <a href={`mailto:${selected.email}`}>{selected.email}</a>
                  </div>
                  <div className="small text-muted mt-2">{formatWhen(selected.created_at)}</div>
                </div>

                <div className="mb-4">
                  <div className="small text-muted text-uppercase fw-semibold mb-1">Message</div>
                  <p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{selected.message}</p>
                </div>

                <div>
                  <label className="small text-muted text-uppercase fw-semibold mb-1 d-block">
                    Staff notes
                  </label>
                  <textarea
                    className="form-control mb-2"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Internal follow-up notes…"
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-premium"
                    disabled={saving}
                    onClick={() =>
                      void updateInquiry(selected.id, {
                        staff_notes: notes,
                        status: selected.status === 'new' ? 'read' : selected.status,
                      })
                    }
                  >
                    {saving ? 'Saving…' : 'Save notes'}
                  </button>
                </div>
              </PremiumCard>
            ) : (
              <PremiumCard title="Message">
                <p className="text-muted mb-0">Select an inquiry from the inbox to read it.</p>
              </PremiumCard>
            )}
          </div>
        </div>
      )}
    </PremiumPage>
  );
}
