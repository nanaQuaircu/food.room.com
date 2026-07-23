'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchApi } from '@/lib/client/fetch-api';
import { motion } from 'framer-motion';
import GuestPageHero from '@/components/guest/GuestPageHero';

const P = '/palatin';

type HotelProfile = {
  name: string;
  address: string | null;
  phone?: string | null;
  email?: string | null;
  stats?: {
    rooms: number;
    room_types: number;
    menu_items: number;
    stays: number;
  };
};

const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' as const } },
};

const fadeInLeft = {
  initial: { opacity: 0, x: -50 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.6, ease: 'easeOut' as const } },
};

const fadeInRight = {
  initial: { opacity: 0, x: 50 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.6, ease: 'easeOut' as const } },
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

/** Palatin about-us.html tailored with hotel profile. */
export default function GuestAboutModule({ slug }: { slug: string }) {
  const [profile, setProfile] = useState<HotelProfile | null>(null);

  const load = useCallback(async () => {
    const p = await fetchApi<HotelProfile>(`/api/public/${slug}`);
    if (p.success && p.data) setProfile(p.data);
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const name = profile?.name || 'Our Hotel';
  const stats = profile?.stats;
  const milestones = [
    {
      icon: 'icon-resort',
      value: stats?.rooms ?? 0,
      label: 'Rooms',
    },
    {
      icon: 'icon-swimming-pool',
      value: stats?.room_types ?? 0,
      label: 'Bookable rooms',
    },
    {
      icon: 'icon-restaurant',
      value: stats?.menu_items ?? 0,
      label: 'Menu items',
    },
    {
      icon: 'icon-cocktail-1',
      value: stats?.stays ?? 0,
      label: 'Stays booked',
    },
  ];

  return (
    <>
      <GuestPageHero title="About us" />

      <section className="about-us-area">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-12 col-lg-6">
              <motion.div
                className="about-text mb-100"
                initial="initial"
                whileInView="animate"
                viewport={{ once: true, margin: '-100px' }}
                variants={fadeInLeft}
              >
                <div className="section-heading">
                  <div className="line-" />
                  <h2>A place to remember</h2>
                </div>
                <p>
                  {name} is dedicated to hospitality excellence. Whether you are visiting for
                  business or leisure, our team ensures a comfortable stay with attentive service
                  and thoughtfully appointed rooms.
                </p>
                <Link href={`/${slug}/rooms`} className="btn palatin-btn mt-50">
                  View rooms
                </Link>
              </motion.div>
            </div>
            <div className="col-12 col-lg-6">
              <motion.div
                className="about-thumbnail mb-100"
                initial="initial"
                whileInView="animate"
                viewport={{ once: true, margin: '-100px' }}
                variants={fadeInRight}
              >
                <img
                  src={`${P}/img/bg-img/2.jpg`}
                  alt=""
                  style={{ borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                />
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      <section
        className="our-milestones section-padding-100-0 bg-img bg-overlay bg-fixed"
        style={{ backgroundImage: `url(${P}/img/bg-img/bg-4.jpg)` }}
      >
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-12 col-lg-8">
              <motion.div
                className="section-heading text-center white"
                initial="initial"
                whileInView="animate"
                viewport={{ once: true }}
                variants={fadeInUp}
              >
                <div className="line-" />
                <h2>Our Milestones</h2>
                <p>
                  Proudly serving guests with comfort and care
                  {profile?.address ? ` from ${profile.address}` : ''}.
                </p>
              </motion.div>
            </div>
          </div>
          <motion.div
            className="row"
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            {milestones.map((item) => (
              <div key={item.label} className="col-12 col-sm-6 col-lg-3">
                <motion.div
                  className="single-cool-fact mb-100"
                  variants={fadeInUp}
                  whileHover={{ scale: 1.05 }}
                >
                  <div className="scf-text">
                    <i className={item.icon} />
                    <h2>
                      <span className="counter">{item.value}</span>
                    </h2>
                    <p>{item.label}</p>
                  </div>
                </motion.div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="our-hotels-area section-padding-100-0">
        <div className="container">
          <div className="row">
            <div className="col-12">
              <motion.div
                className="section-heading text-center"
                initial="initial"
                whileInView="animate"
                viewport={{ once: true }}
                variants={fadeInUp}
              >
                <div className="line-" />
                <h2>Our Hotel</h2>
              </motion.div>
            </div>
          </div>
          <div className="row justify-content-center">
            {[
              { img: '3.jpg', lines: ['Comfortable rooms', 'Attentive front desk', 'Live online booking'] },
              { img: '10.jpg', lines: ['Restaurant dining', 'Room service options', 'Guest account trips'] },
              { img: '11.jpg', lines: ['Secure payments', 'Property amenities', 'Local hospitality'] },
            ].map((block, idx) => (
              <div key={block.img} className="col-12 col-md-6 col-lg-4">
                <motion.div
                  className="single-hotel-info mb-100"
                  variants={{
                    initial: { opacity: 0, y: 40 },
                    animate: {
                      opacity: 1,
                      y: 0,
                      transition: { duration: 0.6, ease: 'easeOut' as const },
                    },
                    hover: {
                      y: -12,
                      boxShadow: '0 20px 40px rgba(203, 134, 112, 0.18)',
                      borderColor: '#cb8670',
                      transition: { duration: 0.3, ease: 'easeInOut' as const },
                    },
                  }}
                  initial="initial"
                  whileInView="animate"
                  whileHover="hover"
                  viewport={{ once: true, margin: '-50px' }}
                  custom={idx}
                  style={{
                    background: '#fff',
                    borderRadius: '16px',
                    border: '1px solid #eaeaea',
                    padding: '30px 25px 25px',
                    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.03)',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    height: 'calc(100% - 100px)',
                  }}
                >
                  <div className="hotel-info-text" style={{ flexGrow: 1, marginBottom: '25px' }}>
                    {block.lines.map((line) => (
                      <h6
                        key={line}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          fontSize: '15px',
                          color: '#2e2e2e',
                          margin: '0 0 15px 0',
                        }}
                      >
                        <motion.span
                          className="fa fa-check"
                          variants={{
                            hover: {
                              scale: 1.2,
                              backgroundColor: '#232323',
                              color: '#cb8670',
                              rotate: 360,
                              transition: { duration: 0.3 },
                            },
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '26px',
                            height: '26px',
                            borderRadius: '50%',
                            backgroundColor: '#cb8670',
                            color: '#ffffff',
                            fontSize: '11px',
                            marginRight: '12px',
                            flexShrink: 0,
                          }}
                        />
                        {line}
                      </h6>
                    ))}
                  </div>
                  <div
                    className="hotel-img"
                    style={{
                      overflow: 'hidden',
                      borderRadius: '10px',
                      width: '100%',
                      height: '240px',
                    }}
                  >
                    <motion.img
                      src={`${P}/img/bg-img/${block.img}`}
                      alt=""
                      variants={{
                        hover: {
                          scale: 1.08,
                          transition: { duration: 0.4, ease: 'easeOut' as const },
                        },
                      }}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  </div>
                </motion.div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
