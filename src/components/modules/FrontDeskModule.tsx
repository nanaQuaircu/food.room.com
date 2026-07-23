'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '@/components/ui/ToastProvider';
import {
  PremiumPage,
  PageHeader,
  PremiumCard,
  PremiumTabs,
  LoadingState,
  EmptyState,
  StatCard,
} from '@/components/ui/premium';
import { fetchApi, peekApiCache } from '@/lib/client/fetch-api';
import { formatDisplayDate } from '@/lib/dates/format-display-date';
import {
  addDaysToDateIso,
  calculateRoomTotal,
  formatLocalDateIso,
} from '@/lib/billing/stay-billing';
import RoomStatusBoard from '@/components/front-desk/RoomStatusBoard';
import FoodOrdersPanel from '@/components/front-desk/FoodOrdersPanel';

type Reservation = {
  id: number;
  confirmation_code: string;
  status: string;
  check_in_date: string;
  check_out_date: string;
  first_name: string;
  last_name: string;
  room_id: number | null;
  room_type_name: string | null;
  room_number: string | null;
  total_amount: number;
  amount_paid: number;
};

type Room = {
  id: number;
  room_number: string;
  floor: string | null;
  status: string;
  room_type_id: number;
  room_type_name: string;
  base_rate: number;
  image_url?: string | null;
  room_type_image_url?: string | null;
};

type Guest = {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  is_blacklisted: number;
};

type RoomType = {
  id: number;
  name: string;
  base_rate: number;
};

type CheckoutPreview = {
  reservation_id: number;
  guest_name: string;
  confirmation_code: string;
  room_number: string | null;
  check_in_date: string;
  scheduled_check_out_date: string;
  actual_check_out_date: string;
  rate_per_night: number;
  scheduled_nights: number;
  actual_nights: number;
  unused_nights: number;
  scheduled_room_total: number;
  actual_room_total: number;
  unused_nights_value: number;
  other_charges: number;
  amount_paid: number;
  balance: number;
  is_early: boolean;
  max_refund: number;
  suggested_refund: number;
};

type RefundPolicy = 'full' | 'partial' | 'none';

const emptyCheckoutForm = {
  actual_check_out_date: '',
  refund_policy: 'full' as RefundPolicy,
  refund_amount: '',
  reason: '',
};
type FrontDeskData = {
  arrivals: Reservation[];
  departures: Reservation[];
  inHouse: Reservation[];
  roomGrid: Room[];
  today: string;
};

function walkInCheckoutDate(checkIn: string, nights: number) {
  const n = Math.max(1, Math.floor(Number(nights)) || 1);
  return addDaysToDateIso(checkIn, n);
}

const emptyWalkIn = {
  guest_mode: 'new' as 'new' | 'existing',
  guest_id: '',
  guest_search: '',
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  nights: '1',
  check_out_date: addDaysToDateIso(formatLocalDateIso(), 1),
  room_type_id: '',
  room_id: '',
  adults: '1',
  collect_payment: true,
  payment_amount: '',
  payment_method: 'cash',
  payment_reference: '',
  billing_type: 'guest' as 'guest' | 'corporate',
  corporate_account_id: '',
};

type GuestNotifications = { sms: string; email: string; errors?: string[] };

type RoomTypeAvailability = {
  id: number;
  name: string;
  rate: number;
  available: number;
  total: number;
};

function formatMoney(amount: number) {
  return `GHS ${Number(amount).toFixed(2)}`;
}

function guestInitialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

function formatCheckoutDate(iso: string) {
  return formatDisplayDate(iso);
}

function formatGuestPayment(r: Pick<Reservation, 'amount_paid' | 'total_amount'>) {
  const paid = Number(r.amount_paid);
  if (paid > 0) return `Paid ${formatMoney(paid)}`;
  const total = Number(r.total_amount);
  if (total > 0) return `Total ${formatMoney(total)}`;
  return null;
}

function showGuestNotificationToasts(
  toast: ReturnType<typeof useToast>,
  notifications?: GuestNotifications
) {
  if (!notifications) return;
  const sent: string[] = [];
  if (notifications.sms === 'sent') sent.push('SMS');
  if (notifications.email === 'sent') sent.push('email');
  if (sent.length > 0) {
    toast.info('Guest notified', `${sent.join(' and ')} sent.`);
  } else if ((notifications.errors?.length ?? 0) > 0) {
    toast.warning(
      'Notifications skipped',
      notifications.errors?.[0] || 'Configure SMS and email in Settings → Integrations.'
    );
  }
}

export default function FrontDeskModule({ userRole }: { userRole?: string }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkInTab, setCheckInTab] = useState<'walk_in' | 'reservation'>('walk_in');
  const [data, setData] = useState<FrontDeskData | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [guestResults, setGuestResults] = useState<Guest[]>([]);
  const [checkInForm, setCheckInForm] = useState({ reservation_id: '', room_id: '' });
  const [walkInForm, setWalkInForm] = useState(emptyWalkIn);
  const [corporateAccounts, setCorporateAccounts] = useState<Array<{ id: number; name: string }>>([]);
  const [checkoutModal, setCheckoutModal] = useState<{ reservationId: number } | null>(null);
  const [checkoutPreview, setCheckoutPreview] = useState<CheckoutPreview | null>(null);
  const [checkoutForm, setCheckoutForm] = useState(emptyCheckoutForm);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [paystackConfig, setPaystackConfig] = useState<{
    enabled: boolean;
    publicKey: string;
    mode: 'test' | 'live';
  } | null>(null);
  const [paystackScriptReady, setPaystackScriptReady] = useState(false);

  useEffect(() => {
    void fetchApi<{ enabled: boolean; publicKey: string; mode: 'test' | 'live' }>(
      '/api/payments/paystack/config'
    ).then((res) => {
      if (res.success && res.data) setPaystackConfig(res.data);
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.PaystackPop) {
      setPaystackScriptReady(true);
      return;
    }
    const existing = document.querySelector('script[data-paystack-inline]');
    if (existing) {
      existing.addEventListener('load', () => setPaystackScriptReady(true));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    script.dataset.paystackInline = 'true';
    script.onload = () => setPaystackScriptReady(true);
    document.body.appendChild(script);
  }, []);

  const loadData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const [deskRes, typesRes, accountsRes] = await Promise.all([
        fetchApi<FrontDeskData>('/api/front-desk'),
        fetchApi<RoomType[]>('/api/room-types'),
        fetchApi<Array<{ id: number; name: string }>>('/api/debtors?action=accounts'),
      ]);
      if (!deskRes.success) {
        toast.error('Failed to load front desk', deskRes.message);
        return;
      }
      setData(deskRes.data ?? null);
      if (typesRes.success) setRoomTypes(typesRes.data ?? []);
      if (accountsRes.success) setCorporateAccounts(accountsRes.data ?? []);
    } catch {
      toast.error('Failed to load front desk');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [toast]);

  const refreshRoomGrid = useCallback(async () => {
    try {
      const deskRes = await fetchApi<FrontDeskData>('/api/front-desk', { skipCache: true });
      if (deskRes.success) {
        setData((prev) =>
          prev && deskRes.data
            ? { ...prev, roomGrid: deskRes.data.roomGrid, inHouse: deskRes.data.inHouse }
            : deskRes.data ?? null
        );
      }
    } catch {
      toast.error('Failed to refresh room board');
    }
  }, [toast]);

  useEffect(() => {
    const cachedDesk = peekApiCache<FrontDeskData>('/api/front-desk');
    const cachedTypes = peekApiCache<RoomType[]>('/api/room-types');
    if (cachedDesk?.success && cachedDesk.data) {
      setData(cachedDesk.data);
      setLoading(false);
    }
    if (cachedTypes?.success && cachedTypes.data) {
      setRoomTypes(cachedTypes.data);
    }
    void loadData({ silent: Boolean(cachedDesk?.success && cachedDesk.data) });
  }, [loadData]);

  const searchGuests = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setGuestResults([]);
        return;
      }
      const res = await fetchApi<Guest[]>(`/api/guests?search=${encodeURIComponent(q)}`);
      if (res.success) setGuestResults(res.data ?? []);
    },
    []
  );

  useEffect(() => {
    if (walkInForm.guest_mode !== 'existing') return;
    const timer = window.setTimeout(() => {
      void searchGuests(walkInForm.guest_search);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [walkInForm.guest_mode, walkInForm.guest_search, searchGuests]);

  const vacantRooms = useMemo(
    () =>
      (data?.roomGrid ?? []).filter(
        (r) => r.status === 'vacant' || r.status === 'clean' || r.status === 'inspected'
      ),
    [data?.roomGrid]
  );

  const selectedArrival = useMemo(() => {
    const id = Number(checkInForm.reservation_id);
    if (!id) return null;
    return (data?.arrivals ?? []).find((r) => r.id === id) ?? null;
  }, [checkInForm.reservation_id, data?.arrivals]);

  /** Vacant rooms plus the room already held on the selected reservation (so it can prefill). */
  const checkInRooms = useMemo(() => {
    const rooms = [...vacantRooms];
    const reservedId = selectedArrival?.room_id;
    if (!reservedId) return rooms;
    if (rooms.some((r) => r.id === reservedId)) return rooms;
    const held = (data?.roomGrid ?? []).find((r) => r.id === reservedId);
    if (held) rooms.unshift(held);
    return rooms;
  }, [vacantRooms, selectedArrival?.room_id, data?.roomGrid]);

  const walkInRooms = useMemo(() => {
    if (!walkInForm.room_type_id) return vacantRooms;
    return vacantRooms.filter((r) => String(r.room_type_id) === walkInForm.room_type_id);
  }, [vacantRooms, walkInForm.room_type_id]);

  const selectedWalkInRoom = walkInRooms.find((r) => String(r.id) === walkInForm.room_id);
  const walkInNights = useMemo(() => {
    const nights = Number(walkInForm.nights);
    return Number.isFinite(nights) && nights > 0 ? Math.floor(nights) : 0;
  }, [walkInForm.nights]);

  useEffect(() => {
    if (!data?.today) return;
    setWalkInForm((prev) => {
      const nights = Math.max(1, Number(prev.nights) || 1);
      const nextCheckout = walkInCheckoutDate(data.today, nights);
      if (prev.check_out_date === nextCheckout && prev.nights === String(nights)) return prev;
      return { ...prev, nights: String(nights), check_out_date: nextCheckout };
    });
  }, [data?.today]);

  const occupiedGuestsByRoom = useMemo(() => {
    const map: Record<string, string> = {};
    for (const stay of data?.inHouse ?? []) {
      if (!stay.room_number) continue;
      map[stay.room_number] = `${stay.first_name} ${stay.last_name}`.trim();
    }
    return map;
  }, [data?.inHouse]);

  const estimatedTotal = useMemo(() => {
    if (!selectedWalkInRoom || walkInNights <= 0) return 0;
    return calculateRoomTotal(Number(selectedWalkInRoom.base_rate), walkInNights);
  }, [selectedWalkInRoom, walkInNights]);

  useEffect(() => {
    if (!walkInForm.collect_payment || estimatedTotal <= 0) return;
    setWalkInForm((prev) => {
      const nextAmount = estimatedTotal.toFixed(2);
      if (prev.payment_amount === nextAmount) return prev;
      return { ...prev, payment_amount: nextAmount };
    });
  }, [estimatedTotal, walkInForm.collect_payment]);

  const roomTypeAvailability = useMemo((): RoomTypeAvailability[] => {
    const map = new Map<number, RoomTypeAvailability>();
    for (const rt of roomTypes) {
      map.set(rt.id, {
        id: rt.id,
        name: rt.name,
        rate: Number(rt.base_rate),
        available: 0,
        total: 0,
      });
    }
    for (const room of data?.roomGrid ?? []) {
      let entry = map.get(room.room_type_id);
      if (!entry) {
        entry = {
          id: room.room_type_id,
          name: room.room_type_name,
          rate: Number(room.base_rate),
          available: 0,
          total: 0,
        };
        map.set(room.room_type_id, entry);
      }
      entry.total += 1;
      if (['vacant', 'clean', 'inspected'].includes(room.status)) {
        entry.available += 1;
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [roomTypes, data?.roomGrid]);

  const selectedRoomType = roomTypeAvailability.find(
    (rt) => String(rt.id) === walkInForm.room_type_id
  );

  function selectRoomTypeForWalkIn(typeId: number) {
    setCheckInTab('walk_in');
    setWalkInForm((prev) => ({
      ...prev,
      room_type_id: String(typeId),
      room_id: '',
    }));
  }

  function selectRoomForWalkIn(room: Room) {
    setCheckInTab('walk_in');
    setWalkInForm((prev) => ({
      ...prev,
      room_type_id: String(room.room_type_id),
      room_id: String(room.id),
    }));
  }

  const roomStatusSummary = useMemo(() => {
    const summary = { ready: 0, occupied: 0, dirty: 0, maintenance: 0 };
    for (const room of data?.roomGrid ?? []) {
      if (['vacant', 'clean', 'inspected'].includes(room.status)) summary.ready += 1;
      else if (room.status === 'occupied') summary.occupied += 1;
      else if (room.status === 'dirty') summary.dirty += 1;
      else summary.maintenance += 1;
    }
    return summary;
  }, [data?.roomGrid]);

  async function handleCheckIn(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetchApi<{
        reservation_id: number;
        room_id: number;
        status: string;
        notifications?: GuestNotifications;
      }>('/api/front-desk', {
        method: 'POST',
        body: JSON.stringify({
          action: 'check_in',
          reservation_id: Number(checkInForm.reservation_id),
          room_id: Number(checkInForm.room_id),
        }),
      });
      if (!res.success) {
        toast.error('Check-in failed', res.message);
        return;
      }
      toast.success('Guest checked in');
      showGuestNotificationToasts(toast, res.data?.notifications);
      setCheckInForm({ reservation_id: '', room_id: '' });
      await loadData();
    } catch {
      toast.error('Check-in failed');
    } finally {
      setSaving(false);
    }
  }

  async function submitWalkIn(paymentReference?: string) {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        action: 'walk_in',
        check_in_date: data?.today,
        check_out_date: walkInForm.check_out_date,
        room_id: Number(walkInForm.room_id),
        adults: Number(walkInForm.adults) || 1,
        collect_payment: walkInForm.collect_payment,
        payment_method: walkInForm.payment_method,
        payment_reference: paymentReference || walkInForm.payment_reference || undefined,
      };

      if (walkInForm.guest_mode === 'existing') {
        payload.guest_id = Number(walkInForm.guest_id);
      } else {
        payload.first_name = walkInForm.first_name;
        payload.last_name = walkInForm.last_name;
        payload.email = walkInForm.email || undefined;
        payload.phone = walkInForm.phone || undefined;
      }

      if (walkInForm.collect_payment && walkInForm.payment_amount) {
        payload.payment_amount = Number(walkInForm.payment_amount);
      }

      payload.billing_type = walkInForm.billing_type;
      if (walkInForm.billing_type === 'corporate' && walkInForm.corporate_account_id) {
        payload.corporate_account_id = Number(walkInForm.corporate_account_id);
      }

      const res = await fetchApi<{
        confirmation_code: string;
        total_amount: number;
        reservation_id: number;
        notifications?: GuestNotifications;
      }>('/api/front-desk', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res.success) {
        toast.error('Walk-in failed', res.message);
        return;
      }

      toast.success(
        'Walk-in complete',
        res.message || `Confirmation ${res.data?.confirmation_code}`
      );
      showGuestNotificationToasts(toast, res.data?.notifications);
      setWalkInForm({
        ...emptyWalkIn,
        check_out_date: data?.today ? walkInCheckoutDate(data.today, 1) : emptyWalkIn.check_out_date,
      });
      await loadData();
    } catch {
      toast.error('Walk-in failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleWalkIn(e: FormEvent) {
    e.preventDefault();

    if (walkInForm.collect_payment && walkInForm.payment_method === 'paystack') {
      if (!paystackConfig?.enabled) {
        toast.warning('Paystack unavailable', 'Enable Paystack in Settings → Integrations.');
        return;
      }
      if (!paystackScriptReady || !window.PaystackPop) {
        toast.error('Paystack is still loading', 'Please wait a moment and try again.');
        return;
      }

      const email = walkInForm.email.trim();
      if (!email) {
        toast.error('Email required', 'Guest email is required for Paystack payments.');
        return;
      }

      const amount = Number(walkInForm.payment_amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error('Invalid amount', 'Enter a valid payment amount.');
        return;
      }

      setSaving(true);
      try {
        const initRes = await fetchApi<{
          reference: string;
          public_key: string;
          amount: number;
          email: string;
        }>('/api/payments/paystack/initialize', {
          method: 'POST',
          body: JSON.stringify({ email, amount }),
        });

        if (!initRes.success || !initRes.data) {
          toast.error('Paystack failed', initRes.message);
          setSaving(false);
          return;
        }

        const { reference, public_key } = initRes.data;
        window.PaystackPop.setup({
          key: public_key,
          email,
          amount: Math.round(amount * 100),
          ref: reference,
          currency: 'GHS',
          onClose: () => setSaving(false),
          callback: (response) => {
            void submitWalkIn(response.reference);
          },
        }).openIframe();
      } catch {
        toast.error('Paystack failed', 'Could not start payment.');
        setSaving(false);
      }
      return;
    }

    await submitWalkIn();
  }

  const loadCheckoutPreview = useCallback(
    async (reservationId: number, actualDate: string, refundPolicy: RefundPolicy) => {
      setPreviewLoading(true);
      try {
        const params = new URLSearchParams({ reservation_id: String(reservationId) });
        if (actualDate) params.set('actual_check_out_date', actualDate);
        params.set('refund_policy', refundPolicy);
        const res = await fetchApi<CheckoutPreview>(`/api/front-desk?${params.toString()}`);
        if (!res.success) {
          toast.error('Failed to load checkout details', res.message);
          setCheckoutPreview(null);
          return;
        }
        setCheckoutPreview(res.data ?? null);
      } catch {
        toast.error('Failed to load checkout details');
      } finally {
        setPreviewLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (!checkoutModal) return;
    const timer = window.setTimeout(() => {
      void loadCheckoutPreview(
        checkoutModal.reservationId,
        checkoutForm.actual_check_out_date,
        checkoutForm.refund_policy
      );
    }, 200);
    return () => window.clearTimeout(timer);
  }, [
    checkoutModal,
    checkoutForm.actual_check_out_date,
    checkoutForm.refund_policy,
    loadCheckoutPreview,
  ]);

  async function openCheckout(reservationId: number) {
    const today = data?.today ?? new Date().toISOString().slice(0, 10);
    setCheckoutModal({ reservationId });
    setCheckoutForm({ ...emptyCheckoutForm, actual_check_out_date: today });
    setCheckoutPreview(null);
    await loadCheckoutPreview(reservationId, today, 'full');
  }

  function closeCheckoutModal() {
    setCheckoutModal(null);
    setCheckoutPreview(null);
    setCheckoutForm(emptyCheckoutForm);
  }

  useEffect(() => {
    if (!checkoutModal) return;
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [checkoutModal]);

  async function handleCheckOutSubmit(e: FormEvent) {
    e.preventDefault();
    if (!checkoutModal) return;

    if (checkoutPreview?.is_early && !checkoutForm.reason.trim()) {
      toast.warning('Reason required', 'Please provide a reason for early check-out.');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        action: 'check_out',
        reservation_id: checkoutModal.reservationId,
        actual_check_out_date: checkoutForm.actual_check_out_date || undefined,
        refund_policy: checkoutForm.refund_policy,
        reason: checkoutForm.reason.trim() || undefined,
      };

      if (checkoutForm.refund_policy === 'partial' && checkoutForm.refund_amount) {
        payload.refund_amount = Number(checkoutForm.refund_amount);
      }

      const res = await fetchApi<{
        reservation_id: number;
        status: string;
        checkout_type: string;
        actual_nights: number;
        unused_nights: number;
        actual_room_total: number;
        refund_amount: number;
        balance: number;
        notifications?: GuestNotifications;
      }>('/api/front-desk', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res.success) {
        toast.error('Check-out failed', res.message);
        return;
      }

      const summary = res.data;
      const parts = [`${summary?.actual_nights ?? 0} night(s) charged`];
      if ((summary?.refund_amount ?? 0) > 0) {
        parts.push(`${formatMoney(summary!.refund_amount)} refunded`);
      }
      if ((summary?.balance ?? 0) > 0) {
        parts.push(`${formatMoney(summary!.balance)} balance due`);
      }

      toast.success(
        summary?.checkout_type === 'early' ? 'Early check-out complete' : 'Guest checked out',
        parts.join(' · ')
      );
      showGuestNotificationToasts(toast, res.data?.notifications);
      closeCheckoutModal();
      await loadData();
    } catch {
      toast.error('Check-out failed');
    } finally {
      setSaving(false);
    }
  }

  function selectExistingGuest(guest: Guest) {
    if (guest.is_blacklisted) {
      toast.warning('Blacklisted guest', 'This guest cannot be checked in.');
      return;
    }
    setWalkInForm({
      ...walkInForm,
      guest_id: String(guest.id),
      guest_search: `${guest.first_name} ${guest.last_name}`,
      first_name: guest.first_name,
      last_name: guest.last_name,
      email: guest.email || '',
      phone: guest.phone || '',
    });
    setGuestResults([]);
  }

  if (loading && !data) {
    return (
      <PremiumPage>
        <PremiumCard>
          <LoadingState label="Loading front desk…" />
        </PremiumCard>
      </PremiumPage>
    );
  }

  return (
    <PremiumPage>
      <PageHeader
        title="Front Desk"
        subtitle={`Operations for ${formatDisplayDate(data?.today ?? formatLocalDateIso())}`}
        icon="ti-door-enter"
        actions={
          <button
            type="button"
            className="btn btn-premium-outline btn-sm"
            onClick={() => void loadData()}
            disabled={loading}
          >
            <i className="ti ti-refresh me-1" />
            Refresh
          </button>
        }
      />

      <div className="row g-3 mb-3 premium-dashboard-row">
        <div className="col-6 col-md-3">
          <StatCard
            label="Arrivals today"
            value={data?.arrivals.length ?? 0}
            icon="ti-door-enter"
            tone="primary"
            featured
          />
        </div>
        <div className="col-6 col-md-3">
          <StatCard
            label="Departures due"
            value={data?.departures.length ?? 0}
            icon="ti-door-exit"
            tone="warning"
          />
        </div>
        <div className="col-6 col-md-3">
          <StatCard
            label="In-house"
            value={data?.inHouse.length ?? 0}
            icon="ti-bed"
            tone="info"
          />
        </div>
        <div className="col-6 col-md-3">
          <StatCard
            label="Rooms available"
            value={vacantRooms.length}
            icon="ti-key"
            tone="info"
          />
        </div>
      </div>

      <div className="row g-3 mb-3 fd-checkin-row">
        <div className="col-lg-7">
          <PremiumCard title="Check In Guest" className="fd-checkin-card">
            <PremiumTabs
              tabs={[
                { id: 'walk_in', label: 'Walk-in' },
                { id: 'reservation', label: 'With reservation' },
              ]}
              active={checkInTab}
              onChange={(id) => setCheckInTab(id as 'walk_in' | 'reservation')}
            />

            {checkInTab === 'walk_in' ? (
              <form className="premium-form mt-3" onSubmit={handleWalkIn}>
                <div className="fd-form-section">
                  <div className="fd-form-section__head">
                    <span className="fd-form-section__num">1</span>
                    <div>
                      <h3 className="fd-form-section__title">Guest details</h3>
                      <p className="fd-form-section__hint">New arrival or returning guest</p>
                    </div>
                  </div>
                  <div className="fd-form-section__body">
                    <div className="fd-segmented mb-3">
                      <button
                        type="button"
                        className={`fd-segmented__btn${walkInForm.guest_mode === 'new' ? ' is-active' : ''}`}
                        onClick={() =>
                          setWalkInForm({
                            ...walkInForm,
                            guest_mode: 'new',
                            guest_id: '',
                            guest_search: '',
                          })
                        }
                      >
                        New guest
                      </button>
                      <button
                        type="button"
                        className={`fd-segmented__btn${walkInForm.guest_mode === 'existing' ? ' is-active' : ''}`}
                        onClick={() => setWalkInForm({ ...walkInForm, guest_mode: 'existing' })}
                      >
                        Returning guest
                      </button>
                    </div>

                    {walkInForm.guest_mode === 'existing' ? (
                      <div className="row g-3">
                          <div className="col-md-6 fd-guest-search-wrap">
                          <label className="form-label">Search guest</label>
                          <input
                            className="form-control"
                            placeholder="Name, email, or phone…"
                            value={walkInForm.guest_search}
                            onChange={(e) =>
                              setWalkInForm({
                                ...walkInForm,
                                guest_search: e.target.value,
                                guest_id: '',
                              })
                            }
                            required={!walkInForm.guest_id}
                          />
                          {guestResults.length > 0 && !walkInForm.guest_id ? (
                            <div className="list-group fd-guest-search shadow-sm">
                              {guestResults.map((g) => (
                                <button
                                  key={g.id}
                                  type="button"
                                  className="list-group-item list-group-item-action"
                                  onClick={() => selectExistingGuest(g)}
                                >
                                  {g.first_name} {g.last_name}
                                  {g.phone ? ` · ${g.phone}` : ''}
                                  {g.is_blacklisted ? ' (blacklisted)' : ''}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="col-md-6">
                          <label className="form-label">Selected guest</label>
                          <input
                            className="form-control"
                            value={
                              walkInForm.guest_id
                                ? `${walkInForm.first_name} ${walkInForm.last_name}`.trim()
                                : ''
                            }
                            placeholder="Search and select a guest"
                            readOnly
                            required
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="row g-3">
                        <div className="col-md-6">
                          <label className="form-label">First name</label>
                          <input
                            className="form-control"
                            value={walkInForm.first_name}
                            onChange={(e) =>
                              setWalkInForm({ ...walkInForm, first_name: e.target.value })
                            }
                            required
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label">Last name</label>
                          <input
                            className="form-control"
                            value={walkInForm.last_name}
                            onChange={(e) =>
                              setWalkInForm({ ...walkInForm, last_name: e.target.value })
                            }
                            required
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label">Phone</label>
                          <input
                            className="form-control"
                            value={walkInForm.phone}
                            onChange={(e) => setWalkInForm({ ...walkInForm, phone: e.target.value })}
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label">Email</label>
                          <input
                            type="email"
                            className="form-control"
                            value={walkInForm.email}
                            onChange={(e) => setWalkInForm({ ...walkInForm, email: e.target.value })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="fd-form-section">
                  <div className="fd-form-section__head">
                    <span className="fd-form-section__num">2</span>
                    <div>
                      <h3 className="fd-form-section__title">Stay dates</h3>
                      <p className="fd-form-section__hint">Check-in is today; enter nights to set check-out</p>
                    </div>
                  </div>
                  <div className="fd-form-section__body">
                    <div className="row g-3">
                      <div className="col-md-3">
                        <label className="form-label">Check-in</label>
                        <input
                          type="text"
                          className="form-control"
                          value={data?.today ? formatDisplayDate(data.today) : ''}
                          readOnly
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label">Nights</label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          className="form-control"
                          value={walkInForm.nights}
                          onChange={(e) => {
                            const nights = Math.max(1, Number(e.target.value) || 1);
                            const checkIn = data?.today ?? formatLocalDateIso();
                            setWalkInForm({
                              ...walkInForm,
                              nights: String(nights),
                              check_out_date: walkInCheckoutDate(checkIn, nights),
                            });
                          }}
                          required
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label">Check-out</label>
                        <input
                          type="text"
                          className="form-control"
                          value={walkInForm.check_out_date ? formatDisplayDate(walkInForm.check_out_date) : ''}
                          readOnly
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label">Adults</label>
                        <input
                          type="number"
                          min={1}
                          className="form-control"
                          value={walkInForm.adults}
                          onChange={(e) => setWalkInForm({ ...walkInForm, adults: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="fd-form-section">
                  <div className="fd-form-section__head">
                    <span className="fd-form-section__num">3</span>
                    <div>
                      <h3 className="fd-form-section__title">Room assignment</h3>
                      <p className="fd-form-section__hint">
                        Pick a type from the rate card on the right, then assign a room
                      </p>
                    </div>
                  </div>
                  <div className="fd-form-section__body">
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label className="form-label">Room type</label>
                        <select
                          className="form-select"
                          value={walkInForm.room_type_id}
                          onChange={(e) =>
                            setWalkInForm({ ...walkInForm, room_type_id: e.target.value, room_id: '' })
                          }
                        >
                          <option value="">All types — see rates panel →</option>
                          {roomTypeAvailability.map((rt) => (
                            <option key={rt.id} value={rt.id}>
                              {rt.name} · {formatMoney(rt.rate)}/night · {rt.available} available
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Room number</label>
                        <select
                          className="form-select"
                          value={walkInForm.room_id}
                          onChange={(e) => setWalkInForm({ ...walkInForm, room_id: e.target.value })}
                          required
                        >
                          <option value="">Select available room…</option>
                          {walkInRooms.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.room_number} · {formatMoney(r.base_rate)}/night
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {walkInNights > 0 ? (
                  <div className="fd-stay-summary">
                    <div className="fd-stay-summary__row">
                      <span className="fd-stay-summary__label">Stay length</span>
                      <span className="fd-stay-summary__value">
                        {walkInNights} night{walkInNights === 1 ? '' : 's'}
                      </span>
                    </div>
                    {selectedWalkInRoom || selectedRoomType ? (
                      <>
                        <div className="fd-stay-summary__row">
                          <span className="fd-stay-summary__label">Rate</span>
                          <span className="fd-stay-summary__value">
                            {formatMoney(
                              Number(selectedWalkInRoom?.base_rate ?? selectedRoomType?.rate ?? 0)
                            )}
                            /night
                          </span>
                        </div>
                        <div className="fd-stay-summary__total">
                          <span>Accommodation total</span>
                          <strong>
                            {selectedWalkInRoom
                              ? formatMoney(estimatedTotal)
                              : selectedRoomType
                                ? formatMoney(
                                    calculateRoomTotal(selectedRoomType.rate, walkInNights)
                                  )
                                : '—'}
                          </strong>
                        </div>
                      </>
                    ) : (
                      <p className="fd-stay-summary__hint mb-0">
                        Select a room type or room to calculate the total charge.
                      </p>
                    )}
                  </div>
                ) : null}

                <div className="fd-form-section">
                  <div className="fd-form-section__head">
                    <span className="fd-form-section__num">4</span>
                    <div>
                      <h3 className="fd-form-section__title">Billing</h3>
                      <p className="fd-form-section__hint">Guest pays, or charge a company / debtor account</p>
                    </div>
                  </div>
                  <div className="fd-form-section__body">
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label className="form-label">Bill to</label>
                        <select
                          className="form-select"
                          value={walkInForm.billing_type}
                          onChange={(e) =>
                            setWalkInForm({
                              ...walkInForm,
                              billing_type: e.target.value as 'guest' | 'corporate',
                              corporate_account_id:
                                e.target.value === 'corporate' ? walkInForm.corporate_account_id : '',
                            })
                          }
                        >
                          <option value="guest">Guest</option>
                          <option value="corporate">Company / debtor</option>
                        </select>
                      </div>
                      {walkInForm.billing_type === 'corporate' ? (
                        <div className="col-md-6">
                          <label className="form-label">Company</label>
                          <select
                            className="form-select"
                            value={walkInForm.corporate_account_id}
                            onChange={(e) =>
                              setWalkInForm({ ...walkInForm, corporate_account_id: e.target.value })
                            }
                            required
                          >
                            <option value="">Select company…</option>
                            {corporateAccounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="fd-form-section">
                  <div className="fd-form-section__head">
                    <span className="fd-form-section__num">5</span>
                    <div>
                      <h3 className="fd-form-section__title">Payment</h3>
                      <p className="fd-form-section__hint">Optional — collect deposit or full payment</p>
                    </div>
                  </div>
                  <div className="fd-form-section__body">
                    <div className="form-check mb-3">
                      <input
                        id="collect-payment"
                        type="checkbox"
                        className="form-check-input"
                        checked={walkInForm.collect_payment}
                        onChange={(e) =>
                          setWalkInForm({
                            ...walkInForm,
                            collect_payment: e.target.checked,
                            payment_amount: e.target.checked ? estimatedTotal.toFixed(2) : '',
                          })
                        }
                      />
                      <label className="form-check-label" htmlFor="collect-payment">
                        Collect payment now
                      </label>
                    </div>
                    {walkInForm.collect_payment ? (
                      <div className="row g-3">
                        <div className="col-md-4">
                          <label className="form-label">Amount (GHS)</label>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            className="form-control"
                            value={walkInForm.payment_amount}
                            onChange={(e) =>
                              setWalkInForm({ ...walkInForm, payment_amount: e.target.value })
                            }
                          />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label">Method</label>
                          <select
                            className="form-select"
                            value={walkInForm.payment_method}
                            onChange={(e) =>
                              setWalkInForm({
                                ...walkInForm,
                                payment_method: e.target.value,
                                payment_reference: '',
                              })
                            }
                          >
                            <option value="cash">Cash</option>
                            {paystackConfig?.enabled ? (
                              <option value="paystack">Paystack</option>
                            ) : null}
                          </select>
                        </div>
                        {walkInForm.payment_method === 'cash' ? (
                          <div className="col-md-4">
                            <label className="form-label">Reference</label>
                            <input
                              className="form-control"
                              value={walkInForm.payment_reference}
                              onChange={(e) =>
                                setWalkInForm({ ...walkInForm, payment_reference: e.target.value })
                              }
                              placeholder="Receipt / txn no."
                            />
                          </div>
                        ) : (
                          <div className="col-md-4">
                            <label className="form-label">Paystack</label>
                            <p className="form-text mb-0 mt-2">
                              Opens the Paystack payment window. Guest email is required.
                            </p>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>

                <button type="submit" className="btn btn-premium btn-lg w-100" disabled={saving}>
                  {saving
                    ? 'Processing…'
                    : walkInForm.collect_payment && walkInForm.payment_method === 'paystack'
                      ? 'Pay with Paystack & check in'
                      : 'Complete walk-in & check in'}
                </button>
              </form>
            ) : (
              <form className="premium-form mt-3" onSubmit={handleCheckIn}>
                <p className="text-muted small mb-3">
                  Assign a room to a guest with a reservation arriving today.
                </p>
                <div className="row g-3 align-items-end">
                  <div className="col-md-5">
                    <label className="form-label">Arrival reservation</label>
                    <select
                      className="form-select"
                      value={checkInForm.reservation_id}
                      onChange={(e) => {
                        const reservationId = e.target.value;
                        const arrival = (data?.arrivals ?? []).find(
                          (r) => String(r.id) === reservationId
                        );
                        setCheckInForm({
                          reservation_id: reservationId,
                          room_id: arrival?.room_id ? String(arrival.room_id) : '',
                        });
                      }}
                      required
                    >
                      <option value="">Select reservation…</option>
                      {(data?.arrivals ?? []).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.first_name} {r.last_name} — {r.confirmation_code}
                          {r.room_number
                            ? ` · Rm ${r.room_number}`
                            : r.room_type_name
                              ? ` · ${r.room_type_name}`
                              : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-5">
                    <label className="form-label">Assign room</label>
                    <select
                      className="form-select"
                      value={checkInForm.room_id}
                      onChange={(e) => setCheckInForm({ ...checkInForm, room_id: e.target.value })}
                      required
                    >
                      <option value="">Select room…</option>
                      {checkInRooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.room_number} · {formatMoney(r.base_rate)}/night
                          {selectedArrival?.room_id === r.id ? ' · reserved' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-2">
                    <button type="submit" className="btn btn-premium w-100" disabled={saving}>
                      {saving ? '…' : 'Check In'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </PremiumCard>
        </div>

        <div className="col-lg-5">
          <div className="fd-sidebar">
            <PremiumCard
              title="Room rates & availability"
              className="fd-rates-card"
              actions={
                <span className="fd-rates-card__badge">
                  {walkInNights > 0
                    ? `${walkInNights} night${walkInNights === 1 ? '' : 's'} selected`
                    : 'Set check-out date'}
                </span>
              }
            >
              {roomTypeAvailability.length === 0 ? (
                <EmptyState message="No room types configured." icon="ti-tag" />
              ) : (
                <div className="fd-rate-list">
                  {roomTypeAvailability.map((rt) => {
                    const isSelected = walkInForm.room_type_id === String(rt.id);
                    const stayTotal =
                      walkInNights > 0 ? calculateRoomTotal(rt.rate, walkInNights) : 0;
                    return (
                      <button
                        key={rt.id}
                        type="button"
                        className={`fd-rate-card${isSelected ? ' is-selected' : ''}${rt.available === 0 ? ' is-unavailable' : ''}`}
                        onClick={() => selectRoomTypeForWalkIn(rt.id)}
                        disabled={rt.available === 0}
                      >
                        <div className="fd-rate-card__top">
                          <span className="fd-rate-card__name">{rt.name}</span>
                          <span
                            className={`fd-rate-card__avail${rt.available === 0 ? ' fd-rate-card__avail--none' : ''}`}
                          >
                            {rt.available} / {rt.total} free
                          </span>
                        </div>
                        <div className="fd-rate-card__price">
                          {formatMoney(rt.rate)}
                          <small>/night</small>
                        </div>
                        {walkInNights > 0 ? (
                          <div className="fd-rate-card__stay">
                            {walkInNights} night{walkInNights === 1 ? '' : 's'} ={' '}
                            <strong>{formatMoney(stayTotal)}</strong>
                          </div>
                        ) : (
                          <div className="fd-rate-card__stay fd-rate-card__stay--muted">
                            Select check-out to see stay total
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="fd-rates-footnote mb-0">
                Tap a room type to filter available rooms. Rates apply per night for the full stay.
              </p>
            </PremiumCard>

            <PremiumCard
              title="Ready to assign"
              className="fd-ready-rooms-card"
              fill
              actions={
                <span className="fd-ready-rooms-card__count">
                  {walkInRooms.length} room{walkInRooms.length === 1 ? '' : 's'}
                </span>
              }
            >
              <div className="fd-room-status-chips">
                <span className="fd-room-status-chip fd-room-status-chip--ready">
                  {roomStatusSummary.ready} ready
                </span>
                <span className="fd-room-status-chip fd-room-status-chip--occupied">
                  {roomStatusSummary.occupied} in use
                </span>
                <span className="fd-room-status-chip fd-room-status-chip--dirty">
                  {roomStatusSummary.dirty} dirty
                </span>
                {roomStatusSummary.maintenance > 0 ? (
                  <span className="fd-room-status-chip fd-room-status-chip--maintenance">
                    {roomStatusSummary.maintenance} maintenance
                  </span>
                ) : null}
              </div>

              {walkInForm.room_type_id && selectedRoomType ? (
                <p className="fd-ready-rooms-filter">
                  Showing <strong>{selectedRoomType.name}</strong> rooms only
                </p>
              ) : (
                <p className="fd-ready-rooms-filter">All room types · tap a room to assign in the form</p>
              )}

              {walkInRooms.length === 0 ? (
                <EmptyState
                  message={
                    walkInForm.room_type_id
                      ? 'No vacant rooms for this type right now.'
                      : 'No vacant rooms available.'
                  }
                  icon="ti-bed-off"
                />
              ) : (
                <div className="fd-ready-room-list">
                  {walkInRooms.map((room) => {
                    const isSelected = walkInForm.room_id === String(room.id);
                    return (
                      <button
                        key={room.id}
                        type="button"
                        className={`fd-ready-room${isSelected ? ' is-selected' : ''}`}
                        onClick={() => selectRoomForWalkIn(room)}
                      >
                        <div className="fd-ready-room__main">
                          <span className="fd-ready-room__number">Room {room.room_number}</span>
                          <span className="fd-ready-room__type">{formatMoney(room.base_rate)}/night</span>
                        </div>
                        <div className="fd-ready-room__meta">
                          {room.floor ? `Floor ${room.floor} · ` : ''}
                          {formatMoney(room.base_rate)}/night
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </PremiumCard>
          </div>
        </div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-lg-4">
          <PremiumCard title="Arrivals today" flush className="fd-ops-card">
            {(data?.arrivals ?? []).length === 0 ? (
              <EmptyState message="No arrivals today." icon="ti-door-enter" />
            ) : (
              <ul className="fd-guest-list">
                {data?.arrivals.map((r) => {
                  const paymentLabel = formatGuestPayment(r);
                  return (
                  <li key={r.id} className="fd-guest-list__item">
                    <div>
                      <div className="fd-guest-list__name">
                        {r.first_name} {r.last_name}
                      </div>
                      <div className="fd-guest-list__meta">
                        {r.room_number
                          ? `Room ${r.room_number}`
                          : r.room_type_name || 'Room TBD'}{' '}
                        · <code>{r.confirmation_code}</code>
                      </div>
                      {paymentLabel ? <div className="fd-guest-list__price">{paymentLabel}</div> : null}
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </PremiumCard>
        </div>

        <div className="col-lg-4">
          <PremiumCard title="Departures due" flush className="fd-ops-card">
            {(data?.departures ?? []).length === 0 ? (
              <EmptyState message="No departures due." icon="ti-door-exit" />
            ) : (
              <ul className="fd-guest-list">
                {data?.departures.map((r) => {
                  const paymentLabel = formatGuestPayment(r);
                  return (
                  <li key={r.id} className="fd-guest-list__item">
                    <div>
                      <div className="fd-guest-list__name">
                        {r.first_name} {r.last_name}
                      </div>
                      <div className="fd-guest-list__meta">Room {r.room_number || '—'}</div>
                      {paymentLabel ? <div className="fd-guest-list__price">{paymentLabel}</div> : null}
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-premium"
                      onClick={() => void openCheckout(r.id)}
                    >
                      Check out
                    </button>
                  </li>
                  );
                })}
              </ul>
            )}
          </PremiumCard>
        </div>

        <div className="col-lg-4">
          <PremiumCard title="In-house snapshot" flush className="fd-ops-card">
            {(data?.inHouse ?? []).length === 0 ? (
              <EmptyState message="No guests in-house." icon="ti-bed" />
            ) : (
              <ul className="fd-guest-list">
                {(data?.inHouse ?? []).slice(0, 5).map((r) => {
                  const isOverdue = data?.today && r.check_out_date < data.today;
                  const isDueToday = r.check_out_date === data?.today;
                  const paymentLabel = formatGuestPayment(r);
                  return (
                    <li key={r.id} className="fd-guest-list__item">
                      <div>
                        <div className="fd-guest-list__name">
                          {r.first_name} {r.last_name}
                          {isOverdue ? (
                            <span className="badge bg-danger ms-1">Overdue</span>
                          ) : isDueToday ? (
                            <span className="badge bg-warning text-dark ms-1">Due</span>
                          ) : null}
                        </div>
                        <div className="fd-guest-list__meta">
                          Rm {r.room_number || '—'} · out {formatDisplayDate(r.check_out_date)}
                        </div>
                        {paymentLabel ? <div className="fd-guest-list__price">{paymentLabel}</div> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {(data?.inHouse.length ?? 0) > 5 ? (
              <p className="fd-ops-more small text-muted mb-0 px-3 pb-2">
                +{(data?.inHouse.length ?? 0) - 5} more — see full list below
              </p>
            ) : null}
          </PremiumCard>
        </div>
      </div>

      <PremiumCard title={`All in-house guests (${data?.inHouse.length ?? 0})`} flush>
        {(data?.inHouse ?? []).length === 0 ? (
          <EmptyState message="No guests currently in-house." icon="ti-bed" />
        ) : (
          <div className="table-responsive">
            <table className="table premium-table mb-0">
              <thead>
                <tr>
                  <th>Guest</th>
                  <th>Room</th>
                  <th>Check-in</th>
                  <th>Scheduled Check-out</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data?.inHouse.map((r) => {
                  const isDueToday = r.check_out_date === data?.today;
                  const isOverdue = data?.today && r.check_out_date < data.today;
                  return (
                    <tr key={r.id}>
                      <td>
                        {r.first_name} {r.last_name}
                        <div className="small text-muted">
                          <code>{r.confirmation_code}</code>
                        </div>
                      </td>
                      <td>{r.room_number || '—'}</td>
                      <td>{formatDisplayDate(r.check_in_date)}</td>
                      <td>
                        {formatDisplayDate(r.check_out_date)}
                        {isOverdue ? (
                          <span className="badge bg-danger ms-2">Overdue</span>
                        ) : isDueToday ? (
                          <span className="badge bg-warning text-dark ms-2">Due today</span>
                        ) : null}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-premium"
                          onClick={() => void openCheckout(r.id)}
                        >
                          Check Out
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PremiumCard>

      {checkoutModal && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="modal show d-block fd-checkout-backdrop"
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
            >
          <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable fd-checkout-dialog">
            <div className="modal-content fd-checkout-modal">
              <form onSubmit={handleCheckOutSubmit}>
                {previewLoading && !checkoutPreview ? (
                  <div className="fd-checkout-modal__loading">
                    <LoadingState label="Calculating stay charges…" />
                  </div>
                ) : checkoutPreview ? (
                  <>
                    <div className="fd-checkout-modal__hero">
                      <button
                        type="button"
                        className="fd-checkout-modal__close"
                        onClick={closeCheckoutModal}
                        aria-label="Close"
                      >
                        <i className="ti ti-x" aria-hidden="true" />
                      </button>
                      <div className="fd-checkout-modal__guest">
                        <div className="fd-checkout-modal__avatar" aria-hidden="true">
                          {guestInitialsFromName(checkoutPreview.guest_name)}
                        </div>
                        <div className="fd-checkout-modal__guest-text">
                          <p className="fd-checkout-modal__eyebrow">Process check-out</p>
                          <h2 className="fd-checkout-modal__name">{checkoutPreview.guest_name}</h2>
                          <div className="fd-checkout-modal__meta">
                            <code>{checkoutPreview.confirmation_code}</code>
                            {checkoutPreview.room_number ? (
                              <span className="fd-checkout-modal__meta-item">
                                <i className="ti ti-door" aria-hidden="true" />
                                Room {checkoutPreview.room_number}
                              </span>
                            ) : null}
                            <span
                              className={`fd-checkout-modal__type${
                                checkoutPreview.is_early ? ' fd-checkout-modal__type--early' : ''
                              }`}
                            >
                              {checkoutPreview.is_early ? 'Early check-out' : 'Scheduled check-out'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="fd-checkout-modal__stats">
                      <div className="fd-checkout-stat">
                        <span className="fd-checkout-stat__label">Room charge</span>
                        <span className="fd-checkout-stat__value">
                          {formatMoney(checkoutPreview.actual_room_total)}
                        </span>
                      </div>
                      <div className="fd-checkout-stat">
                        <span className="fd-checkout-stat__label">Other charges</span>
                        <span className="fd-checkout-stat__value">
                          {formatMoney(checkoutPreview.other_charges)}
                        </span>
                      </div>
                      <div className="fd-checkout-stat fd-checkout-stat--paid">
                        <span className="fd-checkout-stat__label">Amount paid</span>
                        <span className="fd-checkout-stat__value">
                          {formatMoney(checkoutPreview.amount_paid)}
                        </span>
                      </div>
                      <div
                        className={`fd-checkout-stat fd-checkout-stat--balance${
                          checkoutPreview.balance <= 0 ? ' fd-checkout-stat--settled' : ''
                        }`}
                      >
                        <span className="fd-checkout-stat__label">Balance due</span>
                        <span className="fd-checkout-stat__value">
                          {formatMoney(Math.max(0, checkoutPreview.balance))}
                        </span>
                      </div>
                    </div>

                    <div className="fd-checkout-modal__body">
                      <section className="fd-checkout-section" aria-label="Stay details">
                        <div className="fd-checkout-section__head">
                          <h3 className="fd-checkout-section__title">
                            <i className="ti ti-calendar-event" aria-hidden="true" />
                            Stay details
                          </h3>
                        </div>
                        <div className="row g-3">
                          <div className="col-md-4">
                            <label className="form-label">Check-in</label>
                            <div className="fd-checkout-readonly">
                              {formatCheckoutDate(checkoutPreview.check_in_date)}
                            </div>
                          </div>
                          <div className="col-md-4">
                            <label className="form-label">Scheduled check-out</label>
                            <div className="fd-checkout-readonly">
                              {formatCheckoutDate(checkoutPreview.scheduled_check_out_date)}
                            </div>
                          </div>
                          <div className="col-md-4">
                            <label className="form-label">Rate per night</label>
                            <div className="fd-checkout-readonly">{formatMoney(checkoutPreview.rate_per_night)}</div>
                          </div>
                        </div>
                        <div className="row g-3 mt-1">
                          <div className="col-md-6">
                            <label className="form-label">Actual check-out date</label>
                            <input
                              type="date"
                              className="form-control"
                              value={checkoutForm.actual_check_out_date}
                              min={checkoutPreview.check_in_date}
                              max={data?.today}
                              onChange={(e) =>
                                setCheckoutForm({ ...checkoutForm, actual_check_out_date: e.target.value })
                              }
                              required
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label">Nights stayed</label>
                            <div className="fd-checkout-readonly fd-checkout-readonly--highlight">
                              {checkoutPreview.actual_nights} night
                              {checkoutPreview.actual_nights === 1 ? '' : 's'}
                            </div>
                          </div>
                        </div>
                      </section>

                      {checkoutPreview.is_early ? (
                        <section className="fd-checkout-section" aria-label="Early check-out">
                          <div className="fd-checkout-section__head">
                            <h3 className="fd-checkout-section__title">
                              <i className="ti ti-clock-exclamation" aria-hidden="true" />
                              Early check-out
                            </h3>
                          </div>

                          <div className="fd-checkout-alert">
                            <i className="ti ti-info-circle" aria-hidden="true" />
                            <div>
                              <strong>
                                {checkoutPreview.unused_nights} unused night
                                {checkoutPreview.unused_nights === 1 ? '' : 's'}
                              </strong>{' '}
                              ({formatMoney(checkoutPreview.unused_nights_value)} room value). Choose how to handle any
                              refund.
                            </div>
                          </div>

                          <div className="row g-3">
                            <div className="col-md-6">
                              <label className="form-label">Refund policy</label>
                              <select
                                className="form-select"
                                value={checkoutForm.refund_policy}
                                onChange={(e) =>
                                  setCheckoutForm({
                                    ...checkoutForm,
                                    refund_policy: e.target.value as RefundPolicy,
                                    refund_amount:
                                      e.target.value === 'partial'
                                        ? String(checkoutPreview.suggested_refund)
                                        : '',
                                  })
                                }
                              >
                                <option value="full">Full refund for unused nights</option>
                                <option value="partial">Partial refund</option>
                                <option value="none">No refund</option>
                              </select>
                            </div>
                            {checkoutForm.refund_policy === 'partial' ? (
                              <div className="col-md-6">
                                <label className="form-label">Refund amount</label>
                                <input
                                  type="number"
                                  min={0}
                                  max={checkoutPreview.max_refund}
                                  step="0.01"
                                  className="form-control"
                                  value={checkoutForm.refund_amount}
                                  onChange={(e) =>
                                    setCheckoutForm({ ...checkoutForm, refund_amount: e.target.value })
                                  }
                                  required
                                />
                                <div className="form-text">
                                  Maximum refund: {formatMoney(checkoutPreview.max_refund)}
                                </div>
                              </div>
                            ) : (
                              <div className="col-md-6">
                                <label className="form-label">Refund amount</label>
                                <div className="fd-checkout-readonly fd-checkout-readonly--refund">
                                  {checkoutForm.refund_policy === 'full'
                                    ? formatMoney(checkoutPreview.suggested_refund)
                                    : formatMoney(0)}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="mt-3">
                            <label className="form-label">Reason for early check-out</label>
                            <textarea
                              className="form-control"
                              rows={2}
                              value={checkoutForm.reason}
                              onChange={(e) => setCheckoutForm({ ...checkoutForm, reason: e.target.value })}
                              placeholder="e.g. Guest travel plans changed"
                              required
                            />
                          </div>
                        </section>
                      ) : (
                        <div className="fd-checkout-note">
                          <i className="ti ti-circle-check" aria-hidden="true" />
                          Scheduled check-out — room charges are based on {checkoutPreview.actual_nights} night
                          {checkoutPreview.actual_nights === 1 ? '' : 's'}.
                          {checkoutPreview.balance > 0 ? (
                            <span className="fd-checkout-note__warn">
                              {' '}
                              Collect {formatMoney(checkoutPreview.balance)} in Billing before completing check-out.
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>

                    <div className="fd-checkout-modal__footer">
                      <button type="button" className="btn btn-outline-secondary" onClick={closeCheckoutModal}>
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-premium"
                        disabled={saving || previewLoading || !checkoutPreview}
                      >
                        {saving ? 'Processing…' : 'Complete check-out'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="fd-checkout-modal__loading">
                    <EmptyState message="Unable to load checkout details." icon="ti-alert-circle" />
                    <div className="text-center pb-4">
                      <button type="button" className="btn btn-outline-secondary" onClick={closeCheckoutModal}>
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>,
            document.body
          )
        : null}

      <PremiumCard title="Food orders" className="mb-3">
        <FoodOrdersPanel />
      </PremiumCard>

      <PremiumCard title="Room status board">
        <RoomStatusBoard
          rooms={data?.roomGrid ?? []}
          userRole={userRole}
          occupiedGuests={occupiedGuestsByRoom}
          onImageUpdated={() => void refreshRoomGrid()}
        />
      </PremiumCard>
    </PremiumPage>
  );
}
