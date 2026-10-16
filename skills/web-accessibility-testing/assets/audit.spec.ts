import { AxeBuilder } from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Impact = "minor" | "moderate" | "serious" | "critical";

// Used when the site has no reachable sitemap.xml.
const FALLBACK_ROUTES = ["/"];

// Pages the sitemap leaves out on purpose but that still need checking.
const EXTRA_ROUTES: string[] = [];

// Impact levels that fail the run. New projects should list all four.
const FAIL_ON: Impact[] = ["critical", "serious"];

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const REPORT_PATH = "docs/a11y-baseline.json";

type RouteResult = {
  route: string;
  counts: Record<Impact, number>;
  violations: {
    id: string;
    impact: Impact | null;
    help: string;
    helpUrl: string;
    nodes: number;
    samples: { target: string; html: string }[];
  }[];
};

async function discoverRoutes(page: Page): Promise<string[]> {
  try {
    const res = await page.request.get("/sitemap.xml");
    if (!res.ok()) throw new Error(`sitemap returned ${res.status()}`);
    const xml = await res.text();
    const routes = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map(
      (m) => new URL(m[1]).pathname,
    );
    return Array.from(new Set([...routes, ...EXTRA_ROUTES])).sort();
  } catch {
    return Array.from(new Set([...FALLBACK_ROUTES, ...EXTRA_ROUTES])).sort();
  }
}

test("every route meets WCAG 2.2 AA", async ({ page }) => {
  test.setTimeout(300_000);

  // Stops axe sampling colours halfway through fade-in animations.
  await page.emulateMedia({ reducedMotion: "reduce" });

  const results: RouteResult[] = [];

  for (const route of await discoverRoutes(page)) {
    await page.goto(route, { waitUntil: "networkidle" });
    const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

    const counts: Record<Impact, number> = { minor: 0, moderate: 0, serious: 0, critical: 0 };
    for (const v of scan.violations) {
      if (v.impact) counts[v.impact as Impact] += v.nodes.length;
    }

    results.push({
      route,
      counts,
      violations: scan.violations.map((v) => ({
        id: v.id,
        impact: (v.impact ?? null) as Impact | null,
        help: v.help,
        helpUrl: v.helpUrl,
        nodes: v.nodes.length,
        samples: v.nodes.slice(0, 3).map((n) => ({
          target: n.target.join(" "),
          html: n.html.slice(0, 200),
        })),
      })),
    });
  }

  const totals = results.reduce(
    (acc, r) => {
      for (const k of Object.keys(acc) as Impact[]) acc[k] += r.counts[k];
      return acc;
    },
    { minor: 0, moderate: 0, serious: 0, critical: 0 } as Record<Impact, number>,
  );

  const reportPath = resolve(process.cwd(), REPORT_PATH);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(
    reportPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), totals, routes: results }, null, 2)}\n`,
  );

  const blocking = FAIL_ON.reduce((sum, k) => sum + totals[k], 0);
  expect(blocking, `${blocking} blocking violations (${FAIL_ON.join(", ")}). See ${REPORT_PATH}.`).toBe(0);
});
