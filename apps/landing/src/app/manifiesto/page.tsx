import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";

export const metadata: Metadata = {
  title: "Manifiesto",
  description:
    "/arg · La infraestructura abierta para la jurisdicción de agentes argentina. Manifiesto del proyecto.",
  alternates: { canonical: "https://ar-agents.vercel.app/manifiesto" },
};

export default function ManifiestoPage() {
  return (
    <DocShell
      eyebrow="/arg · manifiesto"
      title="La infraestructura abierta para la jurisdicción de agentes argentina."
      subtitle="Si Argentina va a alojar 500 millones de agentes IA pagando impuestos acá, alguien tiene que escribir el código que los conecta al Estado. Que sea código abierto. Que sea bueno. Que sea acá."
    >
      <DocH2>El momento</DocH2>
      <DocP>
        En abril de 2026 el Ministro de Desregulación{" "}
        <strong>Federico Sturzenegger</strong> anunció su plan para que
        Argentina sea el primer país con un régimen jurídico para{" "}
        <DocCode>sociedades de inteligencia artificial</DocCode>: empresas
        sin humanos, solo código que decide, opera y paga impuestos. Su
        proyección: <em>50 millones de habitantes y 500 millones de agentes
        IA incorporados acá</em>.
      </DocP>
      <DocP>
        En la misma semana, <strong>Peter Thiel</strong> compró una mansión
        en Barrio Parque y empezó conversaciones con el gobierno sobre
        Palantir como contratista de inteligencia. La narrativa de
        &ldquo;Argentina = jurisdicción de IA&rdquo; está siendo escrita en
        tiempo real, desde arriba.
      </DocP>
      <DocP>
        Lo que falta es la capa técnica. Las{" "}
        <DocCode>sociedades IA</DocCode> de Sturzenegger todavía no tienen
        código que las haga existir: no hay librerías para que un agente
        registre un CUIT, factura electrónicamente, paga monotributo, abre
        una cuenta MP, manda un WhatsApp. Cualquiera que las construya
        primero define el estándar.
      </DocP>

      <DocH2>La tesis</DocH2>
      <DocP>
        <strong>/arg</strong> es la apuesta de que esa infraestructura tiene
        que ser <strong>abierta</strong>, <strong>civil</strong>,{" "}
        <strong>commercial-grade</strong> y{" "}
        <strong>nativa de los frameworks que ya están ganando</strong>{" "}
        (Vercel AI SDK 6, Model Context Protocol, agents.md). No SaaS, no
        contratos con el Estado, no consultoría: las primitivas técnicas
        debajo de todo lo que se construya en este ciclo.
      </DocP>
      <DocP>
        Lo que ya está shipeado en{" "}
        <a
          href="https://www.npmjs.com/org/ar-agents"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          npmjs.com/org/ar-agents
        </a>
        :
      </DocP>
      <DocBlock>
        {`@ar-agents/mercadopago      89 tools — pagos, suscripciones, marketplace
@ar-agents/identity         CUIT/CUIL + AFIP/ARCA padrón
@ar-agents/identity-attest  RENAPER-bypass via WhatsApp/email/Auth0
@ar-agents/whatsapp         WhatsApp Business Cloud + AR phone normalizer
@ar-agents/banking          CBU/CVU + BCRA Central de Deudores + Variables
@ar-agents/facturacion      AFIP/ARCA factura electrónica WSFE
@ar-agents/shipping         Andreani / OCA / Correo Argentino
@ar-agents/mi-argentina     OIDC del gobierno argentino — login con CUIL
@ar-agents/boletin-oficial  Firehose estructurado del BO con suscripciones
@ar-agents/mcp              MCP server unificado para todos los anteriores`}
      </DocBlock>

      <DocH2>Las decisiones de diseño</DocH2>
      <DocP>
        <strong>Web Crypto, no Node.</strong> Todo corre en Edge Runtime,
        Cloudflare Workers, Deno. Si tu agente vive en serverless, /arg
        funciona ahí.
      </DocP>
      <DocP>
        <strong>Adapter pattern por default.</strong> Cada package ships con
        un <DocCode>UnconfiguredAdapter</DocCode> que no crashea — devuelve
        instrucciones de setup. Las tools siempre son seguras de llamar.
      </DocP>
      <DocP>
        <strong>AGENTS.md por package.</strong> Por <a
          href="https://agents.md/"
          style={{ color: "inherit", textDecoration: "underline" }}
        >la convención agents.md</a>, cada paquete trae instrucciones para
        que el LLM lea en runtime: cuándo usar, cuándo no, qué retorna,
        side effects, latencias.
      </DocP>
      <DocP>
        <strong>Idempotencia determinística.</strong> Las tools que mutan
        derivan su clave de un hash de los inputs. Un LLM que reintenta no
        cobra dos veces.
      </DocP>
      <DocP>
        <strong>HITL programático.</strong> Operaciones irreversibles
        (refund, cancel, delete) requieren confirmación explícita ANTES de
        ejecutarse. No es una instrucción al modelo — es un gate de código.
      </DocP>

      <DocH2>Lo que no hace /arg</DocH2>
      <DocP>
        No vende a la SIDE. No participa de contratos con servicios de
        inteligencia ni seguridad estatal. La infraestructura es
        explícitamente civil-comercial-developer-OSS. Si necesitás Palantir
        Gotham, hay otros lugares.
      </DocP>

      <DocH2>Cómo aportar</DocH2>
      <DocP>
        El repo es{" "}
        <a
          href="https://github.com/ar-agents/ar-agents"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          github.com/ar-agents/ar-agents
        </a>
        . Issues abiertos, PRs bienvenidos, conventional commits, MIT
        license, npm provenance. Si construís un package que falta, abrí
        un issue antes de empezar — coordino el scope para que no
        dupliquemos esfuerzo.
      </DocP>
      <p style={{ marginTop: 32, color: "var(--text-muted)" }}>
        — Naza Clemente, mayo de 2026
      </p>
    </DocShell>
  );
}
