'use client';

import { useRef, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';

export type GalleryImage = {
  id: number;
  image_url: string;
  sort_order?: number;
};

type Props = {
  roomId: number;
  coverUrl?: string | null;
  images: GalleryImage[];
  onChange: (images: GalleryImage[], coverUrl: string | null) => void;
};

function withCacheBust(url: string) {
  if (!url) return url;
  if (url.includes('?v=')) return url;
  return `${url}?v=${Date.now()}`;
}

export default function RoomGalleryUpload({ roomId, coverUrl, images, onChange }: Props) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length) {
      toast.warning('Invalid file', 'Please choose JPG, PNG, or WebP images.');
      return;
    }
    if (images.length + list.length > 8) {
      toast.warning('Photo limit', 'You can add up to 8 photos per room.');
      return;
    }

    setUploading(true);
    try {
      let nextImages = [...images];
      let nextCover = coverUrl ?? null;
      for (const file of list) {
        if (file.size > 3 * 1024 * 1024) {
          toast.warning('Too large', `${file.name} must be 3 MB or smaller.`);
          continue;
        }
        const body = new FormData();
        body.append('image', file);
        body.append('room_id', String(roomId));
        body.append('gallery', '1');
        const res = await fetch('/api/rooms/image', { method: 'POST', body });
        const json = (await res.json()) as {
          success: boolean;
          message?: string;
          data?: { images?: GalleryImage[]; image?: GalleryImage };
        };
        if (!json.success) {
          toast.error('Upload failed', json.message);
          continue;
        }
        if (json.data?.images) {
          nextImages = json.data.images.map((img) => ({
            ...img,
            image_url: withCacheBust(img.image_url),
          }));
        } else if (json.data?.image) {
          nextImages = [...nextImages, { ...json.data.image, image_url: withCacheBust(json.data.image.image_url) }];
        }
        if (!nextCover && nextImages[0]) nextCover = nextImages[0].image_url;
      }
      onChange(nextImages, nextCover);
      toast.success('Photos updated');
    } catch {
      toast.error('Upload failed', 'Unable to reach the server.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function removeImage(imageId: number) {
    setUploading(true);
    try {
      const res = await fetch(`/api/rooms/image?image_id=${imageId}`, { method: 'DELETE' });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        data?: { images?: GalleryImage[]; room_id?: number };
      };
      if (!json.success) {
        toast.error('Remove failed', json.message);
        return;
      }
      const next = (json.data?.images || []).map((img) => ({
        ...img,
        image_url: withCacheBust(img.image_url),
      }));
      onChange(next, next[0]?.image_url ?? null);
      toast.success('Photo removed');
    } catch {
      toast.error('Remove failed');
    } finally {
      setUploading(false);
    }
  }

  async function setCover(imageId: number) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('room_id', String(roomId));
      body.append('cover_image_id', String(imageId));
      const res = await fetch('/api/rooms/image', { method: 'POST', body });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        data?: { image_url?: string };
      };
      if (!json.success) {
        toast.error('Could not set cover', json.message);
        return;
      }
      onChange(images, json.data?.image_url ? withCacheBust(json.data.image_url) : coverUrl ?? null);
      toast.success('Cover photo set');
    } catch {
      toast.error('Could not set cover');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="room-gallery-upload">
      <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
        <div>
          <label className="form-label mb-0">Room photos</label>
          <p className="text-muted small mb-0">Up to 8 photos · shown on the guest website</p>
        </div>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          disabled={uploading || images.length >= 8}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Uploading…' : 'Add photos'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void uploadFiles(e.target.files);
          }}
        />
      </div>

      {images.length === 0 ? (
        <div className="room-gallery-upload__empty">No photos yet. Add photos guests will see when they open this room.</div>
      ) : (
        <div className="room-gallery-upload__grid">
          {images.map((img) => {
            const isCover =
              coverUrl &&
              (coverUrl === img.image_url || coverUrl.split('?')[0] === img.image_url.split('?')[0]);
            return (
              <div key={img.id} className={`room-gallery-upload__item${isCover ? ' is-cover' : ''}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.image_url} alt="" />
                <div className="room-gallery-upload__actions">
                  {!isCover ? (
                    <button type="button" disabled={uploading} onClick={() => void setCover(img.id)}>
                      Set cover
                    </button>
                  ) : (
                    <span>Cover</span>
                  )}
                  <button type="button" disabled={uploading} onClick={() => void removeImage(img.id)}>
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .room-gallery-upload__empty {
          border: 1px dashed #d7d0c8;
          border-radius: 12px;
          padding: 1rem;
          color: #8a8178;
          font-size: 0.85rem;
          background: #faf8f6;
        }
        .room-gallery-upload__grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
          gap: 0.65rem;
        }
        .room-gallery-upload__item {
          position: relative;
          border-radius: 12px;
          overflow: hidden;
          border: 2px solid transparent;
          background: #eee;
          aspect-ratio: 4 / 3;
        }
        .room-gallery-upload__item.is-cover {
          border-color: #1f3a63;
        }
        .room-gallery-upload__item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .room-gallery-upload__actions {
          position: absolute;
          inset: auto 0 0 0;
          display: flex;
          gap: 0.25rem;
          padding: 0.35rem;
          background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
        }
        .room-gallery-upload__actions button,
        .room-gallery-upload__actions span {
          flex: 1;
          border: none;
          border-radius: 6px;
          font-size: 0.65rem;
          font-weight: 700;
          padding: 0.25rem 0.2rem;
          background: rgba(255, 255, 255, 0.92);
          color: #1a1a1a;
          cursor: pointer;
        }
        .room-gallery-upload__actions span {
          text-align: center;
          background: #1f3a63;
          color: #fff;
          cursor: default;
        }
      `}</style>
    </div>
  );
}
