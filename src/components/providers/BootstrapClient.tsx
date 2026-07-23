'use client';

import { useEffect } from 'react';

export default function BootstrapClient() {
  useEffect(() => {
    void import('bootstrap');
  }, []);

  return null;
}
