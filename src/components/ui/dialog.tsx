"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Keep the latest `onClose` in a ref rather than the effect's dependency array. Callers
  // almost always pass an inline arrow function, which is a new reference on every render —
  // typing into any field inside the dialog re-renders the parent, which would otherwise
  // re-run this effect and yank focus from the field (via `ref.current?.focus()`) back to
  // the dialog shell after every single keystroke.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          // max-h/overflow so a tall form (e.g. Add Lead) scrolls within the dialog instead of
          // being cut off by a short mobile viewport — the header stays pinned, only the body
          // scrolls.
          "flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg bg-white p-5 text-gray-900 shadow-xl focus:outline-none",
          className
        )}
      >
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded p-1 text-gray-500 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body
  );
}
