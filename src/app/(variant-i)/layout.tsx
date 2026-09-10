// Root workspace layout.
//
// Imports the variant I library stylesheet once and hosts the I-styled
// toast viewport for the duration of the surface (see components/toasts.tsx).
import type { ReactNode } from "react";

import "@/components/variant-i/styles.css";

import { VariantIToastHost } from "./components/toasts";

export default function AppV3Layout({ children }: { children: ReactNode }) {
  return <VariantIToastHost>{children}</VariantIToastHost>;
}