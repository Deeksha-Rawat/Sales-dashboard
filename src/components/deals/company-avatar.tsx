const COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-indigo-100 text-indigo-700",
];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % COLORS.length;
  return COLORS[Math.abs(hash) % COLORS.length];
}

/** Small colored company-initial square, stand-in for a logo (no real logos in the dataset). */
export function CompanyAvatar({ name }: { name: string }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${colorFor(name)}`}
      aria-hidden="true"
    >
      {name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}
