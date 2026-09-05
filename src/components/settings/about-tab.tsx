"use client";

import { useEffect, useRef, useState } from "react";
import { Database, Download, Loader2, Monitor, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { TabsContent } from "@/components/ui/tabs";

import { getDesktopBridge } from "@/lib/desktop";

import packageJson from "../../../package.json";
export const APP_VERSION = packageJson.version;

export function AboutTab() {
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const manualUpdateToastRef = useRef<string | number | null>(null);

  useEffect(() => {
    const bridge = getDesktopBridge();

    if (!bridge) {
      return;
    }

    const finishManualCheck = () => {
      setIsCheckingForUpdates(false);
      manualUpdateToastRef.current = null;
    };

    const unsubAvailable = bridge.onUpdateAvailable((info) => {
      const id = manualUpdateToastRef.current;
      if (id != null) {
        toast.loading(`Update v${info.version} available. Downloading...`, { id });
        finishManualCheck();
      }
    });

    const unsubReady = bridge.onUpdateReady((info) => {
      const id = manualUpdateToastRef.current;
      if (id != null) {
        toast.success(`Update v${info.version} is ready`, { id });
        finishManualCheck();
      }
    });

    const unsubNotAvailable = bridge.onUpdateNotAvailable(() => {
      const id = manualUpdateToastRef.current;
      if (id != null) {
        toast.success("Foleyard is up to date", { id });
        finishManualCheck();
      }
    });

    const unsubError = bridge.onUpdateError((info) => {
      const id = manualUpdateToastRef.current;
      if (id != null) {
        toast.error(`Update check failed: ${info.message}`, { id });
        finishManualCheck();
      }
    });

    return () => {
      unsubAvailable();
      unsubReady();
      unsubNotAvailable();
      unsubError();
    };
  }, []);
  const handleCheckForUpdates = async () => {
    const bridge = getDesktopBridge();

    if (!bridge) {
      toast.error("Update checks are only available in the desktop app");
      return;
    }

    setIsCheckingForUpdates(true);
    manualUpdateToastRef.current = toast.loading("Checking for updates...");

    try {
      const result = await bridge.checkForUpdates();

      if (!result.ok) {
        toast.error("Update check failed", { id: manualUpdateToastRef.current ?? undefined });
        setIsCheckingForUpdates(false);
        manualUpdateToastRef.current = null;
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Update check failed",
        { id: manualUpdateToastRef.current ?? undefined },
      );
      setIsCheckingForUpdates(false);
      manualUpdateToastRef.current = null;
    }
  };

  return (
          <TabsContent value="about" className="m-0 flex-1 p-8 outline-none">
             <div className="mx-auto max-w-3xl space-y-8">
                <div>
                  <h3 className="text-3xl font-bold tracking-tight text-zinc-50">About</h3>
                  <p className="mt-1 text-[13px] text-zinc-500">
                    Version info, updates, and help.
                  </p>
                </div>
                <div className="flex items-center gap-3 border-y border-white/10 py-4">
                   <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-fill/12 text-accent-text">
                     <Database className="size-5" />
                   </div>
                   <div className="min-w-0 flex-1">
                     <p className="text-sm font-semibold text-zinc-100">Foleyard</p>
                      <p className="text-xs text-zinc-500">Local-first sound library</p>
                   </div>
                   <Badge variant="secondary" className="h-6 rounded-md bg-white/5 px-3 font-mono text-zinc-200">v{APP_VERSION}</Badge>
                   <Badge variant="outline" className="h-6 rounded-md border-white/15 px-3 font-mono text-zinc-400">Desktop Core</Badge>
                </div>

                <p className="max-w-2xl text-sm leading-6 text-zinc-400">
                   Foleyard is an open-source sound library. It indexes local audio so you can search and organize it.
                </p>

                <div className="flex gap-2 border-t border-white/10 pt-4">
                   <Button
                     variant="outline"
                     className="h-10 gap-2 rounded-xl border-white/10 bg-white/5 px-4 text-zinc-200 hover:border-accent-fill/50 hover:text-zinc-100"
                     onClick={handleCheckForUpdates}
                     disabled={isCheckingForUpdates}
                   >
                      {isCheckingForUpdates ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Download className="size-4" />
                      )}
                      Check for Updates
                   </Button>
                   <Button
                     variant="outline"
                     className="h-10 gap-2 rounded-xl border-white/10 bg-white/5 px-4 text-zinc-200 hover:border-accent-fill/50 hover:text-zinc-100"
                     onClick={() => window.open("https://github.com/Daelars/foleyard-v2#readme", "_blank", "noopener,noreferrer")}
                   >
                      <ExternalLink className="size-4" /> Documentation
                   </Button>
                   <Button
                     variant="outline"
                     className="h-10 gap-2 rounded-xl border-white/10 bg-white/5 px-4 text-zinc-200 hover:border-accent-fill/50 hover:text-zinc-100"
                     onClick={() => window.open("https://github.com/Daelars/foleyard-v2", "_blank", "noopener,noreferrer")}
                   >
                      <Monitor className="size-4" /> GitHub
                   </Button>
                </div>

                <div className="space-y-1 border-t border-white/10 pt-4 font-mono text-[10px] text-zinc-600">
                   <p>© 2026 Foleyard Contributors</p>
                   <p>MIT Licensed · Built with Next.js, Electron & SQLite</p>
                </div>
             </div>
          </TabsContent>
  );
}
