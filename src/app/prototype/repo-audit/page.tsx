"use client";

// THROWAWAY: three layouts for reviewing the audit and trying proposed scan/tool workflows.
// Question: can users understand partial scans and authorize a tool before it writes?
// Existing /prototype convention is the host for this audit workbench, not the live library.
import { Suspense, useEffect, useState } from "react";
import { ArrowRight, Folder, Pause, Play, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrototypeSwitcher, usePrototypeVariant } from "@/components/PrototypeSwitcher";
import { findings } from "./findings";

const variants = [{ key: "A", name: "Library workbench" }, { key: "B", name: "Operation timeline" }, { key: "C", name: "Implementation desk" }];
const stages = ["Ready", "Discovering", "Reading metadata", "Reconciling", "Complete"];
const roots = ["Field recordings", "Studio effects", "Archive drive"];
const files = ["Rain on a tin roof.wav", "Station announcement.wav", "Footsteps on gravel.wav", "Heavy door close.wav"];

function AuditPrototype() {
  const variant = usePrototypeVariant(variants);
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);
  const [offline, setOffline] = useState(true);
  const [granted, setGranted] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [job, setJob] = useState("Not started");
  const [log, setLog] = useState(["Example library loaded. No real files are connected."]);
  const [area, setArea] = useState("All");
  const [selected, setSelected] = useState<string>("B01");
  const [planned, setPlanned] = useState<string[]>([]);
  const finding = findings.find(item => item.id === selected)!;
  const filtered = findings.filter(item => area === "All" || item.area === area);
  const record = (message: string) => setLog(current => [message, ...current].slice(0, 12));

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setStep(current => Math.min(4, current + 1));
    }, 1800);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    if (step !== 4 || !running) return;
    // A terminal transition belongs to the simulation, not a server response.
    const timer = setTimeout(() => {
      setRunning(false);
      setLog(current => [offline ? "Scan finished with Archive drive deferred. Its index was preserved." : "Scan finished. All three roots reconciled.", ...current].slice(0, 12));
    }, 0);
    return () => clearTimeout(timer);
  }, [step, running, offline]);

  const start = () => { setStep(1); setRunning(true); record("Started a simulated scan. Browsing remains available."); };
  const runTool = () => {
    if (!enabled || !granted) { setJob("Blocked: write access required"); record("Host rejected Gather. No files written."); return; }
    setJob("Needs review: hit.wav already exists"); record("Preview found a name collision. Existing audio is preserved.");
  };
  const reset = () => { setStep(0); setRunning(false); setOffline(true); setGranted(false); setEnabled(true); setJob("Not started"); setLog(["Example library reset."]); };
  const state = { variant, scan: { phase: stages[step], running, completed: step === 4, offlineRoot: offline ? roots[2] : null, preservedOfflineFiles: offline ? 8400 : 0, exampleCounts: { discovered: step * 1200, pending: running ? 64 : 0, active: running ? 8 : 0 } }, extension: { enabled, grants: granted ? ["files:copy", "destination:chosen-directory"] : [], job }, planned };

  const scan = <section className="rounded-xl border border-border bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-muted-foreground">Library index</p><h2 className="mt-1 text-xl font-semibold">{step === 4 && offline ? "Complete with one deferred root" : stages[step]}</h2></div><Badge variant={offline ? "outline" : "secondary"}>{offline ? "1 root offline" : "All roots online"}</Badge></div>
    <progress aria-label="Simulated scan progress" className="my-5 h-2 w-full accent-primary" value={step} max={4} />
    <div className="flex flex-col gap-3">{roots.map((root, index) => <div key={root} className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><Folder className="size-4 text-muted-foreground" />{root}</span><span className="text-muted-foreground">{index === 2 && offline ? "Offline · 8,400 files kept" : step === 4 ? "Up to date" : running ? "Scanning" : "Ready"}</span></div>)}</div>
    <div className="mt-5 flex flex-wrap gap-2"><Button onClick={start} disabled={running}><Play data-icon="inline-start" />{step === 4 ? "Scan again" : "Start scan"}</Button><Button variant="outline" disabled={step === 0 || step === 4} onClick={() => { setRunning(!running); record(running ? "Paused scheduling; existing results remain." : "Resumed the simulated scan."); }}><Pause data-icon="inline-start" />{running ? "Pause" : "Resume"}</Button><Button variant="ghost" onClick={() => { setOffline(!offline); record(offline ? "Archive drive reconnected. Scan again to reconcile it." : "Archive drive disconnected. Its records will be retained."); }}>{offline ? "Reconnect archive" : "Disconnect archive"}</Button></div>
    <p className="mt-4 text-xs text-muted-foreground">Proposed behavior. Progress counts are illustrative. Only successfully scanned roots can remove missing records.</p>
  </section>;

  const extension = <section className="rounded-xl border border-border bg-card p-5">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-muted-foreground">Extension host</p><h2 className="mt-1 text-xl font-semibold">Library Gatherer</h2></div><ShieldCheck className="size-5 text-primary" /></div>
    <p className="mt-3 text-sm text-muted-foreground">Collect audio into a chosen destination. Review the planned copies before any writes.</p>
    <div className="my-4 flex flex-wrap gap-2"><Badge variant="secondary">Bundled · trusted code</Badge><Badge variant="outline">{enabled ? "Enabled" : "Disabled"}</Badge><Badge variant="outline">{granted ? "Destination granted" : "No write grant"}</Badge></div>
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setGranted(!granted); record(granted ? "Destination grant revoked." : "Granted this simulated destination only."); }}>{granted ? "Revoke grant" : "Grant destination"}</Button><Button variant="ghost" onClick={() => setEnabled(!enabled)}>{enabled ? "Disable extension" : "Enable extension"}</Button></div>
    <div className="mt-5 border-t border-border pt-4"><p aria-live="polite" className="mb-3 text-sm">{job}</p><div className="flex flex-wrap gap-2"><Button onClick={runTool}>Preview gather<ArrowRight data-icon="inline-end" /></Button>{job.startsWith("Needs review") && <Button variant="outline" disabled={!granted || !enabled} onClick={() => { setJob("Complete: copied as hit 2.wav"); record("Copied as hit 2.wav. Original hit.wav unchanged. Example operation only."); }}>Keep both and run</Button>}{job !== "Not started" && <Button variant="ghost" onClick={() => { setJob("Cancelled"); record("Gather cancelled. No further files scheduled."); }}>Cancel</Button>}</div></div>
  </section>;

  const detail = <article className="rounded-xl border border-border bg-card p-5" aria-live="polite"><div className="flex gap-2"><Badge>{finding.id}</Badge><Badge variant="outline">{finding.priority}</Badge></div><h3 className="mt-4 text-xl font-semibold">{finding.title}</h3><p className="mt-3 text-sm text-muted-foreground">{finding.evidence}</p><h4 className="mt-5 text-sm font-semibold">Proposed change</h4><p className="mt-2 text-sm text-muted-foreground">{finding.proposal}</p><h4 className="mt-5 text-sm font-semibold">What would prove it</h4><p className="mt-2 text-sm text-muted-foreground">{finding.verify}</p><code className="mt-5 block break-all text-xs text-muted-foreground">{finding.source}</code><Button className="mt-5" variant="outline" onClick={() => setPlanned(current => current.includes(finding.id) ? current.filter(id => id !== finding.id) : [...current, finding.id])}>{planned.includes(finding.id) ? "Remove from my review queue" : "Add to my review queue"}</Button><p className="mt-2 text-xs text-muted-foreground">Review queue is temporary and resets on reload.</p></article>;
  const healthStats = [
    { value: "9", label: "test files collected" },
    { value: "53", label: "tests (37 passing, 16 expected-fail)" },
    { value: "52.68%", label: "statements covered (baseline 37.77%)" },
    { value: "20 of 224", label: "modules no test loads (was 96)" },
  ];
  const health = <section aria-label="Test health" className="mb-4 rounded-xl border border-border bg-card p-5"><div className="flex flex-wrap items-baseline justify-between gap-3"><h3 className="text-sm font-semibold">Test health</h3><p className="text-xs text-muted-foreground">Measured 5 September 2026 — a stale date means stale numbers.</p></div><dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{healthStats.map(stat => <div key={stat.label}><dt className="text-2xl font-semibold tracking-tight">{stat.value}</dt><dd className="mt-1 text-xs leading-5 text-muted-foreground">{stat.label}</dd></div>)}</dl><p className="mt-4 text-xs leading-5 text-muted-foreground">A passing count and a coverage claim are two different claims: the September audit found 410 passing tests alongside 96 wholly unexecuted modules, including the file that held two shipped defects.</p></section>;
  const ledger = <section><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{findings.length} findings and proposals</h2><label className="flex items-center gap-2 text-sm">Area<select aria-label="Filter findings by area" value={area} onChange={event => setArea(event.target.value)} className="rounded-md border border-border bg-background p-2">{["All", "Bugs", "Indexing", "Extensions", "Performance", "Cleanup", "Tests"].map(value => <option key={value}>{value}</option>)}</select></label></div>{health}<div className="flex flex-col gap-1">{filtered.map(item => <Button key={item.id} variant={selected === item.id ? "secondary" : "ghost"} className="h-auto min-h-10 justify-start whitespace-normal py-3 text-left" onClick={() => setSelected(item.id)}><span className="w-8 shrink-0">{item.id}</span><span className="flex-1">{item.title}</span><span>{planned.includes(item.id) ? "Queued" : item.priority}</span></Button>)}</div></section>;

  return <main className="min-h-0 flex-1 overflow-y-auto bg-background pb-28 text-foreground">
    <header className="border-b border-border px-5 py-4"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="text-lg font-bold tracking-tight">foleyard</span><span className="text-muted-foreground">/</span><span className="text-sm">Repository review</span></div><div className="flex items-center gap-3"><Badge variant="outline">Interactive prototype</Badge><Button variant="ghost" size="sm" onClick={reset}><RotateCcw data-icon="inline-start" />Reset simulation</Button></div></div></header>
    <div className="mx-auto max-w-7xl px-5 pt-9"><p className="text-xs uppercase tracking-widest text-primary">September 2026 · design proposal</p><h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">A library you can trust.<br /><span className="text-muted-foreground">Tools you can inspect.</span></h1><p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">Explore scan recovery and permission-aware tools, then inspect the source-backed work behind them. Everything here is simulated. No audio, settings or library data will change.</p>
      <div className="my-7 flex flex-wrap gap-5 border-y border-border py-4 text-sm"><span><strong>{findings.length}</strong> review items</span><span><strong>53</strong> tests across <strong>9</strong> files</span><span><strong>5</strong> audit reproductions passed</span><span><strong>{planned.length}</strong> in your review queue</span></div>
      {variant === "A" && <div className="grid gap-6 lg:grid-cols-[200px_1fr_340px]"><aside className="flex flex-col gap-4"><h2 className="text-xs uppercase tracking-widest text-muted-foreground">Example workspace</h2><p>Library</p><p className="text-muted-foreground">Favorites</p><p className="text-muted-foreground">Collections</p><p className="font-semibold text-primary">Index & extensions</p><p className="mt-5 text-xs leading-5 text-muted-foreground">A. Keep index health beside the library. Inspect a tool without leaving your work.</p></aside><div className="flex min-w-0 flex-col gap-5">{scan}<section className="rounded-xl border border-border p-5"><h2 className="mb-4 font-semibold">Browsing stays available</h2>{files.map((file, i) => <div key={file} className="flex justify-between gap-3 border-t border-border py-3 text-sm"><span>{file}</span><span className="text-muted-foreground">{["0:24", "0:08", "0:12", "0:03"][i]}</span></div>)}</section></div><div>{extension}</div><div className="lg:col-span-2">{ledger}</div><div>{detail}</div></div>}
      {variant === "B" && <div className="flex flex-col gap-8"><div className="grid gap-5 md:grid-cols-5">{stages.map((stage, index) => <div key={stage} className="border-l-2 border-border pl-4"><Badge variant={step === index ? "default" : "outline"}>{index + 1}</Badge><h2 className="mt-3 font-semibold">{stage}</h2><p className="mt-2 text-xs text-muted-foreground">{["Choose scope", "Bound pending work", "Retry incomplete reads", "Protect offline roots", "Publish outcomes"][index]}</p></div>)}</div><p className="text-sm text-muted-foreground">B. Follow the operation from start to finish. Scan and extension jobs share visible progress and outcomes.</p><div className="grid gap-6 md:grid-cols-2">{scan}{extension}</div><section className="border-y border-border py-5"><h2 className="mb-4 font-semibold">Operation history</h2>{log.map((line, index) => <p key={index} className="py-2 font-mono text-xs text-muted-foreground">{String(log.length - index).padStart(2, "0")} · {line}</p>)}</section><div className="grid gap-6 lg:grid-cols-[1fr_400px]">{ledger}{detail}</div></div>}
      {variant === "C" && <div className="grid gap-6 lg:grid-cols-[1fr_1fr]"><div><p className="mb-5 text-sm text-muted-foreground">C. Review evidence and choose the next work item. Try the relevant workflow alongside the implementation details.</p>{ledger}</div><div className="flex min-w-0 flex-col gap-5">{detail}{scan}{extension}</div></div>}
      <details open className="mt-8 rounded-xl border border-border p-5"><summary className="cursor-pointer text-sm font-semibold">Simulation state and event history</summary><div className="mt-4 grid gap-6 md:grid-cols-2"><pre className="overflow-auto text-xs leading-5 text-muted-foreground">{JSON.stringify(state, null, 2)}</pre><div aria-live="polite">{log.map((line, index) => <p key={index} className="mb-3 text-xs leading-5 text-muted-foreground">{line}</p>)}</div></div></details>
      <p className="mt-6 text-xs text-muted-foreground">Handoff: docs/audit-2026-09/IMPLEMENTATION.md · Working branch: prototype/repo-audit-indexing-extensions · No commits made.</p>
    </div><PrototypeSwitcher variants={variants} current={variant} />
  </main>;
}

export default function Page() { return <Suspense fallback={<p>Loading review…</p>}><AuditPrototype /></Suspense>; }
