'use client';

import { useRef, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchApi } from '@/lib/client/fetch-api';
import { resolveRoomImageUrl, roomPlaceholderPath } from '@/lib/room-images';

type Props = {
  roomId?: number;
  roomTypeId?: number;
  label: string;
  imageUrl?: string | null;
  roomTypeImageUrl?: string | null;
  onUpdated: (imageUrl: string | null) => void;
  compact?: boolean;
};

export default function RoomImageUpload({
  roomId,
  roomTypeId,
  label,
  imageUrl,
  roomTypeImageUrl,
  onUpdated,
  compact = false,
}: Props) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const preview = resolveRoomImageUrl({
    image_url: imageUrl,
    room_type_image_url: roomTypeImageUrl,
  });

  async function upload(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.warning('Invalid file', 'Please choose a JPG, PNG, or WebP image.');
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('image', file);
      if (roomId) body.append('room_id', String(roomId));
      if (roomTypeId) body.append('room_type_id', String(roomTypeId));

      const res = await fetch('/api/rooms/image', { method: 'POST', body });
      const json = (await res.json()) as { success: boolean; message?: string; data?: { image_url: string } };
      if (!json.success) {
        toast.error('Upload failed', json.message);
        return;
      }
      toast.success('Photo updated');
      onUpdated(json.data?.image_url ?? null);
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function removeImage() {
    setUploading(true);
    try {
      const params = new URLSearchParams();
      if (roomId) params.set('room_id', String(roomId));
      if (roomTypeId) params.set('room_type_id', String(roomTypeId));
      const res = await fetchApi(`/api/rooms/image?${params.toString()}`, { method: 'DELETE' });
      if (!res.success) {
        toast.error('Remove failed', res.message);
        return;
      }
      toast.success('Photo removed');
      onUpdated(null);
    } catch {
      toast.error('Remove failed');
    } finally {
      setUploading(false);
      setConfirmRemove(false);
    }
  }

  return (
    <div className={`room-image-upload${compact ? ' room-image-upload--compact' : ''}`}>
      <div className="room-image-upload__preview">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview || roomPlaceholderPath()}
          alt={label}
          className="room-image-upload__img"
        />
      </div>
      <div className="d-flex flex-wrap gap-2 mt-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="d-none"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <button
          type="button"
          className="btn btn-sm btn-premium"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Uploading…' : 'Upload photo'}
        </button>
        {preview && !confirmRemove ? (
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            disabled={uploading}
            onClick={() => setConfirmRemove(true)}
          >
            Remove
          </button>
        ) : null}
      </div>
      {confirmRemove ? (
        <div className="room-image-upload__confirm" role="alert">
          <p className="room-image-upload__confirm-text mb-0">
            Remove this photo? The room board will show the placeholder until a new image is uploaded.
          </p>
          <div className="d-flex gap-2 mt-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={uploading}
              onClick={() => setConfirmRemove(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={uploading}
              onClick={() => void removeImage()}
            >
              {uploading ? 'Removing…' : 'Yes, remove photo'}
            </button>
          </div>
        </div>
      ) : null}
      {!compact ? (
        <p className="small text-muted mb-0 mt-2">
          JPG, PNG, or WebP · max 3 MB. Used on the front desk room board.
        </p>
      ) : (
        <p className="room-image-upload__hint mb-0 mt-2">JPG, PNG, WebP · max 3 MB</p>
      )}
    </div>
  );
}
