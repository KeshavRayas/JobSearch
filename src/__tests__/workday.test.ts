import { describe, it, expect } from "vitest";
import {
  parseWorkdayPostedOn,
  workdayTenantFromHost,
  mapWorkdayPosting,
  WorkdaySource,
} from "@/lib/sources/workday";

const NOW = new Date("2026-09-07T12:00:00Z").getTime();
const DAY = 86_400_000;

describe("parseWorkdayPostedOn", () => {
  it("maps relative labels to dates", () => {
    expect(parseWorkdayPostedOn("Posted Today", NOW)).toEqual(new Date(NOW));
    expect(parseWorkdayPostedOn("Posted Yesterday", NOW)).toEqual(
      new Date(NOW - DAY),
    );
    expect(parseWorkdayPostedOn("Posted 5 Days Ago", NOW)).toEqual(
      new Date(NOW - 5 * DAY),
    );
  });

  it("pushes 30+ past the stale threshold so ingestion rejects it", () => {
    const d = parseWorkdayPostedOn("Posted 30+ Days Ago", NOW)!;
    expect(NOW - d.getTime()).toBeGreaterThan(30 * DAY);
  });

  it("returns undefined for unknown shapes", () => {
    expect(parseWorkdayPostedOn("Posted over a month ago", NOW)).toBeUndefined();
    expect(parseWorkdayPostedOn(undefined, NOW)).toBeUndefined();
    expect(parseWorkdayPostedOn(42, NOW)).toBeUndefined();
  });
});

describe("workdayTenantFromHost", () => {
  it("takes the first DNS label", () => {
    expect(
      workdayTenantFromHost("walmart.wd504.myworkdayjobs.com"),
    ).toBe("walmart");
  });
});

describe("mapWorkdayPosting", () => {
  const company = { name: "Nvidia", companyType: "MNC" as const };
  const host = "nvidia.wd5.myworkdayjobs.com";
  const board = "NVIDIAExternalCareerSite";

  it("maps list fields + description to RawJob", () => {
    const raw = mapWorkdayPosting(
      {
        title: "Senior Software Engineer, NVLINK",
        externalPath:
          "/job/Israel-Yokneam/Senior-Software-Engineer--NVLINK_JR2004601",
        locationsText: "2 Locations",
        postedOn: "Posted Today",
        bulletFields: ["JR2004601"],
      },
      company,
      host,
      board,
      "<p>Build GPUs.</p>",
    );
    expect(raw).toMatchObject({
      externalId: "JR2004601",
      title: "Senior Software Engineer, NVLINK",
      description: "<p>Build GPUs.</p>",
      companyName: "Nvidia",
      location: "2 Locations",
      applyUrl: `https://${host}/en-US/${board}/job/Israel-Yokneam/Senior-Software-Engineer--NVLINK_JR2004601`,
    });
    expect(raw!.postedAt).toBeInstanceOf(Date);
  });

  it("falls back to bulletFields location when locationsText is absent", () => {
    const raw = mapWorkdayPosting(
      {
        title: "Digital Marketing",
        externalPath: "/job/Dublin/Digital-Marketing_R00354853",
        postedOn: "Posted Yesterday",
        bulletFields: ["R00354853", "Dublin"],
      },
      { name: "Accenture", companyType: "MNC" },
      "accenture.wd103.myworkdayjobs.com",
      "AccentureCareers",
      "Marketing things.",
    );
    expect(raw!.externalId).toBe("R00354853");
    expect(raw!.location).toBe("Dublin");
  });

  it("flags remote postings", () => {
    const raw = mapWorkdayPosting(
      {
        title: "Backend Engineer (Remote)",
        externalPath: "/job/Remote/Backend_R1",
        locationsText: "Remote",
        postedOn: "Posted Today",
        bulletFields: ["R1"],
      },
      company,
      host,
      board,
      "Remote work.",
    );
    expect(raw!.remote).toBe(true);
  });

  it("returns null without an id or path", () => {
    expect(
      mapWorkdayPosting({}, company, host, board, "x"),
    ).toBeNull();
  });
});

describe("WorkdaySource", () => {
  it("is named workday", () => {
    expect(new WorkdaySource().name).toBe("workday");
  });
});
