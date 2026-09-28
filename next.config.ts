import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";

/**
 * THE DEPLOYMENT ROOT, RESOLVED BY THE BUILD (FOUNDATION-DEPLOYMENT-ISO-B1)
 * =======================================================================
 *
 * The build is the ONE place that may look at the filesystem to decide where a deployment's
 * configuration lives, and it inlines the answer so that runtime code stays static and
 * client-safe (`src/config/deployment-root.ts` explains why: `siteConfig` is imported by client
 * components, so neither `node:fs` nor `process.cwd()` may appear there).
 *
 *   capsule     `<repo>/deployment/site.config.json` exists → the capsule owns the deployment
 *   override    `FOUNDATION_DEPLOYMENT_ROOT` is set (dev/test) → that directory owns it
 *   repository  otherwise → the CURRENT layout, unchanged: the bundled root `site.config.json`
 *
 * Only the non-repository layouts inline their config, so the reference deployment ships exactly the
 * bytes it shipped before this change.
 */
function deploymentEnvironment(): Record<string, string> {
  const repositoryRoot = process.cwd();
  const override = process.env.FOUNDATION_DEPLOYMENT_ROOT?.trim();
  const capsuleRoot = path.join(repositoryRoot, "deployment");
  const layout =
    override !== undefined && override !== ""
      ? "override"
      : existsSync(path.join(capsuleRoot, "site.config.json"))
        ? "capsule"
        : "repository";

  const environment: Record<string, string> = { FOUNDATION_DEPLOYMENT_LAYOUT: layout };
  if (layout === "repository") return environment;

  const root = layout === "override" ? (override as string) : capsuleRoot;
  const configFile = path.join(root, "site.config.json");
  if (!existsSync(configFile)) {
    throw new Error(
      `FOUNDATION-DEPLOYMENT-ISO-B1: the ${layout} deployment root "${root}" has no site.config.json.`,
    );
  }
  environment.FOUNDATION_DEPLOYMENT_CONFIG = readFileSync(configFile, "utf8");
  return environment;
}

const nextConfig: NextConfig = {
  env: deploymentEnvironment(),
  /**
   * P6-3B — disable the DEVELOPMENT-ONLY Next.js route/dev indicator. It is a
   * fixed-position `nextjs-portal` element pinned to the bottom-left corner of
   * the viewport, where it renders ON TOP of the mobile bottom-bar navigation
   * and swallows pointer events aimed at the bar (the CDP matrix clicks the
   * "More" trigger at its centre). Production never renders it, so this option
   * has no production effect.
   */
  devIndicators: false,
};

export default nextConfig;
