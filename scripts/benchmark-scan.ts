import fs from "fs/promises";
import path from "path";
import process from "process";
import { performance } from "perf_hooks";

import pc from "picocolors";

import type { ScanStatus as ScannerScanStatus } from "../src/lib/scanner";

type CliOptions = {
  desktopMode: boolean;
  discoverOnly: boolean;
  pollMs: number;
  rootOverride: string | null;
};

type MetricOptions = {
  accent?: "default" | "success" | "warning" | "error";
};

type DiscoveryBenchmarkReport = {
  mode: "streaming-batches" | "collect-all";
  filesFound: number;
  batchesProcessed: number | null;
  firstFileLatencyMs: number | null;
  elapsedMs: number;
  throughput: string;
};

type ValidationReport = {
  valid: boolean;
  readable: boolean;
  normalizedPath: string | null;
  elapsedMs: number;
  error: string | null;
};

type NormalizedScanMetrics = {
  discovered: number;
  indexed: number;
  skippedUnchanged: number;
  metadataProcessed: number;
  added: number;
  updated: number;
  removed: number;
  failed: number;
  errors: number;
};

type ScanReport = {
  finalPhase: string;
  elapsedMs: number;
  metrics: NormalizedScanMetrics;
  discoveryThroughput: string | null;
  overallThroughput: string;
  indexingThroughput: string | null;
  metadataThroughput: string | null;
  error: string | null;
};

type RunReport = {
  startedAt: string;
  completedAt: string | null;
  options: CliOptions;
  targetRoot: string;
  mode: "discovery-only" | "full-scan";
  validation: ValidationReport | null;
  discovery: DiscoveryBenchmarkReport | null;
  scan: ScanReport | null;
  exitCode: number;
};

type RunArtifacts = {
  directory: string;
  logLines: string[];
  report: RunReport;
};

const RUNS_DIRECTORY = path.resolve(process.cwd(), "benchmarks", "scan-runs");

function parseArgs(argv: string[]): CliOptions {
  let desktopMode = true;
  let discoverOnly = false;
  let pollMs = 1;
  let rootOverride: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--project-db") {
      desktopMode = false;
      continue;
    }

    if (arg === "--desktop-db") {
      desktopMode = true;
      continue;
    }

    if (arg === "--discover-only") {
      discoverOnly = true;
      continue;
    }

    if (arg === "--root") {
      rootOverride = argv[index + 1] ? path.resolve(argv[index + 1]) : null;
      index += 1;
      continue;
    }

    if (arg === "--poll-ms") {
      const nextValue = Number(argv[index + 1] ?? "1000");
      if (Number.isFinite(nextValue) && nextValue > 0) {
        pollMs = nextValue;
      }
      index += 1;
    }
  }

  return { desktopMode, discoverOnly, pollMs, rootOverride };
}

function formatMs(value: number) {
  return `${value.toFixed(1)}ms`;
}

// Preserved as part of the benchmark formatting helpers contract.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatSeconds(value: number) {
  return `${value.toFixed(2)}s`;
}

function formatDuration(valueMs: number) {
  if (!Number.isFinite(valueMs) || valueMs < 0) {
    return "0s";
  }

  if (valueMs < 1000) {
    return formatMs(valueMs);
  }

  const totalSeconds = valueMs / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(2)}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;

  if (minutes < 60) {
    return `${minutes}m ${seconds.toFixed(1)}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m ${seconds.toFixed(0)}s`;
}

function formatRate(count: number, elapsedMs: number, unit: string) {
  if (elapsedMs <= 0) {
    return `0 ${unit}/s`;
  }

  return `${(count / (elapsedMs / 1000)).toFixed(1)} ${unit}/s`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function colorizeValue(
  value: string,
  accent: MetricOptions["accent"] = "default",
) {
  if (accent === "success") {
    return pc.green(value);
  }

  if (accent === "warning") {
    return pc.yellow(value);
  }

  if (accent === "error") {
    return pc.red(value);
  }

  return value;
}

function stripAnsi(value: string) {
  return value.replace(/\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function createRunDirectoryName(date: Date) {
  const parts = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
    "-",
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0"),
    String(date.getUTCSeconds()).padStart(2, "0"),
    "-",
    String(date.getUTCMilliseconds()).padStart(3, "0"),
  ];

  return parts.join("");
}

async function createRunArtifacts(
  options: CliOptions,
  targetRoot: string,
): Promise<RunArtifacts> {
  const now = new Date();
  const directory = path.join(RUNS_DIRECTORY, createRunDirectoryName(now));

  await fs.mkdir(directory, { recursive: true });

  return {
    directory,
    logLines: [],
    report: {
      startedAt: now.toISOString(),
      completedAt: null,
      options,
      targetRoot,
      mode: options.discoverOnly ? "discovery-only" : "full-scan",
      validation: null,
      discovery: null,
      scan: null,
      exitCode: 0,
    },
  };
}

function normalizeScanMetrics(
  status: Partial<
    Pick<
      ScannerScanStatus,
      | "discovered"
      | "indexed"
      | "skippedUnchanged"
      | "metadataProcessed"
      | "added"
      | "updated"
      | "removed"
      | "failed"
      | "errors"
    >
  >,
): NormalizedScanMetrics {
  return {
    discovered: status.discovered ?? 0,
    indexed: status.indexed ?? 0,
    skippedUnchanged: status.skippedUnchanged ?? 0,
    metadataProcessed: status.metadataProcessed ?? 0,
    added: status.added ?? 0,
    updated: status.updated ?? 0,
    removed: status.removed ?? 0,
    failed: status.failed ?? 0,
    errors: status.errors ?? status.failed ?? 0,
  };
}

function writeLine(artifacts: RunArtifacts, line = "") {
  console.log(line);
  artifacts.logLines.push(stripAnsi(line));
}

function printHeader(
  artifacts: RunArtifacts,
  options: CliOptions,
  targetRoot: string,
) {
  writeLine(artifacts, `${pc.cyan("◇")} ${pc.bold("Foleyard scan benchmark")}`);
  writeLine(artifacts);
  printMetric(
    artifacts,
    "Database",
    options.desktopMode ? "desktop" : "project",
  );
  printMetric(artifacts, "Library", targetRoot);
  printMetric(artifacts, "Poll rate", formatMs(options.pollMs));
  printMetric(
    artifacts,
    "Mode",
    options.discoverOnly ? "discovery only" : "full scan",
  );
  printMetric(artifacts, "Artifacts", artifacts.directory);
  writeLine(artifacts);
}

function printStage(artifacts: RunArtifacts, title: string) {
  writeLine(artifacts, `${pc.cyan("◆")} ${pc.bold(title)}`);
}

function printMetric(
  artifacts: RunArtifacts,
  label: string,
  value: string,
  options?: MetricOptions,
) {
  const paddedLabel = label.padEnd(20, " ");
  writeLine(
    artifacts,
    `  ${pc.dim(paddedLabel)} ${colorizeValue(value, options?.accent)}`,
  );
}

function printStatus(
  artifacts: RunArtifacts,
  label: string,
  ok: boolean,
  value: string,
) {
  const icon = ok ? pc.green("✓") : pc.red("✖");
  printMetric(artifacts, `${icon} ${label}`, value, {
    accent: ok ? "success" : "error",
  });
}

function printErrorBlock(
  artifacts: RunArtifacts,
  title: string,
  fields: Array<{ label: string; value: string }>,
) {
  writeLine(artifacts, `${pc.red("✖")} ${pc.bold(title)}`);
  writeLine(artifacts);
  for (const field of fields) {
    printMetric(artifacts, field.label, field.value, {
      accent: field.label === "Error" ? "error" : "default",
    });
  }
}

function clearLiveLine() {
  if (!process.stdout.isTTY) {
    return;
  }

  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
}

function writeLiveLine(artifacts: RunArtifacts, content: string) {
  artifacts.logLines.push(stripAnsi(content));

  if (!process.stdout.isTTY) {
    console.log(content);
    return;
  }

  clearLiveLine();
  process.stdout.write(content);
}

function finishLiveLine() {
  if (!process.stdout.isTTY) {
    return;
  }

  process.stdout.write("\n");
}

function printPhaseChange(artifacts: RunArtifacts, phase: string) {
  writeLine(
    artifacts,
    `  ${pc.yellow("→")} ${pc.dim("Phase changed:")} ${pc.yellow(phase)}`,
  );
}

function createLiveProgressLine(
  elapsedMs: number,
  status: Partial<ScannerScanStatus>,
) {
  const metrics = normalizeScanMetrics(status);

  return [
    pc.bold(formatDuration(elapsedMs).padStart(8, " ")),
    `${pc.dim("discovered")} ${formatCount(metrics.discovered)}`,
    `${pc.dim("indexed")} ${formatCount(metrics.indexed)}`,
    `${pc.dim("skipped")} ${formatCount(metrics.skippedUnchanged)}`,
    `${pc.dim("metadata")} ${formatCount(metrics.metadataProcessed)}`,
    `${pc.dim("added")} ${formatCount(metrics.added)}`,
    `${pc.dim("updated")} ${formatCount(metrics.updated)}`,
    `${pc.dim("removed")} ${formatCount(metrics.removed)}`,
    `${pc.dim("failed")} ${formatCount(metrics.failed)}`,
    `${pc.dim("errors")} ${formatCount(metrics.errors)}`,
  ].join("  ");
}

function printUsage() {
  console.log(
    [
      "Usage: npm run bench:scan -- [--root <path>] [--project-db] [--desktop-db] [--discover-only] [--poll-ms <ms>]",
      "",
      "Defaults:",
      "- Uses desktop database mode unless `--project-db` is passed.",
      "- Uses the stored library root unless `--root` is passed.",
      "- Runs validation, discovery, then a full scan benchmark.",
    ].join("\n"),
  );
}

function printBenchmarkNotes(artifacts: RunArtifacts) {
  writeLine(artifacts);
  printStage(artifacts, "Benchmark notes");
  printMetric(
    artifacts,
    "Validation",
    "Lightweight root/readability/first-audio-file check.",
  );
  printMetric(
    artifacts,
    "Discovery/index",
    "Fast indexing can populate the library before metadata finishes.",
  );
  printMetric(
    artifacts,
    "Warm scans",
    "Skipped unchanged files are expected on repeat scans.",
  );
  printMetric(
    artifacts,
    "Metadata",
    "metadataProcessed may lag indexed because enrichment is queued.",
  );
  printMetric(
    artifacts,
    "Errors",
    "Broken files increment counters without necessarily aborting the scan.",
  );
}

async function saveRunArtifacts(artifacts: RunArtifacts) {
  artifacts.report.completedAt = new Date().toISOString();

  await Promise.all([
    fs.writeFile(
      path.join(artifacts.directory, "benchmark.log"),
      `${artifacts.logLines.join("\n")}\n`,
      "utf8",
    ),
    fs.writeFile(
      path.join(artifacts.directory, "summary.json"),
      `${JSON.stringify(artifacts.report, null, 2)}\n`,
      "utf8",
    ),
  ]);
}

async function benchmarkDiscovery(
  filesystemModule: typeof import("../src/lib/scanner/filesystem"),
  normalizedRoot: string,
): Promise<DiscoveryBenchmarkReport> {
  const discoveryStart = performance.now();

  if (typeof filesystemModule.streamAudioFileBatches === "function") {
    let filesFound = 0;
    let batchesProcessed = 0;
    let firstFileLatencyMs: number | null = null;

    for await (const batch of filesystemModule.streamAudioFileBatches(normalizedRoot)) {
      batchesProcessed += 1;

      if (batch.length > 0 && firstFileLatencyMs === null) {
        firstFileLatencyMs = performance.now() - discoveryStart;
      }

      filesFound += batch.length;
    }

    const elapsedMs = performance.now() - discoveryStart;

    return {
      mode: "streaming-batches",
      filesFound,
      batchesProcessed,
      firstFileLatencyMs,
      elapsedMs,
      throughput: formatRate(filesFound, elapsedMs, "files"),
    };
  }

  let discoveredCount = 0;
  const discoveredFiles = await filesystemModule.collectAudioFiles(normalizedRoot, () => {
    if (discoveredCount === 0) {
      // Only meaningful as a compatibility fallback.
    }
    discoveredCount += 1;
  });
  const elapsedMs = performance.now() - discoveryStart;

  return {
    mode: "collect-all",
    filesFound: discoveredFiles.length || discoveredCount,
    batchesProcessed: null,
    firstFileLatencyMs: null,
    elapsedMs,
    throughput: formatRate(discoveredFiles.length, elapsedMs, "files"),
  };
}

function maybeFormatRate(count: number, elapsedMs: number) {
  if (count <= 0 || elapsedMs <= 0) {
    return null;
  }

  return formatRate(count, elapsedMs, "files");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  if (options.desktopMode) {
    process.env.FOLEYARD_DESKTOP = process.env.FOLEYARD_DESKTOP ?? "1";
  }

  const [{ getLibraryRoot }, filesystemModule, scanner] = await Promise.all([
    import("../src/lib/db"),
    import("../src/lib/scanner/filesystem"),
    import("../src/lib/scanner"),
  ]);

  const originalRoot = getLibraryRoot();
  const targetRoot = options.rootOverride ?? originalRoot;

  if (!targetRoot) {
    throw new Error(
      "No library root configured. Pass `--root <path>` or configure a library root first.",
    );
  }

  const artifacts = await createRunArtifacts(options, targetRoot);

  try {
    printHeader(artifacts, options, targetRoot);

    const validationStart = performance.now();
    const validation = await scanner.validateLibraryRoot(targetRoot);
    const validationElapsed = performance.now() - validationStart;

    artifacts.report.validation = {
      valid: validation.valid,
      readable: validation.readable,
      normalizedPath: validation.normalizedPath,
      elapsedMs: validationElapsed,
      error: validation.error,
    };

    printStage(artifacts, "Validation");
    printStatus(
      artifacts,
      "Status",
      validation.valid,
      validation.valid ? "ok" : "failed",
    );
    printStatus(
      artifacts,
      "Readable",
      validation.readable,
      validation.readable ? "yes" : "no",
    );
    if (validation.normalizedPath) {
      printMetric(artifacts, "Normalized path", validation.normalizedPath);
    }
    printMetric(
      artifacts,
      "Elapsed",
      `${formatDuration(validationElapsed)} ${pc.dim("(lightweight root check)")}`,
    );

    if (!validation.valid) {
      writeLine(artifacts);
      printErrorBlock(artifacts, "Validation failed", [
        { label: "Path", value: targetRoot },
        { label: "Error", value: validation.error ?? "Unknown validation error" },
      ]);
      process.exitCode = 1;
      artifacts.report.exitCode = 1;
      return;
    }

    writeLine(artifacts);

    const normalizedRoot = validation.normalizedPath ?? targetRoot;
    const discovery = await benchmarkDiscovery(filesystemModule, normalizedRoot);
    artifacts.report.discovery = discovery;

    printStage(artifacts, "Discovery");
    printMetric(artifacts, "Helper mode", discovery.mode);
    printMetric(artifacts, "Files found", formatCount(discovery.filesFound));
    if (discovery.batchesProcessed !== null) {
      printMetric(
        artifacts,
        "Batches processed",
        formatCount(discovery.batchesProcessed),
      );
    }
    if (discovery.firstFileLatencyMs !== null) {
      printMetric(
        artifacts,
        "First file latency",
        formatDuration(discovery.firstFileLatencyMs),
      );
    }
    printMetric(artifacts, "Elapsed", formatDuration(discovery.elapsedMs));
    printMetric(artifacts, "Throughput", discovery.throughput);
    writeLine(artifacts);

    if (options.discoverOnly) {
      printBenchmarkNotes(artifacts);
      writeLine(artifacts);
      writeLine(artifacts, `${pc.green("✓")} ${pc.bold("Benchmark complete")}`);
      return;
    }

    let restoredRoot = false;
    let liveLineActive = false;

    try {
      if (options.rootOverride) {
        scanner.saveLibraryRoot(normalizedRoot);
      }

      const startedAt = performance.now();
      const result = scanner.startScan();

      if (!result.started) {
        throw new Error(`Scan did not start: ${result.reason ?? "unknown"}`);
      }

      let previousPhase = result.status.phase;
      printStage(artifacts, "Full scan");
      printPhaseChange(artifacts, previousPhase);
      writeLine(artifacts);

      while (true) {
        await new Promise((resolve) => setTimeout(resolve, options.pollMs));
        const status = scanner.getScanStatus();

        if (status.phase !== previousPhase) {
          if (liveLineActive) {
            clearLiveLine();
            finishLiveLine();
            liveLineActive = false;
          }

          previousPhase = status.phase;
          printPhaseChange(artifacts, status.phase);
        }

        const elapsedMs = performance.now() - startedAt;
        const liveLine = createLiveProgressLine(elapsedMs, status);

        if (process.stdout.isTTY) {
          writeLiveLine(artifacts, liveLine);
          liveLineActive = true;
        } else {
          writeLiveLine(artifacts, liveLine);
        }

        if (!status.running) {
          const totalElapsed = performance.now() - startedAt;
          const metrics = normalizeScanMetrics(status);

          artifacts.report.scan = {
            finalPhase: status.phase,
            elapsedMs: totalElapsed,
            metrics,
            discoveryThroughput: discovery.throughput,
            overallThroughput: formatRate(
              metrics.discovered,
              totalElapsed,
              "files",
            ),
            indexingThroughput: maybeFormatRate(metrics.indexed, totalElapsed),
            metadataThroughput: maybeFormatRate(
              metrics.metadataProcessed,
              totalElapsed,
            ),
            error: status.error ?? null,
          };

          if (liveLineActive) {
            clearLiveLine();
            finishLiveLine();
            liveLineActive = false;
          }

          writeLine(artifacts);
          printStage(artifacts, "Scan summary");
          printMetric(artifacts, "Final phase", status.phase, {
            accent: status.phase === "complete" ? "success" : "warning",
          });
          printMetric(artifacts, "Elapsed", formatDuration(totalElapsed));
          printMetric(artifacts, "Discovered", formatCount(metrics.discovered));
          printMetric(artifacts, "Indexed", formatCount(metrics.indexed));
          printMetric(
            artifacts,
            "Skipped unchanged",
            formatCount(metrics.skippedUnchanged),
          );
          printMetric(
            artifacts,
            "Metadata processed",
            formatCount(metrics.metadataProcessed),
          );
          printMetric(artifacts, "Added", formatCount(metrics.added));
          printMetric(artifacts, "Updated", formatCount(metrics.updated));
          printMetric(artifacts, "Removed", formatCount(metrics.removed));
          printMetric(artifacts, "Failed", formatCount(metrics.failed), {
            accent: metrics.failed > 0 ? "warning" : "default",
          });
          printMetric(artifacts, "Errors", formatCount(metrics.errors), {
            accent: metrics.errors > 0 ? "warning" : "default",
          });
          printMetric(artifacts, "Discovery throughput", discovery.throughput);
          printMetric(
            artifacts,
            "Overall throughput",
            formatRate(metrics.discovered, totalElapsed, "files"),
          );

          const indexingThroughput = maybeFormatRate(metrics.indexed, totalElapsed);
          if (indexingThroughput) {
            printMetric(artifacts, "Indexing throughput", indexingThroughput);
          }

          const metadataThroughput = maybeFormatRate(
            metrics.metadataProcessed,
            totalElapsed,
          );
          if (metadataThroughput) {
            printMetric(artifacts, "Metadata throughput", metadataThroughput);
          }

          if (status.error) {
            writeLine(artifacts);
            printErrorBlock(artifacts, "Scan failed", [
              { label: "Error", value: status.error },
            ]);
            process.exitCode = 1;
            artifacts.report.exitCode = 1;
          }

          printBenchmarkNotes(artifacts);
          writeLine(artifacts);

          if (!status.error) {
            writeLine(artifacts, `${pc.green("✓")} ${pc.bold("Benchmark complete")}`);
          }

          break;
        }
      }
    } finally {
      if (options.rootOverride && originalRoot !== null && !restoredRoot) {
        scanner.saveLibraryRoot(originalRoot);
        restoredRoot = true;
      }
    }
  } finally {
    artifacts.report.exitCode =
      typeof process.exitCode === "number" ? process.exitCode : 0;
    await saveRunArtifacts(artifacts);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
