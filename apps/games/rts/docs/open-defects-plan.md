# RTS — open defects and the order to fix them

Written 2026-09-04, after the order-target pass (`order-target-audit.md`) closed
two cases and left six unsettled. This is the standing queue. The art items are
merged in from the legibility study when it lands; until then §5 is a stub.

Ranking rule: **a defect a player can hit today outranks a fidelity gap**, and
**a measurement outranks a theory**. Anything whose evidence varied between runs
is in §3, not §1, no matter how plausible the fix looks.

---

## 1. Confirmed defects — measured, reproducible

### 1.1 An out-of-ammo Harrier right-clicking its own Airforce Command does nothing
**Evidence:** both probe runs returned `order: null`, target confirmed as a built
`airforce`. **Root cause is now located, not guessed:** `rightOrder()`
(rts.html:29179) has no `wantsOwn` rung for aircraft, so the click falls through
to `cmd('move', …)` at the bottom — and a `move` is then discarded for an
aircraft already in its pad cycle (`u.ammo <= 0 && pad -> u.rtb = true`,
rts.html:22474; a stopped aircraft re-arms anyway, :25951). The order never
survives to become one.

**Fix:** add the rung — an air unit with `ammo` right-clicking its own
`airforce` issues an explicit return-and-rearm, the same state the auto-RTB
already sets. The mechanic exists; as with the miner and the depot, nothing
reached it. **Cost:** small, one predicate + one branch in the `'own'` handler.

### 1.2 Force-firing at bare ground ignores veteran ROF
**Evidence, read directly:** `fireGround()` sets
`u.cool = spec.rate * (u.rank === 2 ? 0.6 : 1)` (rts.html:29149) — an
**elite-only** multiplier left behind when the rest of the file moved to
`[General] VeteranROF=0.6 **per level**`. The two real fire paths both use
`vetRof(rank)` (:20900, :22637). So a **veteran** unit force-firing at the ground
fires at rookie speed, while the same unit shooting a target does not.
**Fix:** one line — `vetRof(u.rank)`. **Cost:** trivial. Ships independently of §4.

---

## 2. Unresolved — the cause is not yet known

### 2.1 A vehicle right-clicking its own Service Depot still gets a plain `move`
The predicate is **not** the problem. Tested directly in-page: lancer `cls 'v'`,
`air false`; depot `kind 'b'`, `type 'depot'`; **the condition evaluates true.**
So `wantsOwn` is wired correctly and `pickAt(px, py)` did not return the depot on
that click. **This needs a target-picking probe, not another order probe** — log
what `pickAt` returns across the depot's whole footprint. Do not "fix" the
predicate; it is already right.

---

## 3. Not established — the probe is the problem

Terror Drone, Chrono Legionnaire and Yuri right-clicking **our own tank** gave
**different answers between two runs of the same probe**. That is not a result.
The probe must **settle each unit before clicking** (units drift, and the click
chases a stale screen position) before any of the three means anything. Rebuild
the probe first, then read the three cases off it in one run.

Two harness traps are already recorded and must not be re-paid:
`__rtsScreen()` returns **canvas**-relative coordinates while `page.mouse` takes
**page** coordinates (the app top bar put every click ~40 px high), and spawning
cases at a shared offset stacks the units so the click grabs whichever is on top.

---

## 4. ElitePrimary — parked mid-flight, ships as one change

Both research passes are in hand. 26 of 34 rules.ini rows map to units we field.
Blocking sub-tasks, in order:

1. **Unify `Burst`.** It is modelled three ways today: as a damage multiplier
   (`spec.dmg * burst`, rts.html:20969), as damage **pre-doubled into the table**
   (`[DredLauncher]` — "100 was the launcher's own Damage=50", :1642-1644), and
   as prose in a comment (`[HoverMissile]` "25 x Burst 2", :1350). `[120mmE]`
   adds `Burst=2`, so elite Rhinos land straight on this. Unify before, not during.
2. **Settle the veterancy stacking rule by evidence.** Ours compounds
   (`Math.pow`, :1155-1176) → ×1.21 firepower / ×0.36 ROF at elite. The file's own
   comment argues `[General]`'s multipliers are per level and `VeteranCap=2`
   makes that the intent; the competing reading is that each ability applies
   once. **This is genuinely open — it is a decision, not a known bug**, and the
   checklist written before the work started says settle it by evidence and
   record the reason. It must be settled *before* the weapon swap, because the
   swap changes which numbers the multipliers land on.
3. **Add the 4 missing elite warheads** — `ApocAPE`, `RHINAPE`, `GRIZAPE`,
   `HowitzerWH` — with their real `Verses=` rows, or record the substitution.
4. **Swap the weapon at rank 2**, at the single `spec` site both fire paths read.
5. Guard the one failure a player notices instantly: `[120mm]` 90 → `[120mmE]` 85
   means **elite must never come out weaker than veteran**. Walk every mapped
   unit and assert it.

Every test proved red against the unfixed build first.

---

## 5. Art legibility — merged from the study when it lands

*(stub — the study measures sidebar **cameos**, which no tool has ever measured,
re-measures the map, and compares both against real RA2 sprites. Its ranked plan
drops in here.)*

Known carry-over: **`aegis | squid` at 27.6 vs a 32 threshold at zoom 1** — the
last confusable pair under any threshold, needing silhouette work per
`unit-redesign-plan.md` §2.4.

---

## 6. Not reproduced — do not fix blind

**"The map follows my cursor without a right-drag."** Five release scenarios on
`/rts.html` showed **zero** leak. The shell-iframe path is untested (no app-open
hook was found). Two diagnostic questions are outstanding: does the map track the
cursor **1:1 or drift steadily**, and does **a single click stop it**? Answering
either one picks the mechanism; guessing picks a rewrite.

---

## Order of work

1. §1.2 force-fire ROF (one line, independent)
2. §1.1 Harrier rung (small, closes the last known silent no-op)
3. §3 rebuild the probe, then read the three unestablished cases in one run
4. §2.1 target-picking probe for the depot
5. §5 art plan, once merged (likely the largest player-visible win)
6. §4 ElitePrimary, as one change, in its five sub-steps
