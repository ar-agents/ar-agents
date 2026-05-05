// Dump the raw AFIP A13 SOAP response to inspect field shape.
import { TokenCache } from "@ar-agents/identity/wsaa";

const cache = new TokenCache({
  certPath: process.env.AFIP_CERT_PATH,
  keyPath: process.env.AFIP_KEY_PATH,
  env: process.env.AFIP_ENV ?? "prod",
});

const ta = await cache.getTicket("ws_sr_padron_a13");
console.log("[ta] expirationTimeMs:", new Date(ta.expirationTimeMs).toISOString());

const cuit = process.argv[2] ?? "20417581015";
const cuitRep = process.env.AFIP_CUIT_REPRESENTADO;

const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a13="http://a13.soap.ws.server.puc.sr/">
  <soapenv:Header/>
  <soapenv:Body>
    <a13:getPersona>
      <token>${ta.token}</token>
      <sign>${ta.sign}</sign>
      <cuitRepresentada>${cuitRep}</cuitRepresentada>
      <idPersona>${cuit}</idPersona>
    </a13:getPersona>
  </soapenv:Body>
</soapenv:Envelope>`;

const url = (process.env.AFIP_ENV ?? "prod") === "homo"
  ? "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13"
  : "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13";

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
  body: envelope,
});
const text = await res.text();
console.log("[response]:");
console.log(text);
