import type { Metadata } from "next";

/**
 * Shared `robots` directive for pages that stay reachable by direct URL but are
 * de-listed from the public identity: kept for inbound links, removed from
 * crawlers, nav, sitemap, and llms.txt. Spread into a page's `metadata.robots`.
 *
 *   export const metadata: Metadata = { ..., robots: NOINDEX };
 *
 * Demote-not-delete: the route still renders, but search engines and AI crawlers
 * are told not to index or follow it.
 */
export const NOINDEX: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: { index: false, follow: false },
};
