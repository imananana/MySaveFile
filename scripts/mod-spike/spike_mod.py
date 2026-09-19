# MySaveFile companion-mod SPIKE — throwaway proof, NOT a product.
#
# Question under test: can we write career + degree + skill onto a Sim who is
# NOT in the active household, have it survive save/reload, and leave the rest
# of the save untouched?  See docs/MOD_SPIKE.md.
#
# Usage (live mode):  Ctrl+Shift+C  ->  testingcheats on  ->  spike.apply
#                     then save, quit to menu, reload, and:  spike.verify
#
# SAFETY: additive only; touches ONLY the sim_ids listed below; every op is
# wrapped so it can never raise into the game loop; logs to spike_log.txt next
# to the saves folder so results survive a console scroll.
#
# NOTE: the career/skill/degree API calls here are BEST-EFFORT FOR THE SPIKE.
# The whole point is to learn which ones actually stick — they are not yet
# confirmed mappings. The TUNING IDS, however, are confirmed (pulled from our
# parser catalogs: src/data/stockCareers/stockSkills/stockDegrees).

import os
import time


# ── import-time beacon ───────────────────────────────────────────────────────
# Writes to spike_log.txt the INSTANT the game imports this module, before any
# game imports. Lets us tell "module never imported" (no file) from "imported
# but command didn't register" (beacon present, but spike.apply still silent).
def _beacon(msg):
    try:
        path = os.path.join(
            os.path.expanduser("~"), "Documents", "Electronic Arts",
            "The Sims 4", "spike_log.txt",
        )
        with open(path, "a", encoding="utf-8") as f:
            f.write(time.strftime("%H:%M:%S ") + "[spike] " + msg + "\n")
    except Exception:
        pass


_beacon(">>> MODULE IMPORT START")

try:
    import sims4.commands
    import sims4.resources
    import services
    _beacon(">>> game imports OK (sims4.commands, services)")
except Exception as e:
    _beacon(">>> game imports FAILED: %r" % (e,))
    raise

# ── confirmed tuning ids (instance ids; usable directly with instance managers)
CAREER_CULINARY = 0x240F   # full-time Culinary
CAREER_PAINTER  = 0x6D1A   # full-time Painter  (FIX: 0x6D1D is Writer, not Painter)
CAREER_WRITER   = 0x6D1D   # full-time Writer
SKILL_COOKING   = 0x4141   # Cooking skill statistic
SKILL_LOGIC     = 0x4142   # Logic skill (unrelated to any food career)
SKILL_FITNESS   = 0x4113   # Fitness skill (thematic pair = Athlete career)
TRAIT_DEGREE_CULINARY_BA = 0x35435  # earned "Culinary Arts" degree (Britechester, BA)

# ── targets in Slot_00000003 (all young-adults; see docs/MOD_SPIKE.md)
TARGETS = [
    # sim_id,               label,             what we attempt
    (159058256118089871, "Eliza Pancakes", {"career": CAREER_CULINARY}),
    (159058256118089870, "Bob Pancakes",   {"career": CAREER_PAINTER}),    # had Culinary L2 -> change (1st run used 0x6d1d=Writer by mistake)
    (159058256118161987, "Don Lothario",   {"degree": TRAIT_DEGREE_CULINARY_BA}),
    (159058256118161985, "Dina Caliente",  {"skill": (SKILL_COOKING, 7)}),  # the decisive test
]


def _log_path():
    # macOS: ~/Documents/Electronic Arts/The Sims 4/spike_log.txt
    return os.path.join(
        os.path.expanduser("~"), "Documents", "Electronic Arts",
        "The Sims 4", "spike_log.txt",
    )


def _emit(out, msg):
    line = "[spike] " + msg
    try:
        out(line)
    except Exception:
        pass
    try:
        with open(_log_path(), "a", encoding="utf-8") as f:
            f.write(time.strftime("%H:%M:%S ") + line + "\n")
    except Exception:
        pass


def _get_sim(sim_id):
    mgr = services.sim_info_manager()
    if mgr is None:
        return None
    return mgr.get(sim_id)


def _try_career(out, sim_info, career_id):
    try:
        career_type = services.get_instance_manager(sims4.resources.Types.CAREER).get(career_id)
        if career_type is None:
            _emit(out, "  career: tuning 0x%x not found (pack missing?)" % career_id)
            return
        career_instance = career_type(sim_info)
        sim_info.career_tracker.add_career(career_instance, post_quit_msg=False)
        _emit(out, "  career: add_career OK (0x%x)" % career_id)
    except Exception as e:
        _emit(out, "  career: FAILED %r" % (e,))


def _try_degree(out, sim_info, trait_id):
    try:
        trait = services.get_instance_manager(sims4.resources.Types.TRAIT).get(trait_id)
        if trait is None:
            _emit(out, "  degree: trait 0x%x not found (University missing?)" % trait_id)
            return
        ok = sim_info.add_trait(trait)
        _emit(out, "  degree: add_trait -> %s (0x%x)" % (ok, trait_id))
    except Exception as e:
        _emit(out, "  degree: FAILED %r" % (e,))


def _try_skill(out, sim_info, skill_id, level):
    skill = services.get_instance_manager(sims4.resources.Types.STATISTIC).get(skill_id)
    if skill is None:
        _emit(out, "  skill: statistic 0x%x not found" % skill_id)
        return
    # Approach A: the canonical tracker route.
    try:
        tracker = sim_info.get_tracker(skill)
        stat = tracker.add_statistic(skill, force_add=True)
        stat.set_user_value(level)
        _emit(out, "  skill[A]: get_tracker/add_statistic/set_user_value OK -> L%d" % level)
        return
    except Exception as e:
        _emit(out, "  skill[A]: failed %r" % (e,))
    # Approach B: commodity_tracker.set_value with the skill's point value.
    try:
        sim_info.commodity_tracker.set_value(skill, getattr(skill, "max_value", 100))
        _emit(out, "  skill[B]: commodity_tracker.set_value OK")
        return
    except Exception as e:
        _emit(out, "  skill[B]: failed %r" % (e,))
    _emit(out, "  skill: ALL approaches failed (this is the make-or-break result)")


@sims4.commands.Command("spike.apply", command_type=sims4.commands.CommandType.Live)
def spike_apply(_connection=None):
    out = sims4.commands.CheatOutput(_connection)
    _emit(out, "=== APPLY start ===")
    for sim_id, label, ops in TARGETS:
        sim_info = _get_sim(sim_id)
        if sim_info is None:
            _emit(out, "%s (%d): NOT FOUND in sim_info_manager" % (label, sim_id))
            continue
        _emit(out, "%s (%d): found, applying %s" % (label, sim_id, sorted(ops.keys())))
        if "career" in ops:
            _try_career(out, sim_info, ops["career"])
        if "degree" in ops:
            _try_degree(out, sim_info, ops["degree"])
        if "skill" in ops:
            _try_skill(out, sim_info, *ops["skill"])
    _emit(out, "=== APPLY done — now SAVE, quit to menu, reload, run spike.verify ===")


@sims4.commands.Command("spike.verify", command_type=sims4.commands.CommandType.Live)
def spike_verify(_connection=None):
    """Re-read the targets after reload — confirms persistence without clicking each Sim."""
    out = sims4.commands.CheatOutput(_connection)
    _emit(out, "=== VERIFY start ===")
    for sim_id, label, _ops in TARGETS:
        sim_info = _get_sim(sim_id)
        if sim_info is None:
            _emit(out, "%s: NOT FOUND" % label)
            continue
        # careers
        careers = []
        try:
            careers = [hex(c.guid64) for c in sim_info.career_tracker.careers.values()]
        except Exception as e:
            careers = ["err %r" % (e,)]
        # cooking skill value
        cooking = "?"
        try:
            skill = services.get_instance_manager(sims4.resources.Types.STATISTIC).get(SKILL_COOKING)
            stat = sim_info.get_statistic(skill, add=False) if skill else None
            cooking = stat.get_user_value() if stat else "none"
        except Exception as e:
            cooking = "err %r" % (e,)
        # degree trait present?
        has_degree = "?"
        try:
            trait = services.get_instance_manager(sims4.resources.Types.TRAIT).get(TRAIT_DEGREE_CULINARY_BA)
            has_degree = sim_info.has_trait(trait) if trait else "no-tuning"
        except Exception as e:
            has_degree = "err %r" % (e,)
        _emit(out, "%s: careers=%s cooking=%s culinaryBA=%s" % (label, careers, cooking, has_degree))
    _emit(out, "=== VERIFY done ===")


def _careers_of(sim_info):
    try:
        return [hex(c.guid64) for c in sim_info.career_tracker.careers.values()]
    except Exception as e:
        return ["err %r" % (e,)]


# Fresh sims with NO career in the save — isolate "does setting a skill create a career?"
SKILL_ONLY_TARGETS = [
    (159058256118161986, "Nina Caliente", SKILL_COOKING, 5),   # reproduce Dina's case (cooking)
    (159058256112844908, "Clint Vallejo", SKILL_LOGIC, 5),     # unrelated skill
    (159058256118092760, "Alex Moyer",    SKILL_FITNESS, 5),   # thematic-pair skill
]


@sims4.commands.Command("spike.skillonly", command_type=sims4.commands.CommandType.Live)
def spike_skillonly(_connection=None):
    """Smoking-gun: apply ONLY a skill, log careers immediately before/after (same tick)."""
    out = sims4.commands.CheatOutput(_connection)
    _emit(out, "=== SKILL-ONLY isolation start ===")
    for sim_id, label, skill_id, lvl in SKILL_ONLY_TARGETS:
        sim_info = _get_sim(sim_id)
        if sim_info is None:
            _emit(out, "%s: NOT FOUND" % label)
            continue
        before = _careers_of(sim_info)
        _emit(out, "%s: careers BEFORE = %s" % (label, before))
        _try_skill(out, sim_info, skill_id, lvl)
        after = _careers_of(sim_info)
        _emit(out, "%s: careers AFTER  = %s   (set skill 0x%x -> L%d)" % (label, after, skill_id, lvl))
    _emit(out, "=== SKILL-ONLY done. If AFTER gained a career, the SKILL CODE is the cause. "
               "Then SAVE w/o playing, reload, spike.skillverify ===")


# Empirical points->level curve derivation: set each level, read raw points.
# One representative per distinct max-level / sub-family (from the tuning dump).
SKILL_CURVE_TARGETS = [
    # STRAGGLER PASS: child skills (Chana=child) + remaining toddler skills
    # (Jorge=toddler). max_level 10 on child skills reveals the true cap (values
    # plateau past the real max).
    # sim_id,            sim,      skill_id,  label,                 max_level
    (159058262828123170, "Chana",  0x414E, "ChildCreativity",         10),
    (159058262828123170, "Chana",  0x414F, "ChildMental",             10),
    (159058262828123170, "Chana",  0x4150, "ChildMotor",              10),
    (159058262828123170, "Chana",  0x4151, "ChildSocial",             10),
    (159058262828516405, "Jorge",  0x2238A, "ToddlerCommunication",    5),
    (159058262828516405, "Jorge",  0x224D8, "ToddlerThinking",         5),
    (159058262828516405, "Jorge",  0x225A2, "ToddlerImagination",      5),
]


@sims4.commands.Command("spike.skillcurve", command_type=sims4.commands.CommandType.Live)
def spike_skillcurve(_connection=None):
    """For each representative skill, set level 1..max and log the raw points at each."""
    out = sims4.commands.CheatOutput(_connection)
    _emit(out, "=== SKILL CURVE start ===")
    for sim_id, slabel, skill_id, label, maxl in SKILL_CURVE_TARGETS:
        sim_info = _get_sim(sim_id)
        if sim_info is None:
            _emit(out, "%s: NOT FOUND" % slabel)
            continue
        skill = services.get_instance_manager(sims4.resources.Types.STATISTIC).get(skill_id)
        if skill is None:
            _emit(out, "%s/%s: skill 0x%x not found" % (slabel, label, skill_id))
            continue
        try:
            tracker = sim_info.get_tracker(skill)
            stat = tracker.add_statistic(skill, force_add=True)
            pts = []
            for lvl in range(1, maxl + 1):
                stat.set_user_value(lvl)
                pts.append("L%d=%s" % (lvl, stat.get_value()))
            _emit(out, "%s / %s: %s" % (slabel, label, "  ".join(pts)))
        except Exception as e:
            _emit(out, "%s / %s: FAILED %r" % (slabel, label, e))
    _emit(out, "=== SKILL CURVE done ===")


@sims4.commands.Command("spike.skillverify", command_type=sims4.commands.CommandType.Live)
def spike_skillverify(_connection=None):
    """After save+reload (no gameplay): did any skill-only sim gain a persisted career?"""
    out = sims4.commands.CheatOutput(_connection)
    _emit(out, "=== SKILL-ONLY verify (post-reload) ===")
    for sim_id, label, skill_id, _lvl in SKILL_ONLY_TARGETS:
        sim_info = _get_sim(sim_id)
        if sim_info is None:
            _emit(out, "%s: NOT FOUND" % label)
            continue
        _emit(out, "%s: careers=%s" % (label, _careers_of(sim_info)))
    _emit(out, "=== verify done ===")


_beacon(">>> commands registered (apply, verify, skillonly, skillverify, skillcurve) — module load complete")
