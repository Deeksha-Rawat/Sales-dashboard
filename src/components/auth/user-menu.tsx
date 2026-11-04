"use client";

import { LogOut } from "lucide-react";
import { useAuthStore } from "@/store/auth-store";
import { Avatar } from "./avatar";

export function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  if (!user) return null;

  return (
    <div className="flex items-center gap-2">
      <Avatar name={user.name} />
      <div className="hidden leading-tight sm:block">
        <div className="text-sm font-medium text-gray-900">{user.name}</div>
        <div className="text-xs text-gray-500">{user.role}</div>
      </div>
      <button
        onClick={() => logout()}
        className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
        aria-label="Log out"
        title="Log out"
      >
        <LogOut className="h-3.5 w-3.5" />
        <span className="hidden md:inline">Log out</span>
      </button>
    </div>
  );
}
