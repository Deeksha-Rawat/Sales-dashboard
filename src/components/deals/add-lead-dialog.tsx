"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button, Checkbox, Input, Option, Select } from "@/components/ui/primitives";
import { fetchDeals } from "@/lib/deals/api-client";
import { OWNERS } from "@/lib/deals/generator";
import {
  DealMutableFields,
  DealSummary,
  PRIORITIES,
  PRIORITY_LABELS,
  STAGES,
  STAGE_LABELS,
} from "@/lib/deals/types";
import { useDealsStore } from "@/store/deals-store";
import { formatCurrency } from "@/lib/utils";

const EMPTY_FORM = {
  name: "",
  company: "",
  owner: OWNERS[0],
  value: "",
  stage: "new_lead" as DealMutableFields["stage"],
  priority: "medium" as DealMutableFields["priority"],
  closeDate: "",
  contactName: "",
  contactEmail: "",
  notes: "",
};

export function AddLeadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addDeal = useDealsStore((s) => s.addDeal);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [duplicates, setDuplicates] = useState<DealSummary[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [acknowledgeDuplicate, setAcknowledgeDuplicate] = useState(false);
  const duplicateCheckToken = useRef(0);

  function patch(changes: Partial<typeof form>) {
    setForm((f) => ({ ...f, ...changes }));
  }

  // Debounced: a deal with the exact same name at the exact same company already existing is
  // a real duplicate (unlike sharing just a company, which is normal — one company can have
  // several legitimate deals). Checked server-side since the client only holds whatever page
  // of the 50k rows it's scrolled through, not the full set.
  const name = form.name.trim();
  const company = form.company.trim();
  useEffect(() => {
    setAcknowledgeDuplicate(false);
    if (!name || !company) {
      setDuplicates([]);
      return;
    }
    const token = ++duplicateCheckToken.current;
    setCheckingDuplicates(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetchDeals({ search: name, archived: false, cursor: 0, limit: 25 });
        if (duplicateCheckToken.current !== token) return;
        const matches = res.rows.filter(
          (d) => d.name.trim().toLowerCase() === name.toLowerCase() && d.company.trim().toLowerCase() === company.toLowerCase()
        );
        setDuplicates(matches);
      } catch {
        if (duplicateCheckToken.current === token) setDuplicates([]);
      } finally {
        if (duplicateCheckToken.current === token) setCheckingDuplicates(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [name, company]);

  function handleClose() {
    setForm(EMPTY_FORM);
    setError(null);
    setDuplicates([]);
    setAcknowledgeDuplicate(false);
    onClose();
  }

  const hasDuplicates = duplicates.length > 0;
  const valid = !!name && !!company && !!form.owner && (!hasDuplicates || acknowledgeDuplicate);

  async function handleSubmit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await addDeal({
        name: form.name.trim(),
        company: form.company.trim(),
        owner: form.owner,
        value: Number(form.value) || 0,
        stage: form.stage,
        priority: form.priority,
        closeDate: form.closeDate || new Date().toISOString().slice(0, 10),
        contactName: form.contactName.trim(),
        contactEmail: form.contactEmail.trim(),
        notes: form.notes.trim(),
        archived: false,
      });
      handleClose();
    } catch {
      setError("Couldn't add this lead — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Add a new lead" onClose={handleClose} className="max-w-md">
      <div className="space-y-3">
        <Field label="Deal name">
          <Input
            autoFocus
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="e.g. Acme Inc - Expansion"
            aria-label="Deal name"
          />
        </Field>
        <Field label="Company">
          <Input
            value={form.company}
            onChange={(e) => patch({ company: e.target.value })}
            placeholder="e.g. Acme Inc"
            aria-label="Company"
          />
        </Field>

        {checkingDuplicates && (
          <p className="text-xs text-gray-400">Checking for existing deals with this name…</p>
        )}

        {hasDuplicates && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
            <div className="flex items-center gap-1.5 font-medium text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Possible duplicate{duplicates.length > 1 ? "s" : ""} found
            </div>
            <ul className="mt-1.5 space-y-1 text-xs text-amber-700">
              {duplicates.slice(0, 5).map((d) => (
                <li key={d.id} className="truncate">
                  <span className="font-medium">{d.name}</span> — {d.owner}, {STAGE_LABELS[d.stage]},{" "}
                  {formatCurrency(d.value)}
                  {d.archived ? " (archived)" : ""}
                </li>
              ))}
            </ul>
            <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-xs text-amber-800">
              <Checkbox checked={acknowledgeDuplicate} onChange={setAcknowledgeDuplicate} aria-label="Add this lead anyway" />
              This is a different deal — add it anyway
            </label>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Owner">
            <Select size="sm" className="w-full" value={form.owner} onChange={(v) => patch({ owner: v })} aria-label="Owner">
              {OWNERS.map((o) => (
                <Option key={o} value={o}>
                  {o}
                </Option>
              ))}
            </Select>
          </Field>
          <Field label="Value">
            <Input
              type="number"
              min={0}
              value={form.value}
              onChange={(e) => patch({ value: e.target.value })}
              placeholder="0"
              aria-label="Value"
            />
          </Field>
          <Field label="Stage">
            <Select
              size="sm"
              className="w-full"
              value={form.stage}
              onChange={(v) => patch({ stage: v as DealMutableFields["stage"] })}
              aria-label="Stage"
            >
              {STAGES.map((s) => (
                <Option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </Option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select
              size="sm"
              className="w-full"
              value={form.priority}
              onChange={(v) => patch({ priority: v as DealMutableFields["priority"] })}
              aria-label="Priority"
            >
              {PRIORITIES.map((p) => (
                <Option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </Option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Close date">
          <Input
            type="date"
            value={form.closeDate}
            onChange={(e) => patch({ closeDate: e.target.value })}
            aria-label="Close date"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Contact name">
            <Input
              value={form.contactName}
              onChange={(e) => patch({ contactName: e.target.value })}
              aria-label="Contact name"
            />
          </Field>
          <Field label="Contact email">
            <Input
              type="email"
              value={form.contactEmail}
              onChange={(e) => patch({ contactEmail: e.target.value })}
              aria-label="Contact email"
            />
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            value={form.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            rows={3}
            placeholder="Optional remark…"
            aria-label="Notes"
            className="w-full resize-none rounded-md border border-gray-300 p-2 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!valid || submitting}>
            {submitting ? "Adding…" : "Add lead"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  );
}
