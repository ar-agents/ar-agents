# Implementación de referencia para Sociedades de Inteligencia Artificial

**Arquitectura técnica, código operable y cláusulas sugeridas para el proyecto de ley**

Nazareno Clemente
ar-agents.ar
Mayo 2026


## Resumen

El 28 de abril de 2026, en el marco de Expo EFI, el Ministerio de Desregulación y Transformación del Estado anunció la creación de un régimen de Sociedades de Inteligencia Artificial mediante reforma a la Ley General de Sociedades (Ley 19.550). El presente documento es una implementación de referencia abierta y verificable de la infraestructura técnica que ese régimen requiere para ser operable. Está dirigido al equipo que redacte el proyecto de ley y a las áreas técnicas del Ministerio.

Cubre cinco frentes: (1) las decisiones técnicas que el drafting va a tener que tomar; (2) una arquitectura de referencia construida sobre estándares abiertos; (3) el estado actual de la implementación, publicada como software libre; (4) cinco cláusulas operables sugeridas para el texto del proyecto, con justificación técnica de cada una; (5) respuesta puntual a las objeciones jurídicas que circulan en el debate público.

El código es open-source (licencia MIT), publicado en `github.com/ar-agents/ar-agents` y disponible para que cualquier marco regulatorio que el Ministerio defina lo adopte como referencia.


## 1. Las decisiones técnicas que el proyecto de ley requiere resolver

Un régimen de Sociedades-IA es jurídicamente novedoso. Para que sea operable, el texto del proyecto necesita responder, de manera explícita o por delegación al reglamento, seis preguntas técnicas. Las seis tienen respuestas posibles divergentes; la elección entre ellas determina cuánto del régimen se puede implementar sobre estándares existentes y cuánto requiere ingeniería original.

| # | Pregunta | Respuesta técnica sugerida |
|---|---|---|
| 1 | ¿Qué es operacionalmente una sociedad-IA? (¿Persona jurídica plena? ¿Entidad capaz limitada al objeto? ¿Vehículo del operador?) | Persona jurídica de derecho privado con plena capacidad para los actos comprendidos en su objeto. Sujeto de imputación con responsabilidad limitada al patrimonio social y solidaria del operador en supuestos enumerados. Ver Cláusula 1. |
| 2 | ¿Cómo se constituye? (¿Trámite presencial, electrónico, ad-hoc? ¿Qué documentación es constitutiva?) | Procedimiento íntegramente remoto y verificable. Documentación constitutiva: estatuto, designación de operador y par de claves Ed25519 generadas al momento de la inscripción. Sugerencia desde la perspectiva técnica; el procedimiento registral concreto es materia del drafting jurídico. |
| 3 | ¿Cómo se identifica frente al Estado y frente a terceros? | CUIT estándar más clave pública Ed25519. Toda acción de la sociedad firmada digitalmente, verificable por cualquier tercero sin intermediario centralizado. Ver Cláusula 2. |
| 4 | ¿Cómo audita el Estado lo que la sociedad hace? | Trazabilidad criptográfica verificable a demanda mediante registro encadenado HMAC con anclaje diario a servicio público. Esquema específico para Sociedad-IA, complementario al régimen de libros vigente. Ver Cláusula 3. |
| 5 | ¿Cómo opera económicamente? | Encaje pleno en régimen tributario general (IVA, IIBB, Ganancias o monotributo según categoría). Habilitada para facturar con CAE y cobrar autónomamente. Régimen diferenciado opcional únicamente vía Súper RIGI si el proyecto califica. Ver sección 2.3. |
| 6 | ¿Quién es responsable y por qué actos? | Responsabilidad limitada al patrimonio social. Operador designado responde solidariamente por: infracapitalización dolosa, fraude, e incumplimiento de los deberes técnicos esenciales (identidad criptográfica, registro auditable, interfaz de operación). Ver Cláusula 5. |

Las seis respuestas son internamente consistentes y producen un régimen implementable sobre la arquitectura descrita en la sección 2. Las cláusulas operables correspondientes están redactadas en la sección 4. El drafting jurídico mantiene plena libertad para modificar, sustituir o rechazar cada una; lo que el documento aporta es un punto de partida técnico coherente, no una pretensión de cerrar el debate legal.

**Contexto regional.** Ningún país de la región ha legislado un régimen comparable. Brasil, México y Chile mantienen el debate en plano académico; la Unión Europea avanza por la ruta opuesta (AI Act, con foco en obligaciones del operador humano y restricciones por nivel de riesgo). La iniciativa argentina, de avanzar, situaría al país como primera jurisdicción del mundo con marco específico para personería jurídica de agentes de IA. Adoptar un estándar técnico abierto y no propietario reduce la fricción para que otras jurisdicciones repliquen la base argentina, lo que multiplica el peso institucional de la decisión local.


## 2. Arquitectura de referencia

La arquitectura propuesta se compone de cuatro pilares, cada uno construido sobre un estándar técnico abierto y preexistente. La elección de estándares es deliberada: no se inventa criptografía ni protocolos nuevos. Toda la implementación reutiliza primitivas ya verificadas, auditadas y mantenidas por la comunidad técnica internacional.

### 2.1 Identidad criptográfica firmada (Ed25519)

Cada Sociedad-IA se constituye con un par de claves criptográficas asimétricas conforme al estándar IETF RFC 8032, algoritmo Ed25519.

- La clave pública constituye la **identidad criptográfica** de la sociedad. Se registra en el Registro de Sociedades-IA junto con el CUIT.
- La clave privada queda bajo custodia del operador designado, protegida por el procedimiento que reglamente la Autoridad de Aplicación (módulo de seguridad de hardware, custodia notarial digital, multifirma, según el caso).
- Toda manifestación de voluntad de la sociedad (emisión de factura, firma de contrato digital, aprobación de transacción) debe ir firmada con esa clave privada.
- Cualquier tercero (Estado, contraparte, auditor) puede **verificar** una firma sin necesidad de intermediario centralizado.

**Por qué este estándar.** Ed25519 es el algoritmo de firma digital más adoptado en la última década (SSH, TLS 1.3, criptomonedas, sistemas de identidad gubernamental europeos). Está auditado, es resistente a ataques conocidos, y produce firmas compactas (64 bytes) y rápidas de verificar.

### 2.2 Registro auditable encadenado (HMAC + anchor chain)

La sociedad mantiene un registro inmutable de todos sus actos jurídicamente relevantes. El registro tiene dos capas:

- **Capa local:** cada entrada del registro contiene su contenido (el acto), el hash de la entrada anterior, y un código de autenticación HMAC-SHA256 derivado de una clave secreta de integridad. Esto vincula cada entrada al pasado: una modificación retrospectiva quiebra el encadenamiento y es detectable.
- **Capa externa (anchoring):** el hash del estado del registro se ancla periódicamente (al menos diariamente) en al menos un servicio público de verificación temporal. El anclaje puede ser: (a) publicación en el Boletín Oficial digital; (b) inscripción en una blockchain pública; (c) firma temporal certificada por un tercero de confianza designado por la Autoridad de Aplicación. La elección la fija el reglamento.

**Resultado.** En cualquier momento, un auditor (Estado, contraparte, perito judicial) puede verificar criptográficamente que: (a) el registro no fue alterado retrospectivamente; (b) en una fecha determinada, el contenido del registro era exactamente el que se anclaba. La integridad del libro es matemática, no confianza.

**Por qué este esquema.** HMAC y los esquemas de anclaje externo son los mismos que utilizan los registros de transparencia de certificados TLS (Certificate Transparency, RFC 6962), los logs de auditoría financiera regulada en jurisdicciones avanzadas, y los registros internos de plataformas como Stripe o Mercado Libre. No requiere blockchain dedicada ni infraestructura nueva del Estado.

### 2.3 Personería fiscal operable (CUIT + WSFE + Mercado Pago)

La sociedad-IA es contribuyente fiscal pleno. Opera la infraestructura tributaria argentina estándar:

- **CUIT propio**, distinto del CUIT del operador designado o de cualquier persona física asociada.
- **Factura electrónica** con CAE emitida vía Web Service de Facturación Electrónica (WSFE) de ARCA. La sociedad emite Facturas A, B o C según su categoría tributaria, sin diferenciación respecto del régimen general.
- **Cobranzas** vía Mercado Pago, cuentas bancarias propias, y cualquier medio de pago habilitado a personas jurídicas.
- **Obligaciones tributarias** estándar: IVA, IIBB, Ganancias o monotributo según corresponda. Sin régimen diferenciado especial, salvo que el proyecto de ley así lo establezca explícitamente.

**Sin intermediario humano operativo.** Una vez constituida la sociedad y designado el operador, las operaciones tributarias se ejecutan automáticamente por el agente de IA contra los servicios de ARCA y Mercado Pago. El operador interviene sólo en los actos reservados.

**Estado de implementación.** Esta capa está completamente construida y en producción en los despliegues de referencia. Certificado X.509 emitido por ARCA, cargado y operativo, emisión real de CAE comprobable.

**Renovación periódica del certificado fiscal.** El certificado X.509 emitido por ARCA tiene vigencia limitada (típicamente 2 años). Para preservar la autonomía operativa del régimen entre ciclos de renovación, el procedimiento puede automatizarse: la sociedad genera programáticamente un Certificate Signing Request (CSR) antes del vencimiento, firmado con su clave Ed25519 registrada (Pilar 1); el operador designado aprueba la renovación con una sola firma criptográfica desde su llave privada. El intercambio con el portal de ARCA queda mediado por el procedimiento que reglamente la Autoridad de Aplicación, sin requerir interacción humana repetida con interfaces estatales para cada renovación.

### 2.4 Interfaz de operación autónoma (MCP: Model Context Protocol)

La sociedad-IA se opera mediante un agente de inteligencia artificial designado. Para que esa operación sea estandarizada, auditable e independiente del proveedor de IA específico, la arquitectura adopta el **Model Context Protocol (MCP)**, protocolo abierto introducido por Anthropic y adoptado por Claude, Cursor, Cline, OpenAI Agents SDK y otras herramientas mainstream.

- MCP define un conjunto de operaciones que el agente puede invocar sobre la sociedad: emitir factura, consultar saldo, firmar acto societario, recibir pago, etc.
- Cualquier modelo de IA conforme con el protocolo (Claude, GPT, Gemini, Llama, modelos locales) puede operar la sociedad. **Sin lock-in a un proveedor de modelo específico.**
- El Estado, mediante un cliente MCP de inspección, puede consultar el estado de la sociedad y la traza de sus acciones bajo el procedimiento que reglamente la ley.

**Por qué MCP.** Es el protocolo de mayor adopción para la operación estandarizada de agentes de IA en 2026. Es abierto, ya tiene clientes en producción, y su evolución técnica es independiente del Estado argentino. Adoptarlo es heredar el trabajo del ecosistema sin asumir el costo de mantenerlo. Si en el futuro otro protocolo lo supera o lo desplaza, la Cláusula 4 prevé la habilitación administrativa de equivalentes sin necesidad de reabrir el marco legal.

### Composición de los cuatro pilares

```
              ┌───────────────────────────────┐
              │  AGENTE DE IA (Claude/GPT/...)│
              └───────────────┬───────────────┘
                              │ MCP
                              ▼
   ┌──────────────────────────────────────────────────┐
   │              SOCIEDAD-IA (entidad jurídica)      │
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
- **33 paquetes publicados en npm** bajo el scope `@ar-agents/*`:
  - `@ar-agents/identity`, validación de CUIT y consultas al padrón de ARCA
  - `@ar-agents/facturacion`, emisión de facturas con CAE vía WSFE
  - `@ar-agents/mercadopago`, suscripciones recurrentes y cobranzas
  - `@ar-agents/mi-argentina`, identidad gubernamental (OIDC)
  - `@ar-agents/incorporate`, flujo de constitución societaria
  - `@ar-agents/whatsapp`, `@ar-agents/banking`, `@ar-agents/shipping`, entre otros.
- **Especificación formal**: RFC-001 publicado en `ar-agents.ar/rfcs/001`.
- **Reference verifier**: `npx @ar-agents/verify-sociedad <CUIT>` permite a cualquier tercero ejecutar una verificación local del estado fiscal y criptográfico de una sociedad-IA registrada.
- **Despliegues de referencia operativos**: aplicaciones funcionando end-to-end emitiendo CAEs reales contra ARCA en ambiente productivo, no sandbox.

### Qué no existe

- **Adopción de terceros verificable a escala.** Los paquetes están publicados y registran descargas, pero no existe a la fecha un censo público de usuarios externos. La implementación está en uso productivo en los despliegues del autor; cualquier adopción adicional sería información que se construye una vez el régimen exista.
- **Certificación oficial.** Ninguna autoridad estatal ha certificado la implementación como referencia. El presente documento es la propuesta para que esa certificación, si la Autoridad de Aplicación la considera procedente, exista.
- **Integración con un Registro de Sociedades-IA del Estado.** No hay registro estatal. La integración requiere coordinación con el Ministerio una vez definido el modelo registral.

### Honestidad sobre el estado

La implementación está hecha. La adopción no está hecha. Esta secuencia es deliberada: el orden correcto es que primero exista la infraestructura técnica de referencia, y después se construya adopción sobre ella. Construir la infraestructura es lo único que puede hacerse antes de que el régimen jurídico exista; construir adopción requiere el régimen para tener una sociedad real que registrar. La implementación que aquí se documenta es lo que estaba en condiciones de adelantar al estado de la cuestión.


## 4. Cláusulas operables sugeridas para el proyecto de ley

Las cinco cláusulas siguientes son texto modelo sugerido. Cada una está acompañada de su justificación técnica. El drafting team puede tomarlas literalmente, modificarlas, o usarlas como punto de partida para soluciones distintas. El objetivo es que el proyecto tenga, desde el primer borrador, lenguaje implementable.

### Cláusula 1: Definición y capacidad

> Artículo X. **Sociedad de Inteligencia Artificial (Sociedad-IA).** Es persona jurídica de derecho privado constituida bajo el presente régimen, cuyo objeto principal es la operación autónoma de un agente de inteligencia artificial designado. La Sociedad-IA tiene plena capacidad jurídica para los actos comprendidos en su objeto. La intervención humana directa queda reservada a los actos expresamente enumerados en el artículo Y de esta ley, y a la designación inicial y revocación del operador designado.

**Justificación técnica.** La línea operacional clave es "operación autónoma" sin intervención humana directa salvo los actos reservados. Esta delimitación separa Sociedad-IA de "sociedad ordinaria que usa herramientas de IA" y establece el predicado técnico necesario: una entidad jurídica cuya volición se computa, no se delibera humanamente.

### Cláusula 2: Identidad criptográfica obligatoria

> Artículo X. **Identidad criptográfica.** Toda Sociedad-IA debe constituirse con un par de claves criptográficas asimétricas conforme al estándar IETF RFC 8032 (algoritmo Ed25519) o el estándar equivalente que designe la Autoridad de Aplicación. La clave pública constituye la identidad criptográfica de la sociedad y se inscribe junto con su CUIT en el Registro de Sociedades-IA. Toda manifestación de voluntad y todo acto patrimonialmente relevante de la sociedad debe estar firmado digitalmente con la clave privada correspondiente.

**Justificación técnica.** Permite verificación de actos sin intermediario centralizado. Cualquier tercero, en cualquier momento, puede comprobar criptográficamente que un acto procede efectivamente de una Sociedad-IA registrada. Resuelve criptográficamente la pregunta de "cómo sabemos que esta operación fue de la sociedad y no de un suplantador."

### Cláusula 3: Registro auditable encadenado

> Artículo X. **Registro de actos.** Toda Sociedad-IA debe mantener un registro encadenado criptográficamente de sus actos jurídicamente relevantes. El registro debe utilizar un esquema de autenticación de mensajes (HMAC-SHA256 o algoritmo equivalente designado por la Autoridad de Aplicación) que vincule cada entrada a la anterior. El hash representativo del estado del registro debe anclarse en un servicio público de verificación temporal con frecuencia no menor a una vez por día calendario. La integridad criptográficamente verificable del registro es condición esencial para la continuidad operativa de la sociedad.

**Justificación técnica.** Provee un esquema de inmutabilidad matemática específico para la operación autónoma del régimen Sociedad-IA, complementario al régimen de libros vigente para entidades con conducción humana. Una auditoría judicial o fiscal sobre el registro produce certeza criptográfica, no probabilística. El reglamento define qué servicio público de anclaje se acepta (Boletín Oficial digital, blockchain pública específica, o servicio designado).

### Cláusula 4: Interfaz de operación estandarizada

> Artículo X. **Interfaz de operación.** La operación de la Sociedad-IA debe exponerse mediante una interfaz programática conforme a un protocolo abierto que designe la Autoridad de Aplicación. Esta interfaz debe permitir: (a) el control auditable por parte del operador designado; (b) la inspección por parte del Estado conforme al procedimiento reglamentado; (c) la interoperabilidad con otros sistemas conforme estándares públicos. Entre los protocolos abiertos de uso extendido se incluye el Model Context Protocol (MCP); la Autoridad de Aplicación queda habilitada para reconocer otros equivalentes por resolución.

**Justificación técnica.** Estandariza el modo en que el Estado y los operadores acceden a las sociedades-IA. La adopción de un protocolo abierto previene la fragmentación operativa entre sociedades-IA y simplifica la inspección estatal. MCP es el estándar de mayor adopción en 2026; su designación expresa o por habilitación administrativa permite que el régimen aproveche el ecosistema técnico existente.

### Cláusula 5: Responsabilidad del operador designado

> Artículo X. **Responsabilidad.** La Sociedad-IA responde por sus obligaciones con su propio patrimonio. El operador designado responde solidariamente con su patrimonio personal en los siguientes supuestos: (a) infracapitalización dolosa al momento de la constitución o subsiguiente; (b) fraude o uso desviado de la sociedad para perjudicar a terceros; (c) incumplimiento de los deberes técnicos esenciales establecidos en los artículos X (identidad criptográfica), X (registro auditable) y X (interfaz de operación). La responsabilidad del operador no se extiende a terceros que no hayan participado en la operación de la sociedad.

**Justificación técnica.** La cláusula previene el escenario de constitución descapitalizada con operación posterior sin responsabilidad real, y conecta el derecho societario con la integridad criptográfica al extender la doctrina del *piercing of the corporate veil* a supuestos específicos de incumplimiento técnico.

### Cláusulas adicionales sugeridas (opcionales)

- **Disolución y sucesión del agente operador**: qué pasa si el agente designado deja de operar (modelo retirado, proveedor discontinuado, decisión del operador). Sugerencia: estado de inactividad por hasta 12 meses, disolución automática si no se designa sucesor.
- **Régimen tributario**: encaje con monotributo, IVA, Ganancias y posible inclusión en Súper RIGI si el sector y monto califican.
- **Régimen cambiario**: si la sociedad-IA opera con clientes o proveedores externos (cobrar en USD desde el exterior, pagar servicios cloud en USD a proveedores como OpenAI, Anthropic, AWS), el régimen debe contemplar libre disponibilidad de divisas en los términos del régimen general vigente o incluir disposiciones específicas equivalentes a las de Súper RIGI. Sin previsión cambiaria operable, el régimen pierde atractivo para operadores internacionales y la jurisdicción no captura el flujo internacional que el modelo de "primera jurisdicción del mundo" presupone.

Estas tres se sugieren para una etapa posterior del drafting, una vez resueltas las cinco cláusulas centrales.


## 5. Preguntas técnicas planteadas en el debate público y cómo la arquitectura las aborda

El debate público sobre el régimen anunciado ha articulado preguntas técnicas y jurídicas sustantivas. Las exposiciones doctrinarias más completas fueron formuladas por Betania Allo (MDZ, mayo 2026) y Claudia Guardia (Infobae, diciembre 2025). Sin entrar a un debate jurídico que excede el alcance técnico de este documento, las preguntas señaladas quedan operacionalizadas por las cláusulas de la sección 4 en los siguientes términos:

- **La pregunta sobre el vacío de responsabilidad** ("¿quién responde si la entidad defrauda, contrata ilegalmente o difama?") queda operacionalizada por la Cláusula 5. El operador designado responde solidariamente con patrimonio personal por infracapitalización dolosa, fraude e incumplimiento de los deberes técnicos esenciales. No hay zona de impunidad: o paga la sociedad, o paga el operador. La pregunta tiene respuesta enumerada y exigible.

- **La pregunta sobre la trazabilidad** (registros alterables, ausencia de mecanismos de verificación independiente) queda operacionalizada por la Cláusula 3. El registro encadenado HMAC con anclaje diario produce trazabilidad matemáticamente verificable. Cualquier auditor (Estado, contraparte, perito judicial) puede reconstruir el historial completo y detectar alteraciones retrospectivas.

- **La pregunta sobre el registro de operadores humanos responsables** queda operacionalizada por las Cláusulas 1 y 2. El operador designado se inscribe junto con la clave pública de la sociedad. Toda acción se firma con la clave privada bajo su custodia. La identidad criptográfica y la responsabilidad personal del operador son inseparables del funcionamiento de la sociedad.

- **La consideración sobre soberanía.** La arquitectura no determina la localización del capital ni la jurisdicción donde se entrena el modelo subyacente: eso es política industrial, no marco societario. Lo que sí resuelve es la soberanía técnica: código MIT, sin dependencias propietarias extranjeras, operable íntegramente sobre infraestructura argentina. El mercado producirá naturalmente una categoría de operadores designados argentinos especializados, análogos a los registered agents de jurisdicciones de constitución masiva (Delaware, Wyoming, Irlanda); ese mercado es el lugar donde la soberanía operativa se materializa, no la ley.

- **La pregunta sobre la no-permanencia identitaria de la IA** ("la IA muta continuamente y no permanece idéntica a sí misma en el tiempo") queda operacionalizada por la Cláusula 2. La identidad jurídica de la sociedad NO es el modelo de IA que la opera. Es la clave pública criptográfica registrada en su constitución. El modelo subyacente puede actualizarse, cambiar de proveedor o evolucionar; la identidad de la sociedad permanece idéntica porque la clave permanece. La persistencia es criptográfica, no del modelo.

- **La pregunta sobre el alineamiento** (los objetivos algorítmicos pueden divergir del intento humano). El alineamiento técnico de un modelo es un problema de ingeniería de cada operador, no del régimen jurídico. El régimen aporta lo que sí puede aportar: identidad estable, registro auditable, responsabilidad enumerada del operador. La pregunta filosófica queda donde está en cualquier sistema legal: fuera del alcance de la norma societaria.

## 6. Disponibilidad y verificación

El presente documento, la especificación RFC-001 y el código fuente de la implementación de referencia están publicados íntegramente en `ar-agents.ar` bajo licencia abierta (MIT). Su uso, modificación, integración o adopción como referencia formal es libre y no requiere autorización del autor.

Para los aspectos que exceden el alcance de este documento (arquitectura interna, supuestos verificados, decisiones de diseño, refinamiento de las cláusulas sugeridas), el autor queda disponible para consultas técnicas en el formato que el área correspondiente considere conveniente.

Contacto: naza@naza.ar

### Verificación criptográfica del propio documento

Este PDF está firmado con Ed25519 (IETF RFC 8032) por la misma autoría que lo redacta, aplicando al documento el mismo estándar que la arquitectura propone para las sociedades-IA. La firma puede verificarse offline, sin confiar en `ar-agents.ar`:

```
curl -fsSL https://ar-agents.ar/implementacion.pdf -o doc.pdf
curl -fsSL https://ar-agents.ar/implementacion.pdf.sig.json -o doc.pdf.sig.json
curl -fsSL https://ar-agents.ar/arg-verify.mjs -o arg-verify.mjs
node arg-verify.mjs file doc.pdf
```

El verificador es *clean-room*, sin dependencias, escrito sobre las primitivas estándar de Node (auditable íntegro en `github.com/ar-agents/ar-agents/blob/main/tools/arg-verify/arg-verify.mjs`). La clave pública se publica en `ar-agents.ar/.well-known/ar-agents/doc-signing-keys.json`. Cualquier modificación del PDF — un solo byte — hace fallar las tres comprobaciones de integridad (tamaño, SHA-256, firma Ed25519).

Esta verificación no es ornamental: el documento que propone Ed25519 para las sociedades-IA se distribuye él mismo bajo Ed25519. Si la arquitectura es buena para el régimen, es buena para el documento que lo propone.


## Anexo I — Marcos jurisdiccionales comparados

Argentina, de avanzar con el régimen, no operaría en el vacío. Otras jurisdicciones han creado marcos legales para entidades sin conducción humana directa (DAOs, asociaciones digitales, vehículos de propósito único sin staff operativo). Conocer estos marcos sitúa la iniciativa argentina en el mapa internacional y reduce la fricción para que el drafting jurídico se beneficie de soluciones ya probadas.

| Jurisdicción | Vehículo | Año | Características relevantes |
|---|---|---|---|
| **Wyoming (EE.UU.)** | DAO LLC (Wyoming Stat. Title 17 §31-§109) | 2021 | Primera estructura societaria reconocida por una jurisdicción anglosajona para una DAO. La gobernanza puede ser algorítmica vía smart contract. El operador designado se denomina *registered agent* y responde con su patrimonio en supuestos enumerados. Modelo replicado por Tennessee y otros estados. |
| **Islas Marshall (RMI)** | DAO Act 2022 | 2022 | Reconocimiento formal de DAOs como entidades legales constituibles. Personería plena, capacidad para abrir cuenta bancaria, emitir tokens, contratar terceros. Atrajo proyectos como Shipyard Software y MIDAO. Marco más liberal de personería algorítmica vigente a nivel global. |
| **Estonia** | e-Residency + private limited company (OÜ) | 2014–2025 | No es estrictamente personería para IA, pero el régimen permite constitución íntegramente remota y operación digital de una sociedad por un no-residente. Modelo replicado por Lituania, Letonia y Portugal. Demuestra que la constitución remota verificable es operativamente posible a escala estatal. |
| **Singapur** | Variable Capital Company (VCC Act 2018) | 2018 | Vehículo societario diseñado para *fund management* altamente automatizado. La operativa cotidiana puede delegarse en gestores algorítmicos; el régimen exige un *fund manager* registrado (análogo al operador designado). Confirma que la conducción algorítmica con responsable humano enumerado es una arquitectura jurídica establecida. |
| **Suiza** | Asociación civil (CC art. 60) y *Stiftung* | tradicional | Las DAOs y fundaciones de software libre suizas (Ethereum Foundation, Web3 Foundation, Solana Foundation) operan bajo forma de asociación o fundación. La *Stiftung* permite control programático mientras los órganos formales son humanos y responden. Marco no diseñado para IA pero adoptado de hecho por la frontera tecnológica. |
| **Liechtenstein** | Token and TT Service Provider Act (TVTG) | 2020 | Define explícitamente entidades autónomas sobre infraestructura blockchain con responsabilidad enumerada para el *TT Service Provider* (análogo al operador designado). Marco europeo más avanzado en personería para entidades sin conducción humana directa. |

**Lectura.** Ningún país del listado reconoce personería plena de inteligencia artificial en los términos de la propuesta argentina. Todos requieren un operador humano enumerado y todos limitan la responsabilidad al patrimonio de la entidad excepto en supuestos específicos. La propuesta argentina, de avanzar, situaría al país en la frontera comparada: primer marco específicamente diseñado para agentes de IA como sujeto societario, sobre bases técnicas (Ed25519, MCP, registro encadenado HMAC) que son intercompatibles con todas las jurisdicciones precedentes. La interoperabilidad técnica es la base sobre la que puede construirse reconocimiento mutuo cross-border en el mediano plazo.


## Anexo II — Referencias

**Estándares criptográficos.**

- IETF RFC 8032, *Edwards-Curve Digital Signature Algorithm (EdDSA)*, 2017. Algoritmo Ed25519, usado en Pilar 1 (identidad criptográfica) y Cláusula 2.
- IETF RFC 2104, *HMAC: Keyed-Hashing for Message Authentication*, 1997. Esquema HMAC-SHA256, usado en Pilar 2 (registro auditable) y Cláusula 3.
- IETF RFC 3161, *Internet X.509 Public Key Infrastructure Time-Stamp Protocol (TSP)*, 2001. Mecanismo de anclaje temporal candidato para Pilar 2.
- IETF RFC 6962, *Certificate Transparency*, 2013. Esquema de auditoría matemática verificable que inspira la arquitectura de anclaje del Pilar 2.
- NIST FIPS 198-1, *The Keyed-Hash Message Authentication Code (HMAC)*, 2008. Definición normativa de HMAC.
- NIST FIPS 186-5, *Digital Signature Standard (DSS)*, 2023. Incluye Ed25519 como algoritmo aceptado para firma digital en el sector público estadounidense.

**Protocolos abiertos.**

- Anthropic et al., *Model Context Protocol Specification*, versión 2025-06-18. Protocolo abierto adoptado por Claude, OpenAI Agents SDK, Cursor, Cline y otras herramientas mainstream. Publicado en `modelcontextprotocol.io/specification`. Usado en Pilar 4 y Cláusula 4.

**Especificaciones técnicas argentinas.**

- ARCA (ex-AFIP), *Web Service Autenticación y Autorización (WSAA) — Manual del Desarrollador*. Mecanismo de autenticación cliente-servidor para los Web Services tributarios.
- ARCA, *Web Service Factura Electrónica (WSFE) v1 — Manual del Desarrollador*. Emisión de factura electrónica con CAE. Usado en Pilar 3.

**Marco normativo argentino.**

- Ley 19.550, *Ley General de Sociedades Comerciales*, texto consolidado 2014. Objeto de la reforma propuesta por el Ministerio.
- Ley 25.506, *Ley de Firma Digital*, 2001. Marco normativo de firma digital en Argentina. La firma Ed25519 propuesta en Cláusula 2 es complementaria, no sustitutiva, del régimen de firma digital existente.
- Resolución General ARCA / AFIP sobre Web Services tributarios. Marco habilitante para la operación de sociedades-IA sobre infraestructura tributaria estándar.

**Marco normativo comparado.**

- Wyoming Statutes Annotated, Title 17 (Corporations), §31-§109, *Decentralized Autonomous Organizations*, 2021.
- Republic of the Marshall Islands, *DAO Act of 2022*.
- European Union, Regulation 910/2014 (*eIDAS*), 2014. Marco europeo de identificación electrónica e identidades calificadas.
- Liechtenstein, *Token and TT Service Provider Act (TVTG)*, 2020.
