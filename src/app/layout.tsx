import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UpdateNotifier } from "@/components/UpdateNotifier";
import "./globals.css";

export const metadata: Metadata = {
  title: "Foleyard",
  description: "Local audio library manager for sound effects and music.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="dark h-full antialiased"
    >
      <body className="flex min-h-full flex-col font-sans">
        <TooltipProvider>
          {children}
          <Toaster />
          <UpdateNotifier />
        </TooltipProvider>
      </body>
    </html>
  );
}
