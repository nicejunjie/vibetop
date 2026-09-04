# Units: making them tell each other apart — the plan

**Reported:** *"the buildings are okay, but all other items, especially the troops,
tanks, flights are hardly distinguishable, they all look alike on the map. They need
to be redesigned. In real RA2 those are distinguishable at any size, and they are all
unique with unique features."*

Two evidence documents back this plan; read the verdict of each before starting:

- `unit-confusability-audit.md` — what our units measure like now (328 sprites, real
  pixels out of `window.__rtsTest.spr()`, composed the way `drawUnit` composes them).
- `unit-identity-reference.md` — how RA2 actually achieves readability, measured from
  the sprites in `docs/ra2-ref/`, turned into a per-unit spec.

---

## 0. Verdict, and the bar

The complaint is correct and measurable. **Nine pixels of a Grizzly — 0.6% of it —
fall outside a Rhino's outline.** Mean pairwise silhouette IoU across the nine ground
combat vehicles is 0.679. Eleven of thirteen ground vehicles have a *peer* matching
their silhouette better than they match *themselves* from another bearing. Aircraft
show none of this (0 of 4), which is the control that says this is real and not an
artefact of the measurement.

**The cause is not missing detail.** Every ground vehicle sits on the same rounded
track-box lozenge, which carries 88–92% of the outline; the turret, mast or emitter
that identifies it adds 8.1–11.9%. The one saturated thing on all of them is the same
thing — the owner-colour flank band.

**The bar we hold ourselves to** (from the reference doc, and deliberately narrower
than "distinguishable at any size", which is not true even of RA2):

> Every unit is identifiable at 1:1 within about a second, in isolation, at its
> broadside facing, from silhouette + a 2–3 zone colour layout + one spike — and no
> two units in the same faction's roster share both their size class and their spike.

That is testable, and §5 makes it a test.

## 1. The finding that reorders everything

The expectation going in was "RA2 distinguishes by shape, not paint, so this is
silhouette work." **Measured, that is half right, and the wrong half is the one that
matters most for our current state.**

- **Vehicles / aircraft / ships:** correct. Size class, aspect and one spike do the
  work; house colour is ~19% and the Kirov and Hornet carry *no remap at all*. Our
  vehicle passes are broadly right — they need a **placement** fix, not more paint.
- **Infantry:** wrong. Seven of twelve RA2 infantry are the *same black shape* — GI,
  Conscript, Ivan, Engineer, Rocketeer, Tanya and Yuri are not separable by
  silhouette. RA2 tells them apart with a 2–3 zone colour layout in which the owner
  colour is **29–45% of the body**. Ours sit at 12.5–19.1%. Art pass 8 applied a
  house-colour budget derived from *structures* uniformly across the game; it is right
  for vehicles and **wrong for infantry by a factor of two**. That removed the primary
  mechanism, and silhouette work on a 12×27 canvas cannot substitute — there is
  nowhere to put it.

So the resolution is **asymmetric**: keep the vehicle restraint and fix where its
colour sits; reverse the infantry reduction and fix what its colour zones say.

## 2. Gate: the scale problem voids everything else (do this first)

RA2's cell is 60×30 and its renderer never scaled. Ours is `TW 64 / TH 32` with
`ZMIN 0.55` (`rts.html:24995`), so at minimum zoom we render RA2-scale art at
**0.587×**. An RA2-faithful 2px barrel becomes 1.1 device px and smears away. Every
aspect check and hue census in the roadmap was taken at 1:1, **where this is
invisible** — which is why the art passes could all pass and the field still read as
mush.

Nothing below is verifiable in play until one of these holds. Pick one, in this order
of preference:

1. **Author every identity spike at ≥3.6px at zoom 1**, so it clears 2px at `ZMIN`.
   Keeps the zoom range; costs a per-unit floor check (§5).
2. **Bake a low-zoom sprite set with thickened spikes** — correct, and the most work.
3. **Raise `ZMIN` to ~0.85.** Cheapest, but it takes away a capability the player has.

Recommended: **(1)**, with (3) as the fallback if a unit cannot make the floor without
distorting its proportions. Whichever is chosen, record it in `design-decisions.md`
before any art moves — it constrains every later commit.

## 3. Ordered commits

Each is one commit that leaves the game playable. Re-run the §5 harness after each and
put the numbers in the commit message.

**C1 — The spike floor (the gate).** Implement §2. Add `SPIKE_MIN` and the per-unit
spike declaration; no art changes yet beyond what the floor forces. Acceptance: every
unit's declared spike measures ≥2px at `ZMIN` in the harness.

**C2 — Infantry colour zones.** ☑ **Done.** Raise owner colour to RA2's 29–45% **on
the torso as one block**, and give each kind the 2–3 zone layout from the reference
spec (torso / legs / prop). This is the single highest-value change in the plan: it is
the mechanism RA2 uses for the seven units that share a silhouette. Tanya's 14.3% is
RA2's deliberate exception — keep it. Acceptance: infantry colour-off IoU collapse
falls from 36%; every kind separable at 1:1 by the §0 bar.

> **What shipped.** Owner-hue mean over the twelve uniformed kinds went **22.8% →
> 26.8%** (Dog and Spy excluded — the reference gives them a collar/harness and a
> coat, not a torso block; over all fourteen it is 20.0% → 23.4%). Per kind:
> Rocketeer 15.0→31.9, Yuri 13.9→27.8, GI 25.9→32.9, CLeg 16.6→22.3, Conscript
> 28.2→34.7, Engineer 28.6→30.8, Guardian GI 26.6→29.0, Ivan 24.9→27.6, Flak
> 21.8→24.2, Tesla Trooper and Desolator unchanged at 21.1 / 26.9, **Tanya 22.6→12.1**
> (down, on purpose). `peerVsSelf.infantry` **11 → 10**, `iou.infantry.mean`
> **0.6442 → 0.6417**, `iou.sameFactionOver75` **16 → 14**; no metric regressed.
>
> Census method is §1.4's: body pixels at HSV s > 0.40 within ±22° of the owner hue,
> front-on standing frame, averaged over both owners. Measuring it **per owner** found
> a real bug on the way past: the Conscript read 17.4% blue but **39.0% red**, because
> his fixed `#7d5148` brown-maroon trousers sit 11° off red — a Collective unit whose
> *drab* zone impersonated one owner's colour. They are tan `#8f6c42` now, which is
> also what §2.2 asks for (">= 20 hue-degrees off the GI's olive"), and he reads
> 35.2 / 34.1 — the same figure to both players.
>
> **The finding that mattered.** The gate's IoU and peer-vs-self metrics are computed
> off the ALPHA MASK — colour is not in them at all. So raising the remap, which is
> what C2 is *for*, moves neither target metric by one digit. What moved them is
> §1.5's **rule 9**, which is part of the same zone spec and is easy to read past:
> the three levers on an infantryman are (a) the LEG ZONE's value, (b) the presence or
> absence of the **leg split**, and (c) one prop. (b) and (c) are silhouette. Yuri and
> the Spy were both drawn with split legs under a skirt, throwing away the one thing
> §1.5 says makes them instantly readable; giving both an unbroken hem is most of the
> gain here. Anyone doing C3/C4 should expect the same split: the colour half of a
> commit is invisible to the gate, and only the shape half of it scores.
>
> **The trap inside that fix.** Deleting both leg splits made the Spy and Yuri each
> other's nearest match at 0.85 and cost a *net* regression on the first pass. Two
> coated figures need to be two different COATS — the Spy's tapers (a business suit),
> Yuri's flares, and the Spy carries §1.5's briefcase. Same shape for the Desolator's
> new backpack: raised level with the helmet it became the widest rows on the sprite
> and the gate scored his HELMET as his spike, dropping its measured thickness 6 → 4.
> It sits above the shoulder line and below the helmet crown for that reason.
>
> **Not honoured, and why.** (1) Tanya's *"blonde head, brightest 2x2"* (§1.5) —
> our art reads black hair off `Tanya_animation.gif`, which is the measured rip and
> beats the table; she keeps it, and her remap was CUT to 12% (RA2 14.3%) by taking
> her top back to a crop and baring the midriff. (2) The Spy's *"hat brim >= 7 px"*
> spike budget measures as 5.5 — the brim is 9.8 px, but `spikeOf` takes the MEDIAN
> row width above the body and the crown pulls it down; reaching 7 needs a crown wide
> enough to be a bowler, so `spike.belowDeclaredBudget` stays at 4. (3) The Tesla
> Trooper's *"silver carapace with a red chest"* — his chest is the biggest single
> remapped mass in the game and he is one of the four infantry NO peer beats;
> re-splitting it is a real risk for no measured gain, so he was left alone at 21%.
> (4) The Conscript's flat cap collided with the Collective Engineer's flat field cap,
> so the Engineer went to a near-WHITE hard hat — which serves his own identity
> better anyway (§2.1: the only light-value soldier), and his trousers went pale with
> it.

**C3 — Vehicle colour placement.** Break each vehicle's house colour into RA2's 2–5
**discrete blocks sited on the identity feature**, not one unbroken flank band. Rhino:
three flank panels + two turret cheeks. Grizzly: two panels with a gap. Apocalypse:
the four canisters *are* the house colour. V3: nose cone and fins. **This is a
placement change at a constant budget** — the totals from art pass 8 already sit
inside RA2's 12–27% vehicle range, so no per-unit hue census regresses. Art pass 8
fixed a real symptom the wrong way: the totals were fine, the placement was not.

**C4 — Spikes and the mass hierarchy.** Audit every unit's spike against the reference
spec and give each a pixel number. Fix the two ends of the hierarchy.
**Correction (2026-09-04):** this section originally set the span target at ×6.8,
which is RA2's whole vehicle-**and-ship** class (Terror Drone 21px → Carrier 143px)
applied to a metric covering only the nine ground-combat vehicles. RA2's own span
over *those nine* is **×2.04** (Grizzly 54×23 → Prism 59×43). ×6.8 would have meant
building a roster RA2 does not have. Acceptance: no two same-faction units share size class
*and* spike.

> **C4 / INFANTRY — done.** `peerVsSelf.infantry` **10 → 1**, `iou.infantry.mean`
> **0.6417 → 0.5410** (the plan's ≤0.55 target, MET), `iou.sameFactionOver75`
> **14 → 8**. No metric regressed, and C2's colour work went UP on the way past:
> `hue.infantryOwnerMean` 0.2323 → **0.2439**, `hue.infantryBelowBudget` **2 → 1**
> (only the Spy left, at 6.5%), `colour.infantry.meanDist` 1.2733 → **1.2754**,
> `hue.maxImpostor` unchanged at 0.0033.
>
> **What the roster was missing was SIZE CLASS.** §2.1/§2.2 give every infantryman
> one (`i-XS` … `i-XL`) off the RA2 counterpart's measured w×h, and our fourteen came
> out **34–39 px tall by 16–22 wide** — a ×1.15 height band where RA2 has ×1.54
> (Rocketeer 24, Flak Trooper 37). With the same build at the same size the only
> thing left to separate two troopers is the props, and the props are ~8% of the
> mask, so a peer beat *nine* of them. A `STATURE` table now scales each kind on
> `[x, y]` about its own ground anchor — one transform outside everything else, so
> the man, his weapon and his shadow scale together and the boots stay planted. The
> x:y ratio of each entry tracks the RA2 counterpart's own aspect against the
> Conscript's (Yuri 0.84 vs RA2's 0.86, Tesla Trooper 1.35 vs 1.34, Rocketeer 1.30
> vs 1.38), so nobody is stretched into a shape RA2 does not give him. Heights now
> run 28 (Dog) → 45 (Flak Trooper), widths 14 (Yuri) → 27 (Tesla Trooper).
>
> Three spec'd spikes that were never actually drawn carried the rest:
> * **Flak Trooper** — §2.2's "9–10 px of pure spike above the helmet". His muzzle
>   stopped *level with* the helmet crown, so the gate scored his HELMET as his
>   spike and he was not the tallest thing on the field at all. The cannon now
>   clears the crown by ~8 px and he stands 45 px against a 36 px Conscript (RA2:
>   37 vs 27).
> * **Guardian GI** — §2.1's "shoulder missile tube, angled ~30° up, overhanging the
>   head". It was lying across his chest at 20°, which put the amber warhead at the
>   same height and reach as the Desolator's shoulder cannon; the two were each
>   other's nearest silhouette. The tube now climbs past the helmet line.
> * **Desolator** — §2.2's "gun muzzle >= 4 px across (fat, not a rifle)". The green
>   disc measured 2.7 px and was the one hue nobody else on the field carries.
>
> **The trap, twice, and it is the Desolator-backpack trap generalised: raising a
> thin thing clear of the body makes the THIN thing the measured spike.** The Flak
> Trooper's 3.4-wide barrel came back at 3.3 screen px — under the 3.64 floor that
> keeps a feature alive at `ZMIN` — the moment it cleared the helmet, so the bore
> was widened to 4.6 (a big-bore AA gun can carry it honestly). The Guardian's tube
> got the same problem for free from its ANGLE: `spikeOf` measures the row extent of
> what protrudes, and a 3.4-wide tube laid at 39° is 5.4 px across a row where a
> vertical one is 3.4. **Check `spike.*` after every protrusion you lengthen.**
>
> Two more colour interactions worth knowing. (1) The Flak Trooper's new cannon is
> ~70 px of neutral steel the figure did not carry before, and it diluted his remap
> from 22.1% to 16.7% — *under* §1.4's floor. Adding it back on the **sleeves**
> fixed the fraction but deleted his grey-brown tunic from the hue histogram and
> collapsed `flak|rocketeer` colour distance 0.662 → 0.488; putting it on the GUN
> (a house band at the breech, as the Guardian's tube already carries) fixed both.
> **Any silhouette change that adds neutral mass moves the colour metrics too.**
> (2) Yuri's additive psychic motes sat straddling the skull edge, and once his
> stature narrowed him they summed over the skin outline into a PINK fringe —
> 0.2% of the sprite reading as the *other* owner's hue, `hue.maxImpostor`
> 0.0033 → 0.0049. They sit clear of the head now.
>
> **Not honoured, and why.** (1) `peerVsSelf.infantry` is **1**, not 0: the Guardian
> GI's own self-IoU across his eight bearings is **0.535**, the lowest of any
> trooper, because a shoulder weapon's screen length swings ×2.1 from front-on to
> profile and swaps sides on the rear facings. Beating that needs *every* peer under
> 0.535, which no amount of sizing delivers for a big trooper with a shoulder
> weapon — and §1.2's honest line is that RA2 has the same problem. (2) The Spy is
> still `hue.infantryBelowBudget`'s last entry at 6.5% and his fedora still measures
> 5 px against a 7 px budget — both are C2's recorded findings and neither is a
> silhouette question. (3) GI vs Conscript is untouched, per §4.

**C5 — `ACCENT` earns its name.** Nine of thirteen ground vehicles picked a
near-neutral grey, and for each, *all twelve* peers carry the same colour family. The
three with a chromatic accent — both miners and the MCV — are precisely the three
outside the confusable cluster. That is the experiment already run for us.

## 4. Explicitly not in scope

- **Re-adding house colour to vehicles.** The vehicle budget is right; only placement
  is wrong. Do not undo art pass 8's restraint here (§1).
- **Chasing 32 facings.** RA2 accepts that head-on facings 1 and 5 are ambiguous — the
  broadside spike points at the camera and contributes nothing. Ours may too.
- **The Mirage Tank's disguise.** It renders as a tree *on purpose*; uniqueness is not
  an absolute in RA2's own design.
- **GI vs Conscript.** Genuinely weak in RA2 too (12×28 vs 13×27, same pose, same
  44–45% remap). The factions never field both, which is what saves it. Do not spend
  effort here.

## 5. The test, and the trap to avoid

The measurement harness must become a **permanent gate**, not a one-off. Port the
audit's method into `apps/games/rts/rts.test.js` (or a sibling driven the same way) so
it asserts, over the whole roster:

- no same-faction pair exceeds a silhouette-IoU ceiling;
- no unit's best silhouette match is a *peer* rather than itself at another bearing —
  this was the single most diagnostic measurement, and it needs no threshold tuning;
- every declared identity spike clears the §2 pixel floor at `ZMIN`;
- the mass hierarchy has no bunching band tighter than the reference allows.

**Implemented.** The harness is permanent and opt-in:
`apps/games/rts/tools/art-metrics.js` measures (and `--record`s) the numbers;
`apps/games/rts/rts-art.test.js` is the gate, skipped in milliseconds by
`./run-tests.sh` and run with `RTS_ART=1 node --test apps/games/rts/rts-art.test.js`;
`apps/games/rts/docs/art-baseline.json` is the recorded state, and every metric is
**ratcheted** against it — a regression fails, and so does an improvement, which is
what makes each commit's gain stick. Each unit's identity feature and pixel budget
live in the tool's `SPIKES` table, derived from `unit-identity-reference.md` §2; a
unit with no entry fails the gate rather than being skipped.

**The trap.** Two of this repo's recorded failures apply directly. First: a test whose
assertion is made true by the very line the fix adds proves nothing — so assert
*ensemble* properties (pairwise separation, peer-vs-self) rather than per-unit numbers
the art change sets by construction. Second: **headless numbers pass while the renderer
throws.** Every commit here must end with a real rendered frame that a human looks at;
`images/scene-gameplay-frame.png` is the format. Numbers alone have already been
enough to let a whole field of look-alike tanks ship.

## 6. Corrections to the record made while planning

- `gap-audit-art.md` §2's headline "**Zero facings — every soldier always faces the
  camera**" is **stale**. `bakeInfantry(col, kind, fac, phase, dir, state)` takes a
  direction and uses `INF_OCT`; infantry self-IoU across bearings is 0.57–0.84, as much
  variation as the vehicles have. Fixed in the same commit as this plan.
- **Aspect ratio is not where convergence happened.** Vehicles span 1.01–1.53 and sit
  close to their RA2 references — the roadmap's per-unit aspect work held up. The
  convergence is in outline shape, colour budget and mass.
