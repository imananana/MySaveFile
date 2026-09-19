# Third-party acknowledgments

MySaveFile (this repository) is licensed under the GNU General Public License,
version 3 — see [LICENSE](./LICENSE). What that licence does and does not cover
is set out under "What the GPL covers here" at the end of this file.

The planner uses a number of community-discovered facts about
The Sims 4's binary save and thumbnail formats. These notes credit the projects
whose published work helped document those formats. The code in this repository
is an independent implementation; no third-party source code has been copied
or translated into this project.

## s4pi (Sims 4 Package Interface)

- **Source**: <https://github.com/s4ptacle/Sims4Tools>
- **License**: GNU General Public License, version 3. Its package-index code is
  carried forward from s3pi (the Sims 3 Package Interface) by Peter L Jones,
  also GPLv3.
- **What it documents**: The DBPF v2.1 container format used by The Sims 4,
  including the layout of the household-thumbnail resource — a JPEG with a
  custom `"ALFA"` APP0 segment at offset 24 containing a 4-byte big-endian
  length followed by an embedded PNG. The PNG's red channel encodes the alpha
  mask that, when composited with the JPEG's RGB, produces the clean transparent
  cutout shown by tools like Sims 4 Studio.
- **Where used in this project**: [src/lib/thumbCache.ts](src/lib/thumbCache.ts)
  decodes that ALFA-embedded alpha PNG and composites it with the JPEG. The
  implementation is original TypeScript using the browser Canvas API; only the
  format itself (which is not copyrightable) is shared with s4pi.
  [src/lib/dbpf.ts](src/lib/dbpf.ts) reads the container index the same way —
  written from the format, sharing no code with s4pi.

## qfs-compression

- **Source**: <https://github.com/sebamarynissen/qfs-compression>
- **License**: MIT — Copyright (c) 2021 Sebastiaan Marynissen
- **Where used in this project**: [src/lib/refpack.ts](src/lib/refpack.ts)
  calls it to decompress the RefPack (QFS) streams inside a save. It ships to
  the browser as part of the app.

> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

## Other open-source libraries

Installed from npm and listed, with versions, in `package.json` and
`server/package.json`; each package carries its own licence file once
installed. All are compatible with GPLv3.

- **MIT**: React, React DOM, React Router, Zustand, Phosphor Icons, nanoid,
  Sentry SDKs, Express and its middleware (compression, cookie-parser, cors,
  express-session, multer), Passport, jsonwebtoken, bcryptjs, pg, archiver,
  unzipper, resend, zod
- **Apache-2.0**: AWS SDK for JavaScript (S3 client), sharp, Puppeteer
- **BSD-2-Clause**: dotenv
- **SIL Open Font License**: Plus Jakarta Sans and Inter, and **Apache-2.0**:
  Yellowtail — all loaded from Google Fonts, none stored in this repository

## Phase-3-Sims-4-Game-Mod (jolieschae)

- **Source**: <https://github.com/jolieschae/Phase-3-Sims-4-Game-Mod>
- **What it documents**: Decompiled `.proto` definitions extracted from the
  Sims 4 game scripts. The repo includes (among other things) `Clubs_pb2.py`,
  business / holiday / household / lot persistable services, and the field
  numbers used for each save record. Roughly three years old as of this
  writing — predates Businesses & Hobbies and Dynasties — but the older
  records (sims, lots, households, clubs, holidays, retail businesses) match
  exactly what's still in current saves.
- **Where used in this project**: Field-number layouts informed
  [src/lib/saveParser.ts](src/lib/saveParser.ts) — specifically the readers for
  clubs (`PersistableClubService`), holidays (`PersistableHolidayService`),
  households (`PersistableHouseholdService`), sims, and the older
  business/retail records. Newer formats (Businesses & Hobbies small business,
  custom venues) were reverse-engineered against live saves; the diagnostic
  scripts in [scripts/diagnostics/](scripts/diagnostics/) document that work.

## Sims 4 Studio (community tool)

- **Source**: <https://sims4studio.com>
- **What it provided**: ResourceKey instance hexes for the club, holiday, and
  small-business icon pickers shown in-game. The planner's icon library
  (`/public/club-icons/`, `/public/holiday-icons/`,
  `/public/small-business-icons/`) is named with these hexes so that a save's
  stored ResourceKey can map directly to a `.png` file with no lookup table.
- **Note**: Icon image files were extracted from the game with Sims 4 Studio
  by the maintainer for personal use within this planner. The original images
  remain EA / Maxis assets — see below.

## EA / Maxis

- The Sims 4 and all of its game data formats, tunings, art, and content are
  © Electronic Arts Inc. / Maxis. The live site displays icons and world maps
  extracted from the game so that a plan looks like the save it mirrors; those
  images remain EA's, are **not part of this repository**, and are not covered
  by its licence.
- Tuning IDs cited in code comments (venue tuning IDs, holiday type IDs, etc.)
  and the stock names in `src/data/` are factual identifiers from the game
  data, used here for interoperability.
- This project is not affiliated with, endorsed by, or sponsored by EA or
  Maxis. "The Sims" is a trademark of Electronic Arts Inc.

## What the GPL covers here

- **Covered — GPLv3**: all source code in this repository, © Iman Akhtar.
- **Not covered — all rights reserved, © Iman Akhtar**: the MySaveFile name and
  logo, the artwork (the clay plumbob, favicons, link-preview cards, landing
  images, portrait), and the written copy — the landing page, About page, help
  pages and guides. They are here so the app builds and reads as
  it does live; please don't reuse them for another site or product.
- **Not included at all**: EA's icons and maps (see above). The folders they
  load from are listed in the README, with how to supply your own.
