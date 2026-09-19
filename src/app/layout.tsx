import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ULTRON — Installable Assistant Runtime",
  description:
    "ULTRON v1.16 — packaging & installability milestone. Code and user data are fully separated; credentials, databases, logs and workspace live in platform user directories.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="scanlines antialiased">{children}</body>
    </html>
  );
}
