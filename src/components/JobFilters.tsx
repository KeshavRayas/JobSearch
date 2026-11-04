"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { SkillCount } from "@/lib/repositories/jobs.repository";

export function JobFilters({
  total,
  skills,
}: {
  total: number;
  skills: SkillCount[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      params.set("page", "1");
      router.push(`/?${params.toString()}`);
    },
    [router, searchParams],
  );

  const currentQuery = searchParams.get("q") || "";
  const currentWorkMode = searchParams.get("workMode");
  const currentJobType = searchParams.get("jobType");
  const activeSkills =
    searchParams.get("skills")?.split(",").filter(Boolean) ?? [];

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const q = (form.elements.namedItem("q") as HTMLInputElement).value.trim();
    setParams({ q: q || null });
  }

  const isAll =
    !currentWorkMode && !currentJobType && activeSkills.length === 0;

  function pillClass(on: boolean) {
    return `calm-pill cursor-pointer ${on ? "on" : ""}`;
  }

  return (
    <div className="w-full max-w-xl mx-auto text-center">
      <form onSubmit={handleSearch}>
        <div className="flex items-center gap-2 bg-[#F4F4F1] border border-black/10 rounded-full px-5 py-3 transition-colors duration-500 focus-within:border-black/30">
          <span className="text-black/40" aria-hidden>
            ⌕
          </span>
          <input
            type="text"
            name="q"
            defaultValue={currentQuery}
            key={currentQuery}
            placeholder="Try ‘React Bangalore’…"
            className="bg-transparent outline-none flex-1 text-[15px] placeholder:text-black/35 text-left"
          />
          <span className="text-[11px] uppercase tracking-widest text-black/30 hidden sm:inline">
            {total} open
          </span>
        </div>
      </form>

      <div className="mt-4 flex justify-center gap-2 flex-wrap">
        <button className={pillClass(isAll)} onClick={() => router.push("/")}>
          All
        </button>
        <button
          className={pillClass(currentWorkMode === "REMOTE")}
          onClick={() =>
            setParams(
              currentWorkMode === "REMOTE"
                ? { workMode: null, location: null }
                : { workMode: "REMOTE", location: null },
            )
          }
        >
          Remote
        </button>
        <button
          className={pillClass(currentJobType === "FULL_TIME")}
          onClick={() =>
            setParams({
              jobType: currentJobType === "FULL_TIME" ? null : "FULL_TIME",
            })
          }
        >
          Full-time
        </button>
        <button
          className={pillClass(activeSkills.length > 0)}
          onClick={() =>
            setParams({
              skills: activeSkills.length > 0 ? null : "React",
            })
          }
          title="Toggle a starter skill filter"
        >
          React
        </button>
      </div>

      {(activeSkills.length > 0 || currentWorkMode || currentJobType) && (
        <div className="mt-3 flex justify-center gap-2 flex-wrap">
          {activeSkills.map((s) => (
            <button
              key={s}
              onClick={() =>
                setParams({
                  skills: activeSkills.filter((x) => x !== s).join(",") || null,
                })
              }
              className="text-[12px] text-black/50 underline underline-offset-4 hover:text-black transition-colors duration-300"
            >
              {s} ×
            </button>
          ))}
          {!isAll && (
            <button
              onClick={() => router.push("/")}
              className="text-[12px] text-black/50 underline underline-offset-4 hover:text-black transition-colors duration-300"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <details className="mt-4 text-left bg-white border border-black/10 rounded-[22px] px-6 py-4">
        <summary className="cursor-pointer text-[13px] text-black/60 hover:text-black transition-colors duration-300 list-none text-center">
          More filters ↓
        </summary>
        <div className="pt-4 grid sm:grid-cols-2 gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-black/45 mb-3">
              Skills
            </div>
            <div className="flex flex-wrap gap-2">
              {skills.map(({ skill, count }) => (
                <button
                  key={skill}
                  onClick={() =>
                    setParams({
                      skills: activeSkills.includes(skill)
                        ? activeSkills.filter((s) => s !== skill).join(",") ||
                          null
                        : [...activeSkills, skill].join(","),
                    })
                  }
                  className={pillClass(activeSkills.includes(skill))}
                  title={`${count} open role${count === 1 ? "" : "s"}`}
                >
                  {skill}{" "}
                  <span className="text-[11px] opacity-60">{count}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-black/45 mb-2">
                Location
              </div>
              <div className="flex gap-2 flex-wrap">
                {["REMOTE", "HYBRID", "ONSITE"].map((m) => (
                  <button
                    key={m}
                    onClick={() =>
                      m === "REMOTE"
                        ? setParams({ workMode: "REMOTE", location: null })
                        : setParams({ workMode: m, location: "Bangalore" })
                    }
                    className={pillClass(currentWorkMode === m)}
                  >
                    {m === "REMOTE"
                      ? "Remote"
                      : m === "HYBRID"
                        ? "Hybrid"
                        : "On-site"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-black/45 mb-2">
                Type
              </div>
              <div className="flex gap-2 flex-wrap">
                {["FULL_TIME", "CONTRACT", "INTERNSHIP"].map((t) => (
                  <button
                    key={t}
                    onClick={() =>
                      setParams({ jobType: currentJobType === t ? null : t })
                    }
                    className={pillClass(currentJobType === t)}
                  >
                    {t === "FULL_TIME"
                      ? "Full-time"
                      : t === "CONTRACT"
                        ? "Contract"
                        : "Internship"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
