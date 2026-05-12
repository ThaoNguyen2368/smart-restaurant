import { create } from 'zustand';
import { jwtDecode } from 'jwt-decode';

interface User {
  sub: string;
  role: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  login: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const token = localStorage.getItem('admin_token');
  let user = null;
  if (token) {
    try {
      user = jwtDecode<User>(token);
    } catch {
      localStorage.removeItem('admin_token');
    }
  }

  return {
    token: user ? token : null,
    user,
    login: (newToken: string) => {
      localStorage.setItem('admin_token', newToken);
      set({ token: newToken, user: jwtDecode<User>(newToken) });
    },
    logout: () => {
      localStorage.removeItem('admin_token');
      set({ token: null, user: null });
    },
  };
});
