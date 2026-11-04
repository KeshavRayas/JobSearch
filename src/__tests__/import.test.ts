import { describe, it, expect } from "vitest";
import {
  assertImportableUrl,
  parseImportedPage,
} from "@/lib/ingestion/import";

describe("assertImportableUrl", () => {
  it("accepts https URLs", () => {
    expect(
      assertImportableUrl("https://jobs.ashbyhq.com/org/123").hostname,
    ).toBe("jobs.ashbyhq.com");
  });

  it("rejects non-http protocols", () => {
    expect(() => assertImportableUrl("ftp://example.com/jobs")).toThrow();
    expect(() => assertImportableUrl("not a url")).toThrow();
  });

  it("blocks local network targets (SSRF guard)", () => {
    for (const bad of [
      "http://localhost:3000/admin",
      "http://127.0.0.1/jobs",
      "http://10.0.0.5/jobs",
      "http://192.168.1.1/jobs",
      "http://172.16.0.1/jobs",
      "http://0.0.0.0/jobs",
    ]) {
      expect(() => assertImportableUrl(bad)).toThrow();
    }
  });
});

describe("parseImportedPage", () => {
  const html = `
    <html><head>
      <title>Software Engineer - Acme</title>
      <meta property="og:site_name" content="Acme Corp" />
      <script>var x = 1;</script>
      <style>.a{color:red}</style>
    </head><body>
      <h1>Software Engineer</h1>
      <p>Build backend systems with Python and Go. 0-2 years experience. Bangalore based role.</p>
    </body></html>`;

  it("extracts title, company, and cleaned description", () => {
    const out = parseImportedPage("https://acme.com/jobs/1", html);
    expect(out.title).toBe("Software Engineer - Acme");
    expect(out.companyName).toBe("Acme Corp");
    expect(out.description).toContain("Build backend systems");
    expect(out.description).not.toContain("var x = 1");
    expect(out.description).not.toContain("color:red");
    expect(out.applyUrl).toBe("https://acme.com/jobs/1");
  });

  it("falls back to hostname when no site name is present", () => {
    const out = parseImportedPage(
      "https://www.example-jobs.com/post/9",
      "<html><head><title>Dev</title></head><body><p>Work.</p></body></html>",
    );
    expect(out.companyName).toBe("Example Jobs");
  });

  it("infers Bangalore and Remote locations for the workMode gate", () => {
    const b = parseImportedPage(
      "https://x.com/1",
      "<html><head><title>Backend Intern</title></head><body><p>On-site in Bangalore, Karnataka.</p></body></html>",
    );
    expect(b.location).toBe("Bangalore");
    const r = parseImportedPage(
      "https://x.com/2",
      "<html><head><title>Dev (Remote)</title></head><body><p>Fully remote role.</p></body></html>",
    );
    expect(r.location).toBe("Remote");
    expect(r.remote).toBe(true);
  });
});
