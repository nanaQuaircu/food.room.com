'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

const P = '/palatin';

type Profile = {
  name: string;
  logo_url?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
};

const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.12 } },
};

const viewport = { once: true, margin: '-60px' };

/** Exact Palatin footer from index.html — hotel branding only. */
export default function GuestSiteFooter({
  slug,
  profile,
}: {
  slug: string;
  profile: Profile | null;
}) {
  const name = profile?.name || 'Hotel';
  const logo = profile?.logo_url || `${P}/img/core-img/logo.png`;
  const year = new Date().getFullYear();

  return (
    <footer className="footer-area">
      <div className="container">
        <motion.div
          className="row"
          initial="initial"
          whileInView="animate"
          viewport={viewport}
          variants={stagger}
        >
          {/* Brand column */}
          <div className="col-12 col-lg-5">
            <motion.div className="footer-widget-area mt-50" variants={fadeInUp} transition={{ duration: 0.6 }}>
              <Link href={`/${slug}`} className="d-block mb-5 guest-footer-brand">
                <motion.img
                  src={logo}
                  alt={name}
                  className="guest-footer-logo"
                  whileHover={{ scale: 1.05 }}
                  transition={{ duration: 0.2 }}
                />
              </Link>
              <p>
                {name}
                {profile?.address ? ` — ${profile.address}.` : '.'} Book rooms online and enjoy a
                seamless stay experience powered by our hotel property management system.
              </p>
            </motion.div>
          </div>

          {/* Map column */}
          <div className="col-12 col-md-6 col-lg-4">
            <motion.div className="footer-widget-area mt-50" variants={fadeInUp} transition={{ duration: 0.6 }}>
              <h6 className="widget-title mb-5">Find us on the map</h6>
              <motion.img
                src={`${P}/img/bg-img/footer-map.png`}
                alt=""
                whileHover={{ scale: 1.03 }}
                transition={{ duration: 0.3 }}
              />
            </motion.div>
          </div>

          {/* Newsletter column */}
          <div className="col-12 col-md-6 col-lg-3">
            <motion.div className="footer-widget-area mt-50" variants={fadeInUp} transition={{ duration: 0.6 }}>
              <h6 className="widget-title mb-5">Subscribe to our newsletter</h6>
              <form action="#" method="post" className="subscribe-form">
                <input
                  type="email"
                  name="subscribe-email"
                  id="subscribeemail"
                  placeholder="Your E-mail"
                />
                <motion.button
                  type="submit"
                  whileHover={{ scale: 1.05, backgroundColor: '#a86a52' }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ duration: 0.2 }}
                >
                  Subscribe
                </motion.button>
              </form>
            </motion.div>
          </div>

          {/* Copyright */}
          <div className="col-12">
            <motion.div
              className="copywrite-text mt-30"
              variants={fadeInUp}
              transition={{ duration: 0.5 }}
            >
              <p>
                Copyright &copy;{year} {name}. All rights reserved.
              </p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </footer>
  );
}
