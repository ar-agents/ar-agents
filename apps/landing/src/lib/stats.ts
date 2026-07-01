/**
 * Single source of truth for the published-package + canonical-tool counts shown
 * across the site. Surfaces used to drift (published-package counts said
 * 34/35/36/40; tool counts said 221/235/243).
 *
 * Every RENDERED (TSX) surface should import these constants. Static served files
 * that cannot import (public/*.md, public/.well-known/* cards) hand-maintain the
 * same numbers; agents.json is generated from the manifests (35 tool-bearing
 * packages + 243 tools). Keep all of them in sync when the counts change.
 *
 * Keep these in sync with reality:
 *   PUBLISHED_PACKAGES = packages/* dirs with a package.json + "private": false
 *     (`ls packages` minus python-incorporate, which is Python-only + unpublished).
 *   CANONICAL_TOOLS    = sum of tools across every packages/tools.manifest.json,
 *     identical to what /api/discovery + /.well-known/agents.json emit (243).
 *
 * agents.json's toolCount is generated from the manifests at build, so it is the
 * live cross-check for CANONICAL_TOOLS.
 */
export const PUBLISHED_PACKAGES = 37;
export const CANONICAL_TOOLS = 243;
