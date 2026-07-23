'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export type Toast = {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
};

type ToastInput = {
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
};

type ToastContextValue = {
  showToast: (input: ToastInput) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastType, string> = {
  success: 'bi-check-circle-fill',
  error: 'bi-x-circle-fill',
  warning: 'bi-exclamation-triangle-fill',
  info: 'bi-info-circle-fill',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  return (
    <div
      className={`app-toast app-toast--${toast.type}`}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className="app-toast__icon">
        <i className={`bi ${ICONS[toast.type]}`} aria-hidden="true" />
      </div>
      <div className="app-toast__body">
        <div className="app-toast__title">{toast.title}</div>
        {toast.message ? <div className="app-toast__message">{toast.message}</div> : null}
      </div>
      <button
        type="button"
        className="app-toast__close"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
      >
        <i className="bi bi-x-lg" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, title, message, duration = 4500 }: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [...current, { id, type, title, message }]);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      showToast,
      success: (title, message) => showToast({ type: 'success', title, message }),
      error: (title, message) => showToast({ type: 'error', title, message }),
      warning: (title, message) => showToast({ type: 'warning', title, message }),
      info: (title, message) => showToast({ type: 'info', title, message }),
    }),
    [showToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div className="app-toast-stack" aria-label="Notifications">
              {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
              ))}
            </div>,
            document.body
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
