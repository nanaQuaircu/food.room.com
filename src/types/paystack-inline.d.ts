export {};

declare global {
  interface PaystackPopupOptions {
    key: string;
    email: string;
    amount: number;
    ref: string;
    currency?: string;
    metadata?: Record<string, unknown>;
    onClose?: () => void;
    callback: (response: { reference: string; trans?: string; status?: string }) => void;
  }

  interface PaystackPopupHandler {
    openIframe: () => void;
  }

  interface Window {
    PaystackPop?: {
      setup: (options: PaystackPopupOptions) => PaystackPopupHandler;
    };
  }
}
