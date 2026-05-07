# @ar-agents/shipping

## 0.1.1

### Patch Changes

- [`da49fde`](https://github.com/ar-agents/ar-agents/commit/da49fde136ecea89b4755fe74b3ed91ed9720f46) - Enable [npm provenance attestation](https://docs.npmjs.com/generating-provenance-statements) for all `@ar-agents/*` packages. From this version on, the npm registry includes a verifiable cryptographic record that the package was built from this exact GitHub commit, via the GitHub Actions `release.yml` workflow. Boosts supply-chain audit scores (Socket / Snyk / npm) and lets downstream agents verify package integrity without trusting the publisher.

  No API or runtime changes.

## 0.1.0

### Minor Changes

- Initial release. Argentine shipping carriers (OCA, Correo Argentino,
  Andreani) as drop-in tools for the Vercel AI SDK 6.

  Tools shipped:

  - `cotizar_envio` — rate calculation per carrier given origin/destination CP
    and package dimensions
  - `crear_envio` — create a shipment (returns `tracking_number` +
    `etiqueta_url`)
  - `consultar_tracking` — query current shipment status by tracking number
  - `cancelar_envio` — cancel a not-yet-dispatched shipment
  - `listar_codigos_postales` — AR provincia + CP enumeration helpers
  - `validar_codigo_postal` — pure-algorithm CP format validation

  Architecture:

  - `ShippingCarrier` interface — pluggable per-carrier adapters
  - `OcaAdapter`, `CorreoAdapter`, `AndreaniAdapter` — production implementations
  - Default `BcraPublicApiAdapter`-style fallback when carrier creds aren't
    configured (returns clear "not configured" error instead of crashing)
  - AR-specific provincia normalizer (`Buenos Aires` → `B`, `CABA` → `C`, etc.)
  - Tool descriptions in Spanish for natural agent flow with AR users
