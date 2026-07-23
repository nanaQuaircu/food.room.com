'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/ToastProvider';
import {
  PremiumPage,
  PageHeader,
  PremiumCard,
  LoadingState,
  EmptyState,
} from '@/components/ui/premium';
import ProvisionHotelForm from '@/components/platform/ProvisionHotelForm';
import PlatformHotelsTable, { type PlatformHotelRow } from '@/components/platform/PlatformHotelsTable';

export default function PlatformHotelsClient() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const [hotels, setHotels] = useState<PlatformHotelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(searchParams.get('add') === '1');

  const loadHotels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/platform/hotels');
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Unexpected response from platform API.');
      }
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error('Failed to load hotels', json.message || 'Unable to load hotels.');
        return;
      }
      setHotels(json.data);
    } catch {
      toast.error('Failed to load hotels', 'Unable to reach the platform API.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadHotels();
  }, [loadHotels]);

  return (
    <PremiumPage>
      <PageHeader
        variant="platform"
        title="Hotels"
        subtitle="All registered tenant hotels on the platform."
        icon="ti-building"
        actions={
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-premium"
              onClick={() => setShowForm((v) => !v)}
            >
              <i className="ti ti-plus me-1" />
              {showForm ? 'Hide form' : 'Add Hotel'}
            </button>
            <Link href="/platform" className="btn btn-premium-outline">
              Back to dashboard
            </Link>
          </div>
        }
      />

      {showForm ? (
        <ProvisionHotelForm
          showCancel
          onCancel={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            void loadHotels();
          }}
        />
      ) : null}

      <PremiumCard title="Registered hotels" flush>
        {loading ? (
          <LoadingState label="Loading hotels…" />
        ) : hotels.length === 0 ? (
          <EmptyState message="No hotels registered. Click Add Hotel to provision one." icon="ti-building" />
        ) : (
          <PlatformHotelsTable hotels={hotels} showDatabase onChanged={loadHotels} />
        )}
      </PremiumCard>
    </PremiumPage>
  );
}
