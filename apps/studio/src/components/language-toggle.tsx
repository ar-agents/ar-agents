"use client";

import { useLocale } from "@/lib/ui/locale-context";
import type { Locale } from "@/lib/ui/i18n";

const OPTIONS: readonly { locale: Locale; label: string }[] = [
  { locale: "es", label: "ES" },
  { locale: "en", label: "EN" },
];

/** Compact ES/EN segmented control for the page header. Reuses the shared
 *  .btn / .btn-ghost / .btn-primary classes from globals.css instead of
 *  introducing new styles. */
export function LanguageToggle() {
  const { locale, setLocale, t } = useLocale();

  return (
    <div
      role="group"
      aria-label={t("toggle.language.label")}
      style={{ display: "inline-flex", gap: 4 }}
    >
      {OPTIONS.map((option) => {
        const active = option.locale === locale;
        return (
          <button
            key={option.locale}
            type="button"
            className={active ? "btn btn-primary" : "btn btn-ghost"}
            style={{ fontSize: 12, padding: "4px 10px" }}
            aria-pressed={active}
            onClick={() => setLocale(option.locale)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
