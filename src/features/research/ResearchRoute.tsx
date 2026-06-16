/**
 * ResearchRoute — the main route for the AI Research Agent feature.
 *
 * Walks through the research lifecycle:
 *   1. Goal setting dialog (ResearchGoalDialog)
 *   2. Learning profile form (LearningProfileForm)
 *   3. Research progress (ResearchProgress)
 *   4. Campaign review (CampaignReview)
 *   5. Materialization
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Callout } from "../../components/ui";
import { useDb } from "../../app/providers/DbProvider";
import { getSetting, setSetting } from "../../db";
import { ResearchGoalDialog } from "./ResearchGoalDialog";
import { LearningProfileForm } from "./LearningProfileForm";
import { ResearchProgress } from "./ResearchProgress";
import { CampaignReview } from "./CampaignReview";
import { useResearch } from "../../ai/features/research/hooks/useResearch";
import type { LearningProfile } from "../../ai/features/research/types";

const PRIVACY_CONSENT_KEY = "research.consent_given";

export function ResearchRoute() {
  const navigate = useNavigate();
  const db = useDb();
  const research = useResearch();

  const [showGoalDialog, setShowGoalDialog] = useState(true);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [pendingTopic, setPendingTopic] = useState("");
  const [pendingDescription, setPendingDescription] = useState<string | undefined>();
  const [privacyConsentGiven, setPrivacyConsentGiven] = useState(false);
  const [privacyCheckDone, setPrivacyCheckDone] = useState(false);

  // Check privacy consent on mount
  useEffect(() => {
    if (!db) return;
    (async () => {
      const raw = await getSetting(db, PRIVACY_CONSENT_KEY);
      if (raw === "true") {
        setPrivacyConsentGiven(true);
      }
      setPrivacyCheckDone(true);
    })();
  }, [db]);

  const handleGoalSubmit = useCallback(
    (topic: string, description?: string) => {
      setPendingTopic(topic);
      setPendingDescription(description);
      setShowGoalDialog(false);
      setShowProfileForm(true);
    },
    [],
  );

  const handleProfileSubmit = useCallback(
    async (profile: LearningProfile) => {
      setShowProfileForm(false);
      await research.startResearch({
        topic: pendingTopic,
        description: pendingDescription,
        learningProfile: profile,
      });
    },
    [research, pendingTopic, pendingDescription],
  );

  const handleProfileSkip = useCallback(async () => {
    setShowProfileForm(false);
    await research.startResearch({
      topic: pendingTopic,
      description: pendingDescription,
    });
  }, [research, pendingTopic, pendingDescription]);

  const handlePrivacyConsent = useCallback(async () => {
    if (db) {
      await setSetting(db, PRIVACY_CONSENT_KEY, "true");
    }
    setPrivacyConsentGiven(true);
  }, [db]);

  const handleBack = useCallback(() => {
    research.reset();
    setShowGoalDialog(true);
    setShowProfileForm(false);
  }, [research]);

  // ── Render ──

  // Goal dialog
  if (showGoalDialog) {
    return (
      <ResearchGoalDialog
        onSubmit={handleGoalSubmit}
        onClose={() => navigate("/")}
        showPrivacyConsent={privacyCheckDone && !privacyConsentGiven}
        onPrivacyConsent={handlePrivacyConsent}
      />
    );
  }

  // Profile form
  if (showProfileForm) {
    return (
      <div className="mx-auto max-w-lg py-8">
        <LearningProfileForm
          onSubmit={handleProfileSubmit}
          onSkip={handleProfileSkip}
        />
      </div>
    );
  }

  // Error state
  if (research.error || research.uiState === "error") {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <Callout variant="danger" title="Research Error">
          <p className="text-sm">{research.error ?? "An unknown error occurred."}</p>
          <div className="mt-3">
            <button
              onClick={research.dismissError}
              className="rounded-sm bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dim"
            >
              Try Again
            </button>
          </div>
        </Callout>
      </div>
    );
  }

  // Research in progress
  if (research.uiState === "researching" || research.uiState === "materializing") {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <div className="mb-6">
          <h1 className="text-lg font-bold text-text">
            {research.uiState === "materializing"
              ? "Materializing Courses…"
              : `Researching "${research.result?.goal.topic ?? pendingTopic}"…`}
          </h1>
        </div>
        <ResearchProgress
          phase={research.phase}
          message={research.message}
          progress={research.progress}
        />
      </div>
    );
  }

  // Campaign review
  if (research.result && (research.uiState === "reviewing" || research.uiState === "done")) {
    return (
      <div className="py-8">
        <CampaignReview
          result={research.result}
          materializing={false}
          materializeResults={research.materializeResults}
          onMaterialize={research.materializeAll}
          onBack={handleBack}
        />
      </div>
    );
  }

  // Fallback / idle
  return (
    <div className="mx-auto max-w-lg py-8 text-center">
      <p className="text-sm text-text-dim">Loading Research Agent…</p>
    </div>
  );
}
