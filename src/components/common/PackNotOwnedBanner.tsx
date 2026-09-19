/**
 * Soft banner rendered at the top of a feature page when its required pack
 * isn't in the user's ownership. Doesn't block — the page stays functional
 * (the user might be planning ahead, exploring, or have force-disabled the
 * pack intentionally). Just sets expectations and offers a one-click jump
 * to Pack Settings to flip ownership.
 *
 * Renders nothing when the pack is owned.
 */
import { useNavigate, useParams } from 'react-router-dom';
import { Warning } from '@phosphor-icons/react';
import { usePackOwnership } from '../../store/usePackOwnership';
import { PACKS_BY_ID } from '../../data/packs';

export function PackNotOwnedBanner({ packId, feature }: { packId: string; feature: string }) {
  const { saveFileId } = useParams<{ saveFileId: string }>();
  const navigate = useNavigate();
  const isOwned = usePackOwnership((s) => s.isOwned(packId));

  if (isOwned) return null;
  const packName = PACKS_BY_ID[packId]?.name ?? packId;

  return (
    <div className="relative overflow-hidden mx-4 mt-4 mb-3 rounded-xl bg-c-card border border-c-border px-4 py-3 flex items-start gap-3 shrink-0">
      <span className="absolute left-0 inset-y-0 w-[3px] bg-c-gold" aria-hidden />
      <Warning size={18} weight="duotone" className="text-c-gold shrink-0 mt-px" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-c-text">
          <span className="font-semibold">{packName}</span> isn't marked as owned. You can plan here, but you'd need the pack to actually use {feature} in-game.
        </p>
        <button
          type="button"
          onClick={() => saveFileId && navigate(`/saves/${saveFileId}/settings/packs`)}
          className="mt-1.5 inline-flex items-center text-2xs font-semibold text-c-green hover:text-c-accent bg-transparent border-none cursor-pointer p-0 underline underline-offset-2 decoration-c-accent-border hover:decoration-c-accent transition-colors"
        >
          Open Pack Settings →
        </button>
      </div>
    </div>
  );
}
