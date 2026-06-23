import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2";
import { createHash } from "node:crypto";

/**
 * Verificador de la República Autónoma. Recompone el corpus desde el manifiesto
 * servido y lo re-hashea, valida las firmas Ed25519 (constitución, corpus,
 * delegación, ciudadanías) y camina la cadena del censo desde el ancla de génesis.
 * Reimplementación independiente (no comparte código con ar-panel): si coincide,
 * la confianza no depende de un solo código.
 */

ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));
const enc = new TextEncoder();
const fromHex = (h: string) => Uint8Array.from(h.match(/.{2}/g)!.map((x) => parseInt(x, 16)));
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const verifySig = (sig: string | undefined, msg: string, pk: string) => {
  try {
    return !!sig && ed.verify(fromHex(sig), enc.encode(msg), fromHex(pk));
  } catch {
    return false;
  }
};
function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  const k = Object.keys(v as Record<string, unknown>).sort();
  return "{" + k.map((x) => JSON.stringify(x) + ":" + stable((v as Record<string, unknown>)[x])).join(",") + "}";
}
const canonicalRecord = (r: { n: number; handle: string; pais: unknown; identidad: unknown; ts: string; prevHash: string }) =>
  JSON.stringify([r.n, r.handle, r.pais, r.identidad, r.ts, r.prevHash]);
type ActoRec = { n: number; tipo: string; sujeto: string; articulo: string; normas: string[]; plazoDias: number; submittedAt: string; resueltoAt: string | null; ts: string; prevHash: string; hash: string; sig?: string };
const canonicalActo = (a: ActoRec) =>
  JSON.stringify([a.n, a.tipo, a.sujeto, a.articulo, a.normas, a.plazoDias, a.submittedAt, a.resueltoAt, a.ts, a.prevHash]);
type CheckpointHead = { n: number; head: string };
type Checkpoint = { version: string; ts: string; constitutionSha256: string; census: CheckpointHead; acts: CheckpointHead; signature: string; signedBy?: string };
const canonicalCheckpoint = (c: Checkpoint) =>
  JSON.stringify([c.version, c.ts, c.constitutionSha256, c.census.n, c.census.head, c.acts.n, c.acts.head]);
function projectNormative(m: Manifest) {
  return {
    pillars: m.pillars,
    articles: m.constitution.articles,
    laws: m.laws,
    decrees: m.decrees,
    rails: m.rails.map((r) => ({
      id: r.id,
      capacidad: r.capacidad,
      articles: r.articles,
      authorizes: r.authorizes,
      pilares: r.pilares ?? [],
      npm: r.npm ?? null,
      legacyEndpoint: r.legacyEndpoint ?? null,
    })),
  };
}

export type Manifest = {
  keys: { founding: string; census: string; delegation: string };
  seals: { constitution: { sha256: string; signature?: string }; corpus: { sha256: string; signature?: string } };
  pillars: { id: string }[];
  constitution: { articles: { id: string; pilares?: string[] }[] };
  laws: { id: string }[];
  decrees: { id: string }[];
  rails: { id: string; capacidad: unknown; articles: string[]; authorizes: string[]; pilares?: string[]; npm: string | null; legacyEndpoint: string | null }[];
  witness?: Checkpoint;
};

type CensusRec = { n: number; handle: string; pais: unknown; identidad: unknown; ts: string; prevHash: string; hash: string; sig?: string };

export type VerifyReport = {
  ok: boolean;
  base: string;
  checks: { name: string; pass: boolean | null; detail?: string }[];
  founding: string;
  corpusVersion: string | null;
};

/** Verifica una República en `base` (default la oficial). Devuelve un reporte de pruebas. */
export async function verifyRepublic(base = "https://ar-panel-one.vercel.app"): Promise<VerifyReport> {
  base = base.replace(/\/$/, "");
  const [m, ledger, ctext, actos] = await Promise.all([
    fetch(base + "/.well-known/republica.json").then((r) => r.json() as Promise<Manifest & { version?: string }>),
    fetch(base + "/api/censo?full=1").then((r) => r.json() as Promise<{ records?: CensusRec[]; count?: number }>),
    fetch(base + "/constitucion.md").then((r) => (r.ok ? r.text() : null)),
    fetch(base + "/api/actos?full=1").then((r) => (r.ok ? (r.json() as Promise<{ records?: ActoRec[]; count?: number }>) : { records: [], count: 0 })),
  ]);

  const checks: VerifyReport["checks"] = [];
  const add = (name: string, pass: boolean | null, detail?: string) =>
    checks.push(detail === undefined ? { name, pass } : { name, pass, detail });
  const fk = m.keys.founding;

  add("corpus seal recomputes == served", sha256(stable(projectNormative(m))) === m.seals.corpus.sha256);
  add("constitution signature (founding)", verifySig(m.seals.constitution.signature, m.seals.constitution.sha256, fk));
  add("constitution text re-hashes to signed sha", ctext ? sha256(ctext) === m.seals.constitution.sha256 : null);
  add("corpus signature (founding)", verifySig(m.seals.corpus.signature, m.seals.corpus.sha256, fk));
  add("delegation founding -> census", verifySig(m.keys.delegation, m.keys.census, fk));

  const recs = (ledger.records ?? []).slice().sort((a, b) => a.n - b.n);
  let chainOk = true;
  let sigOk = true;
  let prev = m.seals.constitution.sha256;
  let idx = 0;
  for (const r of recs) {
    if (sha256(canonicalRecord(r)) !== r.hash) chainOk = false;
    if (idx === 0 && r.n === 1 && r.prevHash !== m.seals.constitution.sha256) chainOk = false;
    if (idx > 0 && r.prevHash !== prev) chainOk = false;
    if (r.sig && !verifySig(r.sig, r.hash, m.keys.census)) sigOk = false;
    prev = r.hash;
    idx++;
  }
  add("census chain consistent from genesis anchor", chainOk, `${recs.length} record(s)`);
  add("census signatures (delegated key)", recs.length ? sigOk : null);

  const acts = (actos.records ?? []).slice().sort((a, b) => a.n - b.n);
  const artIds = new Set(m.constitution.articles.map((a) => a.id));
  let actsChain = true;
  let actsSig = true;
  let actsArt9 = true;
  let aprev = m.seals.constitution.sha256;
  let aidx = 0;
  for (const a of acts) {
    if (sha256(canonicalActo(a)) !== a.hash) actsChain = false;
    if (aidx === 0 && a.n === 1 && a.prevHash !== m.seals.constitution.sha256) actsChain = false;
    if (aidx > 0 && a.prevHash !== aprev) actsChain = false;
    if (a.sig && !verifySig(a.sig, a.hash, m.keys.census)) actsSig = false;
    if (!artIds.has(a.articulo)) actsArt9 = false;
    aprev = a.hash;
    aidx++;
  }
  add("acts chain consistent + Art. 9 (each act cites a law)", acts.length ? actsChain && actsArt9 : true, `${acts.length} act(s)`);
  add("acts signatures (delegated key)", acts.length ? actsSig : null);

  // Testigo externo: la founding key fija las cabezas. El servidor (clave delegada) no
  // puede producir un checkpoint, así que reescribir o retroceder la historia se detecta.
  const w = m.witness;
  if (w) {
    const censusCount = ledger.count ?? recs.length;
    const actsCount = actos.count ?? acts.length;
    const headOk = (side: CheckpointHead, asc: { n: number; hash: string }[], count: number) => {
      if (side.n === 0) return side.head === m.seals.constitution.sha256;
      const rec = asc.find((r) => r.n === side.n);
      return !!rec && rec.hash === side.head && count >= side.n;
    };
    const wSigned = verifySig(w.signature, canonicalCheckpoint(w), fk) && w.constitutionSha256 === m.seals.constitution.sha256;
    const wHeads = headOk(w.census, recs, censusCount) && headOk(w.acts, acts, actsCount);
    const ahead = Math.max(0, censusCount - w.census.n) + Math.max(0, actsCount - w.acts.n);
    add("external witness: founding-signed checkpoint", wSigned, w.ts ? w.ts.slice(0, 10) : undefined);
    add("witness pins census + acts heads", wHeads, `census n=${w.census.n} · acts n=${w.acts.n}${ahead ? ` · +${ahead} provisional` : ""}`);
  } else {
    add("external witness (checkpoint)", null, "no checkpoint served");
  }

  const aIds = new Set(m.constitution.articles.map((a) => a.id));
  const lIds = new Set(m.laws.map((l) => l.id));
  const dIds = new Set(m.decrees.map((d) => d.id));
  const pIds = new Set(m.pillars.map((p) => p.id));
  const nIds = new Set([...lIds, ...dIds]);
  let dangling = 0;
  for (const r of m.rails) {
    for (const id of r.articles) if (!aIds.has(id)) dangling++;
    for (const id of r.authorizes) if (!nIds.has(id)) dangling++;
    for (const id of r.pilares ?? []) if (!pIds.has(id)) dangling++;
  }
  for (const a of m.constitution.articles) for (const id of a.pilares ?? []) if (!pIds.has(id)) dangling++;
  add("foreign keys resolve (Art. 9)", dangling === 0, `${dangling} dangling`);

  const ok = checks.every((c) => c.pass !== false);
  return { ok, base, checks, founding: fk, corpusVersion: (m as { version?: string }).version ?? null };
}
