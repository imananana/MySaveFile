import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  House,
  Users,
  Heart,
  CalendarDots,
  Storefront,
  ImageSquare,
  GearSix,
  Sparkle,
  PlusCircle,
  Check,
  Warning,
  ArrowRight,
  List,
} from '@phosphor-icons/react';

type Direction = {
  id: string;
  name: string;
  tagline: string;
  tokens: {
    base: string;
    card: string;
    panel: string;
    text: string;
    muted: string;
    dim: string;
    border: string;
    accent: string;
    accentHover: string;
    accentSoft: string;
    secondary: string;
    secondarySoft: string;
    warn: string;
    warnBg: string;
    warnBorder: string;
  };
  display: { family: string; weight: number; tracking: string };
  body: { family: string };
  radius: { sm: string; md: string; lg: string };
};

const JAKARTA_DISPLAY = { family: "'Plus Jakarta Sans', sans-serif", weight: 700, tracking: '-0.015em' };
const JAKARTA_BODY = { family: "'Plus Jakarta Sans', sans-serif" };
const STD_RADIUS = { sm: '6px', md: '10px', lg: '14px' };

// All variants of B share: Plus Jakarta typography, green primary, plum secondary.
// They differ only in canvas warmth / contrast between base, card, and panel.
const DIRECTIONS: Direction[] = [
  {
    id: 'B1',
    name: 'Whisper warm',
    tagline: "Barely-there warmth. Canvas is almost white but with a hint of cream so it doesn't feel clinical. Closest to today's gray-white in feel — just shifted half a degree toward warm.",
    tokens: {
      base: '#fdfbf6',
      card: '#ffffff',
      panel: '#f6f2ea',
      text: '#1a1714',
      muted: '#4b4439',
      dim: '#857c6f',
      border: '#ece6da',
      accent: '#16a34a',
      accentHover: '#15803d',
      accentSoft: '#ecfdf3',
      secondary: '#7c5cbf',
      secondarySoft: '#f3eefb',
      warn: '#b45309',
      warnBg: '#fdf6e7',
      warnBorder: '#f3e2b3',
    },
    display: JAKARTA_DISPLAY,
    body: JAKARTA_BODY,
    radius: STD_RADIUS,
  },
  {
    id: 'B2',
    name: 'Cream (current)',
    tagline: "The version you saw and liked. Cream off-white canvas with white cards — clear elevation between base and surfaces. The committed-but-not-loud warmth.",
    tokens: {
      base: '#faf8f4',
      card: '#ffffff',
      panel: '#f3efe7',
      text: '#1a1714',
      muted: '#4b4439',
      dim: '#7a7268',
      border: '#e8e1d4',
      accent: '#16a34a',
      accentHover: '#15803d',
      accentSoft: '#ecfdf3',
      secondary: '#7c5cbf',
      secondarySoft: '#f3eefb',
      warn: '#b45309',
      warnBg: '#fdf6e7',
      warnBorder: '#f3e2b3',
    },
    display: JAKARTA_DISPLAY,
    body: JAKARTA_BODY,
    radius: STD_RADIUS,
  },
  {
    id: 'B3',
    name: 'Linen',
    tagline: "Goes further with warmth. Canvas reads as soft linen, cards still white but with slightly more saturated panels. More distinctive but also more commitment — the app feels less like a generic SaaS and more like a personal planner.",
    tokens: {
      base: '#f5efe1',
      card: '#fefcf7',
      panel: '#ece4d2',
      text: '#1d1813',
      muted: '#4d4538',
      dim: '#7c7263',
      border: '#dfd5bf',
      accent: '#16a34a',
      accentHover: '#15803d',
      accentSoft: '#ecfdf3',
      secondary: '#7c5cbf',
      secondarySoft: '#f1ebfb',
      warn: '#a25113',
      warnBg: '#f9ecc8',
      warnBorder: '#e6c984',
    },
    display: JAKARTA_DISPLAY,
    body: JAKARTA_BODY,
    radius: STD_RADIUS,
  },
  {
    id: 'B4',
    name: 'White canvas, warm chrome',
    tagline: "Inverts the warmth: keeps a true-white canvas (most familiar / SaaS-safe) but introduces warmth in panels, sidebar surfaces, and borders. Lets warmth live in chrome rather than the main reading area.",
    tokens: {
      base: '#ffffff',
      card: '#ffffff',
      panel: '#f4efe5',
      text: '#191613',
      muted: '#4a4339',
      dim: '#7d7468',
      border: '#e9e2d4',
      accent: '#16a34a',
      accentHover: '#15803d',
      accentSoft: '#ecfdf3',
      secondary: '#7c5cbf',
      secondarySoft: '#f3eefb',
      warn: '#b45309',
      warnBg: '#fdf6e7',
      warnBorder: '#f3e2b3',
    },
    display: JAKARTA_DISPLAY,
    body: JAKARTA_BODY,
    radius: STD_RADIUS,
  },
];

// Secondary-accent alternatives, rendered against the cream (B2) canvas so they
// can be compared in identical context.
const SECONDARY_ALTERNATIVES: { name: string; secondary: string; secondarySoft: string; note: string }[] = [
  { name: 'Plum (current)',   secondary: '#7c5cbf', secondarySoft: '#f3eefb', note: 'Cool, regal, distinct from green.' },
  { name: 'Terracotta',       secondary: '#c2664a', secondarySoft: '#fbeee9', note: 'Warm, earthy, harmonizes with linen canvas.' },
  { name: 'Deep teal',        secondary: '#0f7a83', secondarySoft: '#e6f4f5', note: 'Cool counterpart to green, more grown-up.' },
  { name: 'Mustard',          secondary: '#b88a1c', secondarySoft: '#fbf2dc', note: 'Warm and gold-leaning. Risk of feeling autumn-y.' },
  { name: 'Dusty rose',       secondary: '#b8607c', secondarySoft: '#fbecf1', note: 'Soft and friendly. Risk of feeling too soft.' },
  { name: 'Slate blue',       secondary: '#5a6fb8', secondarySoft: '#eaecf7', note: 'Safe, neutral, very SaaS.' },
];

export default function StyleGuide() {
  return (
    <div className="min-h-screen bg-c-base text-c-text" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="border-b border-c-border bg-c-card px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-c-dim mb-1">Dev · Style guide · Direction B variants</div>
            <h1 className="text-2xl font-bold text-c-text">Refining the warm canvas</h1>
            <p className="text-sm text-c-muted mt-1 max-w-2xl">
              All four variants share Plus Jakarta Sans + green primary + plum secondary. They differ only in canvas warmth: from barely-there to committed linen, plus a "white canvas, warm chrome" inversion. Pick the canvas, then scroll down to see secondary-accent alternatives.
            </p>
          </div>
          <Link to="/saves" className="text-sm text-c-dim hover:text-c-text transition-colors no-underline">
            Back to saves
          </Link>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {DIRECTIONS.map((d) => <DirectionColumn key={d.id} direction={d} />)}
        </div>

        <section className="mt-12 border-t border-c-border pt-8">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-c-text mb-1">Secondary accent — alternatives to plum</h2>
            <p className="text-sm text-c-muted max-w-2xl">
              All rendered against the cream (B2) canvas so they're directly comparable. The secondary shows up on nav-active states, "custom" indicators, and decorative inline links.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {SECONDARY_ALTERNATIVES.map((alt) => (
              <SecondaryPreview key={alt.name} alt={alt} />
            ))}
          </div>
        </section>

        <section className="mt-12 border-t border-c-border pt-8">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-c-text mb-1">Brand mark · plumbob in context</h2>
            <p className="text-sm text-c-muted max-w-2xl">
              Three placements on the cream B2 canvas: sidebar brand header, loading state (with float animation), and login hero. The plumbob lives at <code className="text-xs">/3d-clay-plumbob.svg</code>.
            </p>
          </div>
          <PlumbobShowcase />
        </section>

        <section className="mt-12 border-t border-c-border pt-8">
          <h2 className="text-lg font-bold text-c-text mb-3">Phosphor icons — sample inventory</h2>
          <p className="text-sm text-c-muted mb-4">
            A taste of what's available. Phosphor ships ~9,000 icons across 6 weights (thin / light / regular / bold / fill / duotone). Each is tree-shaken on import.
          </p>
          <IconInventory />
        </section>

        <section className="mt-12 border-t border-c-border pt-8">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-c-text mb-1">Lot category colors — crispier V2</h2>
            <p className="text-sm text-c-muted max-w-2xl">
              First round (earthy / parchment) felt twee + sepia. Take 2: three crispier palettes, each shown with progressively more color real estate per card — pill only, pill + left stripe, then pill + stripe + full cover gradient. Pick the palette AND the treatment density that lands.
            </p>
          </div>
          <LotCategoryComparison />
        </section>

        <section className="mt-12 border-t border-c-border pt-8 pb-16">
          <h2 className="text-lg font-bold text-c-text mb-3">Notes for review</h2>
          <ul className="text-sm text-c-muted space-y-2 max-w-3xl">
            <li>• Every variant uses the <strong className="text-c-text">same</strong> component shapes — only canvas/border/panel tokens differ. So if one feels nicer than another, that's the canvas talking.</li>
            <li>• Plus Jakarta Sans is loaded for all four; primary stays green; secondary stays plum (until you pick a different one from the section below).</li>
            <li>• <strong className="text-c-text">B2</strong> is the version you saw before. <strong className="text-c-text">B1</strong> dials warmth down, <strong className="text-c-text">B3</strong> dials it up, <strong className="text-c-text">B4</strong> keeps a white canvas and moves warmth into chrome.</li>
            <li>• Nothing here ships. This route is not linked from anywhere — accessible only via <code className="text-xs">/dev/style</code>.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

function DirectionColumn({ direction: d }: { direction: Direction }) {
  const t = d.tokens;
  return (
    <div
      className="flex flex-col gap-5 rounded-xl border p-5"
      style={{
        backgroundColor: t.base,
        borderColor: t.border,
        color: t.text,
        fontFamily: d.body.family,
      }}
    >
      {/* Title strip */}
      <div className="flex items-baseline gap-3">
        <div className="text-2xl font-bold" style={{ fontFamily: d.display.family, fontWeight: d.display.weight, letterSpacing: d.display.tracking, color: t.text }}>
          {d.name}
        </div>
        <div className="text-xs uppercase tracking-widest" style={{ color: t.dim }}>Direction {d.id}</div>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: t.muted }}>{d.tagline}</p>

      {/* Palette swatches */}
      <Block label="Palette" muted={t.dim}>
        <div className="grid grid-cols-4 gap-2">
          <Swatch hex={t.base} label="base" border={t.border} text={t.text} />
          <Swatch hex={t.card} label="card" border={t.border} text={t.text} />
          <Swatch hex={t.panel} label="panel" border={t.border} text={t.text} />
          <Swatch hex={t.border} label="border" border={t.border} text={t.text} />
          <Swatch hex={t.accent} label="accent" border={t.border} text="#fff" />
          <Swatch hex={t.accentSoft} label="accent-soft" border={t.border} text={t.text} />
          <Swatch hex={t.secondary} label="secondary" border={t.border} text="#fff" />
          <Swatch hex={t.secondarySoft} label="sec-soft" border={t.border} text={t.text} />
        </div>
      </Block>

      {/* Type ramp */}
      <Block label="Type" muted={t.dim}>
        <div className="space-y-2" style={{ backgroundColor: t.card, padding: '16px', borderRadius: d.radius.md, border: `1px solid ${t.border}` }}>
          <div style={{ fontFamily: d.display.family, fontWeight: d.display.weight, fontSize: '28px', lineHeight: 1.15, color: t.text, letterSpacing: d.display.tracking }}>
            Willow Creek
          </div>
          <div style={{ fontFamily: d.display.family, fontWeight: d.display.weight, fontSize: '18px', lineHeight: 1.3, color: t.text, letterSpacing: d.display.tracking }}>
            Section heading
          </div>
          <div style={{ fontSize: '14px', lineHeight: 1.55, color: t.text }}>
            Body text reads at fourteen pixels — the planner's default. Long descriptive paragraphs and most card content live at this size.
          </div>
          <div style={{ fontSize: '12px', color: t.muted }}>Secondary / muted — label or meta</div>
          <div style={{ fontSize: '11px', color: t.dim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Caption · tertiary</div>
        </div>
      </Block>

      {/* Buttons */}
      <Block label="Buttons" muted={t.dim}>
        <div className="flex flex-wrap gap-2">
          <button style={btnPrimary(t, d)}>
            <PlusCircle size={16} weight="bold" /> Primary
          </button>
          <button style={btnSecondary(t, d)}>
            Secondary
          </button>
          <button style={btnGhost(t, d)}>
            Ghost
          </button>
          <button style={btnDanger(t, d)}>
            Destructive
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <button style={btnAccentSoft(t, d)}>
            <Sparkle size={14} weight="fill" /> Soft accent
          </button>
          <button style={btnSecondarySoft(t, d)}>
            <Heart size={14} weight="fill" /> Soft secondary
          </button>
        </div>
      </Block>

      {/* LotCard mockup */}
      <Block label="Lot card" muted={t.dim}>
        <div style={{ backgroundColor: t.card, borderRadius: d.radius.lg, border: `1px solid ${t.border}`, overflow: 'hidden' }}>
          <div style={{ height: '90px', background: `linear-gradient(135deg, ${t.accentSoft}, ${t.secondarySoft})`, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, padding: '3px 8px', borderRadius: 999, backgroundColor: t.card, color: t.muted, border: `1px solid ${t.border}`, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              Residential
            </div>
            <House size={28} color={t.accent} weight="duotone" style={{ position: 'absolute', bottom: 8, left: 10 }} />
          </div>
          <div style={{ padding: '12px 14px' }}>
            <div style={{ fontFamily: d.display.family, fontWeight: d.display.weight, fontSize: '16px', color: t.text, letterSpacing: d.display.tracking }}>
              Crick Cabana
            </div>
            <div style={{ fontSize: '12px', color: t.dim, marginTop: 2 }}>30×20 · Willow Creek</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: t.muted }}>
              <Users size={14} weight="fill" color={t.accent} />
              <span>Goth family</span>
              <span style={{ color: t.dim }}>·</span>
              <span style={{ color: t.dim }}>4 sims</span>
            </div>
          </div>
        </div>
      </Block>

      {/* Empty state */}
      <Block label="Empty state" muted={t.dim}>
        <div style={{ backgroundColor: t.card, borderRadius: d.radius.lg, border: `1px dashed ${t.border}`, padding: '24px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', padding: '12px', backgroundColor: t.accentSoft, borderRadius: '50%', marginBottom: '12px' }}>
            <ImageSquare size={24} weight="duotone" color={t.accent} />
          </div>
          <div style={{ fontFamily: d.display.family, fontWeight: d.display.weight, fontSize: '17px', color: t.text, marginBottom: '4px', letterSpacing: d.display.tracking }}>
            No inspo yet
          </div>
          <div style={{ fontSize: '13px', color: t.muted, marginBottom: '14px', maxWidth: '280px', margin: '0 auto 14px' }}>
            Drop in screenshots or Pinterest finds to start building a reference library for this save.
          </div>
          <button style={btnPrimary(t, d)}>
            <PlusCircle size={16} weight="bold" /> Add inspo
          </button>
        </div>
      </Block>

      {/* Warning surface */}
      <Block label="Warning" muted={t.dim}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', backgroundColor: t.warnBg, border: `1px solid ${t.warnBorder}`, borderRadius: d.radius.md }}>
          <Warning size={18} weight="fill" color={t.warn} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: t.text, lineHeight: 1.45 }}>
            <div style={{ fontWeight: 600 }}>No download link set yet.</div>
            <div style={{ color: t.muted, fontSize: 12, marginTop: 2 }}>
              Visitors can view your showcase but won't be able to download the .save itself.
            </div>
          </div>
        </div>
      </Block>

      {/* Nav row mock */}
      <Block label="Sidebar items (active + hover)" muted={t.dim}>
        <div style={{ backgroundColor: t.card, borderRadius: d.radius.md, border: `1px solid ${t.border}`, padding: '6px' }}>
          <NavRow t={t} d={d} active>
            <House size={16} weight="fill" /> Worlds
          </NavRow>
          <NavRow t={t} d={d}>
            <Users size={16} weight="regular" /> Households
          </NavRow>
          <NavRow t={t} d={d}>
            <Heart size={16} weight="regular" /> Sims
          </NavRow>
          <NavRow t={t} d={d}>
            <Storefront size={16} weight="regular" /> Small businesses
          </NavRow>
          <NavRow t={t} d={d}>
            <CalendarDots size={16} weight="regular" /> Holidays
          </NavRow>
          <NavRow t={t} d={d}>
            <GearSix size={16} weight="regular" /> Settings
          </NavRow>
        </div>
      </Block>

      {/* Status pills */}
      <Block label="Pills & chips" muted={t.dim}>
        <div className="flex flex-wrap gap-2">
          <Pill bg={t.accentSoft} fg={t.accent} border={t.accent}>
            <Check size={12} weight="bold" /> Assigned
          </Pill>
          <Pill bg={t.warnBg} fg={t.warn} border={t.warnBorder}>
            Unassigned
          </Pill>
          <Pill bg={t.secondarySoft} fg={t.secondary} border={t.secondary}>
            <Sparkle size={12} weight="fill" /> Custom
          </Pill>
          <Pill bg={t.panel} fg={t.muted} border={t.border}>
            30×20
          </Pill>
        </div>
      </Block>

      {/* CTA link */}
      <Block label="Inline link" muted={t.dim}>
        <div style={{ fontSize: 14, color: t.muted, lineHeight: 1.55 }}>
          When you're ready, head to{' '}
          <a style={{ color: t.accent, textDecoration: 'underline', textUnderlineOffset: '3px', textDecorationThickness: '1.5px', cursor: 'pointer' }}>
            Save Settings
          </a>{' '}
          to add a download link. Then share with{' '}
          <a style={{ color: t.secondary, textDecoration: 'underline', textUnderlineOffset: '3px', textDecorationThickness: '1.5px', cursor: 'pointer' }}>
            anyone on the internet
          </a>.
          <button style={{ ...btnGhost(t, d), marginTop: 10, display: 'inline-flex' }}>
            Read the docs <ArrowRight size={14} weight="bold" />
          </button>
        </div>
      </Block>
    </div>
  );
}

function Block({ label, muted, children }: { label: string; muted: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: muted, fontWeight: 600, marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Swatch({ hex, label, border, text }: { hex: string; label: string; border: string; text: string }) {
  return (
    <div style={{ backgroundColor: hex, border: `1px solid ${border}`, borderRadius: 6, padding: '8px 6px', minHeight: 52, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 9, color: text, opacity: 0.7, fontFamily: 'monospace' }}>{hex}</div>
      <div style={{ fontSize: 10, color: text, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function NavRow({ t, d, active, children }: { t: Direction['tokens']; d: Direction; active?: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        borderRadius: d.radius.sm,
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? t.accent : t.muted,
        backgroundColor: active ? t.accentSoft : 'transparent',
        cursor: 'pointer',
      }}
    >
      {children}
    </div>
  );
}

function Pill({ bg, fg, border, children }: { bg: string; fg: string; border: string; children: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px', borderRadius: 999, backgroundColor: bg, color: fg, border: `1px solid ${border}33`, fontWeight: 600 }}>
      {children}
    </span>
  );
}

function btnPrimary(t: Direction['tokens'], d: Direction): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    backgroundColor: t.accent, color: '#fff', border: 'none',
    padding: '8px 14px', borderRadius: d.radius.md, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: d.body.family,
  };
}

function btnSecondary(t: Direction['tokens'], d: Direction): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    backgroundColor: t.card, color: t.text, border: `1px solid ${t.border}`,
    padding: '7px 13px', borderRadius: d.radius.md, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: d.body.family,
  };
}

function btnGhost(t: Direction['tokens'], d: Direction): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    backgroundColor: 'transparent', color: t.muted, border: 'none',
    padding: '7px 10px', borderRadius: d.radius.md, fontSize: 13, fontWeight: 500,
    cursor: 'pointer', fontFamily: d.body.family,
  };
}

function btnDanger(_t: Direction['tokens'], d: Direction): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    backgroundColor: '#fef2f2', color: '#dc2626', border: `1px solid #fecaca`,
    padding: '7px 13px', borderRadius: d.radius.md, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: d.body.family,
  };
}

function btnAccentSoft(t: Direction['tokens'], d: Direction): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    backgroundColor: t.accentSoft, color: t.accent, border: `1px solid ${t.accent}33`,
    padding: '7px 13px', borderRadius: d.radius.md, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: d.body.family,
  };
}

function btnSecondarySoft(t: Direction['tokens'], d: Direction): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    backgroundColor: t.secondarySoft, color: t.secondary, border: `1px solid ${t.secondary}33`,
    padding: '7px 13px', borderRadius: d.radius.md, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: d.body.family,
  };
}

function PlumbobShowcase() {
  // Cream (B2) tokens locked in for these previews.
  const base = '#faf8f4';
  const card = '#ffffff';
  const panel = '#f3efe7';
  const text = '#1a1714';
  const muted = '#4b4439';
  const dim = '#7a7268';
  const border = '#e8e1d4';
  const accent = '#16a34a';
  const accentSoft = '#ecfdf3';
  const secondary = '#7c5cbf';
  const fam = "'Plus Jakarta Sans', sans-serif";
  const PLUMBOB = '/3d-clay-plumbob.svg';

  return (
    <>
      <style>{`
        @keyframes plumbob-bob {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-7px); }
        }
        .plumbob-bob { animation: plumbob-bob 2.4s ease-in-out infinite; }
        @keyframes plumbob-pulse {
          0%, 100% { opacity: 0.22; transform: scale(1); }
          50%      { opacity: 0.42; transform: scale(1.15); }
        }
        .plumbob-glow { animation: plumbob-pulse 2.4s ease-in-out infinite; }
        @keyframes plumbob-spin-bob {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50%      { transform: translateY(-5px) rotate(8deg); }
        }
        .plumbob-tiny-bob { animation: plumbob-spin-bob 3s ease-in-out infinite; }
      `}</style>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* 1. Sidebar brand — bigger plumbob, vertical breathing room */}
        <PreviewCard label="Sidebar brand header" base={base} border={border} dim={dim}>
          <div style={{ display: 'flex', minHeight: 320, fontFamily: fam }}>
            <div style={{ width: 220, backgroundColor: card, borderRight: `1px solid ${border}`, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '20px 16px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${border}` }}>
                <img src={PLUMBOB} alt="" style={{ height: 44, width: 'auto', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: text, letterSpacing: '-0.015em', lineHeight: 1.1 }}>MySaveFile</div>
                  <div style={{ fontSize: 10, color: dim, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>The Sims 4</div>
                </div>
              </div>
              <div style={{ padding: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: accent, backgroundColor: accentSoft }}>
                  <House size={14} weight="fill" /> Worlds
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, color: muted }}>
                  <Users size={14} weight="regular" /> Households
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, color: secondary, backgroundColor: '#f3eefb' }}>
                  <Sparkle size={14} weight="fill" /> Custom Venues
                </div>
              </div>
            </div>
            <div style={{ flex: 1, padding: 16, fontSize: 11, color: dim }}>main content</div>
          </div>
        </PreviewCard>

        {/* 2. Mobile topbar — plumbob only appears when sidebar is hidden */}
        <PreviewCard label="Mobile topbar (sidebar hidden) — plumbob carries the brand here" base={base} border={border} dim={dim}>
          <div style={{ minHeight: 320, fontFamily: fam, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 24 }}>
            {/* Phone frame */}
            <div style={{ width: 280, backgroundColor: card, border: `1px solid ${border}`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 4px 14px rgba(0,0,0,0.06)' }}>
              <div style={{ padding: '12px 14px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                <button style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: muted, display: 'inline-flex' }}>
                  <List size={20} weight="bold" />
                </button>
                <img src={PLUMBOB} alt="" style={{ height: 24, width: 'auto', flexShrink: 0 }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: text, letterSpacing: '-0.01em', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Willow Creek revival</div>
                <div style={{ width: 24, height: 24, borderRadius: 999, backgroundColor: panel, border: `1px solid ${border}`, flexShrink: 0 }} />
              </div>
              <div style={{ padding: '16px 14px', fontSize: 11, color: dim, minHeight: 140 }}>page content…</div>
            </div>
            <div style={{ fontSize: 11, color: dim, marginTop: 14, maxWidth: 280, textAlign: 'center', lineHeight: 1.5 }}>
              On desktop the sidebar is always visible, so the plumbob lives there. On mobile (sidebar collapsed) it moves to the topbar so the brand still travels with you.
            </div>
          </div>
        </PreviewCard>

        {/* 3. Loading state — bigger plumbob, more breathing room */}
        <PreviewCard label="Loading state · gentle bob + glow" base={base} border={border} dim={dim}>
          <div style={{ minHeight: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, padding: 32, fontFamily: fam }}>
            <div style={{ position: 'relative', height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="plumbob-glow" style={{ position: 'absolute', width: 120, height: 120, borderRadius: '50%', background: `radial-gradient(circle, ${accent}55 0%, transparent 65%)` }} />
              <img src={PLUMBOB} alt="" className="plumbob-bob" style={{ position: 'relative', height: 120, width: 'auto', display: 'block' }} />
            </div>
            <div style={{ fontSize: 14, color: muted, fontWeight: 500 }}>Loading your save…</div>
          </div>
        </PreviewCard>

        {/* 4. Login hero — featured plumbob, more room */}
        <PreviewCard label="Login screen hero" base={base} border={border} dim={dim}>
          <div style={{ minHeight: 460, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 28px 28px', fontFamily: fam }}>
            <img src={PLUMBOB} alt="" style={{ height: 96, width: 'auto', marginBottom: 16 }} />
            <div style={{ fontSize: 26, fontWeight: 700, color: text, letterSpacing: '-0.02em', marginBottom: 4 }}>MySaveFile</div>
            <div style={{ fontSize: 11, color: dim, marginBottom: 22, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>The Sims 4</div>
            <div style={{ width: '100%', maxWidth: 320, backgroundColor: card, border: `1px solid ${border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: muted, fontWeight: 600, marginBottom: 4 }}>Email</div>
                <div style={{ backgroundColor: panel, border: `1px solid ${border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12, color: dim }}>you@example.com</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: muted, fontWeight: 600, marginBottom: 4 }}>Password</div>
                <div style={{ backgroundColor: panel, border: `1px solid ${border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12, color: dim }}>••••••••</div>
              </div>
              <button style={{ backgroundColor: accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, fontFamily: fam, marginTop: 4, cursor: 'pointer' }}>
                Sign in
              </button>
            </div>
          </div>
        </PreviewCard>

        {/* 5. Dashboard welcome card with plumbob flourish */}
        <PreviewCard label="Dashboard welcome / first-import toast" base={base} border={border} dim={dim}>
          <div style={{ padding: 24, fontFamily: fam }}>
            <div style={{ position: 'relative', backgroundColor: card, border: `1px solid ${border}`, borderRadius: 14, padding: '22px 24px 22px 110px', overflow: 'hidden' }}>
              <img src={PLUMBOB} alt="" className="plumbob-tiny-bob" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', height: 86, width: 'auto', filter: 'drop-shadow(0 8px 18px rgba(22,163,74,0.25))' }} />
              <div style={{ fontSize: 18, fontWeight: 700, color: text, letterSpacing: '-0.015em', marginBottom: 4 }}>Welcome to your save</div>
              <div style={{ fontSize: 13, color: muted, lineHeight: 1.5, marginBottom: 12 }}>
                Imported 12 households, 41 lots, and 7 clubs. Take a tour or jump straight into Worlds.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ backgroundColor: accent, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, fontFamily: fam, cursor: 'pointer' }}>Take the tour</button>
                <button style={{ backgroundColor: 'transparent', color: muted, border: `1px solid ${border}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 500, fontFamily: fam, cursor: 'pointer' }}>Skip</button>
              </div>
            </div>
          </div>
        </PreviewCard>

        {/* 6. Public showcase header */}
        <PreviewCard label="Public showcase header" base={base} border={border} dim={dim}>
          <div style={{ padding: 24, fontFamily: fam }}>
            <div style={{ backgroundColor: card, border: `1px solid ${border}`, borderRadius: 14, padding: 24, textAlign: 'center' }}>
              <img src={PLUMBOB} alt="" style={{ height: 64, width: 'auto', margin: '0 auto 12px' }} />
              <div style={{ fontSize: 22, fontWeight: 700, color: text, letterSpacing: '-0.02em', marginBottom: 4 }}>Willow Creek revival</div>
              <div style={{ fontSize: 12, color: dim, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>by @iman · Sims 4 save</div>
              <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, backgroundColor: accent, color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 600, fontFamily: fam, cursor: 'pointer' }}>
                <ArrowRight size={14} weight="bold" /> Download this save
              </button>
            </div>
          </div>
        </PreviewCard>

      </div>
    </>
  );
}

function PreviewCard({ label, base, border, dim, children }: { label: string; base: string; border: string; dim: string; children: ReactNode }) {
  return (
    <div style={{ backgroundColor: base, border: `1px solid ${border}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: dim, fontWeight: 600, padding: '10px 16px 0' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function SecondaryPreview({ alt }: { alt: typeof SECONDARY_ALTERNATIVES[number] }) {
  // Render a compact preview against the B2 cream canvas with this alt's secondary.
  const base = '#faf8f4';
  const card = '#ffffff';
  const text = '#1a1714';
  const muted = '#4b4439';
  const dim = '#7a7268';
  const border = '#e8e1d4';
  const accent = '#16a34a';
  const accentSoft = '#ecfdf3';

  return (
    <div
      style={{
        backgroundColor: base,
        border: `1px solid ${border}`,
        borderRadius: 14,
        padding: 16,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <div style={{ fontWeight: 700, fontSize: 16, color: text, letterSpacing: '-0.015em' }}>
          {alt.name}
        </div>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: dim }}>{alt.secondary}</div>
      </div>
      <div style={{ fontSize: 12, color: muted, marginBottom: 12, lineHeight: 1.5 }}>{alt.note}</div>

      {/* Mini nav with active = secondary */}
      <div style={{ backgroundColor: card, border: `1px solid ${border}`, borderRadius: 10, padding: 6, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, fontSize: 13, fontWeight: 600, color: alt.secondary, backgroundColor: alt.secondarySoft }}>
          <Sparkle size={14} weight="fill" /> Custom Venues
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, fontSize: 13, fontWeight: 500, color: muted }}>
          <House size={14} weight="regular" /> Worlds
        </div>
      </div>

      {/* Pill row showing accent + secondary side by side */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px', borderRadius: 999, backgroundColor: accentSoft, color: accent, border: `1px solid ${accent}33`, fontWeight: 600 }}>
          <Check size={12} weight="bold" /> Assigned
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px', borderRadius: 999, backgroundColor: alt.secondarySoft, color: alt.secondary, border: `1px solid ${alt.secondary}33`, fontWeight: 600 }}>
          <Sparkle size={12} weight="fill" /> Custom
        </span>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, backgroundColor: accent, color: '#fff', border: 'none', padding: '7px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
          <PlusCircle size={14} weight="bold" /> Primary
        </button>
        <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, backgroundColor: alt.secondarySoft, color: alt.secondary, border: `1px solid ${alt.secondary}33`, padding: '7px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
          Secondary action
        </button>
      </div>
    </div>
  );
}

// V2 palette comparison — crispier hues + more color real estate per card.
// Each card mock applies the color in THREE places at once (left stripe, pill
// badge, tinted cover gradient) so the category reads at a glance instead of
// hiding in one small chip.
const PALETTES = [
  {
    id: 'D',
    name: 'Jewel tones',
    blurb: 'Saturated emerald / amber / berry. Distinct, modern, fits cream without going earthy.',
    home:   { tint: '#0d8a8c', ink: '#0a5e60' },
    rental: { tint: '#c98a10', ink: '#7a4e08' },
    venue:  { tint: '#b13a6e', ink: '#741c46' },
  },
  {
    id: 'E',
    name: 'Recharged classic',
    blurb: 'Keeps familiar blue/orange identity, swaps purple → magenta to avoid the plum conflict. Crisp but recognizable.',
    home:   { tint: '#3c72c4', ink: '#234a85' },
    rental: { tint: '#c84e7c', ink: '#822848' },
    venue:  { tint: '#e07b24', ink: '#8c4310' },
  },
  {
    id: 'F',
    name: 'Bright pop',
    blurb: 'Loud. Bright teal / bright gold / hot pink. Energy first, palette discipline second.',
    home:   { tint: '#1ca6a8', ink: '#0e6a6c' },
    rental: { tint: '#e8a418', ink: '#8a5e08' },
    venue:  { tint: '#d4488e', ink: '#8a2058' },
  },
] as const;

const SAMPLE_LOTS = [
  { cat: 'home',   typeLabel: 'Residential', name: '15 Lily Street',         size: '30×20', householdName: 'Goth' },
  { cat: 'rental', typeLabel: 'Rental',      name: 'Granite Falls Cabin',     size: '20×20', householdName: null },
  { cat: 'venue',  typeLabel: 'Bar',         name: 'Rattlesnake Juice',       size: '40×30', householdName: null },
] as const;

function LotCategoryComparison() {
  return (
    <div className="flex flex-col gap-8">
      {PALETTES.map((p) => (
        <div key={p.id} style={{ backgroundColor: '#faf8f4', border: '1px solid #e8e1d4', borderRadius: 14, padding: 20 }}>
          <div className="mb-1 flex items-baseline gap-2">
            <div className="text-xs uppercase tracking-widest text-c-dim">Palette {p.id}</div>
            <div className="text-base font-bold text-c-text" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{p.name}</div>
          </div>
          <p className="text-xs text-c-muted mb-4">{p.blurb}</p>

          <div className="mb-3 text-2xs uppercase tracking-label-lg text-c-dim font-semibold">Pill only (least color)</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            {SAMPLE_LOTS.map((l) => (
              <LotMock key={`${p.id}-pill-${l.cat}`} lot={l} color={p[l.cat]} treatment="pill" />
            ))}
          </div>

          <div className="mb-3 text-2xs uppercase tracking-label-lg text-c-dim font-semibold">Pill + left stripe</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            {SAMPLE_LOTS.map((l) => (
              <LotMock key={`${p.id}-stripe-${l.cat}`} lot={l} color={p[l.cat]} treatment="stripe" />
            ))}
          </div>

          <div className="mb-3 text-2xs uppercase tracking-label-lg text-c-dim font-semibold">Pill + stripe + full cover gradient (most color)</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SAMPLE_LOTS.map((l) => (
              <LotMock key={`${p.id}-full-${l.cat}`} lot={l} color={p[l.cat]} treatment="full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Each card now stacks color in three places: left edge stripe, cover
// gradient, and pill badge. The `treatment` prop varies how much: 'pill'
// = just pill, 'stripe' = stripe + pill, 'full' = stripe + bigger
// gradient + pill (most color presence).
function LotMock({ lot, color, treatment }: { lot: typeof SAMPLE_LOTS[number]; color: { tint: string; ink: string }; treatment: 'pill' | 'stripe' | 'full' }) {
  const hasStripe = treatment === 'stripe' || treatment === 'full';
  const gradientStrength = treatment === 'full' ? { from: 0.45, to: 0.18 } : { from: 0.22, to: 0.08 };
  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        border: `1px solid #e8e1d4`,
        borderRadius: 10,
        overflow: 'hidden',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        display: 'grid',
        gridTemplateColumns: hasStripe ? '4px 1fr' : '1fr',
      }}
    >
      {hasStripe && <div style={{ background: color.tint }} />}
      <div>
        {/* Status strip (built green for the demo) */}
        <div style={{ background: '#16a34a', height: 3 }} />
        {/* Cover image placeholder */}
        <div
          style={{
            height: 70,
            background: `linear-gradient(135deg, ${color.tint}${alpha(gradientStrength.from)}, ${color.tint}${alpha(gradientStrength.to)})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ fontSize: 18, opacity: 0.6, color: color.ink }}>◫</div>
        </div>
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1714', letterSpacing: '-0.015em', lineHeight: 1.2 }}>
            {lot.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                background: `${color.tint}30`,
                border: `1px solid ${color.tint}70`,
                color: color.ink,
                fontSize: 10,
                padding: '1px 7px',
                borderRadius: 4,
                fontWeight: 700,
              }}
            >
              {lot.typeLabel}
            </span>
            <span style={{ fontSize: 11, color: '#7a7268' }}>{lot.size}</span>
          </div>
          <div style={{ fontSize: 11, color: lot.householdName ? '#15803d' : '#a89e8f', fontStyle: lot.householdName ? 'normal' : 'italic' }}>
            {lot.householdName ?? '— no household'}
          </div>
        </div>
      </div>
    </div>
  );
}

// Hex alpha helper — converts a 0..1 opacity into the 2-digit hex suffix
// used in `${hex}${alpha(0.45)}` shorthand throughout the lot mocks.
function alpha(opacity: number): string {
  return Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, '0');
}

function IconInventory() {
  const icons = [
    { Icon: House, name: 'House' },
    { Icon: Users, name: 'Users' },
    { Icon: Heart, name: 'Heart' },
    { Icon: CalendarDots, name: 'CalendarDots' },
    { Icon: Storefront, name: 'Storefront' },
    { Icon: ImageSquare, name: 'ImageSquare' },
    { Icon: GearSix, name: 'GearSix' },
    { Icon: Sparkle, name: 'Sparkle' },
    { Icon: PlusCircle, name: 'PlusCircle' },
    { Icon: Check, name: 'Check' },
    { Icon: Warning, name: 'Warning' },
    { Icon: ArrowRight, name: 'ArrowRight' },
  ] as const;
  const weights = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone'] as const;
  return (
    <div className="bg-c-card rounded-xl border border-c-border overflow-hidden">
      <div className="grid" style={{ gridTemplateColumns: `120px repeat(${weights.length}, 1fr)` }}>
        <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-c-dim font-semibold border-b border-c-border">Icon</div>
        {weights.map((w) => (
          <div key={w} className="px-3 py-2 text-[10px] uppercase tracking-widest text-c-dim font-semibold border-b border-c-border text-center">{w}</div>
        ))}
        {icons.map(({ Icon, name }) => (
          <div key={name} className="contents">
            <div className="px-3 py-3 text-xs text-c-muted border-b border-c-border font-mono">{name}</div>
            {weights.map((w) => (
              <div key={w} className="px-3 py-3 flex items-center justify-center border-b border-c-border">
                <Icon size={22} weight={w} color="#16a34a" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
