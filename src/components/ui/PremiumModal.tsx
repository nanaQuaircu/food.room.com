'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'default' | 'lg';
};

export default function PremiumModal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'default',
}: Props) {
  useEffect(() => {
    if (!open) return;

    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';

    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div className="modal-backdrop fade show" onClick={onClose} aria-hidden="true" />
      <div
        className="modal fade show d-block premium-modal"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="premium-modal-title"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <div
          className={`modal-dialog modal-dialog-centered${size === 'lg' ? ' modal-lg' : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="premium-modal-title">
                {title}
              </h5>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
            </div>
            <div className="modal-body">{children}</div>
            {footer ? <div className="modal-footer">{footer}</div> : null}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
