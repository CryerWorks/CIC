/**
 * Blueprint IR types for the Course Generation Engine (Feature 020).
 *
 * The CourseBlueprint is the intermediate representation between generation
 * (Mode A conversational sparring / Mode B RAG synthesis) and materialization
 * (vault MOC + SQLite rows). The review UI operates on this shape before
 * the user approves materialization.
 */

/** Scope: v1 supports single courses only — campaigns deferred. */
export type BlueprintScope = "course";

/** Depth: how deeply the learner wants to engage. */
export type BlueprintDepth = "overview" | "working" | "mastery";

/** A single source within a research session (reading or watching material). */
export interface SessionSource {
  /** URL of the source. */
  url: string;
  /** Title of the source. */
  title: string;
  /** Whether this is a reading or watching assignment. */
  type: "reading" | "watching";
  /** Estimated time to consume in minutes. */
  estimatedMinutes: number;
  /** Starting page number (for reading sources with page ranges). */
  startPage?: number;
  /** Ending page number. */
  endPage?: number;
  /** Starting timestamp in seconds (for watching sources with time ranges). */
  startSeconds?: number;
  /** Ending timestamp in seconds. */
  endSeconds?: number;
}

/** A card seed within a session, referencing a source by index. */
export interface SessionCardSeed {
  /** Card front (question/prompt). */
  front: string;
  /** Card back (correct answer for memory recall). Required — cards are Q+A pairs. */
  back: string;
  /** Which source in the session's sources[] this card refers to. */
  sourceIndex: number;
}

/** A structured learning session within a milestone. */
export interface SessionSeed {
  /** Session title. */
  title: string;
  /** Learning objective for the session. */
  objective: string;
  /** Sources (readings/watchings) for this session. */
  sources: SessionSource[];
  /** Per-source card seeds for this session. */
  cards: SessionCardSeed[];
}

/** A project within a milestone, gated on session completion. */
export interface ProjectSeed {
  /** Project title. */
  title: string;
  /** Project description / brief. */
  description: string;
  /** Indices into the milestone's sessions[] that must be completed first. */
  requiredSessionIndices: number[];
}

/** One planned capability milestone in the course. */
export interface MilestoneSeed {
  /** Display order (0-based). */
  order: number;
  /** One-sentence capability statement, e.g. "Prove continuity using epsilon-delta." */
  capability: string;
  /** Freeform description of what this milestone covers. */
  description: string;
  /** Estimated difficulty ramp (1-5). */
  difficulty: number;
  /** Structured sessions with per-source cards (V2). */
  sessions?: SessionSeed[];
  /** Projects gated on session completion (V2). */
  projects?: ProjectSeed[];
}

/** A card seed — a memory recall Q+A pair. */
export interface CardSeed {
  /** The card front (question/prompt). */
  front: string;
  /** The card back (correct answer for memory recall). Required — cards are Q+A pairs. */
  back: string;
  /** Which milestone this card supports (index into milestones[]). */
  milestoneIndex: number;
}

/** A retrieval practice question for the course (used during materialization for card seeds). */
export interface RetrievalQ {
  /** The question. */
  question: string;
  /** Which milestone this question supports. */
  milestoneIndex: number;
  /** One-sentence answer (informational only — not written to card back in scaffold mode). */
  answerSnippet: string;
}

/** A Feynman technique target — a concept to explain simply. */
export interface FeynmanTarget {
  /** The concept to explain. */
  concept: string;
  /** Which milestone this target belongs to. */
  milestoneIndex: number;
}

/** Links a resource to part of the course. */
export interface BlueprintResourceMap {
  /** Resource ID (for already-ingested resources). */
  resourceId: string;
  /** Which milestone this resource supports. */
  milestoneIndex: number;
  /** Optional role label: primary, secondary, reference. */
  role?: "primary" | "secondary" | "reference";
}

/** User's target specification for course generation. */
export interface BlueprintTarget {
  /** Topic or subject area. */
  topic: string;
  /** Scope (only "course" in v1). */
  scope: BlueprintScope;
  /** Desired depth. */
  depth: BlueprintDepth;
  /** Optional existing domain name to associate the course with. */
  domainName?: string;
  /** Optional current-level calibration (free text). */
  currentLevel?: string;
  /** Optional time budget description. */
  timeBudget?: string;
  /** Optional resource IDs to ground Mode B generation on. */
  resourceIds?: string[];
}

/** The full Course Blueprint IR — the contract between generation and materialization. */
export interface CourseBlueprint {
  /** Course title. */
  title: string;
  /** Domain name (materializer resolves or creates it). */
  domain: string;
  /** The generation target that produced this blueprint. */
  target: BlueprintTarget;
  /** Ordered list of capability milestones. */
  milestones: MilestoneSeed[];
  /** Suggested card seeds (front-only). */
  cardSeeds: CardSeed[];
  /** Retrieval practice questions. */
  retrievalQs: RetrievalQ[];
  /** Feynman technique targets. */
  feynmanTargets: FeynmanTarget[];
  /** Resource-to-milestone mappings. */
  resourceMap: BlueprintResourceMap[];
}

/** Mode of generation. */
export type GenerationMode = "a" | "b";
