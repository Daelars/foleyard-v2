"use client";

import type { ReactNode } from "react";

/**
 * Settings Extensions tab: the v2 extension management section owns
 * enablement, permissions and per-setting controls. The v1 catalog list
 * is retired; v1 execution no longer exists.
 */
export function V3SettingsExtensionsTab({ v2Settings }: { v2Settings?: ReactNode }) {
  return (
    <div className="w-full space-y-8">
      <div>
        <h3 className="text-2xl font-bold tracking-tight text-zinc-50">
          Extension management
        </h3>
        <p className="mt-1 text-[13px] text-zinc-500">
          Enable or disable workflow tools, review permissions, and change
          extension settings.
        </p>
      </div>
      {v2Settings}
    </div>
  );
}
