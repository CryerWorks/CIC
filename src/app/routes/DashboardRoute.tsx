import { Link } from "react-router-dom";
import { Placeholder } from "./Placeholder";
import { Callout } from "../../components/ui";
import { useVaultState } from "../providers/VaultProvider";

export function DashboardRoute() {
  const vault = useVaultState();

  return (
    <div className="flex flex-col gap-6">
      {vault.status === "unset" && (
        <Callout variant="info" title="No vault connected">
          <span>
            Choose your Obsidian vault to start capturing knowledge.{" "}
            <Link to="/vault" className="font-medium text-brand underline">
              Choose your vault
            </Link>
          </span>
        </Callout>
      )}
      <Placeholder name="Dashboard" />
    </div>
  );
}
