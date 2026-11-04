export interface DemoUser {
  name: string;
  email: string;
  password: string;
  role: string;
}

/**
 * Fake accounts for the mock login — there's no real backend here (per the assignment brief),
 * so these are plain hardcoded credentials, not something to model real auth on.
 */
export const DEMO_USERS: DemoUser[] = [
  { name: "Priya Patel", email: "priya@salesco.com", password: "demo1234", role: "Sales Rep" },
  { name: "Alex Chen", email: "alex@salesco.com", password: "demo1234", role: "Sales Rep" },
  { name: "Dana Kim", email: "dana@salesco.com", password: "demo1234", role: "Sales Manager" },
  { name: "Sofia Rossi", email: "sofia@salesco.com", password: "demo1234", role: "Sales Rep" },
];
