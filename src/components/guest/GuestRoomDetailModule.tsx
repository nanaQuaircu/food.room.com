'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchApi } from '@/lib/client/fetch-api';
import { formatGuestMoney } from '@/lib/guest/format-money';
import { formatDisplayDate } from '@/lib/dates/format-display-date';
import GuestPageHero from '@/components/guest/GuestPageHero';
import { amenityLabel } from '@/lib/rooms/amenities';

const fadeInUp = {
  initial: { opacity: 0, y: 35 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' as const } },
};

const stagger = { animate: { transition: { staggerChildren: 0.1 } } };
const viewport = { once: true, margin: '-50px' };

const ASSET = '/palatin';
const PLACEHOLDER = `${ASSET}/img/bg-img/1.jpg`;

type RoomType = {
  id: number;
  name: string;
  description: string | null;
  base_rate: number;
  max_occupancy: number;
  image_url: string | null;
};

type RoomImage = { id: number; image_url: string };

type AvailableRoom = {
  id: number;
  room_number: string;
  floor: string | null;
  status: string;
  image_url: string | null;
  description: string | null;
  amenities?: string[];
  bed_type?: string | null;
  size_sqm?: number | null;
  images?: RoomImage[];
  base_rate: number;
  max_occupancy: number;
};

type RoomDetails = AvailableRoom & {
  room_type_name?: string;
  amenities: string[];
  images: RoomImage[];
};

type HotelProfile = {
  name: string;
  currency: string;
  address: string | null;
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function statusLabel(status: string) {
  if (status === 'vacant' || status === 'clean' || status === 'inspected') return 'Ready for your stay';
  return 'Available';
}

export default function GuestRoomDetailModule({
  slug,
  roomTypeId,
  initialRoomType = null,
  initialRooms = [],
  initialRoomDetails = null,
  initialProfile = null,
  initialCheckIn,
  initialCheckOut,
}: {
  slug: string;
  roomTypeId: number;
  initialRoomType?: RoomType | null;
  initialRooms?: AvailableRoom[];
  initialRoomDetails?: RoomDetails | null;
  initialProfile?: HotelProfile | null;
  initialCheckIn?: string;
  initialCheckOut?: string;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const seeded = useRef(Boolean(initialRoomType));

  const [roomType, setRoomType] = useState<RoomType | null>(initialRoomType);
  const [rooms, setRooms] = useState<AvailableRoom[]>(initialRooms);
  const [profile, setProfile] = useState<HotelProfile | null>(initialProfile);
  const [checkIn, setCheckIn] = useState(
    () => initialCheckIn || search.get('check_in') || todayIso()
  );
  const [checkOut, setCheckOut] = useState(
    () => initialCheckOut || search.get('check_out') || addDaysIso(todayIso(), 2)
  );
  const [adults] = useState(Math.max(1, Number(search.get('adults') || 2)));
  const [children] = useState(Math.max(0, Number(search.get('children') || 0)));
  const preferredRoomId = Number(search.get('room_id') || 0) || null;
  const [loading, setLoading] = useState(!initialRoomType);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomDetails, setRoomDetails] = useState<RoomDetails | null>(initialRoomDetails);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [reviews, setReviews] = useState<
    Array<{ id: number; rating: number; comment: string | null; guest_name: string; created_at: string }>
  >([]);

  useEffect(() => {
    if (!preferredRoomId) {
      setRoomDetails(null);
      return;
    }
    if (initialRoomDetails?.id === preferredRoomId) {
      setRoomDetails(initialRoomDetails);
      return;
    }
    void fetchApi<RoomDetails>(`/api/public/${slug}/rooms/${preferredRoomId}`, {
      skipCache: true,
    }).then((res) => {
      if (res.success && res.data) {
        setRoomDetails(res.data);
        setGalleryIndex(0);
      }
    });
  }, [slug, preferredRoomId, initialRoomDetails]);

  const load = useCallback(async () => {
    if (!checkIn || !checkOut) return;
    setRoomsLoading(true);
    setError(null);
    try {
      const [roomsRes, profileRes] = await Promise.all([
        fetchApi<{ room_type: RoomType; rooms: AvailableRoom[] }>(
          `/api/public/${slug}/room-types/${roomTypeId}/rooms?check_in=${checkIn}&check_out=${checkOut}`
        ),
        fetchApi<HotelProfile>(`/api/public/${slug}`),
      ]);
      if (profileRes.success && profileRes.data) setProfile(profileRes.data);
      if (roomsRes.success && roomsRes.data) {
        setRoomType(roomsRes.data.room_type);
        setRooms(roomsRes.data.rooms);
      } else {
        setRooms([]);
        setError(roomsRes.message || 'Could not load available rooms.');
      }
    } catch {
      setRooms([]);
      setError('Could not load available rooms.');
    } finally {
      setLoading(false);
      setRoomsLoading(false);
    }
  }, [slug, roomTypeId, checkIn, checkOut]);

  useEffect(() => {
    if (seeded.current) {
      seeded.current = false;
      setLoading(false);
      return;
    }
    void load();
  }, [load]);

  // Save search state for "Continue Booking" feature
  useEffect(() => {
    if (roomType) {
      try {
        localStorage.setItem(`guest-saved-search:${slug}`, JSON.stringify({
          roomTypeId: roomType.id,
          roomTypeName: roomType.name,
          checkIn,
          checkOut,
          adults,
          children
        }));
      } catch {
        // ignore
      }
    }
  }, [roomType, checkIn, checkOut, adults, children, slug]);

  useEffect(() => {
    void fetchApi<
      Array<{ id: number; rating: number; comment: string | null; guest_name: string; created_at: string }>
    >(`/api/public/${slug}/reviews?room_type_id=${roomTypeId}`).then((res) => {
      if (res.success && res.data) setReviews(res.data);
    });
  }, [slug, roomTypeId]);

  if (loading && !roomType) {
    return <p className="guest-loading">Loading room…</p>;
  }

  if (!roomType) {
    return <p className="guest-empty">Room type not found.</p>;
  }

  const currency = profile?.currency || 'GHS';
  const preferredRoom = preferredRoomId
    ? rooms.find((r) => r.id === preferredRoomId) ?? null
    : null;
  const displayTitle = preferredRoom || roomDetails
    ? `Room ${(preferredRoom || roomDetails)!.room_number}`
    : roomType.name;
  const typeAsLabel =
    (preferredRoom || roomDetails) &&
    roomType.name.trim().toLowerCase() !==
      `room ${(preferredRoom || roomDetails)!.room_number}`.toLowerCase()
      ? roomType.name
      : null;
  const orderedRooms = preferredRoom
    ? [preferredRoom, ...rooms.filter((r) => r.id !== preferredRoom.id)]
    : rooms;

  const focusRoom = roomDetails || preferredRoom;
  const galleryImages: string[] = (() => {
    const fromDetails = roomDetails?.images?.map((i) => i.image_url).filter(Boolean) || [];
    if (fromDetails.length) return fromDetails;
    const fromAvail = preferredRoom?.images?.map((i) => i.image_url).filter(Boolean) || [];
    if (fromAvail.length) return fromAvail;
    const single =
      focusRoom?.image_url || roomType.image_url || PLACEHOLDER;
    return [single];
  })();
  const activeImage = galleryImages[Math.min(galleryIndex, galleryImages.length - 1)] || PLACEHOLDER;
  const roomDescription =
    focusRoom?.description ||
    roomDetails?.description ||
    roomType.description ||
    `A comfortable stay for up to ${roomType.max_occupancy} guests, with thoughtful amenities for a restful stay.`;
  const amenities = roomDetails?.amenities?.length
    ? roomDetails.amenities
    : preferredRoom?.amenities || [];
  const bedType = roomDetails?.bed_type || preferredRoom?.bed_type || null;
  const sizeSqm = roomDetails?.size_sqm ?? preferredRoom?.size_sqm ?? null;

  function bookHref(room?: AvailableRoom) {
    const q = new URLSearchParams({
      room_type_id: String(roomTypeId),
      check_in: checkIn,
      check_out: checkOut,
      adults: String(adults),
      children: String(children),
    });
    if (room) {
      q.set('room_id', String(room.id));
      q.set('room_number', room.room_number);
    }
    return `/${slug}/book?${q.toString()}`;
  }

  return (
    <>
      <GuestPageHero title={displayTitle} />

      <motion.div
        className="guest-detail-body"
        initial="initial"
        animate="animate"
        variants={stagger}
      >
        <motion.button
          type="button"
          className="btn palatin-btn btn-3 mb-3"
          onClick={() => router.push(`/${slug}/rooms`)}
          variants={fadeInUp}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
        >
          ← Back to rooms
        </motion.button>

        <motion.p className="guest-section__eyebrow" style={{ textAlign: 'left' }} variants={fadeInUp}>
          Your stay
        </motion.p>
        <motion.h1 style={{ marginBottom: '0.5rem' }} variants={fadeInUp}>{displayTitle}</motion.h1>
        <motion.p className="guest-muted mb-3" variants={fadeInUp}>
          {typeAsLabel ? `${typeAsLabel} · ` : ''}
          {profile?.address || profile?.name || 'Hotel'}
        </motion.p>

        <motion.div className="guest-room-gallery mb-4" variants={fadeInUp}>
          <div className="guest-room-gallery__main">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activeImage} alt={displayTitle} />
            {galleryImages.length > 1 ? (
              <>
                <button
                  type="button"
                  className="guest-room-gallery__nav guest-room-gallery__nav--prev"
                  aria-label="Previous photo"
                  onClick={() =>
                    setGalleryIndex((i) => (i - 1 + galleryImages.length) % galleryImages.length)
                  }
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="guest-room-gallery__nav guest-room-gallery__nav--next"
                  aria-label="Next photo"
                  onClick={() => setGalleryIndex((i) => (i + 1) % galleryImages.length)}
                >
                  ›
                </button>
              </>
            ) : null}
          </div>
          {galleryImages.length > 1 ? (
            <div className="guest-room-gallery__thumbs">
              {galleryImages.map((src, idx) => (
                <button
                  key={`${src}-${idx}`}
                  type="button"
                  className={`guest-room-gallery__thumb${idx === galleryIndex ? ' is-active' : ''}`}
                  onClick={() => setGalleryIndex(idx)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          ) : null}
        </motion.div>

        <motion.p style={{ lineHeight: 1.7, marginBottom: '1.25rem' }} variants={fadeInUp}>
          {roomDescription}
        </motion.p>

        <motion.div
          className="d-flex flex-wrap gap-3 mb-3"
          variants={fadeInUp}
          style={{ fontSize: '0.9rem', color: '#5c4a40' }}
        >
          <span>Up to {focusRoom?.max_occupancy || roomType.max_occupancy} guests</span>
          {bedType ? (
            <>
              <span aria-hidden>·</span>
              <span>{bedType} bed</span>
            </>
          ) : null}
          {sizeSqm ? (
            <>
              <span aria-hidden>·</span>
              <span>{sizeSqm} m²</span>
            </>
          ) : null}
          <span aria-hidden>·</span>
          <span>Instant confirmation</span>
        </motion.div>

        {amenities.length > 0 ? (
          <motion.div className="guest-room-amenities mb-4" variants={fadeInUp}>
            <h5 className="mb-2">Room amenities</h5>
            <ul className="guest-room-amenities__list">
              {amenities.map((key) => (
                <li key={key}>{amenityLabel(key)}</li>
              ))}
            </ul>
          </motion.div>
        ) : null}

        <motion.p style={{ color: '#cb8670', fontWeight: 700, fontSize: '1.35rem', marginBottom: '1.5rem' }} variants={fadeInUp}>
          From {formatGuestMoney(focusRoom?.base_rate ?? roomType.base_rate, currency)}
          <span className="guest-muted" style={{ fontWeight: 500, fontSize: '0.95rem' }}>
            {' '}
            / night
          </span>
        </motion.p>

        <div className="guest-panel mb-4">
          <h5 className="mb-3">When are you staying?</h5>
          <div className="row g-3 align-items-end">
            <div className="col-md-4">
              <label className="form-label" htmlFor="detail-check-in">
                Check in
              </label>
              <input
                id="detail-check-in"
                className="form-control"
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="detail-check-out">
                Check out
              </label>
              <input
                id="detail-check-out"
                className="form-control"
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
              />
            </div>
            <div className="col-md-4">
              <button
                type="button"
                className="btn palatin-btn w-100"
                onClick={() => void load()}
                disabled={roomsLoading}
              >
                {roomsLoading ? 'Checking…' : 'Check availability'}
              </button>
            </div>
          </div>
        </div>

        {error ? <p className="text-danger mb-3">{error}</p> : null}

        {roomsLoading ? (
          <p className="guest-loading">Checking availability…</p>
        ) : rooms.length === 0 ? (
          <div className="guest-panel mb-4">
            <h5 className="mb-2">Not available for these dates</h5>
            <p className="guest-muted mb-0">
              Try different dates, or browse other rooms — this category is fully booked for your selected stay.
            </p>
          </div>
        ) : (
          <>
            <motion.div className="guest-panel mb-4" variants={fadeInUp}>
              <h5 className="mb-2">Ready to book</h5>
              <p className="guest-muted mb-3">
                {rooms.length} option{rooms.length === 1 ? '' : 's'} available for{' '}
                {formatDisplayDate(checkIn)} to {formatDisplayDate(checkOut)}.
                {preferredRoom
                  ? ` Continue to reserve Room ${preferredRoom.room_number}.`
                  : " Continue to reserve — we'll assign the best available unit for your stay."}
              </p>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} style={{ display: 'inline-block' }}>
                <Link href={bookHref(preferredRoom ?? undefined)} className="btn palatin-btn">
                  Book {preferredRoom ? `Room ${preferredRoom.room_number}` : roomType.name}
                </Link>
              </motion.div>
            </motion.div>

            <h5 className="mb-2">Prefer a specific room?</h5>
            <p className="guest-muted mb-3">
              Optional — pick a preferred room number if you have one in mind. Otherwise we&apos;ll assign one at check-in.
            </p>

            <motion.div
              className="guest-room-list"
              initial="initial"
              whileInView="animate"
              viewport={viewport}
              variants={stagger}
            >
              <AnimatePresence>
                {orderedRooms.map((room, idx) => {
                  const img = room.image_url || roomType.image_url || PLACEHOLDER;
                  return (
                    <motion.article
                      key={room.id}
                      className="guest-room-list__row"
                      variants={fadeInUp}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.07, duration: 0.45, ease: 'easeOut' }}
                      whileHover={{ x: 4, boxShadow: '0 6px 24px rgba(203,134,112,0.15)' }}
                    >
                      <div className="guest-room-list__media" style={{ backgroundImage: `url(${img})` }} />
                      <div className="guest-room-list__main">
                        <h5>Room {room.room_number}</h5>
                        <p>
                          {room.floor ? `Floor ${room.floor}` : 'Hotel floor'}
                          {' · '}
                          {statusLabel(room.status)}
                          {' · '}
                          Sleeps {room.max_occupancy}
                        </p>
                      </div>
                      <div className="guest-room-list__rate">
                        <strong>{formatGuestMoney(room.base_rate, currency)}</strong>
                        <span>/ night</span>
                      </div>
                      <div className="guest-room-list__action">
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }}>
                          <Link href={bookHref(room)} className="btn palatin-btn btn-3">
                            Select
                          </Link>
                        </motion.div>
                      </div>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          </>
        )}
      </motion.div>

      {reviews.length > 0 ? (
        <motion.section
          className="container py-5"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h3 className="mb-4">Guest reviews</h3>
          <div className="row g-3">
            {reviews.slice(0, 6).map((review) => (
              <div key={review.id} className="col-md-6">
                <div className="guest-panel h-100">
                  <div className="d-flex justify-content-between mb-2">
                    <strong>{review.guest_name}</strong>
                    <span style={{ color: '#cb8670' }}>{'★'.repeat(review.rating)}</span>
                  </div>
                  {review.comment ? <p className="mb-0 small">{review.comment}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      ) : null}
      <style>{`
        .guest-room-gallery__main {
          position: relative;
          border-radius: 18px;
          overflow: hidden;
          aspect-ratio: 16 / 10;
          background: #ddd;
        }
        .guest-room-gallery__main img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .guest-room-gallery__nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 40px;
          height: 40px;
          border: none;
          border-radius: 50%;
          background: rgba(255,255,255,0.92);
          color: #1a1a1a;
          font-size: 1.5rem;
          line-height: 1;
          cursor: pointer;
          box-shadow: 0 6px 16px rgba(0,0,0,0.15);
        }
        .guest-room-gallery__nav--prev { left: 12px; }
        .guest-room-gallery__nav--next { right: 12px; }
        .guest-room-gallery__thumbs {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.65rem;
          overflow-x: auto;
          padding-bottom: 0.25rem;
        }
        .guest-room-gallery__thumb {
          flex: 0 0 72px;
          height: 54px;
          border: 2px solid transparent;
          border-radius: 10px;
          overflow: hidden;
          padding: 0;
          background: #eee;
          cursor: pointer;
        }
        .guest-room-gallery__thumb.is-active { border-color: #cb8670; }
        .guest-room-gallery__thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .guest-room-amenities__list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 0.45rem 1rem;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .guest-room-amenities__list li {
          position: relative;
          padding-left: 1.1rem;
          color: #5c4a40;
          font-size: 0.92rem;
        }
        .guest-room-amenities__list li::before {
          content: '✓';
          position: absolute;
          left: 0;
          color: #cb8670;
          font-weight: 700;
        }
      `}</style>
    </>
  );
}
