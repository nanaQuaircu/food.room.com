'use client';

import { useRef, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';

type Props = {
  imageUrl?: string | null;
  onUpdated: (imageUrl: string | null) => void;
};

export default function MenuImageUpload({ imageUrl, onUpdated }: Props) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.warning('Invalid file', 'Please choose a JPG, PNG, or WebP image.');
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('image', file);
      const res = await fetch('/api/restaurant/image', { method: 'POST', body });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        data?: { image_url: string };
      };
      if (!json.success || !json.data?.image_url) {
        toast.error('Upload failed', json.message);
        return;
      }
      toast.success('Photo uploaded');
      onUpdated(json.data.image_url);
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', display: 'block' }}>
        Item photo
      </label>
      <div className="d-flex align-items-center gap-3 mt-1 flex-wrap">
        <div
          style={{
            width: 112,
            height: 84,
            borderRadius: 10,
            overflow: 'hidden',
            background: '#f3f4f6',
            border: '1px solid #e5e7eb',
            flexShrink: 0,
          }}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="Menu item"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div
              className="d-flex align-items-center justify-content-center h-100 text-muted"
              style={{ fontSize: '0.75rem' }}
            >
              No photo
            </div>
          )}
        </div>
        <div>
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
          <div className="d-flex gap-2 flex-wrap">
            <button
              type="button"
              className="btn btn-sm btn-premium"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? 'Uploading…' : imageUrl ? 'Replace photo' : 'Upload photo'}
            </button>
            {imageUrl ? (
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                disabled={uploading}
                onClick={() => onUpdated(null)}
              >
                Remove
              </button>
            ) : null}
          </div>
          <p className="small text-muted mb-0 mt-2">JPG, PNG, or WebP · max 3 MB</p>
        </div>
      </div>
    </div>
  );
}
