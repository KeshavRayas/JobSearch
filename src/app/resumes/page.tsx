import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ResumeUploadButton } from "@/components/ResumeUploadButton";
import { DeleteResumeButton } from "@/components/DeleteResumeButton";
import { SiteNav } from "@/components/SiteNav";

export const dynamic = "force-dynamic";

// ─── Resumes index (Calm Focus) ──────────────────────────────────────────────
// Same data as before: centered column, serif headline, calm cards with
// hairlines. Upload / New live as quiet pills, not green brutalist buttons.

export default async function ResumesPage() {
  const resumes = await prisma.resume.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      skills: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#111]">
      <header className="max-w-4xl mx-auto px-6 pt-8 flex items-center justify-between text-[13px]">
        <Link href="/" className="font-serif-calm text-xl">
          Job Search
        </Link>
        <SiteNav current="resumes">
          <ResumeUploadButton variant="button" />
          <Link href="/resumes/new" className="calm-pill">
            New resume
          </Link>
        </SiteNav>
      </header>

      <section className="max-w-4xl mx-auto px-6 pt-14 text-center">
        <div className="text-[11px] uppercase tracking-[0.15em] text-black/45">
          {resumes.length} saved
        </div>
        <h1
          className="font-serif-calm mt-4"
          style={{ fontSize: "clamp(40px,6vw,68px)", lineHeight: 1.02 }}
        >
          Your resumes.
        </h1>
        <p className="mt-4 text-[14px] text-black/55">
          One base resume feeds every tailoring. Keep it honest.
        </p>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-14">
        {resumes.length === 0 ? (
          <div className="py-20 text-center">
            <p className="font-serif-calm text-3xl">Nothing here — yet.</p>
            <p className="text-[14px] text-black/55 mt-2">
              Upload a PDF or start a fresh one.
            </p>
            <div className="mt-6">
              <Link href="/resumes/new" className="calm-pill">
                New resume
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {resumes.map((r) => (
              <ResumeItemCard
                key={r.id}
                id={r.id}
                title={r.title}
                skills={r.skills}
                updatedAt={r.updatedAt}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ResumeItemCard({
  id,
  title,
  skills,
  updatedAt,
}: {
  id: string;
  title: string;
  skills: string[];
  updatedAt: Date;
}) {
  return (
    <div className="calm-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-serif-calm text-2xl leading-tight truncate">
            {title}
          </h3>
          <p className="text-[13px] text-black/55 mt-1">
            Updated{" "}
            {new Date(updatedAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
        <DeleteResumeButton id={id} />
      </div>

      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-4">
          {skills.slice(0, 6).map((s) => (
            <span
              key={s}
              className="px-2.5 py-1 rounded-full bg-black/[0.04] text-[11px] font-medium text-black/60"
            >
              {s}
            </span>
          ))}
          {skills.length > 6 && (
            <span className="px-2.5 py-1 rounded-full bg-black/[0.04] text-[11px] font-medium text-black/60">
              +{skills.length - 6}
            </span>
          )}
        </div>
      )}

      <div className="mt-4 text-[13px] underline underline-offset-4 decoration-black/20 hover:decoration-black transition-all duration-500">
        <Link href={`/resumes/${id}`}>Edit →</Link>
      </div>
    </div>
  );
}
