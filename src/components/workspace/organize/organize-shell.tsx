"use client";

import type { ReactNode } from "react";

export function OrganizeShell({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pb-4 md:px-5">
      <style>{`@keyframes field-rise {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .field-rise { animation: field-rise 0.35s cubic-bezier(0.22, 1, 0.36, 1) both; }`}</style>
      {children}
    </div>
  );
}
