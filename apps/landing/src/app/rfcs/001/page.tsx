import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../../doc-shell";
import { RfcJsonLd } from "../../json-ld";
import { RfcDisclaimer } from "../disclaimer";

export const metadata: Metadata = {
  title: "RFC-001: Identidad y firma de agentes en Argentina",
  description:
    "RFC-001, Cómo una sociedad de IA argentina prueba quién es, firma transacciones, recibe notificaciones, y deposita impuestos.",
  alternates: { canonical: "https://ar-agents.ar/rfcs/001" },
};

export default function Rfc001Page() {
  return (
    <DocShell
      eyebrow="rfc-001 · draft"
      title="Identidad y firma de agentes en Argentina."
      subtitle="Cómo una sociedad de IA prueba quién es ante el Estado, firma transacciones, recibe notificaciones legales, y deposita impuestos. Implementación de referencia opinionada."
    >
      <p style={{ color: "var(--text-muted)", marginTop: -24 }}>
        Status: <DocCode>draft-01</DocCode>. Author: Nazareno Clemente. Date:
        2026-05-08. License: CC-BY-4.0. DOI:{" "}
        <a
          href="https://doi.org/10.5281/zenodo.20159396"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          10.5281/zenodo.20159396
        </a>
        . Comments:{" "}
        <a
          href="https://github.com/ar-agents/ar-agents/discussions"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          github.com/ar-agents/ar-agents/discussions
        </a>
        .
      </p>

      <RfcDisclaimer />

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

      <DocH2>2. Identidad, propuesta</DocH2>
      <DocP>
        <strong>2.1</strong> La sociedad IA recibe un CUIT al
        constituirse, exactamente como una SA. No se inventa un &ldquo;CUIT
        de agente&rdquo;, el régimen reusa la primitiva existente. (Esto
        coincide con el plan Sturzenegger: la IA no es titular, la{" "}
        <em>sociedad</em> sí.)
      </DocP>
      <DocP>
        <strong>2.2</strong> La sociedad nombra un{" "}
        <DocCode>oficial digital</DocCode>, un humano físico que figura
        como representante legal en IGJ y que carga el cert X.509 inicial.
        El oficial puede ser el desarrollador, el inversor, o un servicio
        notarial.
      </DocP>
      <DocP>
        <strong>2.3</strong> Para autenticación frente a Mi Argentina, la
        sociedad usa el flow OIDC estándar:{" "}
        <DocCode>@ar-agents/mi-argentina</DocCode>. El{" "}
        <DocCode>sub</DocCode> que devuelve Mi Argentina identifica al
        oficial digital, no a la sociedad, la mapeo CUIT-↔-sub se hace
        en una tabla aparte que el RFC publica.
      </DocP>

      <DocH2>3. Firma, propuesta</DocH2>
      <DocP>
        <strong>3.1</strong> Toda firma electrónica de la sociedad usa el
        cert X.509 emitido por ARCA al CUIT. Mismo mecanismo que existe
        hoy para WSAA, sin invenciones.
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

      <DocH2>4. Notificación, propuesta</DocH2>
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
        notificaciones ahí. Si un agente queda inactivo durante meses
        entre transacciones, las notificaciones se entregan igual al
        webhook registrado.
      </DocP>

      <DocH2>5. Pago, propuesta</DocH2>
      <DocP>
        <strong>5.1</strong> La sociedad mantiene una cuenta bancaria
        habilitada para SUAF + débito automático ARCA. El cert X.509 se
        usa para autorizar transferencias programáticas via{" "}
        <DocCode>@ar-agents/banking</DocCode>.
      </DocP>
      <DocP>
        <strong>5.2</strong> Los pagos menores a 1M ARS se ejecutan
        automáticamente. Los pagos iguales o superiores a 1M ARS
        requieren confirmación humana programática (HITL: human-in-the-loop,
        humano en el ciclo de decisión), el toolkit ar-agents ya
        implementa el patrón en <DocCode>requireConfirmation</DocCode>.
        El humano firmante recibe el pedido, confirma desde Mi
        Argentina, y la transferencia se libera.
      </DocP>

      <DocH2>6. Apertura, open questions</DocH2>
      <DocP>
        <strong>6.1</strong> ¿Quién es responsable cuando un agente
        ejecuta un fraude? El RFC actual es agnóstico, depende de cómo
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
        OIDC? El package ar-agents implementa{" "}
        <DocCode>discover()</DocCode> (refresh de endpoints vía
        .well-known/openid-configuration), el cambio se absorbe sin redeploy.
      </DocP>

      <DocH2>7. Roadmap, qué falta en ar-agents</DocH2>
      <DocP>
        <DocCode>@ar-agents/igj</DocCode>, APIs de IGJ para
        constitución, modificación de estatuto, balances. Hoy solo open data
        en CSV, gap real.
      </DocP>
      <DocP>
        <DocCode>@ar-agents/gde</DocCode>, Gestión Documental
        Electrónica. No tiene API pública; el RFC propone seguirlo via
        TAD scraping hasta que el gobierno publique uno.
      </DocP>
      <DocP>
        <DocCode>@ar-agents/firma-digital</DocCode>, Firma digital
        avanzada (FAD) ONTI, distinta del cert ARCA, requerida para actos
        societarios bajo Ley 25.506.
      </DocP>

      <DocH2>8. Implementación de referencia</DocH2>
      <DocP>
        Este RFC está acompañado por una implementación de referencia en el
        toolkit <DocCode>@ar-agents/*</DocCode>. La lista cruzada muestra qué
        piezas técnicas cubren cada parte del régimen propuesto y qué gaps
        siguen abiertos:
      </DocP>
      <DocP>
        <strong>(a) Identidad</strong>:{" "}
        <DocCode>@ar-agents/identity</DocCode> (CUIT + ARCA padrón) +{" "}
        <DocCode>@ar-agents/mi-argentina</DocCode> (OIDC) +{" "}
        <DocCode>@ar-agents/identity-attest</DocCode> (HMAC-signed
        attestation con trustLevel) +{" "}
        <DocCode>@ar-agents/igj</DocCode> (constitución y registro
        societario).
        <br />
        <strong>(b) Firma</strong>:{" "}
        <DocCode>@ar-agents/firma-digital</DocCode> (CMS/PKCS#7 +
        AC-Raíz/ONTI heuristic + fingerprint pinning) + el cert WSAA
        existente en <DocCode>@ar-agents/identity</DocCode> y{" "}
        <DocCode>@ar-agents/facturacion</DocCode>.
        <br />
        <strong>(c) Notificación</strong>:{" "}
        <DocCode>@ar-agents/boletin-oficial</DocCode> (subscribe por CUIT
        / organismo / keyword) + el endpoint webhook propuesto en 4.3.
        <br />
        <strong>(d) Pago</strong>:{" "}
        <DocCode>@ar-agents/banking</DocCode> (CBU/CVU + BCRA Central de
        Deudores + transfers) +{" "}
        <DocCode>@ar-agents/mercadopago</DocCode> (MP API completo) +{" "}
        <DocCode>@ar-agents/facturacion</DocCode> (factura electrónica
        WSFE) +{" "}
        <DocCode>@ar-agents/agentic-commerce-bridge</DocCode> (ACP
        facilitator con auto-emisión).
      </DocP>
      <DocP>
        El paso 17, domicilio legal digital via TAD/GDE, sigue
        siendo el bloqueante: requiere autorización gubernamental para
        alta de aplicación cliente, no admite acceso programático estable mediante scraping. El RFC
        propone que el régimen exponga el endpoint webhook (4.3) como
        sustituto operativo hasta que TAD ofrezca API.
      </DocP>

      <DocH2>9. Marco de responsabilidad</DocH2>
      <DocP>
        El backlash central al plan Sturzenegger es{" "}
        <em>&ldquo;¿quién responde si una sociedad-IA defrauda?&rdquo;</em>{" "}
        El RFC propone tres capas de responsabilidad concatenadas:
      </DocP>
      <DocP>
        <strong>9.1 Responsabilidad operativa</strong>: el oficial
        digital (humano físico nombrado en IGJ) responde por toda
        acción ejecutada con el cert X.509. Es el equivalente del
        director suplente en una SA.
      </DocP>
      <DocP>
        <strong>9.2 Responsabilidad de auditoría</strong>: cada tool
        call que la sociedad-IA ejecuta queda registrado en un audit
        log con HMAC-signed timestamps (el patrón{" "}
        <DocCode>AuditLogger</DocCode> ya implementado en{" "}
        <DocCode>@ar-agents/mercadopago</DocCode>). El log es prueba
        legal de qué hizo el agente, cuándo, contra qué tool.
      </DocP>
      <DocP>
        <strong>9.3 Responsabilidad de operador (operator-of-record)</strong>:
        cuando la sociedad-IA opera bajo el cert de un facade
        AR-residente (escribano, contador, plataforma SaaS), el operador
        comparte responsabilidad civil. Esto es lo que hoy se conoce
        como &ldquo;intermediario calificado&rdquo; en otros ordenamientos.
      </DocP>
      <DocP>
        Las tres capas no son alternativas, son acumulativas. Una víctima
        de fraude tiene tres demandados con distintas barras probatorias.
      </DocP>

      <DocH2>10. Prior art y citations</DocH2>
      <DocP>
        <strong>Marshall Islands DAO LLC</strong> (2022), el primer
        régimen jurisdiccional reconociendo persona jurídica programática.
        MIDAO cubre <em>(a)</em> y <em>(d)</em> para DAOs cripto pero no
        tiene equivalente AR de <em>(b)</em> (firma estatal) ni{" "}
        <em>(c)</em> (notificación oficial).
      </DocP>
      <DocP>
        <strong>Wyoming DAO LLC</strong> (Wyo. Stat. §17-31, 2021),
        precedente USA con la misma laguna en notificación. ClawBank.co
        construye sobre este régimen.
      </DocP>
      <DocP>
        <strong>EU AI Act Art. 50 + 52</strong> (vigor 2026-08), exige
        marcado verificable de outputs generados por IA y trazabilidad
        de decisiones. Compatible con la sección 9 de este RFC.
      </DocP>
      <DocP>
        <strong>Mastercard Verifiable Intent</strong> +{" "}
        <strong>Google AP2 Mandates</strong>, patrones cripto-firmados
        para autorización de pagos por agentes. El RFC proposes adoptar
        AP2 como el formato estándar para órdenes de pago grandes
        (sección 5.2).
      </DocP>
      <DocP>
        <strong>IETF draft-sharif-agent-audit-trail</strong>, propuesta
        de estándar para audit-trail de tool calls en agentes. La
        sección 9.2 de este RFC se alinea con esa propuesta.
      </DocP>
      <DocP>
        <strong>Plan Sturzenegger</strong>, anuncio en Expo EFI
        2026-04-28. Sin texto público todavía. Este RFC asume el
        contorno descripto en la conferencia y se va a actualizar
        cuando llegue el proyecto a Diputados.
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
      <RfcJsonLd
        id="001"
        title="RFC-001: Identidad y firma de agentes en Argentina"
        abstract="Cómo una sociedad de IA argentina prueba quién es, firma transacciones, recibe notificaciones, y deposita impuestos. Marco de responsabilidad de tres capas (operador, proveedor del modelo, autor de la librería)."
        datePublished="2026-05-01"
      />
    </DocShell>
  );
}
