---
"@ar-agents/constancia": patch
---

Add `"padron-soap"` to `ConstanciaResult.source`. A constancia result may now
originate from AFIP's SOAP `ws_sr_constancia_inscripcion` webservice (via
`@ar-agents/identity`), which returns the constancia DATA but no PDF — distinct
from the `"browse-skill"` browser path that can carry the PDF artifact.
Additive, backwards-compatible: existing producers/consumers are unaffected.

Also funnels the package to the free hosted oracle: README gains a "Hosted
oracle + badge" section (free lookup API + embeddable "Verificado por ar-agents"
badge), the npm `homepage` now points at https://ar-agents.ar/constancia,
keywords expand for CUIT-verification search intent, and the stale author email
is corrected to naza@naza.ar.
