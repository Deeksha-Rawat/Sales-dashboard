"use client";

import {
  ButtonHTMLAttributes,
  Children,
  InputHTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  forwardRef,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// useLayoutEffect warns during SSR (this component still renders server-side pre-hydration);
// fall back to useEffect there since nothing needs to measure the DOM before paint until the
// popover is actually open, which only happens client-side anyway.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md";
  }
>(({ className, variant = "secondary", size = "md", ...props }, ref) => {
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 focus-visible:outline-blue-600",
    secondary:
      "bg-white text-gray-900 border border-gray-300 hover:bg-gray-50 focus-visible:outline-gray-400",
    ghost: "bg-transparent text-gray-700 hover:bg-gray-100 focus-visible:outline-gray-400",
    danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600",
  };
  const sizes = { sm: "h-7 px-2 text-xs", md: "h-9 px-3 text-sm" };
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
});
Button.displayName = "Button";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm placeholder:text-gray-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

/** A single choice inside a <Select>. Never rendered directly — Select reads its props to build the option list. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Option(props: { value: string; children: ReactNode; disabled?: boolean }) {
  return null;
}

interface OptionData {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

function extractOptions(children: ReactNode): OptionData[] {
  const options: OptionData[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement<{ value: string; children?: ReactNode; disabled?: boolean }>(child) && child.type === Option) {
      options.push({ value: child.props.value, label: child.props.children, disabled: child.props.disabled });
    }
  });
  return options;
}

let selectInstanceCounter = 0;

/**
 * Custom listbox dropdown — not a native <select>. Built from scratch (trigger button +
 * portal-rendered popover) so it never gets clipped by the table/board's scrolling
 * containers, behaves identically across browsers, and supports full keyboard operation
 * (arrow keys, Home/End, type-ahead, Escape) via the WAI-ARIA "collapsible listbox" pattern
 * — focus stays on the trigger button and `aria-activedescendant` points at the highlighted
 * option, rather than moving focus into the popup.
 */
export function Select({
  value,
  onChange,
  children,
  placeholder = "Select…",
  disabled,
  pill,
  size = "md",
  className,
  id,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  pill?: boolean;
  size?: "sm" | "md";
  className?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const options = extractOptions(children);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [instanceId] = useState(() => `select-${++selectInstanceCounter}`);
  const listboxId = `${instanceId}-listbox`;

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  function updatePosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const popoverHeight = popoverRef.current?.offsetHeight ?? 240;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < popoverHeight + 8 && rect.top > popoverHeight + 8;
    setPos({
      top: openUpward ? rect.top - popoverHeight - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }

  useIsomorphicLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const raf = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => updatePosition();
    // capture: true catches scroll on any ancestor scroll container, not just window
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: globalThis.MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function openList() {
    if (disabled || !options.length) return;
    setHighlighted(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function commit(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlighted((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlighted((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setHighlighted(0);
        break;
      case "End":
        e.preventDefault();
        setHighlighted(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(highlighted);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (e.key.length === 1) {
          const char = e.key.toLowerCase();
          const start = (highlighted + 1) % options.length;
          for (let i = 0; i < options.length; i++) {
            const idx = (start + i) % options.length;
            const label = typeof options[idx].label === "string" ? options[idx].label.toLowerCase() : "";
            if (label.startsWith(char)) {
              setHighlighted(idx);
              break;
            }
          }
        }
    }
  }

  const sizes: Record<"sm" | "md", string> = { sm: "h-7 pl-2 pr-5 text-xs", md: "h-9 pl-3 pr-7 text-sm" };

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props -- valid per the ARIA 1.2 "collapsible listbox button" pattern */}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && options[highlighted] ? `${listboxId}-${highlighted}` : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={cn(
          "relative inline-flex w-fit items-center justify-between gap-1 border bg-white text-left font-medium text-gray-900 transition-colors",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600",
          "disabled:cursor-not-allowed disabled:opacity-50",
          pill ? "rounded-full border-transparent" : "rounded-md border-gray-300 hover:border-gray-400",
          sizes[size],
          className
        )}
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown className={cn("shrink-0 text-gray-400", size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")} />
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            role="listbox"
            id={listboxId}
            aria-label={ariaLabel}
            style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width }}
            className="z-50 max-h-60 overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={option.value === value}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => commit(index)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm",
                  index === highlighted ? "bg-blue-50 text-blue-700" : "text-gray-700",
                  option.disabled && "pointer-events-none opacity-50"
                )}
              >
                <span className="truncate">{option.label}</span>
                {option.value === value && <Check className="h-3.5 w-3.5 shrink-0" />}
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

let menuInstanceCounter = 0;

/** A small kebab-style action menu — trigger button + portal popover, same positioning approach as Select. */
export function Menu({
  items,
  trigger,
  align = "end",
  "aria-label": ariaLabel,
}: {
  items: MenuItem[];
  trigger: ReactNode;
  align?: "start" | "end";
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [menuId] = useState(() => `menu-${++menuInstanceCounter}`);

  function updatePosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const popoverWidth = popoverRef.current?.offsetWidth ?? 180;
    const popoverHeight = popoverRef.current?.offsetHeight ?? 120;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < popoverHeight + 8 && rect.top > popoverHeight + 8;
    setPos({
      top: openUpward ? rect.top - popoverHeight - 4 : rect.bottom + 4,
      left: align === "end" ? rect.right - popoverWidth : rect.left,
    });
  }

  useIsomorphicLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const raf = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => updatePosition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: globalThis.MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
      >
        {trigger}
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            role="menu"
            id={menuId}
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            className="z-50 min-w-[160px] overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          >
            {items.map((item, i) => (
              <button
                key={i}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50",
                  item.danger ? "text-red-600" : "text-gray-700"
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

export function Badge({
  children,
  tone = "gray",
  className,
}: {
  children: React.ReactNode;
  tone?: "gray" | "blue" | "green" | "red" | "amber" | "purple";
  className?: string;
}) {
  const tones = {
    gray: "bg-gray-100 text-gray-700",
    blue: "bg-blue-100 text-blue-700",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
    purple: "bg-purple-100 text-purple-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  onClick,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  onClick?: (e: MouseEvent<HTMLInputElement>) => void;
  "aria-label"?: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      aria-label={ariaLabel}
      ref={(el) => {
        if (el) el.indeterminate = !!indeterminate;
      }}
      onClick={onClick}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
    />
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className="h-2 w-full overflow-hidden rounded-full bg-gray-200"
    >
      <div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
