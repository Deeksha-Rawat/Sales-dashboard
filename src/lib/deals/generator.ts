import { Deal, Priority, STAGES, Stage } from "./types";

/** Deterministic PRNG (mulberry32) so the dataset is reproducible across server restarts. */
function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  "Olivia", "Liam", "Emma", "Noah", "Ava", "Elijah", "Sophia", "Lucas",
  "Mia", "Mason", "Isabella", "Ethan", "Amelia", "Logan", "Harper", "James",
  "Evelyn", "Benjamin", "Abigail", "Jack", "Ella", "Henry", "Scarlett", "Owen",
];
const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas",
];
const COMPANY_PREFIX = [
  "Acme", "Globex", "Initech", "Umbrella", "Stark", "Wayne", "Hooli", "Soylent",
  "Vandelay", "Cyberdyne", "Wonka", "Monsters", "Pied Piper", "Massive Dynamic", "Aperture", "Gringotts",
];
const COMPANY_SUFFIX = ["Inc", "LLC", "Group", "Partners", "Holdings", "Labs", "Industries", "Co"];
/** 20 reps sharing one pipeline, per the assignment's scenario. */
export const OWNERS = [
  "Priya Patel", "Alex Chen", "Jordan Smith", "Maria Garcia", "Sam Lee",
  "Taylor Brooks", "Nina Rossi", "Chris Evans", "Dana Kim", "Omar Farouk",
  "Rahul Mehta", "Sofia Rossi", "Kenji Tanaka", "Grace Kim", "Lucas Oliveira",
  "Fatima Khan", "Ben Carter", "Aisha Rahman", "Noah Becker", "Ivy Zhang",
];
const NOTE_SNIPPETS = [
  "Follow up after demo.",
  "Waiting on procurement sign-off.",
  "Price objection raised, revisit discount tiers.",
  "Champion is on parental leave, loop in backup.",
  "Strong interest, needs security review.",
  "Lost to competitor on pricing last cycle, reopened.",
  "",
  "",
];

function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function randomDateWithinDays(rand: () => number, daysBack: number, daysForward: number, now: number): Date {
  const offsetDays = -daysBack + rand() * (daysBack + daysForward);
  return new Date(now + offsetDays * 86400000);
}

const PRIORITY_WEIGHTS: [Priority, number][] = [
  ["high", 0.2],
  ["medium", 0.5],
  ["low", 0.3],
];
function weightedPriority(rand: () => number): Priority {
  const r = rand();
  let cumulative = 0;
  for (const [p, w] of PRIORITY_WEIGHTS) {
    cumulative += w;
    if (r <= cumulative) return p;
  }
  return "medium";
}

const STAGE_WEIGHTS: [Stage, number][] = [
  ["new_lead", 0.25],
  ["contacted", 0.2],
  ["demo_done", 0.2],
  ["proposal_sent", 0.15],
  ["negotiation", 0.12],
  ["won", 0.05],
  ["lost", 0.03],
];
function weightedStage(rand: () => number): Stage {
  const r = rand();
  let cumulative = 0;
  for (const [s, w] of STAGE_WEIGHTS) {
    cumulative += w;
    if (r <= cumulative) return s;
  }
  return "new_lead";
}

export function generateDeals(count: number, seed = 42, now: number = Date.now()): Deal[] {
  const rand = mulberry32(seed);
  const deals: Deal[] = [];

  for (let i = 0; i < count; i++) {
    const first = pick(FIRST_NAMES, rand);
    const last = pick(LAST_NAMES, rand);
    const company = `${pick(COMPANY_PREFIX, rand)} ${pick(COMPANY_SUFFIX, rand)}`;
    const stage = weightedStage(rand);
    const value = Math.round((20000 + rand() * 4980000) / 5000) * 5000;
    const updatedAt = randomDateWithinDays(rand, 60, 0, now).toISOString();
    const closeDate = randomDateWithinDays(rand, 10, 90, now).toISOString().slice(0, 10);

    deals.push({
      id: `deal_${i.toString(36)}_${(seed + i).toString(36)}`,
      name: `${company} - ${pick(["Expansion", "New Business", "Renewal", "Upsell", "Pilot"], rand)}`,
      company,
      owner: pick(OWNERS, rand),
      value,
      stage,
      priority: weightedPriority(rand),
      closeDate,
      updatedAt,
      version: 1,
      archived: false,
      contactName: `${first} ${last}`,
      contactEmail: `${first.toLowerCase()}.${last.toLowerCase()}@${company.split(" ")[0].toLowerCase()}.com`,
      notes: pick(NOTE_SNIPPETS, rand),
    });
  }

  return deals;
}

export { STAGES };
