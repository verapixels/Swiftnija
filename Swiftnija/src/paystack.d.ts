// src/types/paystack.d.ts
// Single source of truth for the Paystack global — no conflicts

interface PaystackPopOptions {
  key: string;
  email: string;
  amount: number;
  currency?: string;
  ref?: string;
  metadata?: Record<string, unknown>;
  subaccount?: string;
  onSuccess: (transaction: { reference: string }) => void;
  onCancel: () => void;
}

interface PaystackPopHandler {
  openIframe(): void;
}

interface PaystackPopStatic {
  setup(opts: PaystackPopOptions): PaystackPopHandler;
}

declare global {
  interface Window {
    PaystackPop: PaystackPopStatic;
  }
}

export {};