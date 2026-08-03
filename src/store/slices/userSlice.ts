import type { StateCreator } from 'zustand';

export interface UserSlice {
  user: { id: string; username: string; avatar: string; isAdmin: boolean };
  authStatus: 'demo' | 'loading' | 'authenticated' | 'error';
  setUser: (user: Partial<UserSlice['user']>) => void;
  setAuthStatus: (status: UserSlice['authStatus']) => void;
}
export const createUserSlice: StateCreator<UserSlice, [], [], UserSlice> = (set) => ({
  user: { id: '', username: 'user', avatar: '', isAdmin: false },
  authStatus: 'demo',
  setUser: (user) => set((state) => ({ user: { ...state.user, ...user } })),
  setAuthStatus: (authStatus) => set({ authStatus }),
});
