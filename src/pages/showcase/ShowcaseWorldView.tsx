// One world of the showcase — rendered IN-PAGE by ShowcasePage (the URL
// stays /s/<slug>; there is nothing world-shaped to paste, ever). Ported
// from mockups/showcase/world-page-v8.html.
//
// Sections own their blocks: featured lots lead the lots band, featured
// households get editorial blocks above the roster. Which BAND leads is the
// save-level build-led rule with the per-world Move up/down pin as the
// escape hatch. Empty sections never render for visitors; a zero-photo
// world's lots section is a one-line lot-type stub.
//
// Edit grammar (shared with the front page): ★ Feature/Featured chips,
// labeled Hide chips (→ Other lots), drag the tile itself (grip badge),
// section headers hold only section-level controls.

import { useMemo, useState } from 'react';
import { DownloadSimple, ArrowLeft, CaretLeft, CaretDown, CaretUp, Eye, EyeSlash, Star, ArrowUp, ArrowDown, ArrowCounterClockwise, DotsSixVertical, HouseLine, UploadSimple } from '@phosphor-icons/react';
import { api } from '../../lib/api';
import {
  initials, lotKindLine, stageLabel, worldFeaturedLots, worldGridLots, worldOtherLots, worldLotTypeStub, worldLotsFirst,
  type DerivedShowcase, type DerivedWorld, type DerivedHousehold, type WorldLotEntry,
} from './derive';
import { EditableText, useSortable, moveItem, useFilePick, type SortableProps } from './editKit';
import { overlayClickGuard, type OverlayTarget } from './DetailOverlay';
import { AutoMap, CastRow, type EditCtx } from './ShowcasePage';
import type { ShowcasePayload } from './types';

function ResidentBubble({ h, round }: { h: DerivedHousehold; round?: boolean }) {
  return (
    <span className="sc-resident">
      <span className="sc-bub" style={round ? { borderRadius: '50%' } : undefined}>
        {h.portraitFilename
          ? <img className="sc-phimg" src={api.photoUrl(h.portraitFilename, 40)} alt="" loading="lazy" decoding="async" />
          : <span className="sc-hhPh" style={{ fontSize: 13, color: 'var(--c-faint)' }}>{initials(h.hh.name)}</span>}
      </span>
      <span className="sc-t">{h.hh.name}{!round && h.sims.length > 0 ? <span>{h.sims.length} {h.sims.length === 1 ? 'sim' : 'sims'}</span> : null}</span>
    </span>
  );
}

// drag = the pair from useSortable, already bound to this card's index:
// `item` marks the grid box, `handle` goes on the grab surface inside it.
interface BoundDrag { item: Record<string, unknown>; handle: ReturnType<SortableProps['handle']>; }

function FeaturedLotCard({ e, world, edit, drag, onOpen }: {
  e: WorldLotEntry; world: DerivedWorld; edit: EditCtx | null;
  drag?: BoundDrag; onOpen: (t: OverlayTarget) => void;
}) {
  return (
    <div className="sc-featCard" onClick={(ev) => { if (overlayClickGuard(ev)) onOpen({ kind: 'lot', lotKey: e.lot.lotKey }); }} {...(drag?.item ?? {})}>
      <div className={`sc-img ${edit ? 'sc-editGrab' : ''}`} {...(drag?.handle ?? {})}>
        {e.photo && <img className="sc-phimg" src={api.photoUrl(e.photo.filename, 700)} alt="" loading="lazy" decoding="async" />}
        {edit && (
          <>
            <div className="sc-featTools">
              <span
                className="sc-eChip"
                style={{ background: 'var(--c-secondary)', borderColor: 'var(--c-secondary)', color: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,.18)' }}
                onClick={() => edit.patchWorld(world.name, (ws) => ({ ...ws, featuredLots: (ws.featuredLots ?? []).filter((k) => k !== e.lot.lotKey) }))}
              >
                <Star size={12} weight="fill" className="sc-i" /> Featured
              </span>
            </div>
            <span className="sc-dragBadge"><DotsSixVertical size={12} /></span>
          </>
        )}
      </div>
      <div className="sc-body">
        <h3>{e.lot.customName || e.lot.lotName}</h3>
        <div className="sc-kind">{lotKindLine(e.lot)}</div>
        {edit && !e.lot.imported
          ? <EditableText tag="p" value={e.lot.description} placeholder="Add a description" onCommit={(t) => edit.setLotDescription(e.lot.lotKey, t)} className="sc-blurb" />
          : (e.lot.description ? <p className="sc-blurb">{e.lot.description}</p> : null)}
        {e.resident && <ResidentBubble h={e.resident} />}
      </div>
    </div>
  );
}

function LotCard({ e, world, edit, drag, onOpen }: {
  e: WorldLotEntry; world: DerivedWorld; edit: EditCtx | null;
  drag?: BoundDrag; onOpen: (t: OverlayTarget) => void;
}) {
  return (
    <div className="sc-lotCard" onClick={(ev) => { if (overlayClickGuard(ev)) onOpen({ kind: 'lot', lotKey: e.lot.lotKey }); }} {...(drag?.item ?? {})}>
      <div className={`sc-img ${edit ? 'sc-editGrab' : ''}`} {...(drag?.handle ?? {})}>
        {e.photo && <img className="sc-phimg" src={api.photoUrl(e.photo.filename, 320)} alt="" loading="lazy" decoding="async" />}
        {edit && (
          <>
            <div className="sc-cardChips">
              <span
                className={`sc-eChip ${edit.worldLotsFull(world.name) ? 'full' : ''}`}
                onClick={() => edit.featureLot(world.name, e.lot.lotKey)}
              >
                <Star size={12} className="sc-i" /> Feature
              </span>
              <span
                className="sc-eChip"
                onClick={() => edit.patchWorld(world.name, (ws) => ({ ...ws, hiddenLots: [...(ws.hiddenLots ?? []), e.lot.lotKey] }))}
              >
                <EyeSlash size={12} className="sc-i" /> Hide
              </span>
            </div>
            <span className="sc-dragBadge"><DotsSixVertical size={12} /></span>
          </>
        )}
      </div>
      <div className="sc-n">{e.lot.customName || e.lot.lotName}</div>
      <div className="sc-k">{lotKindLine(e.lot)}</div>
      {e.resident && <ResidentBubble h={e.resident} round />}
    </div>
  );
}

function FeaturedHouseholdBlock({ h, edit, drag, onOpen }: {
  h: DerivedHousehold; edit: EditCtx | null;
  drag?: BoundDrag; onOpen: (t: OverlayTarget) => void;
}) {
  const open = (ev: React.MouseEvent) => { if (overlayClickGuard(ev)) onOpen({ kind: 'hh', hhId: h.hh.id }); };
  const sub = [
    h.sims.length > 0 ? `${h.sims.length} ${h.sims.length === 1 ? 'sim' : 'sims'}` : null,
    h.homeLotName,
  ].filter(Boolean).join(' · ');
  const featuredChip = edit && (
    <div className="sc-featTools">
      <span
        className="sc-eChip"
        style={{ background: 'var(--c-secondary)', borderColor: 'var(--c-secondary)', color: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,.18)' }}
        onClick={() => edit.patchSettings((s) => ({ ...s, featuredHouseholds: edit.featuredHhIds().filter((id) => id !== h.hh.id) }))}
      >
        <Star size={12} weight="fill" className="sc-i" /> Featured
      </span>
    </div>
  );
  const body = (
    <div className="sc-body">
      <h3>{h.hh.name}</h3>
      {sub ? <div className="sc-kind">{sub}</div> : null}
      {edit && !h.hh.imported
        ? <EditableText tag="p" value={h.hh.description} placeholder="Add a description" onCommit={(t) => edit.setHouseholdDescription(h.hh.id, t)} className="sc-blurb" />
        : (h.hh.description ? <p className="sc-blurb">{h.hh.description}</p> : null)}
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
    </div>
  );
  if (!h.portraitFilename) {
    // No portrait → no portrait column at all; the body's named cast row
    // carries the block. The grip badge alone is the drag handle (the body
    // holds editable text, so the whole card can't be the grab surface).
    return (
      <div className="sc-hhFeat" onClick={open} {...(drag?.item ?? {})}>
        {featuredChip}
        {edit && (
          <span className="sc-dragBadge sc-editGrab" {...(drag?.handle ?? {})}>
            <DotsSixVertical size={12} />
          </span>
        )}
        {body}
      </div>
    );
  }
  return (
    <div className="sc-hhFeat" onClick={open} {...(drag?.item ?? {})}>
      <div className={`sc-por ${edit ? 'sc-editGrab' : ''}`} {...(drag?.handle ?? {})}>
        <img className="sc-phimg" src={api.photoUrl(h.portraitFilename, 220)} alt="" loading="lazy" decoding="async" />
        {featuredChip}
        {edit && <span className="sc-dragBadge"><DotsSixVertical size={12} /></span>}
      </div>
      {body}
    </div>
  );
}

function HouseholdRosterCard({ h, edit, onOpen }: { h: DerivedHousehold; edit: EditCtx | null; onOpen: (t: OverlayTarget) => void }) {
  const open = (ev: React.MouseEvent) => { if (overlayClickGuard(ev)) onOpen({ kind: 'hh', hhId: h.hh.id }); };
  const sub = [
    h.sims.length > 0 ? `${h.sims.length} ${h.sims.length === 1 ? 'sim' : 'sims'}` : null,
    h.homeLotName,
  ].filter(Boolean).join(' · ');
  const featureChip = edit && (
    <span
      className={`sc-eChip ${edit.hhBandFull() ? 'full' : ''}`}
      onClick={() => edit.featureHousehold(h.hh.id)}
    >
      <Star size={12} className="sc-i" /> Feature
    </span>
  );
  if (!h.portraitFilename) {
    // No portrait → the short compact card, same as the front band. The chip
    // sits in-flow beside the cast row so a big cast never collides with it.
    return (
      <div className="sc-hhCard compact" onClick={open}>
        <div className="sc-compactHead">
          <CastRow h={h} />
          {featureChip}
        </div>
        <div className="sc-n">{h.hh.name}</div>
        {sub ? <div className="sc-s">{sub}</div> : null}
      </div>
    );
  }
  return (
    <div className="sc-hhCard" onClick={open}>
      <div className="sc-img">
        {featureChip && <div className="sc-cardChips">{featureChip}</div>}
        <img className="sc-phimg" src={api.photoUrl(h.portraitFilename, 220)} alt="" loading="lazy" decoding="async" />
      </div>
      <div className="sc-n">{h.hh.name}</div>
      {sub ? <div className="sc-s">{sub}</div> : null}
    </div>
  );
}

export interface ShowcaseWorldViewProps {
  p: ShowcasePayload;
  d: DerivedShowcase;
  world: DerivedWorld;
  onVisit: (world: string | null) => void; // null = back to the front page
  edit: EditCtx | null;
  onOpen: (t: OverlayTarget) => void;      // lot/household detail overlay
}

export function ShowcaseWorldView({ p, d, world, onVisit, edit, onOpen }: ShowcaseWorldViewProps) {
  const idx = d.worlds.findIndex((w) => w.name === world.name);
  const prev = idx > 0 ? d.worlds[idx - 1] : null;
  const next = idx >= 0 && idx < d.worlds.length - 1 ? d.worlds[idx + 1] : null;

  const featured = useMemo(() => worldFeaturedLots(world), [world]);
  const grid = useMemo(() => worldGridLots(world), [world]);
  const others = useMemo(() => worldOtherLots(world), [world]);
  const hasLotPhotos = featured.length + grid.length > 0;
  const featuredHh = useMemo(
    () => d.featuredHouseholds.filter((h) => h.worldName === world.name),
    [d.featuredHouseholds, world.name],
  );
  const rosterHh = useMemo(() => {
    const featuredIds = new Set(featuredHh.map((h) => h.hh.id));
    // Portrait cards lead, cast-row cards follow — mixed heights read broken.
    return world.households
      .filter((h) => !featuredIds.has(h.hh.id))
      .sort((a, b) => (a.portraitFilename ? 0 : 1) - (b.portraitFilename ? 0 : 1));
  }, [world.households, featuredHh]);
  const lotsFirst = worldLotsFirst(world, d.buildLed);
  const bothSections = hasLotPhotos && (featuredHh.length + rosterHh.length > 0);
  // "Other lots" starts folded — it's reference, not reading material.
  const [othersOpen, setOthersOpen] = useState(false);

  const lotsShown = world.settings.lotsShown !== false;
  const hhShown = world.settings.hhShown !== false;

  // Drag orders. The grid's order materializes from what's on screen the
  // first time a tile is dragged.
  const featDrag = useSortable((from, to) => {
    edit?.patchWorld(world.name, (ws) => ({ ...ws, featuredLots: moveItem(ws.featuredLots ?? [], from, to) }));
  });
  const gridDrag = useSortable((from, to) => {
    if (!edit) return;
    const current = grid.map((e) => e.lot.lotKey);
    edit.patchWorld(world.name, (ws) => ({ ...ws, lotOrder: moveItem(current, from, to) }));
  });
  const featHhDrag = useSortable((from, to) => {
    if (!edit) return;
    // Reorder within this world's featured blocks, mapped back into the
    // global featured list (one list, every page interprets it).
    const ids = edit.featuredHhIds();
    const worldIds = featuredHh.map((h) => h.hh.id);
    const moved = moveItem(worldIds, from, to);
    let wi = 0;
    edit.patchSettings((s) => ({ ...s, featuredHouseholds: ids.map((id) => (worldIds.includes(id) ? moved[wi++] : id)) }));
  });
  const bind = (s: ReturnType<typeof useSortable>, i: number) => ({ item: s.item(i), handle: s.handle(i) });

  // Hero: their world photo, or the world's map art — never homework.
  const heroPhoto = world.settings.lead !== 'map' ? world.leadPhoto : null;

  // Upload a hero shot straight from your files; it becomes this world's
  // photo lead immediately.
  const [uploadBusy, setUploadBusy] = useState(false);
  const filePick = useFilePick(async (file) => {
    if (!edit) return;
    setUploadBusy(true);
    const sp = await edit.uploadShowcasePhoto(file, 'world', world.name);
    setUploadBusy(false);
    if (sp) edit.patchWorld(world.name, (ws) => ({ ...ws, lead: 'photo', leadPhotoId: sp.id }));
  });

  const sectTools = (which: 'lots' | 'hh') => edit && (
    <span className="sc-sectTools">
      {/* both Move chips just FLIP the two sections and pin the choice */}
      {bothSections && !(which === 'lots' && !hasLotPhotos) && (
        <span
          className="sc-eChip"
          onClick={() => edit.patchWorld(world.name, (ws) => ({ ...ws, sectionOrder: lotsFirst ? 'hh' : 'lots' }))}
        >
          {(which === 'lots') === lotsFirst
            ? <><ArrowDown size={12} className="sc-i" /> Move down</>
            : <><ArrowUp size={12} className="sc-i" /> Move up</>}
        </span>
      )}
      <span
        className="sc-eChip"
        style={(which === 'lots' ? lotsShown : hhShown) ? undefined : { opacity: .6 }}
        onClick={() => edit.patchWorld(world.name, (ws) => (which === 'lots' ? { ...ws, lotsShown: !lotsShown } : { ...ws, hhShown: !hhShown }))}
      >
        {(which === 'lots' ? lotsShown : hhShown)
          ? <><Eye size={12} className="sc-i" /> Shown</>
          : <><EyeSlash size={12} className="sc-i" /> Hidden</>}
      </span>
      {which === 'lots' && hasLotPhotos && world.settings.lotOrder && (
        <span className="sc-eChip" onClick={() => edit.patchWorld(world.name, (ws) => ({ ...ws, lotOrder: undefined }))}>
          <ArrowCounterClockwise size={12} className="sc-i" /> Reset order
        </span>
      )}
    </span>
  );

  const lotsBand = ((hasLotPhotos || world.lotEntries.length > 0) && (lotsShown || edit)) && (
    <section className="sc-band alt" key="lots" style={!lotsShown ? { opacity: .65 } : undefined}>
      <div className="sc-bandHead"><h2>The lots</h2>{sectTools('lots')}</div>
      {hasLotPhotos ? (
        <>
          {featured.length > 0 && (
            <div className="sc-featLotGrid">
              {featured.map((e, i) => (
                <FeaturedLotCard e={e} world={world} edit={edit} key={e.lot.lotKey} drag={edit ? bind(featDrag, i) : undefined} onOpen={onOpen} />
              ))}
            </div>
          )}
          {grid.length > 0 && (
            <div className="sc-lotGrid">
              {grid.map((e, i) => (
                <LotCard e={e} world={world} edit={edit} key={e.lot.lotKey} drag={edit ? bind(gridDrag, i) : undefined} onOpen={onOpen} />
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="sc-lotTypes">{worldLotTypeStub(world)}</p>
      )}
    </section>
  );

  const hhBand = ((featuredHh.length > 0 || rosterHh.length > 0) && (hhShown || edit)) && (
    <section className="sc-band tone" key="hh" style={!hhShown ? { opacity: .65 } : undefined}>
      <div className="sc-bandHead"><h2>The households</h2>{sectTools('hh')}</div>
      {featuredHh.length > 0 && (
        <div className="sc-featHHGrid">
          {featuredHh.map((h, i) => (
            <FeaturedHouseholdBlock h={h} edit={edit} key={h.hh.id} drag={edit ? bind(featHhDrag, i) : undefined} onOpen={onOpen} />
          ))}
        </div>
      )}
      {rosterHh.length > 0 && (
        <div className="sc-hhGrid">
          {rosterHh.map((h) => <HouseholdRosterCard h={h} edit={edit} key={h.hh.id} onOpen={onOpen} />)}
        </div>
      )}
    </section>
  );

  // Edit only: the world's other lots — unphotographed rows, and lots the
  // creator hid (those get Show back).
  const otherLotsBand = edit && others.length > 0 && (
    <div className="sc-hiddenBand">
      <button className="sc-hLbl" onClick={() => setOthersOpen((v) => !v)}>
        Other lots ({others.length}) {othersOpen ? <CaretUp size={11} weight="bold" /> : <CaretDown size={11} weight="bold" />}
      </button>
      {othersOpen && others.map((e) => (
        <div className="sc-hiddenRow" key={e.lot.lotKey}>
          <span className="sc-ic"><HouseLine size={16} /></span>
          <div>
            <div className="sc-n">{e.lot.customName || e.lot.lotName}</div>
            <div className="sc-why">{lotKindLine(e.lot)} · {e.hidden ? 'hidden by you' : 'no photo yet'}</div>
          </div>
          {e.hidden && (
            <span
              className="sc-eChip"
              onClick={() => edit.patchWorld(world.name, (ws) => ({ ...ws, hiddenLots: (ws.hiddenLots ?? []).filter((k) => k !== e.lot.lotKey) }))}
            >
              Show
            </span>
          )}
        </div>
      ))}
    </div>
  );

  const backCard = (nextSide: boolean) => (
    <button className={`sc-wnCard ${nextSide ? 'next' : ''}`} onClick={() => onVisit(null)} key={nextSide ? 'n' : 'p'}>
      {nextSide
        ? <img src="/3d-clay-plumbob.svg" alt="" style={{ width: 46, height: 46, objectFit: 'contain' }} />
        : <span style={{ width: 46, textAlign: 'center', color: 'var(--c-dim)' }}><ArrowLeft size={20} className="sc-i" /></span>}
      <span>
        <span className="sc-dir">Back to the save</span>
        <span className="sc-nm">{p.name}</span>
      </span>
    </button>
  );
  const worldCard = (w: DerivedWorld, nextSide: boolean) => (
    <button className={`sc-wnCard ${nextSide ? 'next' : ''}`} onClick={() => onVisit(w.name)} key={w.name}>
      {w.icon ? <img src={w.icon} alt="" /> : null}
      <span>
        <span className="sc-dir">{nextSide ? 'Next world' : 'Previous world'}</span>
        <span className="sc-nm">{w.name}</span>
        <span className="sc-ct">
          {w.photographedLotCount > 0 ? `${w.photographedLotCount} lots · ` : ''}{w.households.length} households
        </span>
      </span>
    </button>
  );

  return (
    <>
      <nav className="sc-wnav">
        <button className="sc-home" onClick={() => onVisit(null)}>
          <CaretLeft size={15} weight="bold" className="sc-i sc-caret" />
          <img src="/3d-clay-plumbob.svg" alt="" />
          <span>
            <span className="sc-nm">{p.name}</span>
            <span className="sc-by">by {p.creator.name ?? 'a MySaveFile creator'}</span>
          </span>
        </button>
        <div className="sc-row">
          {d.worlds.map((w) => (
            <button className={`sc-tn ${w.name === world.name ? 'act' : ''}`} key={w.name} title={w.name} onClick={() => onVisit(w.name)}>
              {w.icon ? <img src={w.icon} alt={w.name} /> : null}
            </button>
          ))}
        </div>
        {p.saveFileUrl && (
          <a className="sc-dlSm" href={p.saveFileUrl} target="_blank" rel="noopener noreferrer">
            <DownloadSimple size={13} weight="bold" className="sc-i" /> Download
          </a>
        )}
      </nav>

      <div className="sc-wheroWrap">
      {/* The scrim under the world's name is sized to what's behind it: a
          photo could be anything, the map art is bright and even. */}
      <div className={`sc-whero ${heroPhoto ? '' : 'mapLead'}`}>
        {heroPhoto
          ? <img className="sc-phimg" src={api.photoUrl(heroPhoto.filename, 1300)} alt="" />
          : <AutoMap worldName={world.name} entries={world.lotEntries} interactive />}
        <div className="sc-scrim" />
        {edit && (
          <div className="sc-heroChips">
            {/* "Your photo" appears once a world photo exists — and Upload is
                the ONLY way to add one (the planner's built-photo flows target
                lots and households; the Photos page is inspo). Auto map +
                Upload always show, so the row reads the same on every world. */}
            {world.worldPhotos.length > 0 && (
              <span
                className={`sc-eChip ${heroPhoto ? 'sel' : ''}`}
                style={heroPhoto ? { background: 'var(--c-secondary)', borderColor: 'var(--c-secondary)', color: '#fff' } : { background: '#fff' }}
                onClick={() => edit.patchWorld(world.name, (ws) => ({ ...ws, lead: 'photo' }))}
              >
                Your photo
              </span>
            )}
            <span
              className={`sc-eChip ${!heroPhoto ? 'sel' : ''}`}
              style={!heroPhoto ? { background: 'var(--c-secondary)', borderColor: 'var(--c-secondary)', color: '#fff' } : { background: '#fff' }}
              onClick={() => edit.patchWorld(world.name, (ws) => ({ ...ws, lead: 'map' }))}
            >
              Auto map
            </span>
            <span className="sc-eChip" style={{ background: '#fff' }} onClick={filePick.open}>
              <UploadSimple size={12} weight="bold" className="sc-i" /> {uploadBusy ? 'Uploading…' : 'Upload a photo'}
            </span>
            {filePick.input}
          </div>
        )}
        <div className="sc-wheroInner">
          {world.icon && <img className="sc-crest" src={world.icon} alt="" />}
          <div>
            <h1>{world.name}</h1>
            <div className="sc-stats"><b>{p.name}</b> · by {p.creator.name ?? 'a MySaveFile creator'}</div>
          </div>
        </div>
      </div>
      </div>

      {(world.blurb || edit) && (
        <div className="sc-intro">
          {edit
            ? <EditableText tag="p" value={world.blurb} placeholder="Add a description" onCommit={(t) => edit.setBlurb(world.name, t)} className="sc-desc" />
            : <p className="sc-desc">{world.blurb}</p>}
        </div>
      )}

      {lotsFirst ? <>{lotsBand}{hhBand}</> : <>{hhBand}{lotsBand}</>}

      <section className="sc-worldNext">
        {prev ? worldCard(prev, false) : backCard(false)}
        {next ? worldCard(next, true) : backCard(true)}
      </section>

      {p.saveFileUrl && (
        <section className="sc-wclosing">
          <h2>Download {p.name}</h2>
          <div>
            <a className="sc-dl" href={p.saveFileUrl} target="_blank" rel="noopener noreferrer" style={{ marginTop: 18 }}>
              <DownloadSimple size={16} weight="bold" className="sc-i" /> Download this save
            </a>
          </div>
        </section>
      )}

      {otherLotsBand}
    </>
  );
}
