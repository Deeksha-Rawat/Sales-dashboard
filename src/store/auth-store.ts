import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEMO_USERS } from "@/lib/auth/demo-users";

export interface AuthUser {
  name: string;
  email: string;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  login: (email: string, password: string) => boolean;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      login: (email, password) => {
        const match = DEMO_USERS.find(
          (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password
        );
        if (!match) return false;
        set({ user: { name: match.name, email: match.email, role: match.role } });
        return true;
      },
      logout: () => set({ user: null }),
    }),
    { name: "sales-pipeline-auth" }
  )
);
