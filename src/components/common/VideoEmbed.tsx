/**
 * A YouTube video, embedded.
 *
 * ★ Renders NOTHING when `id` is empty — the same idiom as SyncGuideLink,
 * which shipped dark until the guide it pointed at existed. It means a page can
 * carry its video slot before there's a video in it, with no chance of a broken
 * player or an empty grey box in front of a user.
 *
 * ★ youtube-nocookie.com, not youtube.com. Privacy-enhanced mode sets no
 * tracking cookies until the viewer actually presses play, which is what keeps
 * an embed on a help page consistent with the privacy policy. If this is ever
 * switched to the plain domain, the policy has to say so first.
 *
 * Lazy-loaded: the player is below the fold on every surface that uses it, and
 * an iframe that loads on sight would undo the page-weight work.
 */
export function VideoEmbed({
  id,
  title,
  caption,
}: {
  /** YouTube video id — the part after `?v=`. Empty renders nothing at all. */
  id: string;
  /** Names the frame for screen readers and for the tab YouTube opens. */
  title: string;
  /** Optional line under the frame. Facts only — never a restatement of the title. */
  caption?: string;
}) {
  if (!id) return null;

  return (
    <figure className="m-0">
      {/* The frame matches the card grammar around it — same border, same
          radius — so a video reads as one of the page's blocks rather than as
          something pasted onto it. overflow-hidden clips the player's own
          square corners to the card's radius. */}
      <div className="bg-c-card border border-c-border rounded-xl overflow-hidden aspect-video">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?rel=0`}
          title={title}
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture; web-share"
          allowFullScreen
          className="w-full h-full block border-0"
        />
      </div>
      {caption && (
        <figcaption className="text-xs text-c-dim mt-2 m-0">{caption}</figcaption>
      )}
    </figure>
  );
}
