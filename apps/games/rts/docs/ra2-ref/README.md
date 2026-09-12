# RA2 in-game reference library

This catalog covers the live game roster: **41 unit types**, **43 building types**, and **97/97 faction-specific variants**. It contains **112 local source images**. Open [the visual index](./index.html) to filter and inspect them.

The catalog deliberately excludes build-menu cameos. Vehicle references favor eight-bearing in-game sheets and voxel renders; infantry use original sprite animations; structures use idle, operating, firing, or deployment animations. Each source is downloaded by exact wiki title, decoded through every frame, checksummed, and linked to its source page.

The civilian roles in this game combine several regional RA2 structures. Their entries therefore name the closest Westwood object IDs and use full original mission or map renders as battle-scale references. Vanilla RA2 has only one completed mission gate, so the Soviet gate entry documents that limitation instead of inventing a Soviet source.

Run `node tools/ra2-reference-library.js --download` to fetch missing files and rebuild the manifest and visual index. Running without `--download` performs an offline integrity and roster-coverage audit.
