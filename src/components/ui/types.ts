// Shared prop/variant unions for the component kit, plus a tiny class-join helper.
// Public types are part of the kit contract (contracts/components.md).

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";
export type TagTone = "brand" | "neutral" | "success" | "warn" | "danger";
export type CalloutVariant = "note" | "tip" | "warn" | "danger" | "info" | "ai";
export type StepState = "done" | "active" | "todo";
export type MessageRole = "user" | "ai";
export type RateValue = "again" | "hard" | "good" | "easy";
export type DomainIndex = 1 | 2 | 3 | 4 | 5;

/** Join truthy class fragments. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
