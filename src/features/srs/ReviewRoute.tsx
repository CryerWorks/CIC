import { Link } from "react-router-dom";
import { Callout } from "../../components/ui";
import { useVaultState } from "../../app/providers/VaultProvider";
import { ReviewSession } from "./ReviewSession";

/** The Review screen. Gates on a connected vault (the due queue is per-vault), then delegates to
 *  the session subtree that calls `useVault()`/`useReview()`. */
export function ReviewRoute() {
  const vault = useVaultState();

  if (vault.status === "checking") {
    return <p className="text-text-dim">Loading…</p>;
  }
  if (vault.status !== "ready") {
    return (
      <div className="mx-auto max-w-2xl">
        <Callout variant="info" title="Connect a vault first">
          <span>
            Review draws on the cards in your active vault.{" "}
            <Link to="/vault" className="font-medium text-brand underline">
              Choose your vault
            </Link>{" "}
            to start.
          </span>
        </Callout>
      </div>
    );
  }
  return <ReviewSession />;
}
