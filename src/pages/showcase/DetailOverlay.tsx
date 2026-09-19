// Click a lot or a household anywhere on the showcase → this overlay, so a
// visitor can actually look at the thing: the photos big, the description,
// the cast. One layer, on top of whichever page you were on — closing puts
// you exactly back. Lot residents cross-link to their household and a
// household's home lot links back, all inside the overlay.

import { useEffect } from 'react';
import { X, HouseLine } from '@phosphor-icons/react';
import { api } from '../../lib/api';
import { initials, lotKindLine, stageLabel, type DerivedShowcase, type DerivedHousehold } from './derive';
import { EditableText } from './editKit';
import type { EditCtx } from './ShowcasePage';
import type { ShowcasePayload, ShowcasePhoto } from './types';

export type OverlayTarget = { kind: 'lot'; lotKey: string } | { kind: 'hh'; hhId: string };

/** Card onClick guard: a click that belongs to a control inside the card
    (chips, the corner X, the grip badge, links, editable text) never opens
    the overlay. */
export function overlayClickGuard(e: React.MouseEvent): boolean {
  return !(e.target as HTMLElement).closest('.sc-eChip, .sc-hhX, .sc-dragBadge, button, a, [contenteditable]');
}

function photosFor(p: ShowcasePayload, targetType: string, targetKey: string): ShowcasePhoto[] {
  return p.photos.filter((ph) => ph.targetType === targetType && ph.targetKey === targetKey);
}

/**
 * The overlay opens on a picture the card behind it was already showing, so
 * the card-sized version (320) is certain to be in cache — paint it as the
 * stage's background and the hero is there the instant you click, with the
 * full-size image landing on top when it arrives. Without this you get an
 * empty stage for as long as a 1440px download takes.
 */
function heroStage(filename: string, contain: boolean): React.CSSProperties {
  return {
    backgroundImage: `url(${api.photoUrl(filename, 320)})`,
    backgroundSize: contain ? 'contain' : 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}

function ResidentRow({ hhs, onOpen }: { hhs: DerivedHousehold[]; onOpen: (t: OverlayTarget) => void }) {
  if (hhs.length === 0) return null;
  return (
    <div className="sc-ovResidents">
      {hhs.map((h) => (
        <button className="sc-ovResident" key={h.hh.id} onClick={() => onOpen({ kind: 'hh', hhId: h.hh.id })}>
          <span className="sc-bub">
            {h.portraitFilename
              ? <img className="sc-phimg" src={api.photoUrl(h.portraitFilename, 40)} alt="" />
              : <span className="sc-hhPh" style={{ fontSize: 12, color: 'var(--c-faint)' }}>{initials(h.hh.name)}</span>}
          </span>
          <span className="sc-t">{h.hh.name}<span>{h.sims.length} {h.sims.length === 1 ? 'sim' : 'sims'}</span></span>
        </button>
      ))}
    </div>
  );
}

export function DetailOverlay({ p, d, target, onOpen, onClose, edit }: {
  p: ShowcasePayload;
  d: DerivedShowcase;
  target: OverlayTarget;
  onOpen: (t: OverlayTarget) => void;
  onClose: () => void;
  edit: EditCtx | null;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  let body: React.ReactNode = null;

  if (target.kind === 'lot') {
    const lot = p.lots.find((l) => l.lotKey === target.lotKey);
    if (!lot) return null;
    const photos = photosFor(p, 'lot', lot.lotKey);
    const residents = lot.householdIds
      .map((id) => d.allHouseholds.find((h) => h.hh.id === id))
      .filter((h): h is DerivedHousehold => !!h);
    body = (
      <>
        {photos.length > 0 && (
          <div className="sc-ovHero" style={heroStage(photos[0].filename, false)}>
            <img className="sc-phimg" src={api.photoUrl(photos[0].filename, 1100)} alt="" decoding="async" />
          </div>
        )}
        <div className="sc-ovBody">
          <h2>{lot.customName || lot.lotName}</h2>
          <div className="sc-ovKind">{lotKindLine(lot)} · {lot.worldName}</div>
          {edit && !lot.imported
            ? <EditableText tag="p" value={lot.description} placeholder="Add a description" onCommit={(t) => edit.setLotDescription(lot.lotKey, t)} className="sc-ovDesc" />
            : (lot.description ? <p className="sc-ovDesc">{lot.description}</p> : null)}
          <ResidentRow hhs={residents} onOpen={onOpen} />
          {photos.length > 1 && (
            <div className="sc-ovGrid">
              {photos.slice(1).map((ph) => (
                <div className="sc-ovCell" key={ph.id}><img className="sc-phimg" src={api.photoUrl(ph.filename, 600)} alt="" loading="lazy" decoding="async" /></div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  } else {
    const h = d.allHouseholds.find((x) => x.hh.id === target.hhId);
    if (!h) return null;
    const morePhotos = photosFor(p, 'household', h.hh.id)
      .filter((ph) => ph.filename !== h.portraitFilename);
    const homeLotKey = h.hh.assignedLotKey;
    body = (
      <>
        {h.portraitFilename && (
          <div className="sc-ovHero por" style={heroStage(h.portraitFilename, true)}>
            <img className="sc-phimg" src={api.photoUrl(h.portraitFilename, 1100)} alt="" decoding="async" />
          </div>
        )}
        <div className="sc-ovBody">
          <h2>{h.hh.name}</h2>
          <div className="sc-ovKind">
            {h.sims.length > 0 && `${h.sims.length} ${h.sims.length === 1 ? 'sim' : 'sims'}`}
            {h.sims.length > 0 && h.homeLotName && ' · '}
            {h.homeLotName && (homeLotKey
              ? <button className="sc-ovLotLink" onClick={() => onOpen({ kind: 'lot', lotKey: homeLotKey })}>
                  <HouseLine size={13} className="sc-i" /> {h.homeLotName}{h.worldName ? `, ${h.worldName}` : ''}
                </button>
              : `${h.homeLotName}${h.worldName ? `, ${h.worldName}` : ''}`)}
          </div>
          {edit && !h.hh.imported
            ? <EditableText tag="p" value={h.hh.description} placeholder="Add a description" onCommit={(t) => edit.setHouseholdDescription(h.hh.id, t)} className="sc-ovDesc" />
            : (h.hh.description ? <p className="sc-ovDesc">{h.hh.description}</p> : null)}
          {h.sims.length > 0 && (
            <div className="sc-simRow">
              {h.sims.map((sim) => (
                <div className={`sc-sim ${sim.gender === 'male' ? 'm' : 'f'}`} key={sim.id}>
                  <div className="sc-c">{(sim.firstName || '?')[0]}</div>
                  <div className="sc-nm">{sim.firstName}</div>
                  <div className="sc-st">{stageLabel(sim)}</div>
                </div>
              ))}
            </div>
          )}
          {morePhotos.length > 0 && (
            <div className="sc-ovGrid">
              {morePhotos.map((ph) => (
                <div className="sc-ovCell" key={ph.id}><img className="sc-phimg" src={api.photoUrl(ph.filename, 600)} alt="" loading="lazy" decoding="async" /></div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="sc-ovScrim" onClick={onClose}>
      <div className={`sc-ovPanel ${target.kind === 'hh' ? 'hh' : ''}`} onClick={(e) => e.stopPropagation()}>
        <button className="sc-ovX" onClick={onClose} aria-label="Close"><X size={16} weight="bold" /></button>
        {body}
      </div>
    </div>
  );
}
