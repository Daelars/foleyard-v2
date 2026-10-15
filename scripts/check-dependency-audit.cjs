#!/usr/bin/env node
/**
 * Dependency audit gate (#260).
 *
 * Fails on a newly disclosed high or critical advisory in a *production*
 * dependency — something that ships inside the Electron app — while keeping
 * development-only and unreachable findings out of the way. Every advisory is
 * attributed to the locked copies of that package and classified into exactly
 * one bucket:
 *
 * - `production`: reachable from the root manifest's runtime dependencies
 *   (`dependencies`, plus the desktop runtime packages named in
 *   `dependency-audit.json`). `next build` traces part of this closure into
 *   `.next/node_modules`, and electron-builder copies the rest of it into the
 *   installer, so an advisory here is reachable desktop risk.
 * - `development`: reachable only from `devDependencies`. A development
 *   finding is never packaged, however alarming its severity.
 * - `unreachable`: locked for an operating system or CPU the desktop build does
 *   not ship (a Linux-only native binary, say), or reachable from no manifest
 *   field at all. Nothing the app ships can load it.
 *
 * The audit feed is keyed by package name, not by version, so an advisory is
 * only attributed to a copy whose version satisfies `vulnerable_versions`;
 * advisories no locked copy satisfies are reported as `notApplicable` instead
 * of being pinned on an unrelated (already fixed) sibling copy.
 *
 * Exceptions live in `dependency-audit.json`. Each names one advisory for one
 * package and carries an owner, a reason and an expiry date. An expired
 * exception fails the gate, so it is re-reviewed rather than fossilised, and
 * an exception that matches nothing is reported as stale.
 *
 * Usage:
 *   node scripts/check-dependency-audit.cjs                    # runs `bun audit --json`
 *   node scripts/check-dependency-audit.cjs --json             # machine-readable report
 *   node scripts/check-dependency-audit.cjs --audit-json <path> # reuse a saved audit report
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const LOCKFILE_PATH = path.join(ROOT, "bun.lock");
const CONFIG_PATH = path.join(ROOT, "dependency-audit.json");

// The gate's contract: unapproved high or critical advisories in the shipped
// dependency closure fail the build. Lower severities are reported, not gated.
const SEVERITIES = ["low", "moderate", "high", "critical"];
const GATED_SEVERITIES = ["high", "critical"];
const BUCKETS = ["production", "development", "unreachable"];
const RUNTIME_PROTOCOLS = ["workspace:", "link:", "file:"];

const CONFIG_KEYS = new Set(["runtimeDependencies", "shippedPlatform", "exceptions"]);
const PLATFORM_KEYS = new Set(["os", "cpu"]);
const EXCEPTION_KEYS = new Set(["package", "advisory", "owner", "reason", "expires"]);
const EXPIRY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Parse JSON that may carry `//` comments and trailing commas (bun.lock). */
function parseJsonc(text) {
  const withoutComments = text.replace(/^\s*\/\/.*$/gm, "");
  let out = "";
  let inString = false;
  let escaped = false;
  let pendingSeparator = -1;
  for (let index = 0; index < withoutComments.length; index += 1) {
    const character = withoutComments[index];
    if (inString) {
      out += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      out += character;
      pendingSeparator = -1;
      continue;
    }
    if (character === ",") {
      pendingSeparator = out.length;
      out += character;
      continue;
    }
    if (/\s/.test(character)) {
      out += character;
      continue;
    }
    // A comma followed only by whitespace and a closer is a trailing comma.
    if (pendingSeparator !== -1 && (character === "}" || character === "]")) {
      out = `${out.slice(0, pendingSeparator)}${out.slice(pendingSeparator + 1)}`;
    }
    pendingSeparator = -1;
    out += character;
  }
  return JSON.parse(out);
}

function parseVersion(value) {
  const text = String(value).trim().replace(/^v/, "");
  const withoutBuild = text.split("+")[0];
  const dash = withoutBuild.indexOf("-");
  const release = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash);
  const prerelease = dash === -1 ? [] : withoutBuild.slice(dash + 1).split(".");
  const numbers = release.split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : Number.NaN));
  if (numbers.length === 0 || numbers.some((part) => Number.isNaN(part))) return null;
  return { numbers, prerelease };
}

function comparePrerelease(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) {
      if (Number(a) !== Number(b)) return Number(a) < Number(b) ? -1 : 1;
    } else if (aNumeric !== bNumeric) {
      return aNumeric ? -1 : 1;
    } else if (a !== b) {
      return a < b ? -1 : 1;
    }
  }
  return 0;
}

/** Semver order for two versions, or `null` when either is unparseable. */
function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;
  const length = Math.max(a.numbers.length, b.numbers.length);
  for (let index = 0; index < length; index += 1) {
    const x = a.numbers[index] ?? 0;
    const y = b.numbers[index] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;
  return comparePrerelease(a.prerelease, b.prerelease);
}

/**
 * Every range in the advisory feed is a comparator or a space-separated AND of
 * comparators (`>=4.0.0 <5.0.9`), with `||` separating alternatives. An
 * unparseable comparator is treated as matching, so an unknown range or version
 * is gated rather than waved through.
 */
function satisfiesRange(version, range) {
  const alternatives = String(range)
    .split("||")
    .map((part) => part.trim())
    .filter(Boolean);
  if (alternatives.length === 0) return true;
  return alternatives.some((alternative) =>
    alternative
      .split(/\s+/)
      .filter(Boolean)
      .every((comparator) => {
        const match = /^(<=|>=|<|>|=)?(.*)$/.exec(comparator);
        const operator = match[1] || "=";
        const order = compareVersions(version, match[2]);
        if (order === null) return true;
        if (operator === "<") return order < 0;
        if (operator === "<=") return order <= 0;
        if (operator === ">") return order > 0;
        if (operator === ">=") return order >= 0;
        return order === 0;
      }),
  );
}

function packageMetadata(entry) {
  return entry.find((value) => value && typeof value === "object" && !Array.isArray(value)) || {};
}

function stringList(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  return typeof value === "string" ? [value] : [];
}

/**
 * npm's `os`/`cpu` platform gate: a positive list restricts the field to those
 * values, a `!` entry denies one, and an absent or negative-only list allows
 * everything else.
 */
function platformAllows(values, target) {
  const declared = stringList(values);
  if (declared.length === 0) return true;
  if (declared.includes(`!${target}`)) return false;
  const positives = declared.filter((value) => !value.startsWith("!"));
  return positives.length === 0 || positives.includes(target);
}

function matchesShippedPlatform(metadata, platform) {
  return (
    platformAllows(metadata.os, platform.os) && platformAllows(metadata.cpu, platform.cpu)
  );
}

function dependencyNames(metadata, field) {
  const declared = metadata[field];
  if (!declared || typeof declared !== "object") return [];
  return Object.entries(declared)
    .filter(([, spec]) => !RUNTIME_PROTOCOLS.some((protocol) => String(spec).startsWith(protocol)))
    .map(([name]) => name);
}

/**
 * Read `bun.lock` into the installed package graph. Keys are resolution paths
 * (`next/postcss` is the copy of postcss nested under next), and a dependency is
 * resolved by walking that path upwards exactly like node_modules lookup.
 */
function parseBunLock(text) {
  const lock = parseJsonc(text);
  const packages = new Map();
  for (const [key, entry] of Object.entries(lock.packages || {})) {
    const identifier = Array.isArray(entry) ? entry[0] : undefined;
    if (typeof identifier !== "string" || !identifier.includes("@")) continue;
    const separator = identifier.lastIndexOf("@");
    const version = identifier.slice(separator + 1);
    // Local workspace links are first-party sources, not installed packages.
    if (RUNTIME_PROTOCOLS.some((protocol) => version.startsWith(protocol))) continue;
    const metadata = packageMetadata(entry);
    packages.set(key, {
      key,
      name: identifier.slice(0, separator),
      version,
      os: stringList(metadata.os),
      cpu: stringList(metadata.cpu),
      dependencies: dependencyNames(metadata, "dependencies"),
      optionalDependencies: dependencyNames(metadata, "optionalDependencies"),
      peerDependencies: dependencyNames(metadata, "peerDependencies"),
    });
  }
  const root = (lock.workspaces && lock.workspaces[""]) || {};
  return {
    packages,
    root: {
      dependencies: Object.keys(root.dependencies || {}),
      devDependencies: Object.keys(root.devDependencies || {}),
    },
  };
}

/** Resolve `name` from `parentKey`, walking up the resolution path. */
function resolveKey(packages, parentKey, name) {
  let prefix = parentKey;
  for (;;) {
    const candidate = prefix ? `${prefix}/${name}` : name;
    if (packages.has(candidate)) return candidate;
    if (!prefix) return null;
    const slash = prefix.lastIndexOf("/");
    prefix = slash === -1 ? "" : prefix.slice(0, slash);
  }
}

function reachableKeys(packages, roots) {
  const seen = new Set();
  const queue = [...roots];
  while (queue.length > 0) {
    const key = queue.pop();
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = packages.get(key);
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      for (const name of entry[field]) {
        const child = resolveKey(packages, key, name);
        if (child) queue.push(child);
      }
    }
  }
  return seen;
}

/**
 * Split the locked packages into production, development and unreachable.
 *
 * Runtime packages are roots without their own subtree: the Electron npm
 * package ships as the app's runtime, but its dependencies (`@electron/get`,
 * `extract-zip`, …) only run while the binary is fetched during install, so
 * they are not part of the packaged app. Platform-excluded copies are checked
 * first: a Linux-only native binary is not production risk for a Windows build
 * no matter which manifest declares it.
 */
function classifyPackages(lock, runtimeDependencies, shippedPlatform) {
  const productionRoots = [];
  const runtimeRoots = [];
  for (const name of lock.root.dependencies) {
    const key = resolveKey(lock.packages, "", name);
    if (key) productionRoots.push(key);
  }
  for (const name of runtimeDependencies) {
    const key = resolveKey(lock.packages, "", name);
    if (key) runtimeRoots.push(key);
  }
  const production = reachableKeys(lock.packages, productionRoots);
  for (const key of runtimeRoots) production.add(key);
  const development = new Set(
    [...reachableKeys(lock.packages, lock.root.devDependencies
      .map((name) => resolveKey(lock.packages, "", name))
      .filter(Boolean))].filter((key) => !production.has(key)),
  );
  const unreachable = new Set(
    [...lock.packages.keys()].filter(
      (key) =>
        !matchesShippedPlatform(lock.packages.get(key), shippedPlatform) ||
        (!production.has(key) && !development.has(key)),
    ),
  );
  for (const key of unreachable) {
    production.delete(key);
    development.delete(key);
  }
  const buckets = { production, development, unreachable };
  const bucketByKey = new Map();
  for (const bucket of BUCKETS) {
    for (const key of buckets[bucket]) bucketByKey.set(key, bucket);
  }
  return { buckets, bucketByKey };
}

function advisoryRecord(advisory) {
  const url = typeof advisory.url === "string" ? advisory.url : "";
  const identifier = url.split("/").filter(Boolean).pop();
  const severity = SEVERITIES.includes(String(advisory.severity).toLowerCase())
    ? String(advisory.severity).toLowerCase()
    : "high";
  return {
    advisory: identifier && /^(GHSA|CVE)-/.test(identifier) ? identifier : `#${advisory.id}`,
    title: typeof advisory.title === "string" ? advisory.title : "(untitled advisory)",
    severity,
    url,
    vulnerableVersions: String(advisory.vulnerable_versions ?? ""),
  };
}

/** Attribute each advisory to the locked copies whose version it matches. */
function collectFindings(audit, lock, classification) {
  const keysByName = new Map();
  for (const [key, entry] of lock.packages) {
    if (!keysByName.has(entry.name)) keysByName.set(entry.name, []);
    keysByName.get(entry.name).push(key);
  }
  const findings = [];
  const notApplicable = [];
  for (const [name, advisories] of Object.entries(audit)) {
    if (!Array.isArray(advisories)) continue;
    const copies = keysByName.get(name) || [];
    for (const advisory of advisories) {
      const record = advisoryRecord(advisory);
      const matching = copies.filter((key) =>
        satisfiesRange(lock.packages.get(key).version, record.vulnerableVersions),
      );
      if (matching.length === 0) {
        notApplicable.push({ package: name, ...record });
        continue;
      }
      for (const key of matching) {
        const entry = lock.packages.get(key);
        findings.push({
          key,
          package: entry.name,
          version: entry.version,
          bucket: classification.bucketByKey.get(key) || "unreachable",
          ...record,
          approved: false,
        });
      }
    }
  }
  return { findings, notApplicable };
}

function validateConfig(config) {
  const errors = [];
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return ["dependency-audit.json must be a JSON object"];
  }
  for (const key of Object.keys(config)) {
    if (!CONFIG_KEYS.has(key)) {
      errors.push(`dependency-audit.json has unknown key ${JSON.stringify(key)}`);
    }
  }
  if (config.runtimeDependencies !== undefined) {
    if (
      !Array.isArray(config.runtimeDependencies) ||
      config.runtimeDependencies.some((name) => typeof name !== "string" || name === "")
    ) {
      errors.push("dependency-audit.json runtimeDependencies must be an array of package names");
    }
  }
  if (config.shippedPlatform !== undefined) {
    const platform = config.shippedPlatform;
    if (!platform || typeof platform !== "object" || Array.isArray(platform)) {
      errors.push("dependency-audit.json shippedPlatform must be a JSON object");
    } else {
      for (const key of Object.keys(platform)) {
        if (!PLATFORM_KEYS.has(key)) {
          errors.push(`dependency-audit.json shippedPlatform has unknown key ${JSON.stringify(key)}`);
        }
      }
      for (const key of PLATFORM_KEYS) {
        if (typeof platform[key] !== "string" || platform[key] === "") {
          errors.push(`dependency-audit.json shippedPlatform needs a non-empty ${key}`);
        }
      }
    }
  }
  if (config.exceptions !== undefined && !Array.isArray(config.exceptions)) {
    errors.push("dependency-audit.json exceptions must be an array");
  }
  return errors;
}

function isCalendarDate(value) {
  if (typeof value !== "string" || !EXPIRY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Validate the exception ledger and work out which findings it approves. Every
 * exception needs an owner, a reason and a future expiry; a broken or expired
 * entry is a gate failure rather than a silent pass.
 */
function validateExceptions(exceptions, findings, today) {
  const errors = [];
  const warnings = [];
  const approved = new Map();
  exceptions.forEach((exception, index) => {
    const label = `exception #${index + 1}`;
    if (!exception || typeof exception !== "object" || Array.isArray(exception)) {
      errors.push(`${label} must be a JSON object`);
      return;
    }
    for (const key of Object.keys(exception)) {
      if (!EXCEPTION_KEYS.has(key)) {
        errors.push(`${label} has unknown key ${JSON.stringify(key)}`);
      }
    }
    const missing = [...EXCEPTION_KEYS].filter((key) => {
      const value = exception[key];
      return typeof value !== "string" || value.trim() === "";
    });
    if (missing.length > 0) {
      errors.push(`${label} is missing a non-empty ${missing.join(", ")}`);
      return;
    }
    const subject = `${exception.package} ${exception.advisory}`;
    if (!isCalendarDate(exception.expires)) {
      errors.push(`${label} (${subject}) expires must be a YYYY-MM-DD calendar date`);
      return;
    }
    if (exception.expires < today) {
      errors.push(
        `${label} (${subject}) expired on ${exception.expires}; re-review it, then fix or renew`,
      );
      return;
    }
    const matched = findings.filter(
      (finding) =>
        finding.package === exception.package && finding.advisory === exception.advisory,
    );
    if (matched.length === 0) {
      warnings.push(
        `${label} (${subject}) matches no current advisory; remove it or it will hide a future one`,
      );
      return;
    }
    if (!matched.some((finding) => finding.bucket === "production")) {
      warnings.push(`${label} (${subject}) approves a development-only finding; it is unnecessary`);
    }
    approved.set(subject, exception);
  });
  return { errors, warnings, approved };
}

function countBySeverity(findings) {
  const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

function evaluateGate({ audit, lock, config, today }) {
  const configErrors = validateConfig(config);
  const runtimeDependencies = Array.isArray(config.runtimeDependencies)
    ? config.runtimeDependencies
    : [];
  const shippedPlatform = config.shippedPlatform || { os: "win32", cpu: "x64" };
  const classification = classifyPackages(lock, runtimeDependencies, shippedPlatform);
  const { findings, notApplicable } = collectFindings(audit, lock, classification);
  const { errors: exceptionErrors, warnings, approved } = validateExceptions(
    Array.isArray(config.exceptions) ? config.exceptions : [],
    findings,
    today,
  );

  const violations = [...configErrors, ...exceptionErrors];
  for (const finding of findings) {
    const exception = approved.get(`${finding.package} ${finding.advisory}`);
    finding.approved = Boolean(exception);
    finding.owner = exception ? exception.owner : null;
    finding.expires = exception ? exception.expires : null;
    if (finding.bucket === "production" && GATED_SEVERITIES.includes(finding.severity) && !exception) {
      violations.push(
        `unapproved ${finding.severity} production advisory: ` +
          `${finding.package}@${finding.version} ${finding.advisory} — ${finding.title}`,
      );
    }
  }

  const summary = {};
  for (const bucket of BUCKETS) {
    const inBucket = findings.filter((finding) => finding.bucket === bucket);
    summary[bucket] = {
      packages: classification.buckets[bucket].size,
      findings: inBucket.length,
      severity: countBySeverity(inBucket),
      gated: inBucket.filter((finding) => GATED_SEVERITIES.includes(finding.severity)).length,
      approved: inBucket.filter((finding) => finding.approved).length,
    };
  }

  return {
    ok: violations.length === 0,
    summary,
    findings,
    notApplicable,
    approvedExceptions: [...approved.keys()],
    warnings,
    violations,
    lockfilePackages: lock.packages.size,
    advisories: Object.values(audit).reduce(
      (total, advisories) => total + (Array.isArray(advisories) ? advisories.length : 0),
      0,
    ),
  };
}

function formatBucketLine(bucket, summary) {
  const severity = SEVERITIES.filter((name) => summary.severity[name] > 0)
    .map((name) => `${name} ${summary.severity[name]}`)
    .join(", ");
  const detail = severity ? ` (${severity})` : "";
  return (
    `  ${bucket.padEnd(12)} ${String(summary.packages).padStart(5)} packages ` +
    `${String(summary.findings).padStart(4)} findings${detail}` +
    (summary.approved > 0 ? `, ${summary.approved} approved` : "")
  );
}

function formatReport(result) {
  const lines = [
    `check-dependency-audit: ${result.lockfilePackages} locked packages, ` +
      `${result.advisories} advisories in the audit feed`,
  ];
  for (const bucket of BUCKETS) lines.push(formatBucketLine(bucket, result.summary[bucket]));
  if (result.notApplicable.length > 0) {
    lines.push(
      `  not applicable: ${result.notApplicable.length} advisories match no locked version ` +
        "(the feed is keyed by package name, not by version)",
    );
  }
  for (const finding of result.findings) {
    if (finding.approved) {
      lines.push(
        `  approved: ${finding.package}@${finding.version} ${finding.advisory} ` +
          `(${finding.severity}, owner ${finding.owner}, expires ${finding.expires})`,
      );
    }
  }
  for (const warning of result.warnings) lines.push(`  warning: ${warning}`);
  if (!result.ok) {
    lines.push(`FAILED with ${result.violations.length} problem(s):`);
    for (const violation of result.violations) lines.push(`  - ${violation}`);
    return lines.join("\n");
  }
  lines.push(
    "check-dependency-audit: OK — no unapproved high or critical production advisory.",
  );
  return lines.join("\n");
}

function runBunAudit() {
  const options = { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 };
  let result = spawnSync("bun", ["audit", "--json"], options);
  if (result.error && result.error.code === "ENOENT") {
    // Windows installs bun as a .cmd/.ps1 shim, which only a shell can spawn.
    result = spawnSync("bun audit --json", { ...options, shell: true });
  }
  if (result.error) throw result.error;
  const stdout = String(result.stdout || "").trim();
  if (stdout === "") {
    const stderr = String(result.stderr || "").trim().split("\n").slice(-3).join(" ");
    throw new Error(`bun audit produced no report (exit ${result.status}): ${stderr}`);
  }
  return stdout;
}

function parseArguments(argv) {
  const options = { json: false, auditJson: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--audit-json") options.auditJson = argv[(index += 1)];
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`unknown argument ${JSON.stringify(argument)}`);
  }
  return options;
}

function main(argv) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    console.error(`check-dependency-audit: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log(
      "Usage: node scripts/check-dependency-audit.cjs [--json] [--audit-json <path>]\n" +
        "  --audit-json <path>  read a saved `bun audit --json` report instead of running bun",
    );
    return 0;
  }

  let auditText;
  try {
    auditText = options.auditJson
      ? fs.readFileSync(options.auditJson, "utf8")
      : runBunAudit();
  } catch (error) {
    console.error(`check-dependency-audit: could not read the dependency audit: ${error.message}`);
    return 2;
  }

  let audit;
  try {
    audit = JSON.parse(auditText);
  } catch {
    console.error("check-dependency-audit: the dependency audit did not return JSON");
    return 2;
  }

  let lock;
  let config;
  try {
    lock = parseBunLock(fs.readFileSync(LOCKFILE_PATH, "utf8"));
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (error) {
    console.error(
      `check-dependency-audit: could not read bun.lock or dependency-audit.json: ${error.message}`,
    );
    return 2;
  }
  const result = evaluateGate({
    audit,
    lock,
    config,
    today: new Date().toISOString().slice(0, 10),
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const report = formatReport(result);
    if (result.ok) console.log(report);
    else console.error(report);
  }
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  BUCKETS,
  GATED_SEVERITIES,
  SEVERITIES,
  classifyPackages,
  collectFindings,
  compareVersions,
  evaluateGate,
  formatReport,
  matchesShippedPlatform,
  parseBunLock,
  parseJsonc,
  parseVersion,
  platformAllows,
  resolveKey,
  satisfiesRange,
  validateConfig,
  validateExceptions,
};
