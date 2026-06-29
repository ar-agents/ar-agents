import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../../doc-shell";

export const metadata: Metadata = {
  title: "El playbook de la sociedad automatizada · documento flagship en español",
  description:
    "Cómo construir una empresa argentina operada por agentes de IA (Sociedad Automatizada, art. 14) en 2027. La infraestructura, la ley, el marco de responsabilidad y la realidad operativa. Escrito para quienes lo van a aprobar, regular o desplegar primero.",
  alternates: { canonical: "https://ar-agents.ar/es/playbook" },
};

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

export default function PlaybookEsPage() {
  return (
    <DocShell
      eyebrow="playbook · 2026-05 · es"
      title="El playbook de la sociedad automatizada."
      subtitle="Cómo construir una empresa argentina operada por agentes en 2027. La infraestructura, la ley, el marco de responsabilidad y la operación diaria. Versión en español del flagship doc, la inglesa vive en /playbook para audiencia internacional."
    >
      <DocBlock>
        <DocP>
          El 28 de abril de 2026, el ministro de Desregulación Federico
          Sturzenegger anunció una nueva forma societaria: la{" "}
          <em>sociedad de IA</em>. El anteproyecto la llama, en su figura
          legal, <strong>Sociedad Automatizada</strong> (art. 14): una
          persona jurídica que desarrolla su objeto con sistemas
          algorítmicos autónomos o agentes de IA, sin trabajadores en
          relación de dependencia para su operación ordinaria. Conserva un
          administrador (art. 88). Software puro en el loop operativo. Tiene
          CUIT, emite facturas, es titular de cuenta bancaria, paga
          impuestos. La cita literal:{" "}
          <strong>500 millones de agentes de IA incorporados en
          Argentina, produciendo para el mundo y pagando impuestos
          acá</strong>.
        </DocP>
        <DocP>
          El texto ya existe. Un anteproyecto firmado (28 de mayo de 2026,
          Santiago Viola, Secretaría de Justicia) entró al Senado el 1 de
          junio de 2026. Reemplaza la Ley 19.550 (la Ley General de
          Sociedades), no la reforma. Todavía no es ley: si se sanciona,
          rige a los 180 días de publicarse en el Boletín Oficial (art.
          271). La elección legislativa de octubre 2026 es la variable
          principal.
        </DocP>
        <DocP>
          Este playbook es la respuesta operativa a una pregunta concreta:{" "}
          <strong>¿qué código hay que escribir hoy para que el día 1 del
          régimen, una sociedad automatizada argentina pueda funcionar de
          verdad?</strong> No es especulación. Cada afirmación de este
          documento mapea a TypeScript específico en{" "}
          <a
            href="https://github.com/ar-agents/ar-agents"
            style={{ color: "var(--accent)" }}
          >
            github.com/ar-agents/ar-agents
          </a>: 36 paquetes, 235 herramientas, 4 subpaths de testing, 17
          recetas del cookbook. Open source. Licencia MIT. Provenance SLSA.
        </DocP>
      </DocBlock>

      <DocH2>1 · Las 17 piezas</DocH2>
      <DocP>
        Una empresa argentina hace 17 cosas distinguibles. Algunas son
        herencia de cualquier empresa en cualquier jurisdicción; la mayoría
        son específicas del marco regulatorio e infraestructural argentino.
        Una sociedad automatizada tiene que ejecutar las 17 sin manos
        humanas.
      </DocP>
      <DocP>
        <strong>Existir como entidad</strong> (4): buscar el registro
        público para conflictos de denominación, inscribirse en IGJ,
        obtener un CUIT en ARCA (ex AFIP), constituir Domicilio Electrónico
        (DEC), la casilla legalmente vinculante para notificaciones
        federales.
      </DocP>
      <DocP>
        <strong>Probar quién es</strong> (3): validar CUITs contra el
        padrón ARCA, autenticar contrapartes humanas vía{" "}
        <DocCode>Mi Argentina</DocCode> (el OIDC federal), firmar
        documentos legalmente vinculantes con PKCS#7/CMS usando
        certificados emitidos por AC-Raíz / ONTI.
      </DocP>
      <DocP>
        <strong>Manejar plata</strong> (4): abrir cuenta CBU/CVU
        (validada localmente vía mod-10 BCRA), inscribirse en monotributo
        o IVA, emitir factura electrónica vía AFIP/ARCA WSFE (Facturas
        A/B/C/E + FCE MiPyMEs), correr facturación recurrente vía Mercado
        Pago Subscriptions.
      </DocP>
      <DocP>
        <strong>Operar con clientes</strong> (3): WhatsApp Business como
        canal default (penetración &gt;95% en AR), verificar identidad de
        contraparte vía OTP, logística física vía Andreani / OCA / Correo
        Argentino.
      </DocP>
      <DocP>
        <strong>Inteligencia operacional</strong> (3): consultar BCRA
        Central de Deudores para decisiones de crédito, monitorear el
        Boletín Oficial para cambios regulatorios, trackear variables
        macro (USD oficial, CER, UVA, reservas) para decisiones de
        tesorería.
      </DocP>
      <DocP>
        Cubrimos 16 de las 17. La pieza 17, filing programático de
        trámites en TAD, requiere integración por organismo que el Estado
        argentino aún está rolleando out. Lectura solo (DEC inbox + Mis
        Trámites) está disponible hoy vía{" "}
        <DocCode>@ar-agents/gde-tad</DocCode>; capacidad de escritura
        depende del cronograma de RFC-001 § 3.4.
      </DocP>

      <DocH2>2 · El contrato Edge-Runtime</DocH2>
      <DocP>
        Cada paquete del stack corre en Vercel Edge Runtime, Cloudflare
        Workers, y Deno sin cambios de código. El contrato:
      </DocP>
      <DocP>
        <strong>Solo Web Crypto.</strong> Cero <DocCode>node:crypto</DocCode>{" "}
        en código de producción. HMAC-SHA256, firma RSA para WSAA,
        verificación de firmas, generación de idempotency-keys, todo usa{" "}
        <DocCode>crypto.subtle</DocCode>.
      </DocP>
      <DocP>
        <strong>HTTP basado en fetch.</strong> Cero <DocCode>got</DocCode>,{" "}
        <DocCode>axios</DocCode>, <DocCode>node:http</DocCode>. La librería
        ship su propia capa de retry + circuit breaker + propagación de
        deadline arriba del <DocCode>fetch</DocCode> nativo del runtime.
      </DocP>
      <DocP>
        <strong>AbortSignal en todas partes.</strong> Cada herramienta
        long-running acepta un <DocCode>AbortSignal</DocCode> padre y
        propaga la cancelación. El runtime mata limpiamente las llamadas
        colgadas cuando el request hace timeout.
      </DocP>
      <DocP>
        <strong>Estado pluggable vía subpath.</strong>{" "}
        <DocCode>InMemoryStateAdapter</DocCode> para tests +{" "}
        <DocCode>VercelKVStateAdapter</DocCode> para producción, misma
        interfaz. El host elige dónde vive el estado.
      </DocP>

      <DocH2>3 · El marco de responsabilidad</DocH2>
      <DocP>
        El primer ataque conceptual contra cualquier propuesta de
        sociedad automatizada es: <em>si la IA rompe algo, ¿quién
        responde?</em> Sin
        una respuesta sólida, el proyecto se traba en el Senado. RFC-001 § 9
        propone un modelo de tres capas:
      </DocP>
      <DocP>
        <strong>Capa 1, operador.</strong> La entidad que despliega
        (ClawBank, doola, MIDAO, un escribano AR-residente, un platform
        partner) asume responsabilidad operacional proporcional al control
        que tiene sobre el surface de tools del agente. El alcance está
        acotado: el operador no es responsable estrictamente del prosa del
        agente, solo de las decisiones de infraestructura.
      </DocP>
      <DocP>
        <strong>Capa 2, proveedor del modelo.</strong> Anthropic, OpenAI,
        Google etc. asumen responsabilidad por la calidad del modelo según
        sus SLAs publicados. El trabajo de la librería es hacer esta capa
        auditable: cada tool call lleva un header de versión-de-modelo +
        hash-de-prompt.
      </DocP>
      <DocP>
        <strong>Capa 3, autor de la librería.</strong> Open source bajo
        MIT, sin garantía. El autor responde solo por errores materiales
        en la documentación pública (ej. afirmar idempotencia donde no la
        hay).
      </DocP>
      <DocP>
        Juntas, las tres capas convierten la pregunta{" "}
        <em>&quot;quién paga cuando la IA rompe algo&quot;</em> de un
        impasse filosófico en una conversación contractual concreta. El
        texto completo está en{" "}
        <a href="/rfcs/001" style={{ color: "var(--accent)" }}>
          /rfcs/001
        </a>
        .
      </DocP>

      <DocH2>4 · El threat model</DocH2>
      <DocP>
        Cuando los agentes mueven plata, la superficie de ataque se
        amplía. Un LLM que puede autorizar un cobro también puede ser
        coercido, vía prompt injection, jailbreak, o modelo upstream
        comprometido, a autorizar uno fraudulento. La librería trata esto
        con la misma seriedad que una aplicación bancaria:
      </DocP>
      <DocP>
        <strong>HITL programático en operaciones irreversibles.</strong> 8
        tools (refund_payment, cancel_subscription, pause_subscription,
        cancel_payment_preference, delete_customer_card, cancel_qr_dynamic,
        delete_pos, revoke_marketplace_token) requieren un callback{" "}
        <DocCode>requireConfirmation</DocCode> que el host implementa. La
        ejecución del tool bloquea hasta que el host confirma vía UI /
        Slack / email. Es una compuerta programática, no una instrucción
        al LLM.
      </DocP>
      <DocP>
        <strong>Idempotencia determinística.</strong> 4 mutating tools
        derivan keys de idempotencia SHA-256 de los parámetros de input.
        Mismos inputs → misma key → MP deduplica server-side. Sobrevive
        retries de red, restart loops, y bugs en el agente.
      </DocP>
      <DocP>
        <strong>Defensa de webhooks por firma + replay.</strong>{" "}
        Verificación HMAC-SHA256 con comparación constant-time. Ventana de
        tolerancia 5 minutos. Cache de dedup persistido vía el mismo
        adapter de KV que el resto del toolkit.
      </DocP>
      <DocP>
        <strong>Audit log con timestamps HMAC-firmados.</strong> Cada tool
        call (input, output, duration, error) se loggea a un sink
        append-only pluggable. Forensicamente sólido. Por RFC-001 § 9.2,
        el log es legalmente probatorio.
      </DocP>
      <DocP>
        Threat model completo, 18 amenazas explícitas, 18 mitigaciones
        explícitas, qué cubre la librería, qué es responsabilidad del
        host, qué queda fuera de scope, en{" "}
        <a href="/security" style={{ color: "var(--accent)" }}>/security</a>.
      </DocP>

      <DocH2>5 · Un día en la vida de ACME-AI SAS</DocH2>
      <DocP>
        ACME-AI es una empresa argentina operada por agentes, con un
        administrador humano responsable (art. 102). Es código corriendo
        en Vercel. Cada mañana se despierta (cron) y hace su trabajo:
      </DocP>
      <DocP>
        <strong>08:00.</strong> Lee el Boletín Oficial. ARCA publicó nueva
        resolución sobre monotributo. ACME-AI revisa si la afecta. Sí:
        tiene que recategorizar. Anota la tarea.
      </DocP>
      <DocP>
        <strong>09:30.</strong> Llega WhatsApp de cliente nuevo: &quot;hola,
        quiero contratar el plan pro&quot;. ACME-AI le pide CUIT, lo valida
        contra el padrón ARCA (existe, monotributo categoría A, OK),
        verifica el WhatsApp con un OTP, crea suscripción en MP por $25k
        mensuales, le manda link de pago.
      </DocP>
      <DocP>
        <strong>10:15.</strong> Cliente pagó. MP webhook llega a ACME-AI.
        El agente confirma, emite Factura A automáticamente vía AFIP WSFE,
        le manda PDF por WhatsApp.
      </DocP>
      <DocP>
        <strong>11:00.</strong> Cliente quiere envío físico. ACME-AI
        cotiza Andreani, OCA, Correo Argentino, elige el más barato, crea
        el envío, manda tracking.
      </DocP>
      <DocP>
        <strong>15:00.</strong> Otro cliente B2B pide cuenta corriente
        plazo 30 días. ACME-AI consulta BCRA Central de Deudores → cliente
        situación 4 (deuda). Rechaza el crédito automáticamente. Razona la
        decisión en el audit log.
      </DocP>
      <DocP>
        <strong>23:00.</strong> Cierre de mes. ACME-AI revisa su
        facturación, calcula monotributo del mes, paga a AFIP, presenta
        F.572 si corresponde.
      </DocP>
      <DocP>
        Todo eso, sin humanos en el loop operativo, solo el administrador
        responsable supervisando (arts. 88, 102). Es código el que hace el
        trabajo. Pero a los ojos del Estado, es una empresa. Cada paso es
        una tool call. La librería ship las herramientas; el agente compone
        el flujo según el prompt. Se escriben las piezas, no la
        orquestación.
      </DocP>

      <DocH2>6 · Incorporación en 10 minutos</DocH2>
      <DocP>
        Pre-launch, casi todo se puede hacer hoy como SAS estándar con
        un agente LLM como operador. Usá el wizard en{" "}
        <a href="/incorporar" style={{ color: "var(--accent)" }}>
          /incorporar
        </a>{" "}
        para generar el repo + manifiesto de variables de entorno + Vercel
        deploy + checklist legal. El código corre en 10 minutos; el cert
        AFIP + la inscripción IGJ tardan 5-10 días hábiles.
      </DocP>
      <DocP>
        Cuando aterrize el régimen, la misma codebase flippea un config
        flag de <DocCode>tipo: SAS</DocCode> a{" "}
        <DocCode>tipo: SOCIEDAD-IA</DocCode> y estás operando bajo el
        nuevo marco. Sin rewrite. El punto de la infraestructura
        pre-launch es exactamente este: estar listo el día 1.
      </DocP>

      <DocH2>7 · Por qué importa fuera de Argentina</DocH2>
      <DocP>
        Una sociedad automatizada es la primera vez que un Estado soberano
        propone una entidad legal construida en torno a un agente no-humano. Las
        DAO LLCs de Marshall Islands (2022) y Wyoming (2021) se le acercan.
        La propuesta argentina va más allá: bajo el art. 14, una Sociedad
        Automatizada corre su operación ordinaria sin trabajadores en
        relación de dependencia, sin humanos en el día a día, conservando
        un administrador responsable (art. 88) para la supervisión. El
        análogo más cercano es el régimen de &quot;sistemas de alto
        riesgo&quot; del EU AI Act, pero ese apunta a la supervisión de IA
        deployada por humanos, no a la capacidad legal de una empresa
        operada por IA en sí.
      </DocP>
      <DocP>
        Si Argentina ship el régimen, tres cosas siguen:
      </DocP>
      <DocP>
        <strong>1. El comercio entre agentes cross-jurisdiction se
        vuelve posible.</strong> Un agente USA-incorporado (ClawBank
        formada en Wyoming, doola Agentic LLC, entidad MIDAO) puede
        componer con un facade AR delgado para hacer negocios en la
        jurisdicción AR sin tener residencia fiscal AR propia. RFC-001 § 7
        bosqueja el surface contractual.
      </DocP>
      <DocP>
        <strong>2. La implementación de referencia es open
        source.</strong> Ningún regulador quiere un régimen que dependa
        de infraestructura propietaria cerrada para compliance. Las 16/17
        piezas del toolkit son MIT-licensed; cualquier operador serio
        puede auditar, forkear, contribuir, o embeber.
      </DocP>
      <DocP>
        <strong>3. Otras jurisdicciones pueden forkear el régimen.</strong>{" "}
        La estructura legal no está acoplada exclusivamente a Argentina.
        Singapur, EAU, Estonia, Marshall Islands tienen interés
        públicamente declarado en formas societarias agent-friendly. AR
        es first-mover; otros van a seguir.
      </DocP>

      <DocH2>8 · Cómo engancharse</DocH2>
      <DocP>
        <strong>Builders</strong>:{" "}
        <DocCode>pnpm add @ar-agents/identity @ar-agents/mercadopago @ar-agents/facturacion</DocCode>{" "}
        y leer el cookbook en{" "}
        <a href="/examples" style={{ color: "var(--accent)" }}>/examples</a>.
        Issues + PRs welcome.
      </DocP>
      <DocP>
        <strong>Reguladores</strong>: la propuesta formal es{" "}
        <a href="/rfcs/001" style={{ color: "var(--accent)" }}>RFC-001</a>.
        Léanla como un draft sobre el cual comentar. Email naza@naza.ar
        para reuniones.
      </DocP>
      <DocP>
        <strong>Inversores</strong>: hay una tesis para escribir sobre la
        primera apuesta jurisdiccional al comercio entre agentes. La
        librería es la implementación de referencia pública. Email
        naza@naza.ar.
      </DocP>
      <DocP>
        <strong>Periodistas</strong>: material fuente, contexto técnico,
        y el walkthrough del threat model en{" "}
        <a href="/security" style={{ color: "var(--accent)" }}>/security</a>{" "}
        y <a href="/architecture" style={{ color: "var(--accent)" }}>/architecture</a>.
        Email naza@naza.ar para entrevistas.
      </DocP>
    </DocShell>
  );
}
