import "dotenv/config";
import { spawnSync } from "node:child_process";
import { prisma } from "@/lib/prisma";
import { validateEnv } from "@/lib/env";

// ─── Local setup ─────────────────────────────────────────────────────────────
// bun run setup
// Idempotent: validates env, applies migrations, seeds the curated company
// list, then reports what the install still needs.

function run(cmd: string, args: string[]) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`\n[setup] command failed: ${cmd} ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
}

async function main() {
  const env = validateEnv();
  if (!env.success) {
    console.error("[setup] .env is not valid:");
    for (const issue of env.error.issues) {
      console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    console.error("\nCopy .env.example to .env and fill in DATABASE_URL.");
    process.exit(1);
  }

  run("bunx", ["prisma", "migrate", "deploy"]);
  run("bun", ["run", "seed"]);

  const [companies, jobs, resumes, profile] = await Promise.all([
    prisma.company.count(),
    prisma.job.count(),
    prisma.resume.count(),
    prisma.profile.findFirst({ orderBy: { updatedAt: "desc" } }),
  ]);

  console.log("\n[setup] ready");
  console.log(
    JSON.stringify(
      {
        companies,
        jobs,
        resumes,
        profile: profile
          ? {
              name: profile.name,
              skills: profile.skills.length,
              baseResumeId: profile.baseResumeId,
            }
          : null,
        provider:
          process.env.LLM_PROVIDER === "cloud"
            ? `cloud (${process.env.LLM_MODEL ?? "model unset"})`
            : `opencode-cli (${process.env.OPENCODE_MODEL ?? "CLI default"})`,
      },
      null,
      2,
    ),
  );
  console.log(
    [
      "",
      "Next:",
      "  1. bun run dev",
      "  2. open http://localhost:3000/settings and fill your profile",
      "  3. upload a base resume at /resumes",
      "  4. bun run ingest   (or refresh from the UI)",
      "  5. bun run audit    (checks visibility + base resume)",
      "",
    ].join("\n"),
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
