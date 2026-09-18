# Unit and landscape scale review — 2026-09-15

Scope: 41 unit keys (42 including both MCVs), 43 building keys (67
faction/neutral entries), and all seven maps. This is a scale review, not
a claim that every existing drawing is a finished RA2-quality asset.

## Visual decisions

Reviewed fixed-scale roster sheets, both factions' base scenes, fleets beside
their shipyards, and actual map renders. IFV, Apocalypse and Soviet Barracks
were also checked against the local RA2 reference images before editing.

| Category | Decision |
| --- | --- |
| Infantry, specialists, dog | Retain current sizes; keep readable native pixels and the heavy-infantry distinction. |
| Light vehicles | IFV bake scale 1.30 → 1.06; its wheels/body previously rivalled the main tanks. Flak Track retains its tall working gun. |
| Battle tanks | Apocalypse .84 → .98; visibly more substantial beside Rhino/Grizzly. Preserve the other tanks' approved silhouettes. |
| Miners and MCVs | Retain the larger, full-bodied utility class and both faction-specific MCVs. |
| Aircraft | Retain Hornet < Harrier < Nighthawk < Kirov hierarchy; no whole-sprite blur/upscale. |
| Naval units | Retain elongated capital ships, smaller escorts, and broad transports. Review with water and a shipyard, not grass. |
| Military structures | Reduce the Soviet Barracks statue about its feet (.90 horizontal, .82 vertical); keep its base and training block unchanged. Retain other footprints and functional clearances. |
| Civilian/tech structures and defenses | Review actual neutral sprites, not the generic faction-building fallback. Retain existing scale. |

## Landscape changes

- Cliff step 32 → 56 screen pixels, with one shared height for the world and
  cliff baker; ramp skirts and viewport culling follow the taller elevation.
- Gem Valley's square cliff perimeter becomes rounded; ridge strips acquire
  tapered ends and a slight bend while retaining their passes.
- River Crossing widens from four to eight cells. Bridges, bank streets and
  repair huts move together. Both banks of both crossings now reserve approach
  roads before random obstacles: seed 90210 exposed a blocked far abutment.
- Lake Divide's main lake expands from radii 11×7 to 14×9, with shaped shores.
- Coastal bay widens from cross-axis radius 11 to 14.5; harbour entrances taper
  into it. The central island and a connected sea remain.
- Fuller tree clusters on the six specialist maps; ground materials follow
  shorelines, cliff feet and woodland instead of noise alone.
- Clear approaches to the mountain passes as well as bridges; a wider
  360-route sweep exposed Chokepoint seed 10's blocked pass mouth.
- Keep the 64×64 board, default 1× display and .75–2× zoom range. Widening
  geography does not require shrinking infantry or changing every travel time.
  Iron Frontier retains its established open lanes and simulation RNG sequence.

## Reproduction and checks

Run `node tools/size-review.js` for all unit/building sheets, including quarter
views for ground and naval units. Run `node tools/world-size-review.js after`
for fixed-seed map/base/fleet captures under `art/out/world-after-*.png`.
`CMP_MAG=3 node tools/ra2-compare.js ifv mammoth` produces eight-bearing
reference comparisons and real gameplay views.

The simulation suite checks navigation, bridges, repair, naval connectivity,
save/load, economy and lockstep. The new `rts-world-scale.test.js` additionally
checks mirrored material/elevation, clear start pads, connected routes across
35 map/seed combinations, the broad connected bay, eight-cell bridge spans,
and raised-ground projection at four zoom levels. Pixel checks cover 2,432
vehicle frames/layers per DPR and unfiltered live drawing at three zooms.
These are regression checks, not substitutes for looking at the images.
An additional navigation sweep checked 60 seeds on each of the six changed
specialist maps: all 360 routes connected after protecting the pass approaches.

No art baseline was regenerated. Deployment is not part of this change.
