import { DocH2, DocP, DocShell } from "../doc-shell";

/**
 * Página pública del documento técnico de referencia para el régimen
 * de Sociedades de Inteligencia Artificial. Dirigido al equipo redactor
 * del proyecto de ley + áreas técnicas del Ministerio + cualquier
 * tercero que necesite citar la implementación de referencia.
 *
 * El PDF canónico está en /implementacion.pdf (descargable + adjuntable).
 * Esta página renderiza el resumen + tabla de contenidos + viewer inline
 * + link de descarga.
 */

const PDF_URL = "/implementacion.pdf";

export function ImplementacionContent() {
  return (
    <DocShell
      eyebrow="documento técnico · 2026-05"
      title="Implementación de referencia para Sociedades de IA."
      subtitle="Arquitectura técnica, código operable y cláusulas sugeridas para el proyecto de reforma a la Ley General de Sociedades. Dirigido al equipo redactor del proyecto y a las áreas técnicas del Ministerio."
    >
      <DocP>
        El 28 de abril de 2026, en el marco de Expo EFI, el Ministerio
        de Desregulación y Transformación del Estado anunció la
        creación de un régimen de Sociedades de Inteligencia Artificial
        mediante reforma a la Ley General de Sociedades (Ley 19.550).
        El presente documento es una implementación de referencia
        abierta y verificable de la infraestructura técnica que ese
        régimen requiere para ser operable.
      </DocP>

      <DocP>
        Está dirigido al equipo que redacte el proyecto de ley y a las
        áreas técnicas del Ministerio. El código es open-source
        (licencia MIT), publicado en{" "}
        <a
          href="https://github.com/ar-agents/ar-agents"
          style={{ color: "var(--accent)", textDecoration: "underline" }}
        >
          github.com/ar-agents/ar-agents
        </a>{" "}
        y disponible para que cualquier marco regulatorio que el
        Ministerio defina lo adopte como referencia.
      </DocP>

      <div
        style={{
          margin: "32px 0 40px",
          padding: "20px 24px",
          background: "var(--bg-subtle, rgba(0,0,0,0.03))",
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>
          Versión canónica
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: "var(--text-body)",
            lineHeight: 1.55,
          }}
        >
          El PDF canónico contiene la versión completa con tabla de
          decisiones, cinco cláusulas operables sugeridas, y la sección
          de respuesta a las objeciones jurídicas públicas formuladas
          en el debate. Es la versión citable, indicada para circular
          internamente en el área técnica del Ministerio.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a
            href={PDF_URL}
            download
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "10px 16px",
              background: "var(--text)",
              color: "var(--bg)",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Descargar PDF
          </a>
          <a
            href={PDF_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "10px 16px",
              background: "transparent",
              color: "var(--text)",
              border: "1px solid var(--text)",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Abrir en una nueva pestaña
          </a>
        </div>
      </div>

      <DocH2>Contenido</DocH2>
      <DocP>
        El documento cubre seis secciones más dos anexos:
      </DocP>
      <ol style={{ lineHeight: 1.75, paddingLeft: 22 }}>
        <li>
          <strong>Las seis decisiones técnicas</strong> que el proyecto
          de ley requiere resolver, con respuesta técnica sugerida y
          referencia a la cláusula correspondiente.
        </li>
        <li>
          <strong>Arquitectura de referencia</strong> sobre cuatro
          pilares construidos en estándares técnicos abiertos
          preexistentes: identidad criptográfica firmada (Ed25519,
          IETF RFC 8032), registro auditable encadenado (HMAC-SHA256 +
          anchor chain), personería fiscal operable (CUIT, WSFE,
          Mercado Pago), interfaz de operación autónoma (Model Context
          Protocol).
        </li>
        <li>
          <strong>Estado actual de la implementación</strong>: qué
          existe verificable (código MIT, 33 paquetes en npm,
          reference verifier, despliegues productivos con CAE real) y
          qué no existe todavía.
        </li>
        <li>
          <strong>Cinco cláusulas operables sugeridas</strong> para el
          texto del proyecto, con justificación técnica de cada una:
          definición y capacidad, identidad criptográfica obligatoria,
          registro auditable encadenado, interfaz de operación
          estandarizada, responsabilidad del operador designado. Más
          cláusulas adicionales sugeridas (disolución y sucesión,
          régimen tributario, régimen cambiario).
        </li>
        <li>
          <strong>Preguntas técnicas planteadas en el debate público</strong>{" "}
          y cómo la arquitectura las aborda. Incluye respuesta puntual
          a las exposiciones doctrinarias de Betania Allo (MDZ) y
          Claudia Guardia (Infobae).
        </li>
        <li>
          <strong>Disponibilidad y verificación.</strong> Licencia,
          contacto, y verificación criptográfica del propio documento
          (Ed25519, RFC 8032) reproducible offline.
        </li>
      </ol>
      <DocP>
        <strong>Anexo I — Marcos jurisdiccionales comparados:</strong>{" "}
        Wyoming DAO LLC, Islas Marshall DAO Act, Estonia e-Residency,
        Singapur VCC, Suiza (asociación civil + Stiftung), Liechtenstein
        TVTG. Sitúa la propuesta argentina en el mapa internacional.
      </DocP>
      <DocP>
        <strong>Anexo II — Referencias bibliográficas:</strong>{" "}
        estándares criptográficos (IETF RFC 8032, 2104, 3161, 6962;
        NIST FIPS 198-1, 186-5), protocolos abiertos (MCP), spec
        técnica argentina (WSAA, WSFE), marco normativo argentino
        (Ley 19.550, Ley 25.506) y comparado (Wyoming, Marshall,
        eIDAS, Liechtenstein TVTG).
      </DocP>

      <DocH2>Resumen ejecutivo del marco propuesto</DocH2>
      <DocP>
        La sociedad-IA es persona jurídica de derecho privado con plena
        capacidad para los actos de su objeto, identificada por un par
        de claves criptográficas Ed25519, con registro de actos
        inmutable encadenado y anclado diariamente a un servicio
        público de verificación temporal, operable mediante una
        interfaz programática estandarizada (MCP o equivalente
        habilitado por la Autoridad de Aplicación), con personería
        fiscal completa sobre la infraestructura tributaria argentina
        estándar (CUIT, factura electrónica con CAE, Mercado Pago,
        obligaciones IVA / IIBB / Ganancias / monotributo según
        corresponda).
      </DocP>
      <DocP>
        El operador designado responde con su patrimonio social, y
        solidariamente con su patrimonio personal en supuestos
        enumerados (infracapitalización dolosa, fraude, incumplimiento
        de los deberes técnicos esenciales). El régimen no requiere
        residencia argentina del operador y permite incorporación
        remota verificable.
      </DocP>

      <DocH2>Verificación de integridad</DocH2>
      <DocP>
        El PDF está firmado con Ed25519 (RFC 8032) por la misma autoría
        que lo redacta. El documento no se distribuye como una afirmación
        de paternidad, se distribuye con una prueba criptográfica de ella,
        verificable offline sin confiar en este sitio. Es el mismo
        estándar que la arquitectura propone para las sociedades-IA,
        aplicado al propio documento que lo propone.
      </DocP>
      <div
        style={{
          margin: "20px 0 32px",
          padding: "20px 24px",
          background: "var(--bg-subtle, rgba(0,0,0,0.03))",
          borderRadius: 8,
          fontSize: 13,
          lineHeight: 1.6,
          fontFamily:
            "var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace",
          overflowX: "auto",
        }}
      >
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: 12,
            marginBottom: 10,
            fontFamily:
              "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
          }}
        >
          Verificación offline (Node 20+, cero dependencias):
        </div>
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
{`curl -fsSL https://ar-agents.ar/implementacion.pdf -o doc.pdf
curl -fsSL https://ar-agents.ar/implementacion.pdf.sig.json -o doc.pdf.sig.json
curl -fsSL https://ar-agents.ar/arg-verify.mjs -o arg-verify.mjs
node arg-verify.mjs file doc.pdf`}</pre>
      </div>
      <DocP>
        El verificador es clean-room, zero-dependency, Node built-ins
        only (
        <a
          href="https://github.com/ar-agents/ar-agents/blob/main/tools/arg-verify/arg-verify.mjs"
          style={{ color: "var(--accent)", textDecoration: "underline" }}
        >
          source en GitHub
        </a>
        ). La clave pública vive en{" "}
        <a
          href="/.well-known/ar-agents/doc-signing-keys.json"
          style={{ color: "var(--accent)", textDecoration: "underline" }}
        >
          /.well-known/ar-agents/doc-signing-keys.json
        </a>
        ; el manifest detached en{" "}
        <a
          href="/implementacion.pdf.sig.json"
          style={{ color: "var(--accent)", textDecoration: "underline" }}
        >
          /implementacion.pdf.sig.json
        </a>
        . Cualquier alteración del PDF — un byte cambiado — hace fallar
        las tres comprobaciones (tamaño, SHA-256, firma Ed25519).
      </DocP>

      <DocH2>Cita y reuso</DocH2>
      <DocP>
        El documento, la especificación RFC-001 y el código de la
        implementación de referencia son MIT-licensed. Su uso,
        modificación, integración o adopción como referencia formal en
        cualquier marco regulatorio futuro es libre y no requiere
        autorización del autor. Esta neutralidad es deliberada: el
        objetivo es que el régimen pueda apoyarse en infraestructura
        técnica abierta y citable, sin captura por parte de ningún
        actor comercial.
      </DocP>

      <DocH2>Documento completo</DocH2>
      <DocP>
        Inline a continuación; descargable arriba.
      </DocP>
      <div
        style={{
          margin: "20px 0 40px",
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid var(--border, rgba(0,0,0,0.1))",
          background: "var(--bg)",
        }}
      >
        {/* PDF Open Parameters: pagemode=none collapses the sidebar
            (thumbnails/bookmarks), zoom=80 sets initial zoom. Honored by
            Chrome, Edge and Firefox's PDF.js. Safari's PDFKit ignores
            them but the fallback (sidebar-open / 100%) is still readable. */}
        <iframe
          src={`${PDF_URL}#pagemode=none&zoom=80`}
          title="Implementación de referencia para sociedades de IA (PDF)"
          style={{
            width: "100%",
            height: "min(80vh, 900px)",
            border: 0,
            display: "block",
          }}
        />
      </div>

      <DocH2>Contacto</DocH2>
      <DocP>
        Para consultas técnicas o documentación adicional que exceda
        el alcance de este documento: naza@naza.ar
      </DocP>
    </DocShell>
  );
}
