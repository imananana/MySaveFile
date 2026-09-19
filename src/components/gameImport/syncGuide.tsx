/**
 * The footer link on the import and sync modals.
 *
 * Both screens were cut down hard on the basis that this page exists: the sync
 * modal lost its "your notes, photos, inspo and descriptions stay as they are"
 * subtitle, and the different-file notice lost "anything missing from it is
 * removed". Both facts live on /help/syncing now, so this link is the only
 * thing keeping them reachable — if it ever goes, put the copy back first.
 *
 * A new tab on purpose: you click this mid-sync, and losing the modal to read
 * about the modal would be its own small joke.
 */
export function SyncGuideLink({ label }: { label: string }) {
  return (
    <a
      href="/help/syncing"
      target="_blank"
      rel="noopener noreferrer"
      className="mr-auto text-xs text-c-dim hover:text-c-text underline underline-offset-4 decoration-c-border"
    >
      {label}
    </a>
  );
}
