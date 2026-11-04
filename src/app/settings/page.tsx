import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getDefaultProfileRow } from "@/lib/matching/profile";
import { ProfileSettings } from "@/components/ProfileSettings";
import { ProviderSettings } from "@/components/ProviderSettings";
import { SiteNav } from "@/components/SiteNav";
import type { ProfileUpdate } from "@/lib/profile/contract";

export const dynamic = "force-dynamic";

// ─── Settings (Calm Focus) ───────────────────────────────────────────────────
// The only UI that writes Profile. Everything downstream (matching, prompts,
// PDF contact block, digest) reads what is saved here.

export default async function SettingsPage() {
  const [profile, resumes] = await Promise.all([
    getDefaultProfileRow(),
    prisma.resume.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true },
    }),
  ]);

  const initial: ProfileUpdate = {
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    linkedin: profile.linkedin,
    github: profile.github,
    skills: profile.skills,
    minSalary: profile.minSalary,
    locations: profile.locations,
    workModes: profile.workModes as ProfileUpdate["workModes"],
    dealbreakers: profile.dealbreakers,
    preferredRoleFamilies:
      profile.preferredRoleFamilies as ProfileUpdate["preferredRoleFamilies"],
    vetoedRoleFamilies:
      profile.vetoedRoleFamilies as ProfileUpdate["vetoedRoleFamilies"],
    openToRemote: profile.openToRemote,
    baseResumeId: profile.baseResumeId,
  };

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#111]">
      <header className="max-w-4xl mx-auto px-6 pt-8 flex items-center justify-between text-[13px]">
        <Link href="/" className="font-serif-calm text-xl">
          Job Search
        </Link>
        <SiteNav current="settings" />
      </header>

      <section className="max-w-4xl mx-auto px-6 pt-14 text-center">
        <div className="text-[11px] uppercase tracking-[0.15em] text-black/45">
          The one profile
        </div>
        <h1
          className="font-serif-calm mt-4"
          style={{ fontSize: "clamp(40px,6vw,68px)", lineHeight: 1.02 }}
        >
          Make it yours.
        </h1>
        <p className="mt-4 text-[14px] text-black/55">
          Matching, prompts, and every rendered resume read from here.
        </p>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-12">
        <div className="grid gap-4">
          <ProviderSettings />
          <ProfileSettings initial={initial} resumes={resumes} />
        </div>
      </section>
    </div>
  );
}
