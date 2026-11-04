"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ROLE_FAMILIES,
  ROLE_FAMILY_LABELS,
  dedupe,
  type ProfileUpdate,
} from "@/lib/profile/contract";

type ResumeOption = { id: string; title: string };
type SaveState = "idle" | "saving" | "saved" | "error";

const inputClass =
  "w-full bg-white border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] outline-none transition-colors duration-500 focus:border-black/30 placeholder:text-black/35";

const labelClass =
  "block text-[11px] uppercase tracking-[0.12em] text-black/45";

const WORK_MODES = ["REMOTE", "HYBRID", "ONSITE"] as const;

function toForm(profile: Partial<ProfileUpdate>): ProfileUpdate {
  return {
    name: profile.name ?? null,
    email: profile.email ?? null,
    phone: profile.phone ?? null,
    linkedin: profile.linkedin ?? null,
    github: profile.github ?? null,
    skills: profile.skills ?? [],
    minSalary: profile.minSalary ?? null,
    locations: profile.locations ?? [],
    workModes: profile.workModes ?? [],
    dealbreakers: profile.dealbreakers ?? [],
    preferredRoleFamilies: profile.preferredRoleFamilies ?? [],
    vetoedRoleFamilies: profile.vetoedRoleFamilies ?? [],
    openToRemote: profile.openToRemote ?? true,
    baseResumeId: profile.baseResumeId ?? null,
  };
}

export function ProfileSettings({
  initial,
  resumes,
}: {
  initial: ProfileUpdate;
  resumes: ResumeOption[];
}) {
  const [form, setForm] = useState<ProfileUpdate>(initial);
  // Tag inputs commit on blur; the ref makes Save see the latest value even
  // when the blur and the click land in the same React batch.
  const latest = useRef(form);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const idPrefix = useId();

  function update<K extends keyof ProfileUpdate>(
    key: K,
    value: ProfileUpdate[K],
  ) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      latest.current = next;
      return next;
    });
    if (state === "saved") setState("idle");
    if (state === "error") {
      setState("idle");
      setError(null);
    }
  }

  function text(
    key: "name" | "email" | "phone" | "linkedin" | "github",
    value: string,
  ) {
    update(key, value.trim() ? value : null);
  }

  function toggleWorkMode(mode: (typeof WORK_MODES)[number]) {
    const current = latest.current.workModes;
    update(
      "workModes",
      current.includes(mode)
        ? current.filter((m) => m !== mode)
        : [...current, mode],
    );
  }

  function toggleFamily(
    kind: "preferredRoleFamilies" | "vetoedRoleFamilies",
    family: (typeof ROLE_FAMILIES)[number],
  ) {
    const current = latest.current[kind];
    const next = current.includes(family)
      ? current.filter((f) => f !== family)
      : [...current, family];
    update(kind, next);
    // Preferred and vetoed are mutually exclusive.
    const other =
      kind === "preferredRoleFamilies"
        ? "vetoedRoleFamilies"
        : "preferredRoleFamilies";
    if (next.includes(family)) {
      update(
        other,
        latest.current[other].filter((f) => f !== family),
      );
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setState("saving");
    setError(null);

    const snapshot = latest.current;
    const payload: ProfileUpdate = {
      ...snapshot,
      skills: dedupe(snapshot.skills),
      locations: dedupe(snapshot.locations),
      dealbreakers: dedupe(snapshot.dealbreakers),
    };

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const issue = data?.issues?.[0];
        throw new Error(
          issue
            ? `${issue.path}: ${issue.message}`
            : (data?.error ?? `Save failed (${res.status})`),
        );
      }
      const next = toForm(data.profile as Partial<ProfileUpdate>);
      latest.current = next;
      setForm(next);
      setState("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setState("error");
    }
  }

  return (
    <form onSubmit={save} className="grid gap-4">
      <section className="calm-card p-6 sm:p-8">
        <h2 className="font-serif-calm text-[24px]">Identity</h2>
        <p className="mt-1 text-[13px] text-black/55">
          Printed on every resume and PDF. Leave a field blank to omit it.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field id={`${idPrefix}-name`} label="Name">
            <input
              id={`${idPrefix}-name`}
              className={inputClass}
              value={form.name ?? ""}
              onChange={(e) => text("name", e.target.value)}
              autoComplete="name"
            />
          </Field>
          <Field id={`${idPrefix}-email`} label="Email">
            <input
              id={`${idPrefix}-email`}
              type="email"
              className={inputClass}
              value={form.email ?? ""}
              onChange={(e) => text("email", e.target.value)}
              autoComplete="email"
            />
          </Field>
          <Field id={`${idPrefix}-phone`} label="Phone">
            <input
              id={`${idPrefix}-phone`}
              className={inputClass}
              value={form.phone ?? ""}
              onChange={(e) => text("phone", e.target.value)}
              autoComplete="tel"
            />
          </Field>
          <div className="hidden sm:block" aria-hidden="true" />
          <Field id={`${idPrefix}-linkedin`} label="LinkedIn">
            <input
              id={`${idPrefix}-linkedin`}
              className={inputClass}
              value={form.linkedin ?? ""}
              onChange={(e) => text("linkedin", e.target.value)}
              placeholder="https://linkedin.com/in/…"
            />
          </Field>
          <Field id={`${idPrefix}-github`} label="GitHub">
            <input
              id={`${idPrefix}-github`}
              className={inputClass}
              value={form.github ?? ""}
              onChange={(e) => text("github", e.target.value)}
              placeholder="https://github.com/…"
            />
          </Field>
        </div>
      </section>

      <section className="calm-card p-6 sm:p-8">
        <h2 className="font-serif-calm text-[24px]">What you want</h2>
        <p className="mt-1 text-[13px] text-black/55">
          Drives eligibility, scoring, and which roles reach the digest.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field
            id={`${idPrefix}-salary`}
            label="Minimum salary"
            hint="Annual, in the currency your sources use."
          >
            <input
              id={`${idPrefix}-salary`}
              type="number"
              min={0}
              step={10000}
              className={inputClass}
              value={form.minSalary ?? ""}
              onChange={(e) =>
                update(
                  "minSalary",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
              placeholder="No floor"
            />
          </Field>
          <div>
            <span className={labelClass}>Work modes</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {WORK_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={form.workModes.includes(mode)}
                  onClick={() => toggleWorkMode(mode)}
                  className={`calm-pill ${
                    form.workModes.includes(mode) ? "on" : ""
                  }`}
                >
                  {mode[0] + mode.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <label className="mt-4 flex items-center gap-2 text-[13px] text-black/65">
              <input
                type="checkbox"
                checked={form.openToRemote}
                onChange={(e) => update("openToRemote", e.target.checked)}
                className="control-checkbox"
              />
              Open to remote roles
            </label>
          </div>
        </div>

        <div className="mt-5">
          <TagInput
            id={`${idPrefix}-locations`}
            label="Locations"
            hint="Press Enter or comma after each city."
            placeholder="Bangalore, Remote…"
            values={form.locations}
            onChange={(values) => update("locations", values)}
          />
        </div>
      </section>

      <section className="calm-card p-6 sm:p-8">
        <h2 className="font-serif-calm text-[24px]">Skills</h2>
        <p className="mt-1 text-[13px] text-black/55">
          The matcher weighs overlap with these. Analysis prompts receive a
          relevant slice, never the whole list.
        </p>
        <div className="mt-5">
          <TagInput
            id={`${idPrefix}-skills`}
            label="Skills"
            hint="Press Enter or comma after each skill."
            placeholder="TypeScript, PostgreSQL…"
            values={form.skills}
            onChange={(values) => update("skills", values)}
          />
        </div>
      </section>

      <section className="calm-card p-6 sm:p-8">
        <h2 className="font-serif-calm text-[24px]">Role goals</h2>
        <p className="mt-1 text-[13px] text-black/55">
          A preferred family scores higher; a vetoed one is filtered out before
          scoring. Picking one removes it from the other list.
        </p>

        <div className="mt-5 space-y-5">
          <FamilyPicker
            label="Preferred"
            selected={form.preferredRoleFamilies}
            onToggle={(family) => toggleFamily("preferredRoleFamilies", family)}
          />
          <FamilyPicker
            label="Vetoed"
            selected={form.vetoedRoleFamilies}
            onToggle={(family) => toggleFamily("vetoedRoleFamilies", family)}
            tone="veto"
          />
        </div>
      </section>

      <section className="calm-card p-6 sm:p-8">
        <h2 className="font-serif-calm text-[24px]">Base resume</h2>
        <p className="mt-1 text-[13px] text-black/55">
          Tailoring, cover letters, and interview prep cite this resume as their
          evidence set.
        </p>
        <div className="mt-5">
          <Field id={`${idPrefix}-base-resume`} label="Pinned resume">
            <select
              id={`${idPrefix}-base-resume`}
              className={inputClass}
              value={form.baseResumeId ?? ""}
              onChange={(e) => update("baseResumeId", e.target.value || null)}
            >
              <option value="">No pinned resume (use most recent)</option>
              {resumes.map((resume) => (
                <option key={resume.id} value={resume.id}>
                  {resume.title}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-5">
          <TagInput
            id={`${idPrefix}-dealbreakers`}
            label="Dealbreakers"
            hint="Free-form notes carried into analysis prompts."
            placeholder="No on-call, no unpaid overtime…"
            values={form.dealbreakers}
            onChange={(values) => update("dealbreakers", values)}
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-1">
        <p
          role="status"
          aria-live="polite"
          className={`text-[13px] ${
            state === "error" ? "text-red-700/80" : "text-black/55"
          }`}
        >
          {state === "saving"
            ? "Saving…"
            : state === "saved"
              ? "Saved"
              : state === "error"
                ? error
                : "Changes apply to the next resume, PDF, and nightly run."}
        </p>
        <button
          type="submit"
          disabled={state === "saving"}
          className="rounded-full bg-[#111] px-5 py-2.5 text-[13px] font-medium text-white transition-opacity duration-300 hover:opacity-85 disabled:opacity-50"
        >
          {state === "saving" ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-1.5 text-[12px] text-black/40">{hint}</p>}
    </div>
  );
}

function TagInput({
  id,
  label,
  hint,
  placeholder,
  values,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const parts = draft
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 0) onChange(dedupe([...values, ...parts]));
    setDraft("");
  }

  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-medium text-black/65"
            >
              {value}
              <button
                type="button"
                aria-label={`Remove ${value}`}
                onClick={() => onChange(values.filter((v) => v !== value))}
                className="text-black/35 transition-colors hover:text-black"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        id={id}
        className={`${inputClass} mt-2`}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
      />
      <p className="mt-1.5 text-[12px] text-black/40">{hint}</p>
    </div>
  );
}

function FamilyPicker({
  label,
  selected,
  onToggle,
  tone = "prefer",
}: {
  label: string;
  selected: string[];
  onToggle: (family: (typeof ROLE_FAMILIES)[number]) => void;
  tone?: "prefer" | "veto";
}) {
  return (
    <div>
      <span className={labelClass}>{label}</span>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ROLE_FAMILIES.map((family) => {
          const on = selected.includes(family);
          return (
            <button
              key={family}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(family)}
              className={`calm-pill ${on ? "on" : ""} ${
                on && tone === "veto" ? "line-through decoration-1" : ""
              }`}
            >
              {ROLE_FAMILY_LABELS[family]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
