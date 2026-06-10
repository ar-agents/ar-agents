import type { Metadata } from "next";
import { DocCode, DocH2, DocP, DocShell } from "../doc-shell";

export const metadata: Metadata = {
  title: "Video: una sociedad-IA en producción · ar-agents",
  description:
    "Demo 2:30, agente Claude usando 6 paquetes ar-agents para constituir, facturar y operar una sociedad-IA argentina end-to-end. Hecho con Remotion. CC0.",
  alternates: {
    canonical: "https://ar-agents.ar/video",
  },
  openGraph: {
    type: "video.other",
    title: "Una sociedad-IA en producción, demo ar-agents",
    description:
      "2:30 · 6 paquetes · operación autónoma, supervisión humana mínima. Implementación de referencia para el régimen de sociedades-IA de Sturzenegger.",
    url: "https://ar-agents.ar/video",
    videos: [
      {
        url: "https://ar-agents.ar/video/sociedad-ia-demo.mp4",
        width: 1920,
        height: 1080,
        type: "video/mp4",
      },
    ],
  },
};

export default function VideoPage() {
  return (
    <DocShell
      eyebrow="demo en video"
      title="Una sociedad-IA en producción."
      subtitle="2:30 · 6 paquetes · operación autónoma, supervisión humana mínima. Un agente Claude ejecutando el ciclo completo: constituir → CUIT → MP → factura → WhatsApp → BO. Datos mock, paquetes reales."
    >
      <div
        style={{
          margin: "16px 0 32px",
          borderRadius: 12,
          overflow: "hidden",
          backgroundColor: "var(--bg-tint)",
          boxShadow: "var(--card-shadow)",
        }}
      >
        <video
          src="/video/sociedad-ia-demo.mp4"
          poster="/video/sociedad-ia-demo-poster.jpg"
          controls
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            backgroundColor: "#000",
          }}
        >
          <track
            kind="subtitles"
            label="Español (Argentina)"
            srcLang="es-AR"
            src="/video/sociedad-ia-demo.es.vtt"
            default
          />
          <p>
            Tu navegador no soporta video HTML5. Descargá el archivo{" "}
            <a href="/video/sociedad-ia-demo.mp4">acá</a>.
          </p>
        </video>
      </div>

      <DocH2>Qué muestra</DocH2>
      <DocP>
        El agente recibe una sola consigna: <em>&ldquo;Necesito constituir una
        sociedad-IA, conseguir CUIT, abrir cuenta MP, emitir factura y
        notificar al cliente por WhatsApp&rdquo;</em>. Sin más input humano, el
        agente atraviesa el ciclo llamando 6 paquetes ar-agents en secuencia:
      </DocP>

      <ol
        style={{
          margin: "8px 0 24px 24px",
          color: "var(--text-body)",
          fontSize: 15,
          lineHeight: 1.7,
        }}
      >
        <li>
          <DocCode>@ar-agents/igj</DocCode>, verifica que el nombre &ldquo;ACME-AI&rdquo; está
          disponible en el dataset abierto de IGJ.
        </li>
        <li>
          <DocCode>@ar-agents/identity</DocCode>, valida el CUIT y consulta el padrón AFIP/ARCA.
        </li>
        <li>
          <DocCode>@ar-agents/mercadopago</DocCode>, crea el customer y la suscripción
          mensual de $50.000.
        </li>
        <li>
          <DocCode>@ar-agents/facturacion</DocCode>, emite la factura electrónica con CAE.
        </li>
        <li>
          <DocCode>@ar-agents/whatsapp</DocCode>, notifica al cliente con template de WhatsApp Business.
        </li>
        <li>
          <DocCode>@ar-agents/boletin-oficial</DocCode>, suscribe el CUIT propio al firehose del BO.
        </li>
      </ol>

      <DocH2>Cómo está hecho</DocH2>
      <DocP>
        El video lo armé con{" "}
        <a
          href="https://www.remotion.dev/"
          style={{ color: "var(--accent)", textDecoration: "underline" }}
        >
          Remotion
        </a>:{" "}
      un framework de React para generar video programáticamente. El
        código está en{" "}
        <DocCode>apps/demo-video/</DocCode> del monorepo: 6 scenes (intro, contexto,
        tesis, stats, terminal, outro) compuestas en una <DocCode>Composition</DocCode>{" "}
        de 1920×1080 a 30fps, total ~2:30. Las llamadas a tools en la pantalla del
        terminal son mocks deterministas, la lógica de cada paquete está en el monorepo
        para que cualquiera la verifique. Sin actores, sin foley, sin AI-generation: todo
        es código React renderizado frame-por-frame con Chromium headless.
      </DocP>

      <DocH2>Subtítulos y accesibilidad</DocH2>
      <DocP>
        El reproductor incluye subtítulos en español argentino (
        <DocCode>.vtt</DocCode>, activos por default). Para verlos sin
        sonido o en una pantalla muteada, el archivo bruto está en{" "}
        <a
          href="/video/sociedad-ia-demo.es.vtt"
          style={{ color: "var(--accent)", textDecoration: "underline" }}
        >
          /video/sociedad-ia-demo.es.vtt
        </a>:{" "}
      también CC0. Para traducirlo, abrí un PR contra{" "}
        <DocCode>
          apps/landing/public/video/sociedad-ia-demo.es.vtt
        </DocCode>
        .
      </DocP>

      <DocH2>Licencia</DocH2>
      <DocP>
        El video es <strong>CC0</strong>, dominio público. El código que lo genera es{" "}
        <strong>MIT</strong>. Republicalo, traducilo, subtitulá, citá libremente sin
        pedir permiso. La única restricción ética: no edites el video para
        tergiversar las capacidades técnicas mostradas.
      </DocP>
    </DocShell>
  );
}
