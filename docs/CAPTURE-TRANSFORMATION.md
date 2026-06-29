# ar-agents, Plan de captura ($1T): el registro de buena-standing de las sociedades automatizadas

**Tesis locked (2026-06-29).** ar-agents se convierte en el **registro de referencia y oráculo de
confianza de las empresas autónomas**: el DUNS + Carta de los agentes, reconocido por ley, no el
Visa. Captura $1T siendo el registro de buena-standing que las contrapartes (bancos, marketplaces,
otros agentes) **tienen que consultar antes de transaccionar**, no ganándole a Stripe / Coinbase /
AP2 en pagos. Argentina es la **jurisdicción #1 de un estándar global**, no un producto AR
standalone: el wedge en el tiempo, mientras el estándar global de confianza es la espina en el
valor. El toll de settlement viaja ARRIBA de esa posición de oráculo (cobrás un corte porque sos el
registro que las contrapartes exigen), no como competencia de pagos. Una sola marca: ar-agents
(motor abierto) + ar-agents Cloud (hosteado). "Vultur" se retira; su valor migra adentro cuando el
multi-tenant lo exija.

## Tesis resuelta (las 4 preguntas, cerradas)

1. **$1T cierra en el estándar global, no en AR.** AR (~$650B de PBI) no sostiene $1T ni capturando
   entera su economía de agentes. $1T = estándar global + el oráculo de buena-standing sobre el que
   viaja el settlement. El error del plan previo era confundir **diferir el BUILD y el mensaje
   global (correcto)** con **diferir la TESIS global (fatal)**. AR es la jurisdicción #1 / lighthouse
   / template regulatorio, porque es el lugar más barato del mundo para comprar reconocimiento legal
   de primer movimiento ahora (el gobierno lo quiere conferir). Corolario que cambia el build: la
   costura de jurisdicción va AHORA (arquitectura), no en Fase 4.

2. **El moat NO es la clave central.** Una clave privada raíz es esquivable con un transparency log
   público (OpenTimestamps / CT / anchor en L2) y encima te vuelve el tercero-de-confianza que una
   contraparte sofisticada quiere remover (ataque "caja negra"). EL moat son dos cosas, en orden:
   (1) **designación legal** (el Estado te nombra registro/estándar de referencia; no-forkeable
   porque lo confiere el Estado, no tu código), y (2) **la red del registro + el corpus portable de
   buena-standing** (dinámica DUNS / Carta / Verisign: cada empresa registrada y cada contraparte
   que consulta suben el valor; irse = abandonar tu historial y tu rastro de evidencia legal).
   **Decisión que fuerza:** invertir casi cero en el notario-como-secreto. La attestation se hace
   **trust-minimized / anclada públicamente** a propósito (una entidad de Wyoming o Estonia se
   verifica sin confiar en una clave argentina). La clave central pasa a ser firma de conveniencia,
   no raíz de confianza. Bonus: la attestation trust-minimized es REQUISITO del juego global igual,
   así que no es sacrificio, es el desbloqueo.

3. **Quién paga antes de la ley: operadores de agentes crypto-native + startups de AI-agents.** Los
   builders tipo Bankrbot / clawbank / $sairi y las startups de "AI employee" cuyos clientes
   enterprise ya preguntan "¿cómo confío y audito este agente?". Su dolor existe HOY, pre-ley, y es
   agudo: debanking, on/off-ramps de fiat que los rechazan, contrapartes que no confían, sin forma de
   probar accountability / kill-switch / audit-trail. El Auditor día-1 NO es "tu defensa art.102", es
   **"prueba verificable de que tu agente autónomo es accountable, auditado y en buena-standing"** +
   rieles fiat que no los debankean. La ley no CREA al comprador; lo **upgradea** de badge
   nice-to-have a registro legalmente requerido y explota el segmento angosto a toda la economía de
   esa jurisdicción. (Conecta con el beachhead crypto-native: ver project_ar_agents_beachhead_open_tools.)

4. **Hedge de la ley: la tesis NO es ley-AR-contingente.** Los agentes autónomos que mueven plata y
   necesitan ser confiables existen global con o sin ley. Si la ley pasa: chokepoint conferido por el
   Estado + explosión de TAM en un mercado + template regulatorio para la jurisdicción #2
   (acelerante). Si el anteproyecto muere: seguís siendo la capa de confianza / attestation / banking
   del ecosistema global de agentes autónomos, mismo producto, menos un viento de cola.
   **Consecuencia dura:** el AR-acoplamiento del código (ARS / AFIP / CBU / ARCA en cientos de refs)
   es un **pasivo estratégico, no un nice-to-have de refactor-después.** Por eso la costura no es
   opcional ni tardía.

## Posicionamiento (explícito, no implícito)

Tu lane defendible frente a Stripe / Coinbase x402 / Google AP2 / Skyfire es el **registro de
referencia legalmente reconocido**: ninguno de ellos quiere ser un registro regulado. Sos el DUNS +
Carta de las empresas autónomas, reconocido por ley, no el Visa. Esa posición de confianza
regulatoria es la que un jugador de pagos puro estructuralmente NO quiere ocupar; por eso es
defendiblemente tuya.

## El riesgo #1 de ejecución (validar antes que nada)

La red del registro es un mercado de dos lados: empresas que se registran + **contrapartes que
consultan**. El moat de red recién existe cuando las contrapartes consultan el registro antes de
transaccionar. La designación legal resuelve el cold-start (si la regulación EXIGE registro +
chequeo de buena-standing, la liquidez del lado-demanda queda mandatada). **Sin la ley, hay que
fabricar el lado-demanda** (bancos / marketplaces / frameworks de agentes que consulten). Esto, no
la plomería, es el verdadero riesgo de go-to-market. **Primer target de validación: conseguir que
>=1 contraparte real (un banco / PSP, un marketplace, o un framework de agentes) consuma la
attestation de buena-standing.**

## Estado verificado (auditoría de código, 2026-06-29)

- **El Auditor ya es un loop de cobro real y prendible.** `apps/landing/src/app/api/auditor/{subscribe,activate,log,webhook}`:
  preapproval de MP real ($199/mes), mintea una API key `arag_live_*` al activar, writes firmados
  autenticados por key, webhook que revoca al cancelar. `MERCADOPAGO_ACCESS_TOKEN` YA está en prod.
  Ya existe un primitivo cuenta + ApiKey + metering-write, angosto (un SKU) y sobre Vercel KV. **No
  hay base de datos en el monorepo.**
- **La clave central ya existe en prod** (`AUDIT_ED25519_PRIVATE_KEY` id `ar-agents-ref-2026` +
  `AUDIT_HMAC_SECRET`). Pero por la tesis resuelta #2, NO es el moat: se reusa como firma de
  conveniencia, no como raíz.
- **Vultur no está acá.** Cero `apps/cloud`, `@vultur/*`, `plans.ts`, `VULTUR_USAGE_FEE_PCT`. Es el
  repo separado `~/Downloads/claude/vultur` (naza00000/vultur), multi-sesión. "Migrar Vultur" = port
  cross-repo, no refactor local; diferido.
- **art.102 abierto en la superficie distribuida.** `enforceRiskPolicy` (packages/core/src/risk-manifest.ts:172)
  se llama solo en los loops de app (sociedad-ia-starter, landing), NO en `packages/mcp` (el server
  que se autohostea con npx). El MCP público ejecuta tools de plata/fiscales sin gate ni kill-switch.
- **El anchor del audit-log se auto-firma con el secreto del operador** (TODO de timestamping
  externo escrito en ledger.ts; sin anchoring a ARCA ni ledger público). Esto es lo que la tesis #2
  manda cambiar a trust-minimized.
- **Chokepoints de fee sin monetizar.** x402 `settleAndRespond` (packages/x402/src/server.ts:136,
  usado en /api/x402/cuit) + treasury `convert` (Bitso/Manteca/Ripio/Mural). Sin take-rate. x402 →
  facilitador externo x402.org por default.
- **Rieles AR-acopladas (cientos de refs).** Providers detrás de `OffRampAdapter`, pero moneda=ARS,
  payout=CBU/CVU, fisco=AFIP/ARCA hardcoded. No hay interfaz `Jurisdiction/FiatRail/Registry/TaxRule`
  en el core. Por la tesis #4, esto es pasivo estratégico.
- **Cero sociedades productivas.** `/registro` es array hardcodeado (5 demos propias). Demanda real
  gateada por la ley.

## Principios

1. **No bajamos NADA de lo open source.** Los `@ar-agents/*` siguen MIT. La captura vive en
   designación + red/datos + hosting de conveniencia, no en cerrar código. Todo aditivo.
2. **Self-host gratis para siempre, y dicho fuerte.** Escudo anti caja-negra + motor de adopción.
3. **El motor abierto es el embudo; el registro/oráculo es la captura.**
4. **Una sola espina de metering de la que cobra todo.**
5. **Global-first en arquitectura, AR-first en build y mensaje.** AR es la jurisdicción #1 de un
   estándar global, no un producto standalone.

## Decisión de marca

- `@ar-agents/*` (MIT) = el motor. Sin cambios.
- Capa paga = **ar-agents Cloud**. "El Auditor" = un **tier** (el loop que ya existe es su núcleo).
- El valor de Vultur (ledger DB-enforced, RBAC, encryption) se incorpora cuando el multi-tenant
  exija una DB real; port cross-repo coordinado, no el primer paso.

---

# Build (re-secuenciado por la tesis locked)

## Sprint 1, La fundación = el producto día-1 (interno, sin efecto outward)
- **Costura de jurisdicción en el core AHORA**: interfaces `Jurisdiction / FiatRail / Registry /
  TaxRule`, AR como primera impl, aditivo (no rompe consumidores). Es el hedge de ley (#4) hecho
  arquitectura.
- **Attestation trust-minimized / anclada públicamente**: sacar la dependencia del notario-secreto;
  que una entidad de cualquier jurisdicción se verifique sin confiar en nuestra clave. Es a la vez
  el moat global (#2) y la credibilidad del producto crypto-native día-1 (#3).

## Sprint 2, El registro como oráculo de red real
- `/registro` de array hardcodeado a DB escribible + **consultable** por API autenticada (el oráculo
  de buena-standing). `/certifier` de scanner-de-score a certificado firmado, listado, revocable.
- **Validar el riesgo #1**: conseguir >=1 contraparte que consulte la attestation. Sin esto, no hay
  moat de red.

## Sprint 3, Prender revenue en el segmento crypto-native
- Generalizar el primitivo cuenta + ApiKey + evento-de-metering de El Auditor (KV alcanza; DB se
  difiere). Prender el cobro real (el MP token ya está). Reframe del pitch: accountability + audit +
  buena-standing + rieles que no debankean, para builders crypto-native.

## Sprint 4, Cerrar el chokepoint del estándar
- art.102 default-on en el MCP público (`packages/mcp`): enforce + approve hook + kill-switch
  passthrough. Fix de audit + fortalece el estándar.

## Sprint 5, Globalización (la espina del $1T)
- **RFC-003 (reciprocidad cross-jurisdiccional)** de documento a protocolo shipeado, con impls de
  referencia para AR + 1 (Wyoming DAO LLC / RMI MIDAO / Estonia OÜ). Buena-standing portable y
  verificable cross-jurisdicción = lo que te hace el registro global, no el local.

## Continuo, no-código (la palanca maestra)
- **Designación legal** (que la reg implementadora nombre/exija el estándar) vía la campaña en X.
- Moat de datos/red (`/observatory`), bus-factor (segundo mantenedor).

## Diferido (con razón)
- Fee-leg + facilitador x402 propio (Fase 2); port de Vultur (cuando el multi-tenant exija DB);
  custodia / PSAV (rung-3).

# Página (Parte B, para que matchee)

Hero queda: **"Creá una sociedad automatizada en Argentina."** Debajo: vender el producto recurrente
(la backbone hosteada: supervisión + auditoría + buena-standing verificable + rieles que no
debankean). Pricing first-class (El Auditor $199/mes es SKU vivo, no placeholder). Narrativa del
estándar (spec abierto + reference impl; hosteado = el upgrade pago). Que la ambición de registro
global asome sin sobreprometer. El comprador día-1 (crypto-native) tiene que verse reflejado, no solo
la futura sociedad AR.

# Decisiones que son tuyas

1. **Trust-minimized vs notario-secreto: resuelto a trust-minimized** (tesis #2). Confirmás que NO
   invertimos en operar la clave como raíz de confianza.
2. **Port de Vultur**: cuando el multi-tenant exija DB, coordinado con las otras sesiones. No ahora.
3. **Custodia / PSAV** y **facilitador x402 propio**: diferidos.

# Riesgos

- **Cold-start del lado-demanda del registro** (riesgo #1, arriba). El más importante.
- **Rebrand != captura.** Mover/renombrar Vultur no mueve la facturación.
- **Hosting/clave no son moat** (tesis #2). El moat es designación + red.
- **Riesgo de la ley**: mitigado por la tesis #4 (no ley-contingente), pero el AR-acoplamiento del
  código hay que deshacerlo (Sprint 1).
- **Adyacencia a players grandes** (Stripe/Coinbase/AP2/Skyfire): mitigado por el lane de registro
  regulado que ellos no quieren ocupar.

# Mapa: qué se toca

| Cosa | Estado real | Tipo |
|---|---|---|
| Costura de jurisdicción (core) | no existe; AR inline (pasivo) | refactor aditivo, AHORA |
| Attestation trust-minimized | hoy auto-firmada con secreto operador | edit que la hace anclada públicamente |
| Registro consultable (oráculo) | array hardcodeado | net-new (DB + API) |
| Loop de cobro El Auditor | YA existe, prendible | generalizar + prender |
| Base de datos / Prisma | no existe; KV alcanza | diferir |
| art.102 en MCP público | abierto | edit que FORTALECE |
| RFC-003 reciprocidad | doc | promover a protocolo (jurisdicción #2) |
| `@vultur/*` / apps/cloud | repo separado / no existe | diferido |
| Fee leg, facilitador x402, PSAV | sin take-rate / externo | diferido |

**Nada de lo open source se baja. La captura es aditiva. El moat es la designación + la red del
registro, no la clave. El $1T necesita el global; AR es la jurisdicción #1, no el techo.**
