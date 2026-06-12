import { z } from "zod";

/** A citation embedded in an AI response — links to a specific source */
export interface Citation {
  sourceName: string;
  locator: string;
  sourceKind: "resource" | "note";
  sourceId: string;
}

/** A single message in the Feynman conversation */
export interface FeynmanMessage {
  role: "learner" | "tutor";
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
}

/** A knowledge gap identified by the AI */
export interface FeynmanGap {
  text: string;
  sourceName?: string;
}

/** Where to save identified gaps */
export interface GapSaveTarget {
  type: "session-writeup" | "standalone-note";
  notePath: string;
  courseId?: string;
}

/** Zod schema for feynman_gaps DB rows */
export const FeynmanGapRowSchema = z.object({
  id: z.string(),
  vault_id: z.string(),
  course_id: z.string().nullable(),
  note_path: z.string(),
  text: z.string(),
  status: z.enum(["open", "completed"]),
  created_at: z.string(),
});

export type FeynmanGapRow = z.infer<typeof FeynmanGapRowSchema>;
