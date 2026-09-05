import { notFound } from "next/navigation";
import type { ReactNode } from "react";

// Prototype routes are local design work only. They stay compilable in
// `next dev` but resolve to the not-found page in production builds
// (including the packaged desktop app, which additionally excludes the
// compiled prototype routes via electron-builder.yml ignores).
export default function PrototypeLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return children;
}
