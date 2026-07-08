// Pure inference of where the user is in the "idea -> operating automated
// society" journey (docs/CONTRACT.md's /api/agent `stage` field and the
// journey rail in the UI share this vocabulary). Takes plain signals, no
// React/fetch, so it is unit-testable and reusable from both places.

export type StageId = "idea" | "validacion" | "spec" | "constitucion" | "operacion";

export interface StageDefinition {
  id: StageId;
  label: string;
}

// Order matters: this is the left-to-right / top-to-bottom order of the rail.
export const STAGES: readonly StageDefinition[] = [
  { id: "idea", label: "Idea" },
  { id: "validacion", label: "Validación" },
  { id: "spec", label: "Especificación" },
  { id: "constitucion", label: "Constitución" },
  { id: "operacion", label: "Operación" },
];

export interface StageSignals {
  /** The account already has a constituted society (GET /api/society). */
  hasSociety: boolean;
  /** A `preview_society` tool result has appeared in the conversation. */
  hasPreviewDraft: boolean;
  /**
   * The constitution confirm dialog is open, or a constitute request is in
   * flight. Only meaningful while there is no society yet: once a society
   * exists it never overrides "operacion".
   */
  constituting?: boolean;
  /** Total number of chat messages (user + assistant) so far. */
  messageCount: number;
}

/**
 * Below this many messages with no draft yet, the conversation is still
 * "idea" (a first pass at the concept). Past it, we call it "validacion"
 * (probing/pressure-testing the idea) even though nothing concrete has been
 * drafted yet. Arbitrary threshold, stated here so it is easy to retune.
 */
const IDEA_MESSAGE_THRESHOLD = 4;

/**
 * Priority (highest wins): an existing society always means "operacion",
 * even mid-dialog; an open constitution dialog means "constitucion"; a seen
 * draft with no society yet means "spec"; otherwise message volume decides
 * between "idea" and "validacion".
 */
export function inferStage(signals: StageSignals): StageId {
  if (signals.hasSociety) return "operacion";
  if (signals.constituting) return "constitucion";
  if (signals.hasPreviewDraft) return "spec";
  if (signals.messageCount > IDEA_MESSAGE_THRESHOLD) return "validacion";
  return "idea";
}

export function stageIndex(stage: StageId): number {
  return STAGES.findIndex((s) => s.id === stage);
}
