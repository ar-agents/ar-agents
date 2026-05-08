import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../../doc-shell";

export const metadata: Metadata = {
  title: "RFC-001: Identidad y firma de agentes en Argentina",
  description:
    "RFC-001 — Cómo una sociedad de IA argentina prueba quién es, firma transacciones, recibe notificaciones, y deposita impuestos.",
  alternates: { canonical: "https://ar-agents.vercel.app/rfcs/001" },
};

export default function Rfc001Page() {
  return (
    <DocShell
      eyebrow="/arg · rfc-001 · draft"
      title="Identidad y firma de agentes en Argentina."
      subtitle="Cómo una sociedad de IA prueba quién es ante el Estado, firma transacciones, recibe notificaciones legales, y deposita impuestos. Implementación de referencia opinionada."
    >
      <p style={{ color: "var(--text-muted)", marginTop: -24 }}>
        Status: <DocCode>draft-01</DocCode>. Author: Naza Clemente. Date:
        2026-05-08. License: CC0. Comments:{" "}
        <a
          href="https://github.com/ar-agents/ar-agents/discussions"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          github.com/ar-agents/ar-agents/discussions
        </a>
        .
      </p>

      <DocH2>1. Problem statement</DocH2>
      <DocP>
        Una <DocCode>sociedad de IA</DocCode> creada bajo el régimen
        propuesto por Sturzenegger necesita resolver, sin un humano en el
        ciclo, los mismos cuatro problemas que cualquier persona jurídica
        argentina:
      </DocP>
      <DocP>
        <strong>(a) Identidad</strong>: probar al Estado quién es.
        <br />
        <strong>(b) Firma</strong>: emitir actos legales con autoría
        verificable.
        <br />
        <strong>(c) Notificación</strong>: recibir comunicaciones oficiales
        en un canal monitoreable.
        <br />
        <strong>(d) Pago</strong>: depositar impuestos y transferencias
        sin intervención manual.
      </DocP>
      <DocP>
        Hoy Argentina resuelve <em>(a)</em> con CUIT + Clave Fiscal,{" "}
        <em>(b)</em> con cert X.509 emitido por AFIP/ARCA + firma digital
        para algunos casos, <em>(c)</em> con domicilio fiscal electrónico
        + GDE/TAD, <em>(d)</em> con cuenta bancaria habilitada para SUAF.
        Funciona razonablemente para humanos. Para agentes se rompe.
      </DocP>

      <DocH2>2. Identidad — propuesta</DocH2>
      <DocP>
        <strong>2.1</strong> La sociedad IA recibe un CUIT al
        constituirse, exactamente como una SA. No se inventa un &ldquo;CUIT
        de agente&rdquo; — el régimen reusa la primitiva existente. (Esto
        coincide con el plan Sturzenegger: la IA no es titular, la{" "}
        <em>sociedad</em> sí.)
      </DocP>
      <DocP>
        <strong>2.2</strong> La sociedad nombra un{" "}
        <DocCode>oficial digital</DocCode> — un humano físico que figura
        como representante legal en IGJ y que carga el cert X.509 inicial.
        El oficial puede ser el desarrollador, el inversor, o un servicio
        notarial.
      </DocP>
      <DocP>
        <strong>2.3</strong> Para autenticación frente a Mi Argentina, la
        sociedad usa el flow OIDC estándar:{" "}
        <DocCode>@ar-agents/mi-argentina</DocCode>. El{" "}
        <DocCode>sub</DocCode> que devuelve Mi Argentina identifica al
        oficial digital, no a la sociedad — la mappeo CUIT-↔-sub se hace
        en una tabla aparte que el RFC publica.
      </DocP>

      <DocH2>3. Firma — propuesta</DocH2>
      <DocP>
        <strong>3.1</strong> Toda firma electrónica de la sociedad usa el
        cert X.509 emitido por ARCA al CUIT. Mismo mecanismo que existe
        hoy para WSAA — sin invenciones.
      </DocP>
      <DocP>
        <strong>3.2</strong> El cert vive en un HSM o un KMS gestionado
        (Vercel KV con encryption-at-rest, AWS KMS, Google Cloud KMS).{" "}
        <strong>NUNCA</strong> en disco del proceso del agente.
      </DocP>
      <DocP>
        <strong>3.3</strong> Para acciones que requieren acto notarial
        (cambio de directorio, fusión, disolución), el RFC requiere{" "}
        <em>doble firma</em>: cert ARCA + firma digital del oficial
        humano. Es la salvaguarda contra runaway-agent que la teoría legal
        actual demanda.
      </DocP>
      <DocBlock>
        {`// Firma estándar (transacciones rutinarias)
sign(payload, certArca)

// Firma con doble factor (actos societarios)
const sigA = sign(payload, certArca);
const sigB = await human.confirm(payload); // bloqueante
const wrapped = wrap(payload, [sigA, sigB]);`}
      </DocBlock>

      <DocH2>4. Notificación — propuesta</DocH2>
      <DocP>
        <strong>4.1</strong> Domicilio fiscal electrónico (DFE) ARCA sigue
        siendo el canal oficial. Sin cambios.
      </DocP>
      <DocP>
        <strong>4.2</strong> Para notificaciones publicadas en Boletín
        Oficial que afecten a la sociedad (resoluciones, designaciones,
        edictos), <DocCode>@ar-agents/boletin-oficial</DocCode> ofrece
        suscripciones por CUIT. La sociedad se subscribe a su propio CUIT
        + a los CUITs de sus contrapartes habituales y procesa los
        matches en su cola interna.
      </DocP>
      <DocP>
        <strong>4.3</strong> El RFC propone que el régimen exija un
        endpoint webhook público (HTTPS, autenticado con HMAC) por cada
        sociedad IA, registrado en IGJ. ARCA y Boletín Oficial entregan
        notificaciones ahí. Cuando un agente se &ldquo;duerme&rdquo;
        durante meses entre transacciones, las notificaciones llegan
        igual.
      </DocP>

      <DocH2>5. Pago — propuesta</DocH2>
      <DocP>
        <strong>5.1</strong> La sociedad mantiene una cuenta bancaria
        habilitada para SUAF + débito automático ARCA. El cert X.509 se
        usa para autorizar transferencias programáticas via{" "}
        <DocCode>@ar-agents/banking</DocCode>.
      </DocP>
      <DocP>
        <strong>5.2</strong> Pagos chicos (&lt; 1M ARS) se ejecutan
        directo. Pagos grandes (&gt;= 1M ARS) requieren HITL programático
        — el toolkit /arg ya implementa el patrón en
        <DocCode>requireConfirmation</DocCode>. El humano firmante recibe
        el pedido, confirma desde Mi Argentina, y la transferencia se
        libera.
      </DocP>

      <DocH2>6. Apertura — open questions</DocH2>
      <DocP>
        <strong>6.1</strong> ¿Quién es responsable cuando un agente
        ejecuta un fraude? El RFC actual es agnóstico — depende de cómo
        el proyecto Sturzenegger trate la responsabilidad piercing-the-veil.
      </DocP>
      <DocP>
        <strong>6.2</strong> ¿Cómo se renueva el cert X.509 sin
        intervención humana? Propuesta interim: el cert tiene 1 año de
        vida y la renovación requiere humano + Mi Argentina (vuelve a
        depender del oficial digital).
      </DocP>
      <DocP>
        <strong>6.3</strong> ¿Qué pasa si Mi Argentina cambia el flow
        OIDC? El package /arg implementa{" "}
        <DocCode>discover()</DocCode> (refresh de endpoints vía
        .well-known/openid-configuration) — el cambio se absorbe sin redeploy.
      </DocP>

      <DocH2>7. Roadmap — qué falta en /arg</DocH2>
      <DocP>
        <DocCode>@ar-agents/igj</DocCode> — APIs de IGJ para
        constitución, modificación de estatuto, balances. Hoy solo open data
        en CSV — gap real.
      </DocP>
      <DocP>
        <DocCode>@ar-agents/gde</DocCode> — Gestión Documental
        Electrónica. No tiene API pública; el RFC propone seguirlo via
        TAD scraping hasta que el gobierno publique uno.
      </DocP>
      <DocP>
        <DocCode>@ar-agents/firma-digital</DocCode> — Firma digital
        avanzada (FAD) ONTI, distinta del cert ARCA, requerida para actos
        societarios bajo Ley 25.506.
      </DocP>

      <DocH2>Comentarios</DocH2>
      <DocP>
        Este RFC es un primer borrador. Se va a iterar contra: lectura del
        proyecto cuando llegue al Boletín Oficial, feedback de juristas,
        feedback de agentes que efectivamente intenten incorporarse.{" "}
        <a
          href="https://github.com/ar-agents/ar-agents/discussions"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          Comentarios públicos
        </a>{" "}
        bienvenidos.
      </DocP>
    </DocShell>
  );
}
