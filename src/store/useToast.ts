import { create } from 'zustand';

/**
 * The app's one way of saying "that didn't work".
 *
 * Built because every photo upload in the app failed SILENTLY: the server does
 * reject bad files properly, but the eight client handlers had no catch between
 * them, so a rejected upload just stopped the spinner and said nothing. The
 * alternative was eight separate inline error slots, each screen deciding where
 * the text goes — this is one place instead.
 *
 * Deliberately NOT a general notification system. Success is already visible in
 * this app (the photo appears, the field turns purple), so a toast that says
 * "Saved!" is noise. This is for the case where something you asked for did not
 * happen and nothing on screen would otherwise tell you.
 */
export type ToastTone = 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

// Monotonic, so a React key is never reused even if two land in the same ms.
let nextId = 1;

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  show: (message, tone = 'error') => {
    const id = nextId++;
    set((s) => ({
      // Bursts are real here: a multi-file upload can reject several at once,
      // and one identical line repeated five times is worse than one line.
      toasts: s.toasts.some((t) => t.message === message)
        ? s.toasts
        : [...s.toasts, { id, message, tone }],
    }));
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Call from anywhere, including outside React. */
export const toast = (message: string, tone: ToastTone = 'error') =>
  useToast.getState().show(message, tone);
