'use client';

import PremiumModal from '@/components/ui/PremiumModal';

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Keep',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <PremiumModal
      open={open}
      title={title}
      onClose={busy ? () => undefined : onCancel}
      footer={
        <>
          <button
            type="button"
            className="btn btn-premium-outline"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-premium'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="mb-0 text-secondary">{message}</p>
    </PremiumModal>
  );
}
