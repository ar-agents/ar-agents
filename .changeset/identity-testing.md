---
"@ar-agents/identity": minor
---

Add `@ar-agents/identity/testing` subpath: in-memory `MockAfipPadronAdapter` + result factories.

```ts
import { identityTools } from "@ar-agents/identity";
import {
  MockAfipPadronAdapter,
  mockAfipPadronAvailable,
  mockMonotributista,
} from "@ar-agents/identity/testing";

const afip = new MockAfipPadronAdapter()
  .seed("20-12345678-9", mockAfipPadronAvailable({ nombre: "Acme SRL" }))
  .seed("20-99999999-9", mockMonotributista({ categoria: "A" }));

const tools = identityTools({ afip });
```

Factories: `mockAfipPadronAvailable`, `mockAfipPadronUnavailable`, `mockAfipPadronError`, `mockMonotributista`. The adapter exposes a `.calls` array so tests can assert on which CUITs the agent looked up.

Subpath chosen so the dev-only mock stays out of production bundles.
