import Link from "next/link";
import type { ReactNode } from "react";

export type NavPage = "discover" | "tracker" | "resumes" | "settings";

const LINKS: { page: NavPage; href: string; label: string }[] = [
  { page: "discover", href: "/", label: "Discover" },
  { page: "tracker", href: "/tracker", label: "Tracker" },
  { page: "resumes", href: "/resumes", label: "Resumes" },
  { page: "settings", href: "/settings", label: "Settings" },
];

// Calm nav: quiet pills, current page omitted so the header never repeats it.
export function SiteNav({
  current,
  children,
}: {
  current?: NavPage;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      {LINKS.filter((l) => l.page !== current).map((l) => (
        <Link key={l.page} href={l.href} className="calm-pill">
          {l.label}
        </Link>
      ))}
      {children}
    </div>
  );
}
