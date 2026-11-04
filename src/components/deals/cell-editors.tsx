"use client";

import { KeyboardEvent, useRef, useState } from "react";
import { PRIORITIES, PRIORITY_LABELS, Priority, STAGES, STAGE_LABELS, Stage } from "@/lib/deals/types";
import { Option, Select } from "@/components/ui/primitives";
import { cn, formatCurrency } from "@/lib/utils";

interface EditableTextProps {
  value: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
  type?: "text" | "number";
  format?: (value: string) => string;
}

export function EditableText({ value, onCommit, disabled, type = "text", format }: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="w-full truncate rounded px-1.5 py-1 text-left hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed"
      >
        {format ? format(value) : value}
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    if (draft !== value && draft.trim() !== "") onCommit(draft);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setDraft(value);
      setEditing(false);
    }
  };

  return (
    <input
      ref={inputRef}
      autoFocus
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className="w-full rounded border border-blue-500 px-1.5 py-1 text-left text-sm focus:outline-none"
    />
  );
}

export function StageSelect({
  value,
  onCommit,
  disabled,
}: {
  value: Stage;
  onCommit: (value: Stage) => void;
  disabled?: boolean;
}) {
  const tones: Record<Stage, string> = {
    new_lead: "bg-gray-100 text-gray-700",
    contacted: "bg-sky-100 text-sky-700",
    demo_done: "bg-blue-100 text-blue-700",
    proposal_sent: "bg-purple-100 text-purple-700",
    negotiation: "bg-amber-100 text-amber-700",
    won: "bg-green-100 text-green-700",
    lost: "bg-red-100 text-red-700",
  };
  return (
    <Select
      pill
      size="sm"
      value={value}
      disabled={disabled}
      onChange={(v) => onCommit(v as Stage)}
      className={cn("w-[132px] font-medium", tones[value])}
      aria-label="Change stage"
    >
      {STAGES.map((s) => (
        <Option key={s} value={s}>
          {STAGE_LABELS[s]}
        </Option>
      ))}
    </Select>
  );
}

export function PrioritySelect({
  value,
  onCommit,
  disabled,
}: {
  value: Priority;
  onCommit: (value: Priority) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      size="sm"
      value={value}
      disabled={disabled}
      onChange={(v) => onCommit(v as Priority)}
      className="w-[104px]"
      aria-label="Change priority"
    >
      {PRIORITIES.map((p) => (
        <Option key={p} value={p}>
          {PRIORITY_LABELS[p]}
        </Option>
      ))}
    </Select>
  );
}

export function ValueCell({
  value,
  onCommit,
  disabled,
}: {
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <EditableText
      value={String(value)}
      type="number"
      disabled={disabled}
      format={(v) => formatCurrency(Number(v))}
      onCommit={(v) => {
        const n = Number(v);
        if (!Number.isNaN(n) && n >= 0) onCommit(n);
      }}
    />
  );
}
