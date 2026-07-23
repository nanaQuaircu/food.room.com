'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import PremiumModal from '@/components/ui/PremiumModal';

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger' | 'warning';
};

type ConfirmState = ConfirmOptions & {
  open: boolean;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

const defaultState: ConfirmState = {
  open: false,
  title: '',
  message: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  tone: 'default',
};

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState>(defaultState);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const close = useCallback((result: boolean) => {
    setState((prev) => ({ ...prev, open: false }));
    resolverRef.current?.(result);
    resolverRef.current = null;
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({
        open: true,
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? 'Confirm',
        cancelLabel: options.cancelLabel ?? 'Cancel',
        tone: options.tone ?? 'default',
      });
    });
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  const confirmButtonClass =
    state.tone === 'danger'
      ? 'btn btn-danger btn-sm'
      : state.tone === 'warning'
        ? 'btn btn-warning btn-sm'
        : 'btn btn-premium btn-sm';

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <PremiumModal
        open={state.open}
        title={state.title}
        onClose={() => close(false)}
        footer={
          <>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => close(false)}>
              {state.cancelLabel}
            </button>
            <button type="button" className={confirmButtonClass} onClick={() => close(true)}>
              {state.confirmLabel}
            </button>
          </>
        }
      >
        <p className="mb-0 text-secondary">{state.message}</p>
      </PremiumModal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return ctx.confirm;
}
