import { prisma } from "@/lib/prisma";
import type { MatcherProfile } from "@/lib/matching/score";

// ─── Profile loading for the nightly matcher ───────────────────────────────
// Single "default" profile row. Created on first nightly run from the most
// recent Resume's skills (or empty when no resume exists yet). Role goals
// seed from observed judgments (backend/infra direction; annotation vetoed)
// and stay editable without code changes. Salary left null until known.

const DEFAULT_PREFERRED_FAMILIES = [
  "BACKEND",
  "INFRASTRUCTURE",
  "DEVOPS_SRE",
  "FULL_STACK",
  "ML_AI",
  "DATA",
  "FORWARD_DEPLOYED",
];

const DEFAULT_VETOED_FAMILIES = ["DATA_ANNOTATION"];

export async function getOrCreateDefaultProfile(): Promise<
  MatcherProfile & { id: string }
> {
  const existing = await prisma.profile.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  if (existing) {
    return {
      id: existing.id,
      skills: existing.skills,
      minSalary: existing.minSalary,
      preferredRoleFamilies: existing.preferredRoleFamilies,
      vetoedRoleFamilies: existing.vetoedRoleFamilies,
      openToRemote: existing.openToRemote,
    };
  }

  const latestResume = await prisma.resume.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { skills: true },
  });

  const created = await prisma.profile.create({
    data: {
      label: "default",
      skills: latestResume?.skills ?? [],
      preferredRoleFamilies: DEFAULT_PREFERRED_FAMILIES,
      vetoedRoleFamilies: DEFAULT_VETOED_FAMILIES,
      openToRemote: true,
    },
  });
  return {
    id: created.id,
    skills: created.skills,
    minSalary: created.minSalary,
    preferredRoleFamilies: created.preferredRoleFamilies,
    vetoedRoleFamilies: created.vetoedRoleFamilies,
    openToRemote: created.openToRemote,
  };
}

/**
 * Full profile row for the settings screen. Creates the default row on first
 * visit so the editor always has a target to update.
 */
export async function getDefaultProfileRow() {
  const existing = await prisma.profile.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing;

  await getOrCreateDefaultProfile();
  return prisma.profile.findFirstOrThrow({
    orderBy: { updatedAt: "desc" },
  });
}
