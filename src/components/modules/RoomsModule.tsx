'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import {
  PremiumPage,
  PageHeader,
  PremiumCard,
  LoadingState,
  EmptyState,
  StatusBadge,
} from '@/components/ui/premium';
import TablePagination, { paginateSlice } from '@/components/ui/TablePagination';
import PremiumModal from '@/components/ui/PremiumModal';
import { fetchApi } from '@/lib/client/fetch-api';
import RoomGalleryUpload, { type GalleryImage } from '@/components/rooms/RoomGalleryUpload';
import { resolveRoomImageUrl, roomPlaceholderPath } from '@/lib/room-images';
import {
  BED_TYPE_OPTIONS,
  ROOM_AMENITY_OPTIONS,
  parseAmenities,
} from '@/lib/rooms/amenities';

const PAGE_SIZE = 8;

const ROOM_STATUSES = [
  'vacant',
  'occupied',
  'dirty',
  'clean',
  'inspected',
  'out_of_order',
  'out_of_service',
] as const;

type Room = {
  id: number;
  room_number: string;
  floor: string | null;
  status: string;
  room_type_id: number;
  room_type_name: string;
  base_rate: number;
  max_occupancy?: number;
  image_url?: string | null;
  room_type_image_url?: string | null;
  description?: string | null;
  amenities?: string[] | string | null;
  bed_type?: string | null;
  size_sqm?: number | null;
  images?: GalleryImage[];
};

function AmenityChecklist({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="rooms-amenity-grid">
      {ROOM_AMENITY_OPTIONS.map((opt) => {
        const checked = selected.includes(opt.key);
        return (
          <label key={opt.key} className={`rooms-amenity-chip${checked ? ' is-on' : ''}`}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => {
                onChange(
                  checked ? selected.filter((k) => k !== opt.key) : [...selected, opt.key]
                );
              }}
            />
            <span>{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}

export default function RoomsModule() {
  const toast = useToast();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [saving, setSaving] = useState(false);
  const [roomsPage, setRoomsPage] = useState(1);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  const [roomForm, setRoomForm] = useState({
    room_number: '',
    floor: '',
    base_rate: '',
    max_occupancy: '2',
    description: '',
    bed_type: '',
    size_sqm: '',
    amenities: [] as string[],
  });

  const [editRoomForm, setEditRoomForm] = useState({
    room_number: '',
    floor: '',
    status: 'vacant',
    base_rate: '',
    max_occupancy: '2',
    description: '',
    bed_type: '',
    size_sqm: '',
    amenities: [] as string[],
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const roomsRes = await fetchApi<Room[]>('/api/rooms');
      if (!roomsRes.success) {
        toast.error('Failed to load rooms', roomsRes.message);
        return;
      }
      setRooms(roomsRes.data ?? []);
    } catch {
      toast.error('Failed to load rooms', 'Unable to reach the server.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const roomsPaged = useMemo(
    () => paginateSlice(rooms, roomsPage, PAGE_SIZE),
    [rooms, roomsPage]
  );

  function openEditRoom(r: Room) {
    setEditingRoom(r);
    setEditRoomForm({
      room_number: r.room_number,
      floor: r.floor || '',
      status: r.status,
      base_rate: String(r.base_rate ?? ''),
      max_occupancy: String(r.max_occupancy ?? 2),
      description: r.description || '',
      bed_type: r.bed_type || '',
      size_sqm: r.size_sqm != null ? String(r.size_sqm) : '',
      amenities: parseAmenities(r.amenities),
    });
  }

  async function handleCreateRoom(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetchApi<{ id: number }>('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({
          room_number: roomForm.room_number,
          floor: roomForm.floor || undefined,
          base_rate: Number(roomForm.base_rate),
          max_occupancy: Number(roomForm.max_occupancy) || 2,
          description: roomForm.description || undefined,
          bed_type: roomForm.bed_type || undefined,
          size_sqm: roomForm.size_sqm ? Number(roomForm.size_sqm) : undefined,
          amenities: roomForm.amenities,
        }),
      });
      if (!res.success) {
        toast.error('Failed to create room', res.message);
        return;
      }
      toast.success('Room created', 'Open Edit to add photos.');
      setRoomForm({
        room_number: '',
        floor: '',
        base_rate: '',
        max_occupancy: '2',
        description: '',
        bed_type: '',
        size_sqm: '',
        amenities: [],
      });
      setRoomsPage(1);
      await loadData();
      if (res.data?.id) {
        const created = (await fetchApi<Room[]>('/api/rooms')).data?.find((x) => x.id === res.data!.id);
        if (created) openEditRoom(created);
      }
    } catch {
      toast.error('Failed to create room');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateRoom(e: FormEvent) {
    e.preventDefault();
    if (!editingRoom) return;
    setSaving(true);
    try {
      const res = await fetchApi('/api/rooms', {
        method: 'PATCH',
        body: JSON.stringify({
          id: editingRoom.id,
          room_number: editRoomForm.room_number,
          floor: editRoomForm.floor,
          status: editRoomForm.status,
          base_rate: Number(editRoomForm.base_rate),
          max_occupancy: Number(editRoomForm.max_occupancy) || 2,
          description: editRoomForm.description,
          bed_type: editRoomForm.bed_type,
          size_sqm: editRoomForm.size_sqm === '' ? null : Number(editRoomForm.size_sqm),
          amenities: editRoomForm.amenities,
        }),
      });
      if (!res.success) {
        toast.error('Failed to update room', res.message);
        return;
      }
      toast.success('Room updated');
      setEditingRoom(null);
      await loadData();
    } catch {
      toast.error('Failed to update room');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRoom(id: number, roomNumber: string) {
    const ok = await confirm({
      title: 'Remove room',
      message: `Remove room ${roomNumber} from inventory?`,
      confirmLabel: 'Remove room',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetchApi(`/api/rooms?id=${id}`, { method: 'DELETE' });
      if (!res.success) {
        toast.error('Delete failed', res.message);
        return;
      }
      toast.success('Room removed');
      await loadData();
    } catch {
      toast.error('Delete failed');
    }
  }

  return (
    <PremiumPage>
      <PageHeader
        title="Rooms"
        subtitle="Add rooms by number, rate, specs, and photos for the guest website."
        icon="ti-building"
      />

      {loading ? (
        <PremiumCard>
          <LoadingState label="Loading…" />
        </PremiumCard>
      ) : (
        <div className="row g-3">
          <div className="col-lg-4">
            <PremiumCard title="Add room">
              <form className="premium-form" onSubmit={handleCreateRoom}>
                <div className="mb-3">
                  <label className="form-label">Room number</label>
                  <input
                    className="form-control"
                    value={roomForm.room_number}
                    onChange={(e) => setRoomForm({ ...roomForm, room_number: e.target.value })}
                    placeholder="e.g. 103"
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Nightly rate (GHS)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-control"
                    value={roomForm.base_rate}
                    onChange={(e) => setRoomForm({ ...roomForm, base_rate: e.target.value })}
                    required
                  />
                </div>
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label">Max guests</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      className="form-control"
                      value={roomForm.max_occupancy}
                      onChange={(e) => setRoomForm({ ...roomForm, max_occupancy: e.target.value })}
                      required
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label">Floor</label>
                    <input
                      className="form-control"
                      value={roomForm.floor}
                      onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })}
                    />
                  </div>
                </div>
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label">Bed type</label>
                    <select
                      className="form-select"
                      value={roomForm.bed_type}
                      onChange={(e) => setRoomForm({ ...roomForm, bed_type: e.target.value })}
                    >
                      <option value="">Select…</option>
                      {BED_TYPE_OPTIONS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label">Size (m²)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      className="form-control"
                      value={roomForm.size_sqm}
                      onChange={(e) => setRoomForm({ ...roomForm, size_sqm: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={roomForm.description}
                    onChange={(e) => setRoomForm({ ...roomForm, description: e.target.value })}
                    placeholder="What guests should know about this room"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Amenities</label>
                  <AmenityChecklist
                    selected={roomForm.amenities}
                    onChange={(amenities) => setRoomForm({ ...roomForm, amenities })}
                  />
                </div>
                <button type="submit" className="btn btn-premium" disabled={saving}>
                  {saving ? 'Saving…' : 'Add room'}
                </button>
              </form>
            </PremiumCard>
          </div>
          <div className="col-lg-8">
            <PremiumCard title="Room inventory" flush>
              {rooms.length === 0 ? (
                <EmptyState
                  message="No rooms yet. Add a room number and nightly rate to get started."
                  icon="ti-door"
                />
              ) : (
                <>
                  <div className="table-responsive rooms-table-scroll">
                    <table className="table premium-table mb-0">
                      <thead>
                        <tr>
                          <th>Photo</th>
                          <th>Room #</th>
                          <th>Floor</th>
                          <th>Guests</th>
                          <th>Status</th>
                          <th>Rate / night</th>
                          <th className="text-end">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {roomsPaged.items.map((r) => (
                          <tr key={r.id}>
                            <td>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={resolveRoomImageUrl(r) || roomPlaceholderPath()}
                                alt=""
                                className="rooms-table-thumb"
                              />
                            </td>
                            <td className="fw-medium">{r.room_number}</td>
                            <td>{r.floor || '—'}</td>
                            <td>{r.max_occupancy ?? '—'}</td>
                            <td>
                              <StatusBadge status={r.status} />
                            </td>
                            <td>{Number(r.base_rate).toFixed(2)}</td>
                            <td className="text-end">
                              <div className="btn-group btn-group-sm">
                                <button
                                  type="button"
                                  className="btn btn-outline-secondary"
                                  onClick={() => openEditRoom(r)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline-danger"
                                  onClick={() => void handleDeleteRoom(r.id, r.room_number)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <TablePagination
                    page={roomsPage}
                    pageSize={PAGE_SIZE}
                    total={rooms.length}
                    onPageChange={setRoomsPage}
                  />
                </>
              )}
            </PremiumCard>
          </div>
        </div>
      )}

      <PremiumModal
        open={Boolean(editingRoom)}
        title={editingRoom ? `Edit room ${editingRoom.room_number}` : 'Edit room'}
        onClose={() => setEditingRoom(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setEditingRoom(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-room-form"
              className="btn btn-premium btn-sm"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      >
        {editingRoom ? (
          <form
            id="edit-room-form"
            className="premium-form rooms-edit-modal"
            onSubmit={handleUpdateRoom}
          >
            <div className="row g-3">
              <div className="col-md-7">
                <div className="row g-2">
                  <div className="col-sm-6">
                    <label className="form-label">Room #</label>
                    <input
                      className="form-control form-control-sm"
                      value={editRoomForm.room_number}
                      onChange={(e) =>
                        setEditRoomForm({ ...editRoomForm, room_number: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Nightly rate</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-control form-control-sm"
                      value={editRoomForm.base_rate}
                      onChange={(e) =>
                        setEditRoomForm({ ...editRoomForm, base_rate: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="col-sm-4">
                    <label className="form-label">Max guests</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      className="form-control form-control-sm"
                      value={editRoomForm.max_occupancy}
                      onChange={(e) =>
                        setEditRoomForm({ ...editRoomForm, max_occupancy: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="col-sm-4">
                    <label className="form-label">Floor</label>
                    <input
                      className="form-control form-control-sm"
                      value={editRoomForm.floor}
                      onChange={(e) =>
                        setEditRoomForm({ ...editRoomForm, floor: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-sm-4">
                    <label className="form-label">Status</label>
                    <select
                      className="form-select form-select-sm"
                      value={editRoomForm.status}
                      onChange={(e) =>
                        setEditRoomForm({ ...editRoomForm, status: e.target.value })
                      }
                    >
                      {ROOM_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Bed type</label>
                    <select
                      className="form-select form-select-sm"
                      value={editRoomForm.bed_type}
                      onChange={(e) =>
                        setEditRoomForm({ ...editRoomForm, bed_type: e.target.value })
                      }
                    >
                      <option value="">Select…</option>
                      {BED_TYPE_OPTIONS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label">Size (m²)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      className="form-control form-control-sm"
                      value={editRoomForm.size_sqm}
                      onChange={(e) =>
                        setEditRoomForm({ ...editRoomForm, size_sqm: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-control form-control-sm"
                      rows={3}
                      value={editRoomForm.description}
                      onChange={(e) =>
                        setEditRoomForm({ ...editRoomForm, description: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label">Amenities</label>
                    <AmenityChecklist
                      selected={editRoomForm.amenities}
                      onChange={(amenities) => setEditRoomForm({ ...editRoomForm, amenities })}
                    />
                  </div>
                </div>
              </div>
              <div className="col-md-5">
                <RoomGalleryUpload
                  roomId={editingRoom.id}
                  coverUrl={editingRoom.image_url}
                  images={editingRoom.images || []}
                  onChange={(images, coverUrl) => {
                    setEditingRoom((prev) =>
                      prev ? { ...prev, images, image_url: coverUrl } : prev
                    );
                    void loadData();
                  }}
                />
              </div>
            </div>
          </form>
        ) : null}
      </PremiumModal>
      <style>{`
        .rooms-amenity-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
        }
        .rooms-amenity-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          border: 1px solid #ddd5cc;
          border-radius: 999px;
          padding: 0.28rem 0.65rem;
          font-size: 0.78rem;
          background: #fff;
          cursor: pointer;
          user-select: none;
        }
        .rooms-amenity-chip input { display: none; }
        .rooms-amenity-chip.is-on {
          border-color: #1f3a63;
          background: #eef2f8;
          color: #1f3a63;
          font-weight: 600;
        }
      `}</style>
    </PremiumPage>
  );
}
