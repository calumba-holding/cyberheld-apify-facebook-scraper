import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Evidence Capture — Operator Console",
  description: "Chrome session pool, sign-in, live VNC, and run-a-job-on-a-post",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <span className="brand">🛡️ Evidence Capture — Console</span>
          <a href="/">Session Pool</a>
          <a href="/jobs">Run a Job</a>
          <span className="spacer" />
          <span style={{ color: "var(--muted)", fontSize: 12 }}>one account ↔ one Chrome profile</span>
        </nav>
        <div className="wrap">{children}</div>
      </body>
    </html>
  );
}
