"use client";

import { STAGES, stageIndex, type StageId } from "@/lib/ui/stage";
import { useLocale } from "@/lib/ui/locale-context";
import type { MessageId } from "@/lib/ui/i18n";

// STAGES/StageId live in stage.ts (not editable: its tests import the es
// labels directly). This maps each stage id to the matching localized
// message id instead, so the rail can render either locale without touching
// that file.
const STAGE_MESSAGE_ID: Record<StageId, MessageId> = {
  idea: "stage.idea",
  validacion: "stage.validacion",
  spec: "stage.spec",
  constitucion: "stage.constitucion",
  operacion: "stage.operacion",
};

/** Right-column rail before a society exists: shows the five journey stages
 *  with the current one highlighted. Once a society exists this column shows
 *  <OperationDashboard> instead (see src/app/page.tsx). */
export function JourneyRail({ stage }: { stage: StageId }) {
  const { t } = useLocale();
  const currentIndex = stageIndex(stage);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <p
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--text-muted)",
          margin: "0 0 8px 2px",
        }}
      >
        {t("journey.heading")}
      </p>
      {STAGES.map((s, i) => {
        const isCurrent = i === currentIndex;
        const isDone = i < currentIndex;
        return (
          <div
            key={s.id}
            className={`stage-rail-item${isCurrent ? " is-current" : ""}${
              isDone ? " is-done" : ""
            }`}
          >
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 18,
                height: 18,
                borderRadius: 999,
                fontSize: 11,
                flexShrink: 0,
                border: "1px solid var(--border-color)",
                background: isCurrent ? "var(--primary-bg)" : "transparent",
                color: isCurrent
                  ? "var(--primary-text)"
                  : isDone
                    ? "var(--text-body)"
                    : "var(--text-muted)",
              }}
            >
              {i + 1}
            </span>
            {t(STAGE_MESSAGE_ID[s.id])}
          </div>
        );
      })}
    </div>
  );
}
