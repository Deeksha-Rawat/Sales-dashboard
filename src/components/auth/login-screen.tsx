"use client";

import { FormEvent, useState } from "react";
import { Workflow, Eye, EyeOff, LogIn } from "lucide-react";
import { useAuthStore } from "@/store/auth-store";
import { DEMO_USERS } from "@/lib/auth/demo-users";
import { Button, Input } from "@/components/ui/primitives";
import { Avatar } from "./avatar";

export function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const ok = login(email, password);
    if (!ok) setError("Email or password doesn't match a demo account below.");
  }

  function loginAs(demoEmail: string, demoPassword: string) {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError(null);
    login(demoEmail, demoPassword);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Workflow className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold text-gray-900">Sales Pipeline</span>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-base font-semibold text-gray-900">Sign in</h1>
          <p className="mb-4 text-sm text-gray-500">There&apos;s no real backend here — this is a mock login.</p>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label htmlFor="email" className="mb-1 block text-xs font-medium text-gray-600">
                Email
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@salesco.com"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-xs font-medium text-gray-600">
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pr-9"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button type="submit" variant="primary" className="w-full justify-center">
              <LogIn className="h-4 w-4" /> Sign in
            </Button>
          </form>
        </div>

        <div className="mt-5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Demo accounts — click one to sign in
          </h2>
          <ul className="space-y-1">
            {DEMO_USERS.map((u) => (
              <li key={u.email}>
                <button
                  type="button"
                  onClick={() => loginAs(u.email, u.password)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                >
                  <Avatar name={u.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">{u.name}</span>
                    <span className="block truncate text-xs text-gray-500">
                      {u.email} · {u.password}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-blue-600">Sign in</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
