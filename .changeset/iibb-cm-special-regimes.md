---
"@ar-agents/iibb": minor
---

CM special regimes: Articles 6, 8, 9 (construction / transport / professional services).

`computeDdjj` now accepts `cmArticle` (defaults to `art_2_general`) and
`seatJurisdiction`. The three highest-volume CM special regimes are
implemented:

- **Article 6 — Construction**: 10% to the corporate seat, 90% prorated
  to the jurisdiction where the work was performed (new optional
  `IngresoLine.workJurisdiction`).
- **Article 8 — Transport**: 100% to the trip's origin jurisdiction (new
  optional `IngresoLine.originJurisdiction`). No seat component.
- **Article 9 — Professional services**: 20% to the corporate seat, 80%
  prorated to the jurisdictions where services were realized.

Articles 7, 10, 11, 12, 13 are recognized but raise an actionable
`IibbValidationError` explaining what per-article inputs they need
(premium amounts, origin/destination, storage volumes). They can be
handled off-package by feeding synthetic local DDJJs per jurisdiction.

13 new tests cover apportionment + fall-back rules + the stub-article
error path. All 54 existing tests pass.
