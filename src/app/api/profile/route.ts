import { prisma } from "@/lib/prisma";
import { getDefaultProfileRow } from "@/lib/matching/profile";
import { dedupe, profileUpdateSchema } from "@/lib/profile/contract";

// ─── Profile settings API ────────────────────────────────────────────────────
// GET  → the default profile row (creates one on first visit)
// PUT  → validated full replacement of the editable fields

export async function GET() {
  const profile = await getDefaultProfileRow();
  return Response.json({ profile });
}

export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "invalid profile",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  const data = parsed.data;

  if (data.baseResumeId) {
    const resume = await prisma.resume.findUnique({
      where: { id: data.baseResumeId },
      select: { id: true },
    });
    if (!resume) {
      return Response.json(
        { error: "baseResumeId does not match a saved resume" },
        { status: 422 },
      );
    }
  }

  const current = await getDefaultProfileRow();
  const profile = await prisma.profile.update({
    where: { id: current.id },
    data: {
      ...data,
      skills: dedupe(data.skills),
      locations: dedupe(data.locations),
      dealbreakers: dedupe(data.dealbreakers),
      preferredRoleFamilies: dedupe(data.preferredRoleFamilies),
      vetoedRoleFamilies: dedupe(data.vetoedRoleFamilies),
    },
  });

  return Response.json({ profile });
}
