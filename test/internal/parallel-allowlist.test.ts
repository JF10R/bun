import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const testDir = join(import.meta.dir, "..");
const table = JSON.parse(readFileSync(join(testDir, "parallel-allowlist.json"), "utf8"));

test("test/parallel-allowlist.json has the shape the runner reads", () => {
  expect(table._meta).toBeObject();
  expect(table.dirs).toBeArray();
  expect(table.excludeFiles).toBeArray();
  expect(table.dirs.length).toBeGreaterThan(100);
  for (const p of [...table.dirs, ...table.excludeFiles]) {
    expect(p).not.toContain("\\");
    expect(p).not.toStartWith("test/");
    expect(p).not.toStartWith("/");
  }
});

test("excludeFiles are real files inside listed dirs", () => {
  const dirs = new Set(table.dirs);
  const bad = table.excludeFiles.filter((f: string) => !dirs.has(dirname(f)) || !existsSync(join(testDir, f)));
  expect(bad).toEqual([]);
});

// scripts/update-parallel-allowlist.mjs rebuilds excludeFiles from scratch: a
// file is excluded only if it produced a flaky/error annotation in the scanned
// build window. A file that is already excluded runs serially, produces no
// annotation, and so gets dropped on the next regen, then flakes again once
// re-included (#36585 dropped inspect-error-leak, #39236 dropped streams-leak).
// These files assert on process-wide state from inside the test process
// (rss(), heapStats().objectTypeCounts), which neighbouring files in a
// `bun test --parallel` worker perturb, so no amount of clean history makes
// them batch-safe. Pin them so a regen that drops one fails here instead of
// reintroducing the flake. Remove an entry only after the measurement moves
// into a spawned subprocess or its directory leaves `dirs`.
const mustExclude = [
  "js/bun/shell/leak.test.ts",
  "js/bun/spawn/spawn-pipe-leak.test.ts",
  "js/bun/util/inspect-error-leak.test.js",
  "js/node/net/handle-leak.test.ts",
  "js/node/tls/node-tls-getpeercert-leak.test.ts",
  "js/node/vm/sourcetextmodule-leak.test.ts",
  "js/node/zlib/leak.test.ts",
  "js/web/fetch/fetch-leak.test.ts",
  "js/web/request/request-clone-leak.test.ts",
  "js/web/streams/streams-leak.test.ts",
  "js/workerd/html-rewriter-leak.test.ts",
];

test("in-process RSS leak tests stay excluded from the parallel batch", () => {
  const excluded = new Set(table.excludeFiles);
  const dirs = new Set(table.dirs);
  const missing = mustExclude.filter(f => dirs.has(dirname(f)) && !excluded.has(f));
  expect(missing).toEqual([]);
});
