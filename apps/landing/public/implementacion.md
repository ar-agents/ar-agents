# Implementación de referencia para Sociedades Automatizadas

**Arquitectura técnica, código operable y mapeo al texto del anteproyecto de Ley General de Sociedades**

Nazareno Clemente
ar-agents.ar
Junio 2026


## Resumen

El 28 de abril de 2026, en el marco de Expo EFI, el Ministerio de Desregulación y Transformación del Estado anunció la creación de un régimen para sociedades operadas por inteligencia artificial. El 28 de mayo de 2026 ese anuncio se materializó en un texto: el anteproyecto de Ley General de Sociedades, firmado por Santiago Viola (Secretaría de Justicia, Ministerio de Justicia, expediente IF-2026-53144057-APN-SECJ#MJ), enviado al Senado el 1 de junio de 2026. El anteproyecto tiene 277 artículos y no reforma la Ley 19.550: la reemplaza y deroga (art. 270). Todavía no es ley. El nombre legal de la figura es **Sociedad Automatizada** (art. 14); "sociedades de IA" es solo el paraguas coloquial.

El presente documento es una implementación de referencia abierta y verificable de la infraestructura técnica que ese régimen requiere para ser operable. Está dirigido al equipo técnico del Ministerio y a quienes acompañen el tratamiento legislativo. Cuando se escribió la primera versión de este documento el texto del anteproyecto no existía y todo se planteaba como "lo que un régimen futuro necesitaría"; ahora el texto existe y confirma la mayor parte de la arquitectura propuesta. Esta versión está reescrita para anclarse en los artículos concretos.

Cubre cinco frentes: (1) cómo el texto del anteproyecto responde a las decisiones técnicas de fondo, con cita de artículo; (2) una arquitectura de referencia construida sobre estándares abiertos; (3) el estado actual de la implementación, publicada como software libre; (4) cómo los artículos ya redactados se mapean a infraestructura operable, con refinamientos sugeridos al texto; (5) respuesta puntual a las objeciones jurídicas que circulan en el debate público.

El código es open-source (licencia MIT), publicado en `github.com/ar-agents/ar-agents` y disponible para que el marco regulatorio que se sancione lo adopte como referencia.


## 1. Las decisiones técnicas de fondo y cómo el anteproyecto las responde

Un régimen de sociedades operadas por IA es jurídicamente novedoso. La primera versión de este documento planteaba seis preguntas técnicas que un texto futuro tendría que resolver. El anteproyecto del 28 de mayo de 2026 ya responde varias de ellas en el plano jurídico. La tabla siguiente mapea cada decisión de fondo al artículo que la aborda y a la pieza de arquitectura que la hace operable. Donde el anteproyecto delega en el reglamento (la futura Autoridad de Aplicación), lo indicamos.

| # | Decisión de fondo | Lo que dice el anteproyecto | Pieza técnica que la opera |
|---|---|---|---|
| 1 | ¿Qué es, jurídicamente, una sociedad operada por IA? | **Art. 14:** una sociedad de cualquier tipo (SRL, SA, SAS) que desarrolle su objeto mediante sistemas algorítmicos autónomos o agentes de IA, sin requerir recursos humanos para su operación ordinaria, es una **Sociedad Automatizada**. La declaración consta en el estatuto, la denominación incluye "Automatizada", y la sociedad responde con su patrimonio por los daños de sus sistemas. No es un tipo nuevo: es una calificación transversal a los tipos existentes. | Conserva administrador (art. 88) y, en su caso, representante humano. La sociedad mantiene CUIT y personería estándar (sección 2.3). |
| 2 | ¿Cómo se constituye? | **Art. 6:** constitución por instrumento público o privado con **firma digital, firma certificada o firma electrónica avanzada**. La constitución íntegramente remota y verificable ya está habilitada por el texto. | Par de claves Ed25519 generado en la inscripción más firma digital del art. 6 vía `@ar-agents/firma-digital` y `@ar-agents/incorporate` (sección 2.1). |
| 3 | ¿Cómo se identifica frente al Estado y a terceros? | El texto no fija un esquema criptográfico de identidad por fuera de la firma del art. 6. Queda como espacio para el reglamento. | CUIT estándar más clave pública Ed25519. Toda acción firmada digitalmente, verificable por cualquier tercero sin intermediario centralizado (sección 2.1, refinamiento sugerido en 4.2). |
| 4 | ¿Cómo se audita lo que la sociedad hace? | **Art. 263**, en el régimen de la Sociedad Descentralizada Autónoma Operativa (DAO): todo registro digital es válido siempre que su información sea **públicamente verificable**, reproducible en formato legible y permita reconstruir el estado patrimonial. **Art. 102:** deber de configuración y supervisión de los sistemas de IA. **Art. 101:** procedimiento de decisión adecuado. El texto ya exige registros verificables. | Registro encadenado HMAC con anclaje periódico a servicio público (sección 2.2). Es la pieza técnica que hace operable la exigencia del art. 263 y deja evidencia del deber de supervisión del art. 102. |
| 5 | ¿Cómo opera económicamente? | El anteproyecto no crea un régimen tributario especial: la Sociedad Automatizada es una sociedad de tipo común y tributa como tal. **Art. 36** habilita instrumentos de inversión convertibles (SAFE-like). | Encaje pleno en régimen tributario general (IVA, IIBB, Ganancias o monotributo según categoría), facturación con CAE y cobro autónomo (sección 2.3). |
| 6 | ¿Quién responde y por qué actos? | **Art. 14:** la sociedad responde con su patrimonio. **Art. 88:** administración a cargo de una o más personas humanas o jurídicas. **Art. 101:** responsabilidad por culpa o dolo, con regla de discrecionalidad empresarial (business judgment rule). **Art. 102:** el uso de IA no exime ni limita la responsabilidad de los administradores. **Art. 91:** contratar un gerenciamiento no excluye los deberes ni la responsabilidad. | El registro auditable (sección 2.2) materializa la prueba del cumplimiento de los deberes de los arts. 91, 101 y 102. Refinamientos sugeridos en 4.5. |

Las respuestas del anteproyecto son consistentes con la arquitectura descrita en la sección 2: el texto fija los deberes y la exigencia de registros verificables, y nuestra implementación aporta la pieza técnica que los hace operables y auditables a demanda. El mapeo artículo por artículo, con los refinamientos que sugerimos, está en la sección 4.

**Contexto regional.** Ningún país de la región tiene un régimen comparable ya redactado. Brasil, México y Chile mantienen el debate en plano académico; la Unión Europea avanza por la ruta opuesta (AI Act, con foco en obligaciones del operador humano y restricciones por nivel de riesgo). Argentina, con este anteproyecto, es la primera jurisdicción del mundo con un texto específico que nombra a la sociedad operada por IA como sujeto societario (Sociedad Automatizada, art. 14) y regula una Sociedad Descentralizada Autónoma Operativa (DAO, arts. 258-265). Adoptar un estándar técnico abierto y no propietario reduce la fricción para que otras jurisdicciones repliquen la base argentina, lo que multiplica el peso institucional de la decisión local.


## 2. Arquitectura de referencia

La arquitectura propuesta se compone de cuatro pilares, cada uno construido sobre un estándar técnico abierto y preexistente. La elección de estándares es deliberada: no se inventa criptografía ni protocolos nuevos. Toda la implementación reutiliza primitivas ya verificadas, auditadas y mantenidas por la comunidad técnica internacional.

### 2.1 Identidad criptográfica firmada (Ed25519)

Cada Sociedad Automatizada se constituye con un par de claves criptográficas asimétricas conforme al estándar IETF RFC 8032, algoritmo Ed25519. Esto se apoya en el art. 6 del anteproyecto, que ya admite la constitución por firma digital, firma certificada o firma electrónica avanzada.

- La clave pública constituye la **identidad criptográfica** de la sociedad. Se registra junto con el CUIT en el registro societario.
- La clave privada queda bajo custodia del operador designado, protegida por el procedimiento que reglamente la Autoridad de Aplicación (módulo de seguridad de hardware, custodia notarial digital, multifirma, según el caso).
- Toda manifestación de voluntad de la sociedad (emisión de factura, firma de contrato digital, aprobación de transacción) debe ir firmada con esa clave privada.
- Cualquier tercero (Estado, contraparte, auditor) puede **verificar** una firma sin necesidad de intermediario centralizado.

**Por qué este estándar.** Ed25519 es el algoritmo de firma digital más adoptado en la última década (SSH, TLS 1.3, criptomonedas, sistemas de identidad gubernamental europeos). Está auditado, es resistente a ataques conocidos, y produce firmas compactas (64 bytes) y rápidas de verificar.

### 2.2 Registro auditable encadenado (HMAC + anchor chain)

Esta es la pieza que el anteproyecto ya exige por escrito y que nuestra implementación hace operable. El **art. 263** (régimen DAO) establece que todo registro digital es válido siempre que su información resulte **públicamente verificable**, pueda reproducirse en formato legible y permita reconstruir el estado patrimonial. El **art. 102** fija el deber de configuración y supervisión de los sistemas de IA en la gestión, y aclara que su uso no exime de responsabilidad. El **art. 101** exige que las decisiones se adopten "con arreglo a un procedimiento de decisión adecuado" para amparar al administrador bajo la regla de discrecionalidad empresarial. Los tres apuntan a lo mismo: tiene que quedar traza verificable de lo que la sociedad decidió y ejecutó. El registro encadenado es esa traza.

La sociedad mantiene un registro de todos sus actos jurídicamente relevantes. El registro tiene dos capas:

- **Capa local:** cada entrada del registro contiene su contenido (el acto), el hash de la entrada anterior, y un código de autenticación HMAC-SHA256 derivado de una clave secreta de integridad. Esto vincula cada entrada al pasado: una modificación retrospectiva quiebra el encadenamiento y es detectable por quien tenga la clave de integridad.
- **Capa externa (anchoring):** el hash del estado del registro se ancla periódicamente (al menos diariamente) en al menos un servicio público de verificación temporal. El anclaje puede ser: (a) publicación en el Boletín Oficial digital; (b) inscripción en una blockchain pública; (c) firma temporal certificada por un tercero de confianza designado por la Autoridad de Aplicación. La elección la fija el reglamento, que el art. 263 prevé para los estándares mínimos de trazabilidad y conservación.

**Resultado, con su límite honesto.** Una vez que un tercero (Estado, contraparte, perito) retiene un anclaje del estado del registro en una fecha, puede verificar criptográficamente que: (a) el registro no fue alterado retrospectivamente respecto de ese punto; (b) en esa fecha, el contenido del registro era exactamente el que se anclaba. La propiedad concreta es **tamper-evidente frente a testigos**: cualquier alteración posterior al anclaje queda en evidencia. Mientras el anclaje externo no esté desplegado, el registro local no es a prueba del propio operador, porque quien controla la clave de integridad podría reconstruir la cadena. Por eso el anclaje externo no es un adorno: es lo que convierte "el operador dice que no tocó nada" en "cualquiera puede demostrar si lo tocó". No afirmamos operator-proof hasta que el anclaje externo esté en producción.

**Por qué este esquema.** HMAC y los esquemas de anclaje externo son los mismos que utilizan los registros de transparencia de certificados TLS (Certificate Transparency, RFC 6962), los logs de auditoría financiera regulada en jurisdicciones avanzadas, y los registros internos de plataformas como Stripe o Mercado Libre. No requiere blockchain dedicada ni infraestructura nueva del Estado. La especificación está en RFC-004 y RFC-006 de `ar-agents.ar/rfcs`.

### 2.3 Personería fiscal operable (CUIT + WSFE + Mercado Pago)

La Sociedad Automatizada es contribuyente fiscal pleno. El anteproyecto no crea un régimen tributario especial: tributa como la sociedad de tipo común que es. Opera la infraestructura tributaria argentina estándar:

- **CUIT propio**, distinto del CUIT del operador designado o de cualquier persona física asociada.
- **Factura electrónica** con CAE emitida vía Web Service de Facturación Electrónica (WSFE) de ARCA. La sociedad emite Facturas A, B o C según su categoría tributaria, sin diferenciación respecto del régimen general.
- **Cobranzas** vía Mercado Pago, cuentas bancarias propias, y cualquier medio de pago habilitado a personas jurídicas.
- **Obligaciones tributarias** estándar: IVA, IIBB, Ganancias o monotributo según corresponda. Sin régimen diferenciado especial, salvo que el proyecto de ley así lo establezca explícitamente.

**Sin intermediario humano operativo.** Una vez constituida la sociedad y designado el operador, las operaciones tributarias se ejecutan automáticamente por el agente de IA contra los servicios de ARCA y Mercado Pago. El operador interviene sólo en los actos reservados.

**Estado de implementación.** Esta capa está completamente construida y en producción en los despliegues de referencia. Certificado X.509 emitido por ARCA, cargado y operativo, emisión real de CAE comprobable.

**Renovación periódica del certificado fiscal.** El certificado X.509 emitido por ARCA tiene vigencia limitada (típicamente 2 años). Para preservar la autonomía operativa del régimen entre ciclos de renovación, el procedimiento puede automatizarse: la sociedad genera programáticamente un Certificate Signing Request (CSR) antes del vencimiento, firmado con su clave Ed25519 registrada (Pilar 1); el operador designado aprueba la renovación con una sola firma criptográfica desde su llave privada. El intercambio con el portal de ARCA queda mediado por el procedimiento que reglamente la Autoridad de Aplicación, sin requerir interacción humana repetida con interfaces estatales para cada renovación.

### 2.4 Interfaz de operación autónoma (MCP: Model Context Protocol)

La Sociedad Automatizada se opera mediante sistemas algorítmicos autónomos o agentes de IA, en los términos del art. 14, bajo el deber de configuración y supervisión del art. 102. Para que esa operación sea estandarizada, auditable e independiente del proveedor de IA específico, la arquitectura adopta el **Model Context Protocol (MCP)**, protocolo abierto introducido por Anthropic y adoptado por Claude, Cursor, Cline, OpenAI Agents SDK y otras herramientas mainstream.

- MCP define un conjunto de operaciones que el agente puede invocar sobre la sociedad: emitir factura, consultar saldo, firmar acto societario, recibir pago, etc.
- Cualquier modelo de IA conforme con el protocolo (Claude, GPT, Gemini, Llama, modelos locales) puede operar la sociedad. **Sin lock-in a un proveedor de modelo específico.**
- El Estado, mediante un cliente MCP de inspección, puede consultar el estado de la sociedad y la traza de sus acciones bajo el procedimiento que reglamente la ley.

**Por qué MCP.** Es el protocolo de mayor adopción para la operación estandarizada de agentes de IA en 2026. Es abierto, ya tiene clientes en producción, y su evolución técnica es independiente del Estado argentino. Adoptarlo es heredar el trabajo del ecosistema sin asumir el costo de mantenerlo. Si en el futuro otro protocolo lo supera o lo desplaza, el refinamiento sugerido en 4.4 prevé que la Autoridad de Aplicación pueda habilitar equivalentes por resolución, sin necesidad de reabrir el marco legal.

### Composición de los cuatro pilares

```
              ┌───────────────────────────────┐
              │  AGENTE DE IA (Claude/GPT/...)│
              └───────────────┬───────────────┘
                              │ MCP
                              ▼
   ┌──────────────────────────────────────────────────┐
   │          SOCIEDAD AUTOMATIZADA (art. 14)         │
   │                                                  │
   │  ┌──────────────┐  ┌────────────────────────┐    │
   │  │ Identidad    │  │ Registro auditable     │    │
   │  │ Ed25519      │  │ HMAC + anchor chain    │    │
   │  └──────────────┘  └────────────────────────┘    │
   │                                                  │
   │  ┌──────────────────────────────────────────┐    │
   │  │ Personería fiscal: CUIT + WSFE + MP      │    │
   │  └──────────────────────────────────────────┘    │
   └──────────────────────────────────────────────────┘
                              │
                              ▼
              ┌──────────────────────────────┐
              │  ESTADO (auditoría, registro)│
              └──────────────────────────────┘
```

El que controla la clave privada Ed25519 controla la sociedad. Toda actividad se firma, se registra, se factura y se opera por MCP. Cada una de las cuatro capas es verificable independientemente.


## 3. Implementación de referencia: `@ar-agents`

La arquitectura descrita en la sección 2 está implementada y publicada como software libre. La presente sección documenta con honestidad qué existe y qué no existe a la fecha.

### Qué existe y es verificable

- **Código fuente abierto** en `github.com/ar-agents/ar-agents`, licencia MIT.
- **39 paquetes publicados en npm** bajo el scope `@ar-agents/*`:
  - `@ar-agents/identity`, validación de CUIT y consultas al padrón de ARCA
  - `@ar-agents/facturacion`, emisión de facturas con CAE vía WSFE
  - `@ar-agents/mercadopago`, suscripciones recurrentes y cobranzas
  - `@ar-agents/mi-argentina`, identidad gubernamental (OIDC)
  - `@ar-agents/incorporate`, flujo de constitución societaria
  - `@ar-agents/whatsapp`, `@ar-agents/banking`, `@ar-agents/shipping`, entre otros.
- **Especificaciones formales**: 6 RFCs publicados en `ar-agents.ar/rfcs`, incluido el registro auditable encadenado (RFC-004) y su anclaje externo (RFC-006).
- **252 herramientas** expuestas a través de los paquetes, operables vía Vercel AI SDK y MCP.
- **Reference verifier**: `npx @ar-agents/verify-sociedad <CUIT>` permite a cualquier tercero ejecutar una verificación local del estado fiscal y criptográfico de una Sociedad Automatizada registrada.
- **Despliegues de referencia operativos**: aplicaciones funcionando end-to-end emitiendo CAEs reales contra ARCA en ambiente productivo, no sandbox.

### Qué no existe

- **Adopción de terceros verificable a escala.** Los paquetes están publicados y registran descargas, pero no existe a la fecha un censo público de usuarios externos. La implementación está en uso productivo en los despliegues del autor; cualquier adopción adicional sería información que se construye una vez el régimen exista.
- **Certificación oficial.** Ninguna autoridad estatal ha certificado la implementación como referencia. El presente documento es la propuesta para que esa certificación, si la Autoridad de Aplicación la considera procedente, exista.
- **Anclaje externo del registro en producción.** El registro encadenado local existe y es tamper-evidente; el anclaje a un servicio público (Boletín Oficial digital, blockchain pública o tercero certificado del art. 263) está especificado en RFC-006 pero todavía no desplegado. Hasta entonces el registro no es a prueba del propio operador, según se explica con honestidad en la sección 2.2.
- **Integración con el registro societario del Estado bajo el nuevo régimen.** El anteproyecto está en el Senado y todavía no es ley; no hay aún un procedimiento registral definido para la Sociedad Automatizada. La integración requiere coordinación con la futura Autoridad de Aplicación una vez sancionado el texto y dictado el reglamento.

### Honestidad sobre el estado

La implementación está hecha. El anclaje externo y la adopción a escala no están hechos. Esta secuencia es deliberada: el orden correcto es que primero exista la infraestructura técnica de referencia, y después se construya adopción sobre ella. Construir la infraestructura es lo único que podía hacerse antes incluso de que existiera el texto del anteproyecto; ahora que el texto existe, la implementación se puede anclar a sus artículos, pero la adopción a escala todavía requiere que el régimen se sancione para tener una Sociedad Automatizada real que registrar. Lo que aquí se documenta es lo que estaba en condiciones de adelantar al estado de la cuestión.


## 4. Mapeo de los artículos redactados a infraestructura operable

A diferencia de la primera versión de este documento, el texto ya está redactado. Por eso esta sección no propone cláusulas desde cero: toma los artículos del anteproyecto que ya existen y muestra, para cada uno, qué pieza de la implementación de referencia lo hace operable, y dónde sugerimos un refinamiento al texto. Donde un artículo ya recoge sustancialmente lo que se necesita, lo decimos así de claro: el anteproyecto ya lo dice, nuestra implementación es la pieza técnica que lo vuelve verificable. Los refinamientos son sugerencias; el tratamiento legislativo mantiene plena libertad para tomarlos, modificarlos o descartarlos.

### 4.1 Definición y capacidad: el anteproyecto ya lo resuelve (art. 14)

> **Art. 14 (vigente en el anteproyecto).** La sociedad de cualquiera de los tipos previstos que desarrolle su objeto social mediante sistemas algorítmicos autónomos o agentes de inteligencia artificial, sin requerir trabajadores en relación de dependencia ni recursos humanos para su operación ordinaria, será considerada una Sociedad Automatizada. La declaración de automatización deberá constar expresamente en el estatuto. La denominación deberá incluir la expresión "Automatizada". La sociedad responde con su patrimonio frente a terceros por los daños causados por sus sistemas algorítmicos autónomos o agentes de inteligencia artificial.

**Lectura técnica.** El anteproyecto ya recoge esto: no hace falta una cláusula nueva de definición. El art. 14 resuelve la decisión de fondo número 1 y lo hace de un modo más sólido que la formulación especulativa original, porque no inventa un tipo nuevo sino que califica a los tipos existentes (SRL, SA, SAS). Una precisión honesta: el texto dice "sin requerir recursos humanos para su operación ordinaria", no "cero humanos". La sociedad conserva administrador (art. 88) y, según el caso, representante humano. La pieza técnica que acompaña al art. 14 es el resto de la arquitectura: identidad criptográfica, registro auditable y personería fiscal operable.

### 4.2 Identidad criptográfica: refinamiento sugerido sobre el art. 6

El art. 6 ya admite la constitución por firma digital, firma certificada o firma electrónica avanzada, lo que habilita el alta remota verificable. Lo que el texto no fija es un esquema de identidad criptográfica persistente para los actos posteriores de la sociedad. Sugerimos que el reglamento de la Autoridad de Aplicación lo precise:

> **Refinamiento sugerido.** Toda Sociedad Automatizada se constituye con un par de claves criptográficas asimétricas conforme al estándar IETF RFC 8032 (algoritmo Ed25519) o el equivalente que designe la Autoridad de Aplicación. La clave pública se inscribe junto con su CUIT y constituye la identidad criptográfica de la sociedad. Todo acto patrimonialmente relevante debe firmarse digitalmente con la clave privada correspondiente.

**Lectura técnica.** Permite verificación de actos sin intermediario centralizado. Cualquier tercero, en cualquier momento, puede comprobar criptográficamente que un acto procede de una Sociedad Automatizada registrada. Resuelve la pregunta de "cómo sabemos que esta operación fue de la sociedad y no de un suplantador". Esto da continuidad a la firma del art. 6 a lo largo de toda la vida de la sociedad, no solo en su constitución.

### 4.3 Registro auditable: el anteproyecto ya lo exige (arts. 263, 102, 101)

> **Art. 263 (vigente en el anteproyecto).** Todo registro digital sustituye cualquier soporte físico equivalente, siempre que su información resulte públicamente verificable, pueda reproducirse en formato legible y permita reconstruir su estado patrimonial.

**Lectura técnica.** El anteproyecto ya recoge esto: el art. 263 exige registros digitales públicamente verificables, el art. 102 fija el deber de configuración y supervisión de los sistemas de IA, y el art. 101 exige un procedimiento de decisión adecuado. No hace falta una cláusula nueva que ordene "llevar un registro encadenado". Lo que hace falta es la pieza técnica que cumpla esa exigencia, y es exactamente el registro encadenado HMAC con anclaje externo de la sección 2.2. Refinamiento sugerido para el reglamento que el propio art. 263 anticipa: fijar HMAC-SHA256 (o equivalente) para el encadenamiento y una frecuencia mínima de anclaje externo no menor a una vez por día calendario, de modo que la verificabilidad pública del art. 263 sea efectiva y no quede librada a la implementación de cada sociedad. La propiedad alcanzable es tamper-evidencia frente a testigos, no operator-proof, mientras el anclaje externo no esté desplegado.

### 4.4 Interfaz de operación estandarizada: refinamiento sugerido

El anteproyecto no fija un protocolo de operación. El art. 102 supone que el órgano de administración usa sistemas de IA pero no estandariza la interfaz. Sugerimos:

> **Refinamiento sugerido.** La operación de la Sociedad Automatizada puede exponerse mediante una interfaz programática conforme a un protocolo abierto que designe la Autoridad de Aplicación, que permita el control auditable por el administrador, la inspección por el Estado conforme al procedimiento reglamentado, y la interoperabilidad conforme estándares públicos. Entre los protocolos abiertos de uso extendido se incluye el Model Context Protocol (MCP); la Autoridad de Aplicación queda habilitada para reconocer equivalentes por resolución.

**Lectura técnica.** Estandariza el modo en que el Estado y los administradores acceden a las sociedades automatizadas, previene la fragmentación operativa y simplifica la inspección estatal. MCP es el estándar de mayor adopción en 2026; reconocerlo por resolución permite aprovechar el ecosistema sin atarse a un proveedor ni reabrir la ley si otro protocolo lo supera.

### 4.5 Responsabilidad: el anteproyecto ya la fija (arts. 14, 101, 102, 91), con un refinamiento

El anteproyecto ya resuelve la responsabilidad y lo hace bien: el art. 14 dispone que la sociedad responde con su patrimonio por los daños de sus sistemas; el art. 101 fija responsabilidad por culpa o dolo con la regla de discrecionalidad empresarial; el art. 102 aclara que usar IA no exime ni limita la responsabilidad de los administradores y conserva el deber de configuración y supervisión; el art. 91 agrega que contratar un gerenciamiento no excluye los deberes ni la responsabilidad. No hay zona de impunidad en el texto.

> **Refinamiento sugerido.** Vincular expresamente el deber de configuración y supervisión del art. 102 al mantenimiento del registro auditable verificable del art. 263, de modo que el incumplimiento de la traza verificable opere como incumplimiento del deber de supervisión a los efectos del art. 101.

**Lectura técnica.** El refinamiento conecta el derecho societario con la integridad criptográfica: el registro auditable (sección 2.2) es la prueba objetiva de si el administrador cumplió o no su deber de supervisión. Sin esa traza, el deber del art. 102 queda en una afirmación difícil de auditar; con ella, es verificable a demanda.

### Refinamientos adicionales sugeridos (opcionales)

- **Disolución y sucesión del agente operador**: qué pasa si el sistema o agente designado deja de operar (modelo retirado, proveedor discontinuado, decisión del administrador). Sugerencia: estado de inactividad por hasta 12 meses, disolución si no se designa sucesor, en línea con las causales de disolución del régimen.
- **Régimen tributario**: el anteproyecto no crea un régimen especial; la Sociedad Automatizada tributa como sociedad de tipo común (IVA, IIBB, Ganancias o monotributo según categoría). Si se quisiera un tratamiento diferenciado, debería establecerse por la vía fiscal correspondiente, no por la ley societaria.
- **Régimen cambiario**: si la Sociedad Automatizada opera con clientes o proveedores externos (cobrar en USD desde el exterior, pagar servicios cloud en USD a proveedores como OpenAI, Anthropic, AWS), conviene contemplar la libre disponibilidad de divisas en los términos del régimen general vigente. Sin previsión cambiaria operable, el régimen pierde atractivo para operadores internacionales y la jurisdicción no captura el flujo internacional que el rol de "primera jurisdicción del mundo" presupone.

Estos refinamientos se sugieren para una etapa posterior del tratamiento, una vez consolidado el núcleo de los arts. 14, 101, 102 y 263.


## 5. Preguntas técnicas planteadas en el debate público y cómo la arquitectura las aborda

El debate público sobre el régimen ha articulado preguntas técnicas y jurídicas sustantivas. Las exposiciones doctrinarias más completas fueron formuladas por Betania Allo (MDZ, mayo 2026) y Claudia Guardia (Infobae, diciembre 2025). Buena parte de esas preguntas se formularon antes de que existiera el texto; ahora pueden contrastarse contra los artículos. Sin entrar a un debate jurídico que excede el alcance técnico de este documento, las preguntas señaladas quedan abordadas por el texto y por la arquitectura en los siguientes términos:

- **La pregunta sobre el vacío de responsabilidad** ("¿quién responde si la entidad defrauda, contrata ilegalmente o difama?") queda respondida por el texto: art. 14 (la sociedad responde con su patrimonio), art. 101 (responsabilidad de los administradores por culpa o dolo), art. 102 (usar IA no exime de responsabilidad) y art. 91 (contratar un gerenciamiento no excluye los deberes). No hay zona de impunidad en el anteproyecto. Nuestro aporte (sección 4.5) es vincular esos deberes al registro verificable para que el cumplimiento sea auditable.

- **La pregunta sobre la trazabilidad** (registros alterables, ausencia de mecanismos de verificación independiente) la responde el art. 263, que exige registros digitales públicamente verificables. La pieza técnica que lo hace efectivo es el registro encadenado HMAC con anclaje externo (secciones 2.2 y 4.3). Con el anclaje desplegado, cualquier auditor (Estado, contraparte, perito judicial) puede reconstruir el historial y detectar alteraciones retrospectivas posteriores al anclaje. Mientras el anclaje no esté en producción, la propiedad es tamper-evidencia frente a testigos, no inmutabilidad absoluta: lo decimos sin rodeos.

- **La pregunta sobre el registro de responsables humanos** la responde el art. 88: la administración está a cargo de una o más personas humanas o jurídicas, cargo personal e indelegable. En el régimen DAO, el art. 260 exige además uno o más representantes humanos, y el art. 264 suma fiscalización y beneficiarios finales ante la UIF (Ley 25.246), con uno de los representantes legales como oficial de cumplimiento. La identidad criptográfica (secciones 2.1 y 4.2) liga cada acción a la clave de la sociedad bajo supervisión del administrador. El responsable humano no desaparece: el texto lo conserva.

- **La consideración sobre soberanía.** La arquitectura no determina la localización del capital ni la jurisdicción donde se entrena el modelo subyacente: eso es política industrial, no marco societario. Lo que sí resuelve es la soberanía técnica: código MIT, sin dependencias propietarias extranjeras, operable íntegramente sobre infraestructura argentina. El mercado producirá naturalmente una categoría de administradores argentinos especializados, análogos a los registered agents de jurisdicciones de constitución masiva (Delaware, Wyoming, Irlanda); ese mercado es el lugar donde la soberanía operativa se materializa, no la ley.

- **La pregunta sobre la no-permanencia identitaria de la IA** ("la IA muta continuamente y no permanece idéntica a sí misma en el tiempo") la resuelve la identidad criptográfica (sección 4.2). La identidad jurídica de la sociedad NO es el modelo de IA que la opera. Es la clave pública registrada en su constitución, en continuidad con la firma del art. 6. El modelo subyacente puede actualizarse, cambiar de proveedor o evolucionar; la identidad de la sociedad permanece idéntica porque la clave permanece. La persistencia es criptográfica, no del modelo.

- **La pregunta sobre el alineamiento** (los objetivos algorítmicos pueden divergir del intento humano). El alineamiento técnico de un modelo es un problema de ingeniería de cada administrador, y el art. 102 lo reconoce al imponer el deber de configuración y supervisión. El régimen aporta lo que sí puede aportar: identidad estable, registro auditable, deberes y responsabilidad enumerados. La pregunta filosófica queda donde está en cualquier sistema legal: fuera del alcance de la norma societaria.

## 6. Disponibilidad y verificación

El presente documento, la especificación RFC-001 y el código fuente de la implementación de referencia están publicados íntegramente en `ar-agents.ar` bajo licencia abierta (MIT). Su uso, modificación, integración o adopción como referencia formal es libre y no requiere autorización del autor.

Para los aspectos que exceden el alcance de este documento (arquitectura interna, supuestos verificados, decisiones de diseño, refinamientos sugeridos al texto del anteproyecto), el autor queda disponible para consultas técnicas en el formato que el área correspondiente considere conveniente.

Contacto: naza@naza.ar

### Verificación criptográfica del propio documento

Este PDF está firmado con Ed25519 (IETF RFC 8032) por la misma autoría que lo redacta, aplicando al documento el mismo estándar que la arquitectura propone para las Sociedades Automatizadas. La firma puede verificarse offline, sin confiar en `ar-agents.ar`:

```
curl -fsSL https://ar-agents.ar/implementacion.pdf -o doc.pdf
curl -fsSL https://ar-agents.ar/implementacion.pdf.sig.json -o doc.pdf.sig.json
curl -fsSL https://ar-agents.ar/arg-verify.mjs -o arg-verify.mjs
node arg-verify.mjs file doc.pdf
```

El verificador es *clean-room*, sin dependencias, escrito sobre las primitivas estándar de Node (auditable íntegro en `github.com/ar-agents/ar-agents/blob/main/tools/arg-verify/arg-verify.mjs`). La clave pública se publica en `ar-agents.ar/.well-known/ar-agents/doc-signing-keys.json`. Cualquier modificación del PDF, un solo byte, hace fallar las tres comprobaciones de integridad (tamaño, SHA-256, firma Ed25519).

Esta verificación no es ornamental: el documento que propone Ed25519 para las Sociedades Automatizadas se distribuye él mismo bajo Ed25519. Si la arquitectura es buena para el régimen, es buena para el documento que lo propone.


## Anexo I, Marcos jurisdiccionales comparados

Argentina, de avanzar con el régimen, no operaría en el vacío. Otras jurisdicciones han creado marcos legales para entidades sin conducción humana directa (DAOs, asociaciones digitales, vehículos de propósito único sin staff operativo). Conocer estos marcos sitúa la iniciativa argentina en el mapa internacional y reduce la fricción para que el drafting jurídico se beneficie de soluciones ya probadas.

| Jurisdicción | Vehículo | Año | Características relevantes |
|---|---|---|---|
| **Wyoming (EE.UU.)** | DAO LLC (Wyoming Stat. Title 17 §31-§109) | 2021 | Primera estructura societaria reconocida por una jurisdicción anglosajona para una DAO. La gobernanza puede ser algorítmica vía smart contract. El operador designado se denomina *registered agent* y responde con su patrimonio en supuestos enumerados. Modelo replicado por Tennessee y otros estados. |
| **Islas Marshall (RMI)** | DAO Act 2022 | 2022 | Reconocimiento formal de DAOs como entidades legales constituibles. Personería plena, capacidad para abrir cuenta bancaria, emitir tokens, contratar terceros. Atrajo proyectos como Shipyard Software y MIDAO. Marco más liberal de personería algorítmica vigente a nivel global. |
| **Estonia** | e-Residency + private limited company (OÜ) | 2014-2025 | No es estrictamente personería para IA, pero el régimen permite constitución íntegramente remota y operación digital de una sociedad por un no-residente. Modelo replicado por Lituania, Letonia y Portugal. Demuestra que la constitución remota verificable es operativamente posible a escala estatal. |
| **Singapur** | Variable Capital Company (VCC Act 2018) | 2018 | Vehículo societario diseñado para *fund management* altamente automatizado. La operativa cotidiana puede delegarse en gestores algorítmicos; el régimen exige un *fund manager* registrado (análogo al operador designado). Confirma que la conducción algorítmica con responsable humano enumerado es una arquitectura jurídica establecida. |
| **Suiza** | Asociación civil (CC art. 60) y *Stiftung* | tradicional | Las DAOs y fundaciones de software libre suizas (Ethereum Foundation, Web3 Foundation, Solana Foundation) operan bajo forma de asociación o fundación. La *Stiftung* permite control programático mientras los órganos formales son humanos y responden. Marco no diseñado para IA pero adoptado de hecho por la frontera tecnológica. |
| **Liechtenstein** | Token and TT Service Provider Act (TVTG) | 2020 | Define explícitamente entidades autónomas sobre infraestructura blockchain con responsabilidad enumerada para el *TT Service Provider* (análogo al operador designado). Marco europeo más avanzado en personería para entidades sin conducción humana directa. |

**Lectura.** Ningún país del listado reconoce personería plena de inteligencia artificial en los términos del anteproyecto argentino. Todos requieren una persona humana responsable y todos limitan la responsabilidad al patrimonio de la entidad excepto en supuestos específicos, igual que el anteproyecto argentino (art. 14 responde con el patrimonio; arts. 88 y 91 conservan la administración y sus deberes humanos). La novedad argentina es nombrar a la Sociedad Automatizada (art. 14) como calificación societaria y regular la Sociedad Descentralizada Autónoma Operativa (DAO, arts. 258-265), sobre bases técnicas (Ed25519, MCP, registro encadenado HMAC) intercompatibles con las jurisdicciones precedentes. La interoperabilidad técnica es la base sobre la que puede construirse reconocimiento mutuo cross-border en el mediano plazo. El art. 263 del anteproyecto, al exigir registros públicamente verificables, deja a Argentina mejor posicionada que la mayoría de esos marcos para la auditoría externa.


## Anexo II, Referencias

**Estándares criptográficos.**

- IETF RFC 8032, *Edwards-Curve Digital Signature Algorithm (EdDSA)*, 2017. Algoritmo Ed25519, usado en Pilar 1 (identidad criptográfica) y en el refinamiento 4.2.
- IETF RFC 2104, *HMAC: Keyed-Hashing for Message Authentication*, 1997. Esquema HMAC-SHA256, usado en Pilar 2 (registro auditable) y en la sección 4.3.
- IETF RFC 3161, *Internet X.509 Public Key Infrastructure Time-Stamp Protocol (TSP)*, 2001. Mecanismo de anclaje temporal candidato para Pilar 2.
- IETF RFC 6962, *Certificate Transparency*, 2013. Esquema de auditoría matemática verificable que inspira la arquitectura de anclaje del Pilar 2.
- NIST FIPS 198-1, *The Keyed-Hash Message Authentication Code (HMAC)*, 2008. Definición normativa de HMAC.
- NIST FIPS 186-5, *Digital Signature Standard (DSS)*, 2023. Incluye Ed25519 como algoritmo aceptado para firma digital en el sector público estadounidense.

**Protocolos abiertos.**

- Anthropic et al., *Model Context Protocol Specification*, versión 2025-06-18. Protocolo abierto adoptado por Claude, OpenAI Agents SDK, Cursor, Cline y otras herramientas mainstream. Publicado en `modelcontextprotocol.io/specification`. Usado en Pilar 4 y en el refinamiento 4.4.

**Especificaciones técnicas argentinas.**

- ARCA (ex-AFIP), *Web Service Autenticación y Autorización (WSAA), Manual del Desarrollador*. Mecanismo de autenticación cliente-servidor para los Web Services tributarios.
- ARCA, *Web Service Factura Electrónica (WSFE) v1, Manual del Desarrollador*. Emisión de factura electrónica con CAE. Usado en Pilar 3.

**Marco normativo argentino.**

- Anteproyecto de *Ley General de Sociedades*, firmado el 28 de mayo de 2026 por Santiago Viola (Secretaría de Justicia, Ministerio de Justicia), expediente IF-2026-53144057-APN-SECJ#MJ. 277 artículos. Enviado al Senado el 1 de junio de 2026; aún no es ley. Reemplaza y deroga la Ley 19.550 (art. 270). Artículos citados en este documento: 6 (forma), 14 (Sociedad Automatizada), 36 (instrumentos de inversión), 88 (administración), 91 (deberes), 101 (responsabilidad y discrecionalidad empresarial), 102 (IA en la gestión), 258-265 (Sociedad Descentralizada Autónoma Operativa, DAO), 263 (registros digitales verificables), 270 (derogaciones), 271 (vigencia).
- Ley 19.550, *Ley General de Sociedades*, texto consolidado 2014. Régimen vigente que el anteproyecto reemplaza y deroga (art. 270 del anteproyecto), no reforma.
- Ley 25.506, *Ley de Firma Digital*, 2001. Marco normativo de firma digital en Argentina. La firma Ed25519 del refinamiento 4.2 es complementaria, no sustitutiva, del régimen de firma digital existente y de la firma admitida por el art. 6 del anteproyecto.
- Resolución General ARCA / AFIP sobre Web Services tributarios. Marco habilitante para la operación de la Sociedad Automatizada sobre infraestructura tributaria estándar.

**Marco normativo comparado.**

- Wyoming Statutes Annotated, Title 17 (Corporations), §31-§109, *Decentralized Autonomous Organizations*, 2021.
- Republic of the Marshall Islands, *DAO Act of 2022*.
- European Union, Regulation 910/2014 (*eIDAS*), 2014. Marco europeo de identificación electrónica e identidades calificadas.
- Liechtenstein, *Token and TT Service Provider Act (TVTG)*, 2020.
