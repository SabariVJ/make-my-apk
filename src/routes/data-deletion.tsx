import { createFileRoute } from "@tanstack/react-router";
import { DeleteAccountPage } from "./delete-account";

export const Route = createFileRoute("/data-deletion")({
  head: () => ({
    meta: [
      { title: "Delete Your Data — SVJ" },
      {
        name: "description",
        content:
          "Delete your SVJ account and all associated data, including activity and profile data.",
      },
    ],
  }),
  component: DataDeletionPage,
});

/**
 * Play Console's "data deletion" URL. It renders the same deliberate,
 * re-authenticated deletion flow as `/delete-account` — one implementation, two
 * entry paths — so the app never promises a deletion behaviour it does not run.
 */
function DataDeletionPage() {
  return <DeleteAccountPage />;
}
