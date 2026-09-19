#!/usr/bin/env python3
"""
Build src/data/stockVenuePresets.ts — the Sims-Team (EA) premade venue presets —
from the ~/Documents/Custom Venue tuning snippets.

These are LAYER 1 in the preset model: the undeletable built-in templates the
game ships (11 schedule presets `PremadeGetaways_*`, 36 role presets
`PremadeRoles_*`). They live in tuning, never in the .save, so we ingest them as
a static read-only catalog (distinct from a player's own imported presets).

Each snippet maps cleanly onto the parser's shapes (ParsedCustomVenue /
ParsedVenueRole) so the existing display components render them unchanged. Names
are the confirmed display_name STBL strings; criterion/activity ids resolve via
the existing stock catalogs. No guesses — anything unmappable is left raw.

Run: python3 scripts/diagnostics/buildVenuePresets.py
"""
import os, re, glob, json
import xml.etree.ElementTree as ET

HOME = os.environ["HOME"]
DIR = f"{HOME}/Documents/Custom Venue"
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# tuning age enum -> Sims lifestage bitmask (HUMAN_LIFESTAGE, app-wide)
AGE_BITS = {"BABY": 1, "NEWBORN": 1, "INFANT": 128, "TODDLER": 2, "CHILD": 4,
            "TEEN": 8, "YOUNGADULT": 16, "ADULT": 32, "ELDER": 64}
# tuning criterion type -> (our type string, our numeric rawType code)
CRIT_TYPE = {"skill": ("skill", 0), "trait": ("trait", 1), "age": ("age", 5),
             "fame_rank": ("fame", 7), "relationship_status": ("relationship", 13)}
OUTFIT_MODE = {"no_outfit": "none", "outfit_category": "category",
               "style_and_color": "style", "uniform": "custom"}


def disp(el):
    """display string from a <T>id<!--name--></T>: prefer the comment."""
    return None


def comment_after(text, attr):
    m = re.search(rf'n="{attr}"[^>]*>[^<]*<!--([^>]*?)-->', text)
    return m.group(1).strip() if m else None


def parse_role(path):
    raw = open(path).read()
    root = ET.fromstring(raw)
    name = comment_after(raw, "display_name") or ""
    sim_count = 1
    activities, criteria = [], []
    outfit = {"mode": "none"}

    for el in root:
        n = el.get("n")
        if n == "sim_count":
            sim_count = int(el.text or "1")
        elif n == "default_behaviors":
            # Activity ids stay STRINGS end to end — a modded id outruns a JS
            # number, so nothing downstream is allowed to narrow one.
            activities = [t.text.strip() for t in el.findall("T") if t.text and t.text.strip().isdigit()]
        elif n == "default_outfit":
            outfit = {"mode": OUTFIT_MODE.get(el.get("t"), "custom")}
        elif n == "sim_criteria":
            for v in el.findall("V"):
                c = parse_criterion(v)
                if c:
                    criteria.append(c)
    return {"name": name, "simCount": sim_count, "criteria": criteria,
            "activities": activities, "outfit": outfit, "index": 0}


def parse_criterion(v):
    t = v.get("t")
    if t not in CRIT_TYPE:
        return None
    our_type, raw = CRIT_TYPE[t]
    required = True
    values = []
    # required flag (default True unless an explicit criteria_required False)
    req = v.find(f".//T[@n='criteria_required']")
    if req is not None and (req.text or "").strip() == "False":
        required = False
    if t == "age":
        bits = 0
        for e in v.findall(".//L[@n='ages']/E"):
            bits |= AGE_BITS.get((e.text or "").strip(), 0)
        if bits:
            values = [bits]
    elif t == "trait":
        values = [int(e.text) for e in v.findall(".//L[@n='traits']/T") if e.text and e.text.strip().isdigit()]
    elif t == "skill":
        values = [int(e.text) for e in v.findall(".//L[@n='skills']/T") if e.text and e.text.strip().isdigit()]
    elif t == "fame_rank":
        ranks = [int(m.group(1)) for e in v.findall(".//L[@n='fame_rank_requirements']/E")
                 for m in [re.search(r"FAME_RANK_(\d+)", e.text or "")] if m]
        if ranks:
            values = [min(ranks)]  # "rank N or higher" → store the minimum
    elif t == "relationship_status":
        values = []  # premades leave this unspecified; show the type only
    return {"type": our_type, "required": required, "values": values, "rawType": raw}


def parse_schedule(path, role_by_inst):
    raw = open(path).read()
    root = ET.fromstring(raw)
    name = comment_after(raw, "name") or ""
    # ordered role instance ids → roles (index = position in the hierarchy)
    hierarchy = [int(t.text) for t in root.findall("./L[@n='assignment_hierarchy']/T") if t.text and t.text.strip().isdigit()]
    idx_of = {inst: i for i, inst in enumerate(hierarchy)}
    roles = []
    for i, inst in enumerate(hierarchy):
        r = dict(role_by_inst.get(inst, {"name": f"#{inst}", "simCount": 1, "criteria": [], "activities": [], "outfit": {"mode": "none"}}))
        r["index"] = i
        roles.append(r)

    slots = []
    for slot in root.findall("./L[@n='time_slots']/U"):
        hour = int(slot.find("T[@n='key']").text)
        val = slot.find("U[@n='value']")
        db = val.find("T[@n='default_behavior']")
        main = db.text.strip() if db is not None and db.text and db.text.strip().isdigit() else None
        assignments = []
        for a in val.findall("L[@n='time_slot_assignments']/U"):
            inst = int(a.find("T[@n='key']").text)
            overrides = [t.text.strip() for t in a.findall("U[@n='value']/V[@n='behavior_overrides']/L[@n='enabled']/T") if t.text and t.text.strip().isdigit()]
            assignments.append({"roleIndex": idx_of.get(inst, 0),
                                "activityOverrides": overrides if overrides else None,
                                "outfitOverride": None})
        slots.append({"hour": hour, "mainActivity": main, "assignments": assignments})
    return {"name": name, "lotId": None, "roles": roles, "slots": slots}


# ── Build ─────────────────────────────────────────────────────────────────────
role_by_inst = {}
role_presets = []
for f in sorted(glob.glob(f"{DIR}/*PremadeRoles*.SnippetTuning.xml")):
    inst = int(re.search(r"!0*([0-9A-F]+)\.", os.path.basename(f)).group(1), 16)
    role = parse_role(f)
    role_by_inst[inst] = role
    role_presets.append({"key": format(inst, "x"), "name": role["name"], "data": role})

schedule_presets = []
for f in sorted(glob.glob(f"{DIR}/*PremadeGetaways*.SnippetTuning.xml")):
    inst = int(re.search(r"!0*([0-9A-F]+)\.", os.path.basename(f)).group(1), 16)
    sched = parse_schedule(f, role_by_inst)
    schedule_presets.append({"key": format(inst, "x"), "name": sched["name"], "data": sched})

schedule_presets.sort(key=lambda p: p["name"])
role_presets.sort(key=lambda p: p["name"])

ts = (
    "/**\n"
    " * Sims-Team (EA) premade venue presets — the built-in starter templates.\n"
    " * Generated by scripts/diagnostics/buildVenuePresets.py from the\n"
    " * ~/Documents/Custom Venue tuning snippets. DO NOT EDIT BY HAND.\n"
    " *\n"
    " * These are read-only stock templates (Layer 1), distinct from a player's own\n"
    " * imported/authored presets. data matches the parser's ParsedCustomVenue\n"
    " * (schedules) / ParsedVenueRole (roles) shapes so the display reuses them.\n"
    " */\n"
    "import type { ParsedCustomVenue, ParsedVenueRole } from '../lib/parser/types';\n\n"
    "export interface StockVenuePreset<T> { key: string; name: string; data: T }\n\n"
    "export const STOCK_VENUE_PRESETS: {\n"
    "  schedules: StockVenuePreset<ParsedCustomVenue>[];\n"
    "  roles: StockVenuePreset<ParsedVenueRole>[];\n"
    "} = {\n"
    f"  schedules: {json.dumps(schedule_presets, indent=2)},\n"
    f"  roles: {json.dumps(role_presets, indent=2)},\n"
    "};\n"
)
open(f"{REPO}/src/data/stockVenuePresets.ts", "w").write(ts)
print(f"stockVenuePresets: {len(schedule_presets)} schedules, {len(role_presets)} roles")
