import { create } from 'zustand';
import { api } from '../lib/api';

interface User {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  creatorName: string | null;
  socialLinks: Record<string, string>;
  profilePhotoUrl: string | null;
  profilePhotoFilename: string | null;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  // Set true when an authed request 401s mid-session (cookie lapsed). Drives the
  // "your session expired" notice on the login screen; cleared on next login.
  sessionExpired: boolean;
  handleSessionExpired: () => void;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (data: { displayName?: string; creatorName?: string | null; socialLinks?: Record<string, string> }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  uploadProfilePhoto: (formData: FormData) => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  sessionExpired: false,

  // Called by api.ts (via setUnauthorizedHandler) on any 401 from an authed
  // endpoint. Clearing `user` makes App's guard redirect to /login; the flag
  // tells the login screen to explain why. Idempotent (safe if already null).
  handleSessionExpired: () => {
    if (get().user) set({ user: null, sessionExpired: true });
  },

  init: async () => {
    try {
      const user = await api.me();
      set({ user, isLoading: false });
    } catch {
      set({ user: null, isLoading: false });
    }
  },

  login: async (email, password) => {
    await api.login(email, password);
    const user = await api.me();
    set({ user, sessionExpired: false });
  },

  register: async (email, password, displayName) => {
    const { id, email: e, displayName: dn } = await api.register(email, password, displayName);
    set({ user: { id, email: e, displayName: dn, emailVerified: false, creatorName: null, socialLinks: {}, profilePhotoUrl: null, profilePhotoFilename: null } });
  },

  logout: async () => {
    await api.logout();
    set({ user: null });
  },

  refreshUser: async () => {
    try {
      const user = await api.me();
      set({ user });
    } catch { /* ignore — leave existing state */ }
  },

  updateProfile: async (data) => {
    await api.updateProfile(data);
    const current = get().user;
    if (!current) return;
    set({
      user: {
        ...current,
        ...(data.displayName !== undefined && { displayName: data.displayName }),
        ...(data.creatorName !== undefined && { creatorName: data.creatorName ?? null }),
        ...(data.socialLinks !== undefined && { socialLinks: data.socialLinks }),
      },
    });
  },

  changePassword: async (currentPassword, newPassword) => {
    await api.changePassword(currentPassword, newPassword);
  },

  uploadProfilePhoto: async (formData) => {
    const { profilePhotoUrl, profilePhotoFilename } = await api.uploadProfilePhoto(formData);
    const current = get().user;
    if (!current) return;
    set({ user: { ...current, profilePhotoUrl, profilePhotoFilename } });
  },
}));
