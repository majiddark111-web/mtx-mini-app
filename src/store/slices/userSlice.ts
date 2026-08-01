import type { StateCreator } from 'zustand';

export interface UserSlice {
  user: { id: string; username: string; avatar: string; isAdmin: boolean };
  setUser: (user: Partial<UserSlice['user']>) => void;
}
export const createUserSlice: StateCreator<UserSlice, [], [], UserSlice> = (set) => ({
  user: { id: '', username: 'user', avatar: '', isAdmin: false },
  setUser: (user) => set((state) => ({ user: { ...state.user, ...user } })),
});
