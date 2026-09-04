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

> **C2 / C4 — infantry colour — done.** `hue.infantryOwnerMean` **0.2439 →
> 0.2946** (the ≥0.29 target, MET), `hue.infantryBelowBudget` **1 → 0**,
> `iou.sameFactionOver75` **3 → 1** (the survivor is Aegis|Destroyer, naval),
> `spike.belowDeclaredBudget` **4 → 2** (the survivors are the Destroyer and the
> Landing Craft, naval). Nothing regressed, and two metrics improved on the way
> past: `iou.infantry.mean` **0.5410 → 0.5334** and `colour.infantry.meanDist`
> **1.2754 → 1.3124**. `hue.maxImpostor` unchanged at 0.0033, and every
> non-infantry number is byte-identical.
>
> Per kind: Spy 6.5→32.0, Tesla Trooper 20.6→33.7, Guardian GI 24.0→30.1,
> Desolator 24.7→31.1, Flak Trooper 24.8→31.2, Yuri 25.5→25.9, GI 27.4→33.0,
> Chrono Legionnaire 31.6→31.9, Ivan 31.7→35.8 (§2.2 asks ≥35), Conscript
> 32.0→34.6, Rocketeer 34.2 and Engineer 36.6 untouched. **Dog and Tanya were
> not painted** — the mean is over all fourteen including the two the budget
> metric exempts, which is a real tension worth stating: RA2 itself keeps those
> two drab, so the 0.29 has to be earned entirely on the other twelve, and it
> was.
>
> **The Spy was the biggest single win, and it was a misreading rather than a
> shortfall.** §1.5's infantry table heads its middle column *"mid zone
> (HOUSE)"* and gives the Spy `fedora / long coat / unbroken hem / briefcase` —
> RA2 remaps the **coat**. Ours was a fixed charcoal suit with a house-colour
> TIE, a 2 px stripe, and he came in at 6.5%, the lowest uniformed figure in the
> game. The coat body is the house block now over the same unbroken charcoal
> hem, with charcoal lapels, hat and shoes: three zones, the GI's own layout
> worn by a man in a hat. The tie went dark for the same reason the Collective
> Engineer's red star did — a saturated note has to stop being the owner's
> colour once the garment beside it is.
>
> **The fedora, and why C2's "reaching 7 needs a bowler" was wrong.**
> `spikeOf('v')` calls a row BODY at 55% of the widest row and scores the median
> width of what stands above it, so the wide brim is body and the run above it is
> the CROWN alone. Neither of the two faults was the brim. (1) The crown was 5.8
> units under a 9.8 brim — **0.59, which is a top hat's proportion.** A real
> fedora's crown is 0.60–0.70 of its brim, because the brim is a 1–1.5 px lip
> round it; 7.6 under 11.6 is 0.66, and it measures **9 px against a budget of
> 7**. (2) The widest row on an infantryman is the **contact-shadow blob**
> (rx 6.0 → ~13.2 × `STATURE[0]` px), not his shoulders, so the cut sat at 6.6
> and a 7 px crown would have counted as body and taken the spike to zero. The
> overcoat's padded 1940s shoulder now beats the shadow, and **the hat is drawn
> at true screen width** — a brim and a crown are round in PLAN, so they present
> the same width from every compass bearing while the man under them turns.
> Inside the body's `scale(TURN, 1)` the fedora lost a quarter of itself at the
> three-quarter facings, and that is exactly where the gate was scoring it.
>
> **`wpn()` is a model, not a wrapper, and it is wrong for a weapon held ACROSS
> the body.** It gives a piece its full length back as the man turns to profile,
> which is right for a shoulder tube pointing along the facing and backwards for
> a rifle across the chest. Enforcing §2.1's *"rifle ≥ 9 px **long**"* on the
> Chrono Legionnaire under `wpn` swung his weapon enough to take his own
> cross-bearing self-IoU 0.707 → 0.631 and hand him to the Rocketeer as a
> peer-vs-self failure; drawn in body space it narrows with his shoulders, and he
> is len 7 → 9 at thick 10 with self-IoU 0.678. (The outer `MIR` still swaps it
> left-for-right with the facing; the extra front-to-back `GSIDE` flip was
> dropped, because a rifle across the chest is *behind* him on the rear facings
> and which screen side it lands on there is arbitrary.)
>
> **The Desolator's pack is the C4 trap read backwards.** The gate wanted 8 rows
> of protrusion and measured 7, and the obvious move — raise the tanks — makes it
> **worse**: at the profile facings the body is squeezed 0.66 and the tanks are
> not, so lifting them into the helmet's rows takes that band over the 55% cut and
> the run gets SHORTER. Measured sweep: +2.0 → 4 rows, +1.0 → 6, 0 → 7, **−1.0 →
> 8**. What is counted is how many rows stay NARROW, not how high the widest thing
> sits. The helmet went up a unit and the tanks down half of one.
>
> **The Guardian GI, twice.** §2.1 asks the tube to clear the helmet by ≥4 px and
> it stopped a pixel and a half SHORT of the crown. Raising it dropped the
> measured thickness **10 → 2.5**, under the 3.64 floor, because the rows it
> newly exposed were the warhead's pointed 1–2 px TIP — the same trap the Flak
> Trooper's barrel and the Desolator's backpack each fell into once. A missile
> nose is blunt: it is a 5.0-wide round-capped stroke now and the topmost row it
> owns is already 4 px across. Then he had to come DOWN — at 45 rows he stood
> level with the Flak Trooper, whose whole identity in §2.2 is being the tallest
> man in the game, and **two tall figures with a long weapon over the right
> shoulder are one silhouette**: they became each other's nearest match at 0.605
> and both failed peer-vs-self. `STATURE` 1.10×1.14 → 1.12×1.03, 42 rows against
> the Flak Trooper's 45.
>
> **Engineer|Spy 0.7647 → 0.7374 and Engineer|Tanya 0.7519 → 0.6951**, bought
> with §1.5's own rule 9 rather than by shrinking anyone. The Spy's overcoat
> TAPERS hard — a business coat against Yuri's flared robe — and has no leg split
> at all; the Engineer gets the widest planted stance on the field, a workman
> standing over his work. And the Engineer is **shared**, so he stands in both
> rosters and pairs with all thirteen: at 19×31 he sat between Tanya (20×33) and
> the Spy (19×29) and owned BOTH failing pairs. 1.06×0.82 (21×30) clears them.
>
> **Not honoured, and why.** (1) `peerVsSelf.infantry` is still **1**, the
> Guardian GI — but C4's verdict is now measured rather than assumed, and it is
> **reachable**. Drawing his tube in body space the way the CLeg's rifle now is
> takes his self-IoU 0.482 → 0.627 and `peerVsSelf.infantry` to **0**, the first
> time any pass has reached it. Rejected on two measurements: the tube stops being
> what makes him unlike everyone else, so `iou.infantry.mean` goes 0.5334 →
> **0.5486** — a regression that lands 0.0014 under the 0.55 ceiling and leaves
> the next pass nowhere to stand — and the physics is wrong, because a launcher
> braced on the shoulder and aimed *along* the facing genuinely does foreshorten
> head-on and open out at profile, which is the case `wpn` exists for. If a later
> pass finds room under the ceiling, this is a one-line change. (2) The Tesla
> Trooper's chest is still one house block, against §2.2's *"silver carapace
> value ≥ 0.70 across ≥ 40% of the torso"*. C2 declined to re-split it and that
> call stands; his budget went on the HIPS and the gauntlet cuffs instead, which
> is the same three-block armour pattern and took him 20.6 → 33.7 without
> touching the biggest remapped mass in the game. (3) GI vs Conscript untouched,
> per §4. (4) The GI is at 33.0% where RA2's E1 measures 45.2%, and the Conscript
> 34.6% against 44.6%. The headroom is real but the code's own record is that a
> 45%-remap GI *"read as a plastic figure rather than a soldier in a uniform"*,
> and 30–35% is where he still reads as a man in a uniform. Part of the gap is
> also an artefact worth writing down: **our masks include the contact-shadow
> blob (~18% of a sprite, pure neutral) and §1.4's RA2 census had the SHP shadow
> index masked out**, so our percentages are measured against a larger
> denominator than RA2's were.

> **C6 — NAVAL — done.** `peerVsSelf.naval` **8 → 1**, `iou.naval.mean`
> **0.4781 → 0.3835** (the plan's ≤0.45 target, MET with room),
> `iou.sameFactionOver75` **3 → 2** — Aegis|Destroyer was the naval entry at
> 0.7524 and is now **0.6235**, the worst naval pair of any kind is 0.673, and the
> two that remain are C2/C4's infantry pairs. `spike.belowFloor` **1 → 0** and
> `spike.minThickAtZmin` **1.65 → 2.20**, both of which were the Landing Craft.
> `spike.belowDeclaredBudget` **4 → 2** (the two left are the Chrono Legionnaire
> and the Spy — infantry). `hue.maxImpostor` 0.0033 → **0.0027**. Nothing outside
> the group moved by one digit: `peerVsSelf.vehicle/infantry/air`,
> `iou.groundCombat/vehicle/infantry/air`, `mass.*` and every `hue.*` are byte-equal
> to the pre-change run, which is what you expect when the diff is confined to
> `bakeShip`.
>
> Per ship, self-IoU / best peer / peers beating self:
>
> | ship | selfIoU | best peer | beat |
> |---|---|---|---|
> | Sea Scorpion | 0.801 | Amph Transport 0.673 | 0 |
> | Landing Craft | 0.694 | Amph Transport 0.665 | 0 |
> | Aegis Cruiser | 0.647 | Destroyer 0.623 | 0 |
> | Dolphin | 0.632 | Typhoon Sub 0.340 | 0 |
> | Aircraft Carrier | 0.614 | Giant Squid 0.581 | 0 |
> | Giant Squid | 0.590 | Aircraft Carrier 0.581 | 0 |
> | Dreadnought | 0.573 | Aircraft Carrier 0.543 | 0 |
> | Typhoon Sub | 0.458 | Sea Scorpion 0.448 | 0 |
> | **Destroyer** | **0.476** | Landing Craft 0.626 | **5** |
>
> **The lever was SIZE CLASS, exactly as C4 found for infantry, and the second
> lever was that no two crowns may be the same HEIGHT.** Our nine hull lengths were
> bunched between 18 and 58 pre-scale px, and the Giant Squid — RA2's `[SQD]` is
> **117x30**, the second-longest sprite in the game — was drawn at **20**, inside
> the Dolphin's class. The `G` table is now RA2's own broadside widths rescaled so
> the Destroyer keeps L 46 against its 101 px sprite. That alone moved
> `iou.naval.mean` 0.4781 → 0.4640 and took Aegis|Destroyer under the ceiling.
>
> The rest came from crown HEIGHT. `iou()` centres both masks on their bbox centre,
> so a crown that both ships share at the same height is pure overlap: the Destroyer
> and the Aegis each carried a ~12-unit block amidships and matched at 0.73 no
> matter what the hulls did. Dropping the Destroyer to a low 11.6-unit wheelhouse
> and taking the Aegis to a 20-unit slab tower — which is also what RA2's two look
> like, a low destroyer and a blocky cruiser — took the pair to 0.593 in one edit
> and closed the Aegis outright. The fleet's crowns now run 25 (Dreadnought) → 20
> (Aegis) → 11.6 (Destroyer) → 10.6 (Carrier island) → 9.2 (Sea Scorpion) → 7.6
> (Landing Craft) → ~7 (Typhoon sail), and each is the feature §2.3/§2.4 names.
>
> **Four bugs found on the way, each of which was the art lying about itself:**
> * **The Squid and the Dolphin were being drawn on a warship's hull.** Every kind
>   ran the same three ship steps — filled plan at the waterline, graded freeboard,
>   lit sheer line — so under the paint the Squid was a 50x16 SHIP, and the alpha
>   mask the gate reads is exactly that hull. §2.4 asks for "zero straight edges …
>   the only unit whose outline is not a machine". Skipping the three steps for the
>   two animals dropped Squid|Destroyer **0.726 → 0.563** on its own.
> * **`box(u, v, len, wid, hgt)` takes a FULL width, and the hull's beam is `2 * W`.**
>   Every deckhouse in the file was written as `W * 1.0`, i.e. *half* the beam — a
>   superstructure narrower than the ship under it. They are 60-80% of beam now,
>   which is what the RA2 sprites carry, and it is why no crown could ever
>   out-measure the hull.
> * **The Landing Craft's ramp was folded UP over the bow**, inside the hull
>   outline — a texture, not a spike (§1.3 rule 4). So the longest horizontal
>   protrusion on her sprite was the **bow WAVE**, a 1-px decorative stroke, and the
>   gate scored *that* as her identity feature at 3.00 px: the game's only
>   `spike.belowFloor`. The ramp is down and reaches past the stem now, and measures
>   **11.0**.
> * **The Destroyer's measured spike was her own STEM POST.** A plan that comes to
>   zero beam extrudes its freeboard into a 2-px column, and seen end-on that column
>   is the tallest thing on the ship. Giving every hull a real stem plate
>   (`W * 0.28`, the Typhoon's finer at 0.16) plus replacing her 13-unit wire mast
>   with a solid mack took her from 4.00 to **16.0**.
>
> **The trap, and it is C4's trap at sea: the thin decorative thing wins.**
> `spikeOf` picks the bearing with the LONGEST run past the body and then takes the
> MEDIAN cross-extent of it, so a 1-px wake that runs nine columns outboard beats a
> ten-px ramp that runs six. The bow wave's outboard throw is now scaled by
> `min(W, L * 0.30)` rather than by beam alone — a fat slow barge does not throw a
> wake half again her own width — which is both truer and what let the ramp win.
> Worth recording the other direction too: **the wake HELPS**. Narrowing it cost
> `iou.naval.mean` 0.0030 and re-opened a ship, because a size-proportional halo
> round a hull is facing-invariant mass, which is the same thing a crown is.
>
> Two colour interactions, both C4's "any silhouette change that adds neutral mass
> moves the colour metrics" rule: growing the **Carrier** to RA2's 143-px class and
> the **Dreadnought**'s launch boxes to 25 units diluted their remap to **9.2%** and
> **9.2%**, under §1.4's 11.5% vehicle floor. Fixed where RA2 puts colour on those
> two — the Carrier's deck markings (landing strip, deck edges, round-down band:
> 20.9%) and the Dreadnought's launch heads, which §2.4 says *are* the house colour
> (16.7%). Naval is not inside `hue.vehicleOwnerMean` (the group is `naval`), so
> neither showed up as a gate movement; they were only visible per unit.
>
> **Not honoured, and why.** (1) `peerVsSelf.naval` is **1**, not 0: the
> **Destroyer**'s own self-IoU across her eight bearings is **0.476**, the lowest
> afloat, and five peers sit between 0.51 and 0.63. Closing her needs either her
> self above 0.626 or all five peers under 0.476, and neither is reachable — a
> 46 x 12 hull swings from an 89 x 62 broadside to a 36-wide end-on, and every route
> to raising her self is a taller crown, which is precisely what puts Aegis|Destroyer
> back over 0.70 (measured: a 20-unit wheelhouse gives 0.729). This is the Guardian
> GI's problem with a longer hull: §1.6.3 records that RA2 accepts the head-on
> collapse, and RA2's own `[DEST]` and `[AEGIS]` are 101x41 and 91x35 — an 11%
> length difference, which is not a silhouette separation either. (2) The **Typhoon
> Sub**'s bbox height is 0.67 of her length against §2.4's "height ≤ 0.20 x length".
> That ratio is an ELEVATION measured off a 75x14 RA2 sprite; our isometric bbox
> folds the beam into the height, and a hull with zero superstructure at this beam
> already measures 0.45. She is the flattest thing afloat by a wide margin, carries
> the sail as her only vertical mass, and her plan aspect is **6.0** against RA2's
> 5.36 — the spec's intent is met, its literal number is not measurable here.
> (3) The **Sea Scorpion** is L 22 against an RA2-implied 27, and the **Landing
> Craft** L 32 x W 24 rather than the ~36 x 16 the rescale implies. Both are
> deliberate: the Scorpion has to stop matching the Typhoon (a 15-unit gun pedestal
> did it too, and turned a 45-px gunboat into a chimney on a dinghy — the proportion
> is the honest version of that fix), and the barge has to stop matching the
> Amphibious Transport, whose 30x21 footprint is not mine to move. Both keep their
> spec'd identity: shortest armed hull afloat, and the beamiest thing in the game.
> (4) The **Squid** has no owner colour at all and the fleet's fixed chroma is the
> lowest of any group (min 0.062 / mean 0.145 / max 0.326). That is the spec — haze
> grey and olive-slate hulls, §2.4's sea monster — and no crown added here made it
> worse.
>
> Checked with a real rendered frame, per §5: all ten hulls spawned on the Coastal
> map's bay at zoom 1 and driven through the live renderer, not the bake canvas.
> The size ladder reads at a glance — Carrier, Dreadnought, Squid, Destroyer/Aegis,
> Landing Craft, Sea Scorpion, Typhoon, Dolphin — and no two hulls in the frame
> could be mistaken for each other. No page errors, no bake errors.

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
