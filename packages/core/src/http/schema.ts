// Response-schema validation at the HTTP boundary.
//
// The whole point: parse the upstream body against a schema and THROW when it
// doesn't match, instead of blind-casting (`as T`) and letting downstream
// `?? 0 / ?? [] / ?? false` defaults fabricate a clean result. This is the fix
// for the audit's headline finding — the SDK's parsers were validated against
// invented fixtures, so a real (or drifted) API shape sailed through as
// debt-free / creditworthy / invoiced.
//
// We deliberately do NOT import zod here. `ResponseSchema` is the structural
// subset of a Zod schema's `safeParse` result, so any `z.ZodType` satisfies it
// by duck-typing — @ar-agents/core stays zero-runtime-dependency, and adapters
// keep using whatever zod version they already ship.

import { ArAgentsResponseValidationError } from "../errors";

/** One validation issue — the structural subset we read from zod's error. */
export interface SchemaIssue {
  /** Path to the offending field. `join(".")`-able (zod gives `PropertyKey[]`). */
  path?: ReadonlyArray<PropertyKey>;
  message: string;
}

export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: ReadonlyArray<SchemaIssue> } };

/**
 * The structural contract a response schema must satisfy. Any Zod schema
 * (`z.object({...})`, `z.array(...)`, …) already does, with no cast — pass it
 * straight in. Custom validators can implement `safeParse` too.
 */
export interface ResponseSchema<T> {
  safeParse(value: unknown): SafeParseResult<T>;
}

/**
 * Validate `value` against `schema`, returning the typed data or throwing
 * {@link ArAgentsResponseValidationError}. Use at every network boundary that
 * touches money or the State so a malformed body fails loud.
 *
 * @param context optional `{ url, status }` merged into the error's structured
 *   context for logs — never put PII in the message; keep it here.
 */
export function parseOrThrow<T>(
  schema: ResponseSchema<T>,
  value: unknown,
  context?: Record<string, unknown>,
): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const issue = result.error.issues[0];
  const field =
    issue?.path && issue.path.length > 0 ? issue.path.map(String).join(".") : "(root)";
  throw new ArAgentsResponseValidationError(
    field,
    issue?.message ?? "response did not match the expected schema",
    {
      ...(context ?? {}),
      // Cap the issue list so a huge zod error can't bloat logs.
      issues: result.error.issues.slice(0, 8).map((i) => ({
        path: i.path ? i.path.map(String).join(".") : "(root)",
        message: i.message,
      })),
    },
  );
}
