import { z } from "zod";

// ─── Profile settings contract ──────────────────────────────────────────────
// Single-user profile. The client sends trimmed values and `null` for blanks;
// arrays are deduped server-side before persisting.

export const ROLE_FAMILIES = [
  "BACKEND",
  "INFRASTRUCTURE",
  "DEVOPS_SRE",
  "FULL_STACK",
  "FRONTEND",
  "ML_AI",
  "DATA",
  "DATA_ANNOTATION",
  "FORWARD_DEPLOYED",
  "OTHER",
] as const;

export const ROLE_FAMILY_LABELS: Record<
  (typeof ROLE_FAMILIES)[number],
  string
> = {
  BACKEND: "Backend",
  INFRASTRUCTURE: "Infrastructure",
  DEVOPS_SRE: "DevOps / SRE",
  FULL_STACK: "Full stack",
  FRONTEND: "Frontend",
  ML_AI: "ML / AI",
  DATA: "Data",
  DATA_ANNOTATION: "Data annotation",
  FORWARD_DEPLOYED: "Forward deployed",
  OTHER: "Other",
};

export const roleFamilySchema = z.enum(ROLE_FAMILIES);

const listItem = z.string().trim().min(1).max(80);

export const profileUpdateSchema = z.object({
  name: z.string().trim().max(120).nullable(),
  email: z.string().trim().email().max(200).nullable(),
  phone: z.string().trim().max(40).nullable(),
  linkedin: z.string().trim().max(300).nullable(),
  github: z.string().trim().max(300).nullable(),

  skills: z.array(listItem).max(200),
  minSalary: z.number().int().min(0).max(1_000_000_000).nullable(),
  locations: z.array(listItem).max(20),
  workModes: z.array(z.enum(["REMOTE", "HYBRID", "ONSITE"])).max(3),
  dealbreakers: z.array(z.string().trim().min(1).max(200)).max(30),
  preferredRoleFamilies: z.array(roleFamilySchema).max(10),
  vetoedRoleFamilies: z.array(roleFamilySchema).max(10),
  openToRemote: z.boolean(),
  baseResumeId: z.string().trim().min(1).nullable(),
});

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export function dedupe<T>(values: T[]): T[] {
  return [...new Set(values)];
}
