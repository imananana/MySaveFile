#!/usr/bin/env python3
"""
Extract custom-venue icons from the S4Studio ~/Desktop/icons.html gallery dump.

icons.html holds one <div class="icon-item"> per icon: an <img src="data:...base64">,
an internal <span>name</span>, and a "type:group:instance" ResourceKey. We pull the
PNGs for:
  - ACTIVITIES: every STOCK_ACTIVITIES iconKey instance -> public/activity-icons/<instance>.png
  - VENUE TRAITS: the hidden getaway-NPC trait icons (from the ~/Documents/Traits
    TraitTuning `icon` ResourceKey) -> public/trait-icons/<instance>.png (existing folder/keying)

Also prints the getaway trait id -> iconInstance map so stockVenueTraits.ts can carry it.

Run: python3 scripts/diagnostics/extractVenueIcons.py
"""
import os, re, base64, glob

HOME = os.environ["HOME"]
ICONS = f"{HOME}/Desktop/icons.html"
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ── 1. Target instances ──────────────────────────────────────────────────────
# Activities: instance = last segment of each iconKey in STOCK_ACTIVITIES.ts
act_src = open(f"{REPO}/src/data/stockActivities.ts").read()
activity_instances = set(re.findall(r"iconKey: '[0-9a-f]{8}:[0-9a-f]{8}:([0-9a-f]{16})'", act_src))

# Venue traits: icon ResourceKey instance from each getaway-NPC TraitTuning XML
trait_id_to_instance = {}
for f in glob.glob(f"{HOME}/Documents/Traits/*trait_Hidden_Getaway*.TraitTuning.xml"):
    m = re.search(r"!0*([0-9A-F]+)\.trait", os.path.basename(f))
    xml = open(f).read()
    icon = re.search(r'n="icon"[^>]*>[0-9a-fA-F]{8}:[0-9a-fA-F]{8}:([0-9a-fA-F]{16})<', xml)
    if m and icon:
        trait_id_to_instance["0x" + format(int(m.group(1), 16), "x")] = icon.group(1).lower()
trait_instances = set(trait_id_to_instance.values())

print(f"targets: {len(activity_instances)} activity icons, {len(trait_instances)} trait icons")

os.makedirs(f"{REPO}/public/activity-icons", exist_ok=True)

# ── 2. Stream icons.html, extract matching PNGs ───────────────────────────────
data = open(ICONS, "r", encoding="utf-8", errors="replace").read()
wrote_act = wrote_trait = 0
for block in data.split('<div class="icon-item">')[1:]:
    key = re.search(r">[0-9a-f]{8}:[0-9a-f]{8}:([0-9a-f]{16})<", block)
    if not key:
        continue
    inst = key.group(1)
    if inst in activity_instances:
        dest = f"{REPO}/public/activity-icons/{inst}.png"; folder = "activity-icons"
    elif inst in trait_instances:
        dest = f"{REPO}/public/trait-icons/{inst}.png"; folder = "trait-icons"
    else:
        continue
    b64 = re.search(r"data:image/png;base64,([A-Za-z0-9+/=]+)", block)
    if not b64:
        continue
    open(dest, "wb").write(base64.b64decode(b64.group(1)))
    if folder == "activity-icons": wrote_act += 1
    else: wrote_trait += 1

print(f"wrote: {wrote_act} activity icons, {wrote_trait} trait icons")
missing_act = activity_instances - {os.path.splitext(f)[0] for f in os.listdir(f'{REPO}/public/activity-icons')}
if missing_act:
    print(f"  WARNING: {len(missing_act)} activity instances not found in icons.html")
print("\ngetaway trait id -> iconInstance:")
for tid, inst in sorted(trait_id_to_instance.items()):
    print(f"  {tid}: {inst}")
