'use client';

import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/premium';
import PremiumModal from '@/components/ui/PremiumModal';
import RoomImageUpload from '@/components/rooms/RoomImageUpload';
import {
  ROOM_IMAGE_UPLOAD_ROLES,
  resolveRoomImageUrl,
} from '@/lib/room-images';
import { hasAnyRole } from '@/lib/roles';

export type RoomBoardItem = {
  id: number;
  room_number: string;
  status: string;
  room_type_name: string;
  base_rate: number;
  image_url?: string | null;
  room_type_image_url?: string | null;
};

type StatusFilter = 'all' | 'available' | 'occupied' | 'dirty' | 'other';

const STATUS_LABELS: Record<string, string> = {
  vacant: 'Available',
  clean: 'Available',
  inspected: 'Available',
  occupied: 'Occupied',
  dirty: 'Dirty',
  out_of_order: 'Out of order',
  out_of_service: 'Out of service',
};

function formatMoney(amount: number) {
  return `GHS ${Number(amount).toFixed(2)}`;
}

function statusTone(status: string) {
  if (['vacant', 'clean', 'inspected'].includes(status)) return 'available';
  if (status === 'occupied') return 'occupied';
  if (status === 'dirty') return 'dirty';
  return 'other';
}

type Props = {
  rooms: RoomBoardItem[];
  userRole?: string;
  occupiedGuests?: Record<string, string>;
  onImageUpdated?: () => void;
};

export default function RoomStatusBoard({
  rooms,
  userRole,
  occupiedGuests,
  onImageUpdated,
}: Props) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [uploadRoom, setUploadRoom] = useState<RoomBoardItem | null>(null);

  const canUpload = hasAnyRole(userRole, ROOM_IMAGE_UPLOAD_ROLES);

  const filtered = useMemo(() => {
    return rooms.filter((room) => {
      const tone = statusTone(room.status);
      if (filter === 'all') return true;
      if (filter === 'available') return tone === 'available';
      if (filter === 'occupied') return tone === 'occupied';
      if (filter === 'dirty') return tone === 'dirty';
      return tone === 'other';
    });
  }, [rooms, filter]);

  const counts = useMemo(() => {
    const c = { all: rooms.length, available: 0, occupied: 0, dirty: 0, other: 0 };
    for (const room of rooms) {
      const tone = statusTone(room.status);
      if (tone === 'available') c.available += 1;
      else if (tone === 'occupied') c.occupied += 1;
      else if (tone === 'dirty') c.dirty += 1;
      else c.other += 1;
    }
    return c;
  }, [rooms]);

  function openUpload(room: RoomBoardItem) {
    setUploadRoom(room);
  }

  return (
    <>
      <div className="fd-board-toolbar">
        <div className="fd-board-filters" role="tablist" aria-label="Filter rooms by status">
          {(
            [
              ['all', `All (${counts.all})`],
              ['available', `Available (${counts.available})`],
              ['occupied', `Occupied (${counts.occupied})`],
              ['dirty', `Dirty (${counts.dirty})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={`fd-board-filters__btn${filter === id ? ' is-active' : ''}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {canUpload ? (
          <span className="fd-board-hint">
            <i className="ti ti-camera me-1" />
            Click a room to upload its photo
          </span>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <EmptyState message="No rooms match this filter." icon="ti-building" />
      ) : (
        <div className="fd-room-board">
          {filtered.map((room, index) => {
            const imageUrl = resolveRoomImageUrl(room);
            const tone = statusTone(room.status);
            const guestName =
              tone === 'occupied' ? occupiedGuests?.[room.room_number] : undefined;

            const cardInner = (
              <>
                <div className="fd-room-card__media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt={`Room ${room.room_number}`} className="fd-room-card__img" />
                  <span className={`fd-room-card__status fd-room-card__status--${tone}`}>
                    {STATUS_LABELS[room.status] || room.status.replace(/_/g, ' ')}
                  </span>
                  <span className="fd-room-card__number">{room.room_number}</span>
                  {canUpload ? (
                    <span className="fd-room-card__camera" aria-hidden>
                      <i className="ti ti-camera" />
                    </span>
                  ) : null}
                </div>
                <div className="fd-room-card__body">
                  <div className="fd-room-card__type">{room.room_type_name}</div>
                  {guestName ? (
                    <div className="fd-room-card__guest">
                      <i className="ti ti-user" aria-hidden="true" />
                      {guestName}
                    </div>
                  ) : null}
                  <div className="fd-room-card__rate">{formatMoney(room.base_rate)}/night</div>
                </div>
              </>
            );

            if (canUpload) {
              return (
                <button
                  key={room.id}
                  type="button"
                  className={`fd-room-card fd-room-card--${tone} fd-room-card--clickable`}
                  style={{ animationDelay: `${Math.min(index, 24) * 40}ms` }}
                  onClick={() => openUpload(room)}
                >
                  {cardInner}
                </button>
              );
            }

            return (
              <article
                key={room.id}
                className={`fd-room-card fd-room-card--${tone}`}
                style={{ animationDelay: `${Math.min(index, 24) * 40}ms` }}
              >
                {cardInner}
              </article>
            );
          })}
        </div>
      )}

      <PremiumModal
        open={Boolean(uploadRoom)}
        title={uploadRoom ? `Room ${uploadRoom.room_number} photo` : 'Room photo'}
        onClose={() => setUploadRoom(null)}
        size="lg"
      >
        {uploadRoom ? (
          <>
            <p className="text-muted small">
              {uploadRoom.room_type_name} ·{' '}
              {STATUS_LABELS[uploadRoom.status] || uploadRoom.status}
            </p>
            <RoomImageUpload
              roomId={uploadRoom.id}
              label={`Room ${uploadRoom.room_number}`}
              imageUrl={uploadRoom.image_url}
              roomTypeImageUrl={uploadRoom.room_type_image_url}
              onUpdated={() => {
                setUploadRoom(null);
                onImageUpdated?.();
              }}
            />
          </>
        ) : null}
      </PremiumModal>
    </>
  );
}
