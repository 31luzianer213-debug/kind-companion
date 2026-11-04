export type InteractiveTextButton = {
  id: string;
  displayText: string;
  type?: string;
  copyCode?: string;
  url?: string;
};

export type InteractiveTextPayload =
  | { type: "buttons"; buttons: InteractiveTextButton[] }
  | {
      type: "list";
      sections: Array<{
        rows: Array<{ rowId: string; title: string; description?: string }>;
      }>;
    };

export function interactivePayloadAsText(interactive?: InteractiveTextPayload | null): string {
  if (!interactive) return "";
  if (interactive.type === "buttons") {
    return interactive.buttons
      .map((button) => {
        const value = button.copyCode || button.url;
        const command =
          button.type === "reply" || (!button.copyCode && !button.url) ? `${button.id}. ` : "";
        return `${command}${button.displayText}${value ? `\n${value}` : ""}`;
      })
      .filter(Boolean)
      .join("\n\n");
  }
  return interactive.sections
    .flatMap((section) =>
      section.rows.map(
        (row) => `${row.rowId}. ${row.title}${row.description ? ` — ${row.description}` : ""}`,
      ),
    )
    .join("\n");
}

/** Preserva Pix copia-e-cola, links e opções quando o cliente não recebe botões nativos. */
export function completeBotReply(
  reply: string,
  interactive?: InteractiveTextPayload | null,
): string {
  const base = String(reply ?? "").trim();
  const fallback = interactivePayloadAsText(interactive);
  if (!fallback) return base;
  return base ? `${base}\n\n${fallback}` : fallback;
}
