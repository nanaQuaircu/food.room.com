'use client';

import { useEffect, useState } from 'react';

const HOTEL_SLIDES = [
  { src: '/assets/images/hotels/hotel-1.jpg', caption: 'Luxury lobby & reception' },
  { src: '/assets/images/hotels/hotel-2.jpg', caption: 'Premium guest suites' },
  { src: '/assets/images/hotels/hotel-3.jpg', caption: 'World-class hospitality' },
  { src: '/assets/images/hotels/hotel-4.jpg', caption: 'Resort & leisure' },
  { src: '/assets/images/hotels/hotel-5.jpg', caption: 'Modern property management' },
];

const INTERVAL_MS = 5000;

export default function LoginHotelSlideshow() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActive((i) => (i + 1) % HOTEL_SLIDES.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="login-hero__slideshow" aria-hidden="true">
      {HOTEL_SLIDES.map((slide, index) => (
        <div
          key={slide.src}
          className={`login-hero__slide${index === active ? ' is-active' : ''}`}
          style={{ backgroundImage: `url(${slide.src})` }}
        />
      ))}
      <div className="login-hero__slideshow-overlay" />
      <div className="login-hero__slide-dots">
        {HOTEL_SLIDES.map((slide, index) => (
          <button
            key={slide.src}
            type="button"
            className={`login-hero__slide-dot${index === active ? ' is-active' : ''}`}
            onClick={() => setActive(index)}
            aria-label={slide.caption}
          />
        ))}
      </div>
    </div>
  );
}
