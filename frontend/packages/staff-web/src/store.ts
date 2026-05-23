import { create } from 'zustand';
import { jwtDecode } from 'jwt-decode';

interface User {
  sub: string;
  role: string;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  login: (accessToken: string, refreshToken: string) => void;
  updateToken: (accessToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const token = localStorage.getItem('staff_token');
  const refreshToken = localStorage.getItem('staff_refresh_token');
  let user = null;
  if (token) {
    try {
      user = jwtDecode<User>(token);
    } catch {
      localStorage.removeItem('staff_token');
      localStorage.removeItem('staff_refresh_token');
    }
  }

  return {
    token: user ? token : null,
    refreshToken: user ? refreshToken : null,
    user,
    login: (newToken: string, newRefreshToken: string) => {
      localStorage.setItem('staff_token', newToken);
      localStorage.setItem('staff_refresh_token', newRefreshToken);
      set({ token: newToken, refreshToken: newRefreshToken, user: jwtDecode<User>(newToken) });
    },
    updateToken: (newToken: string) => {
      localStorage.setItem('staff_token', newToken);
      set({ token: newToken, user: jwtDecode<User>(newToken) });
    },
    logout: () => {
      localStorage.removeItem('staff_token');
      localStorage.removeItem('staff_refresh_token');
      set({ token: null, refreshToken: null, user: null });
    },
  };
});
