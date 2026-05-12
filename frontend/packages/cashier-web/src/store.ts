import { create } from "zustand";
import { jwtDecode } from "jwt-decode";

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
  const token = localStorage.getItem("cashier_token");
  let user: User | null = null;
  if (token) {
    try {
      user = jwtDecode<User>(token);
    } catch {
      localStorage.removeItem("cashier_token");
    }
  }

  return {
    token: user ? token : null,
    user,
    login: (newToken: string) => {
      localStorage.setItem("cashier_token", newToken);
      set({ token: newToken, user: jwtDecode<User>(newToken) });
    },
    logout: () => {
      localStorage.removeItem("cashier_token");
      set({ token: null, user: null });
    },
  };
});
