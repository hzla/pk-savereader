# romhack-save-reader

Browser-native save readers for Pokemon romhacks and vanilla games supported by Dynamic Calc.

```ts
import { parseSave } from "romhack-save-reader";

const input = document.querySelector<HTMLInputElement>("#save")!;
input.addEventListener("change", async () => {
  const file = input.files?.[0];
  if (!file) return;

  const result = parseSave({
    baseGame: "C",
    title: "Crystal Clear",
    save: await file.arrayBuffer()
  });

  renderParty(result.party);
  renderBoxes(result.boxes);
});
```

## API

- `parseSave({ baseGame, title, save, options })` parses a raw save file and returns structured party/box data plus Showdown text. `title` is optional and enables romhack-specific adjustments when the title is registered.
- `parseSave({ title, save, options })` is still supported for registered titles. Unknown titles should be retried with an explicit `baseGame`.
- `listSupportedTitles()` returns registered titles and parser families.
- `resolveSaveProfile(title)` returns the routing profile used by `parseSave`.
- `toShowdown(result)` returns the compatibility Showdown import text.

```ts
parseSave({ baseGame: "RB", save });
parseSave({ baseGame: "C", title: "Crystal Clear", save });
parseSave({ baseGame: "run_and_bun", title: "Pokemon Run & Bun", save });
```

Every parsed Pokemon includes stable position fields. Party Pokemon expose zero-based `partyIndex` and one-based `partySlot`; boxed Pokemon expose one-based `box`, zero-based `boxIndex`, zero-based `boxSlotIndex`, and one-based `boxSlot`. The legacy-compatible `slot` field mirrors `partySlot` or `boxSlot`.

`parseSave` also exposes `eventFlags` and `hallOfFame` for vanilla/basegame-derived profiles. These are intentionally disabled for Radical Red, Unbound, Emerald Imperium, Pokemon Null, and Run & Bun until their heavily customized layouts are modeled directly.

`eventFlags.activeFlags` contains labeled, currently-set event flags sourced from PKHeX's known flag lists. `eventFlags.works` contains non-zero EventWork values for developers who need lower-level progression counters.

`hallOfFame` parses team/species entries for Gen 3, Gen 4, Gen 5, Gen 6, and Gen 7 layouts when present. Gen 5 BW/B2W2 uses the Dendou circular Hall of Fame records from the external save area.

### Pokemon return shape

`result.party`, `result.boxMons`, and each `result.boxes[n].pokemon` entry contain `ParsedPokemon` objects. Fields vary by generation and romhack, but the stable shape is:

```ts
const pokemon = result.party[0];

// Example ParsedPokemon
{
  speciesId: 389,
  speciesName: "Torterra",
  nickname: "TURTWIG",
  level: 64,
  gender: "M",
  nature: "Adamant",
  ability: "Overgrow",
  abilitySlot: 1,
  item: "Leftovers",
  trainerId: 12345,
  moves: [
    { id: 89, name: "Earthquake" },
    { id: 242, name: "Crunch" },
    { id: 348, name: "Leaf Blade" },
    { id: 444, name: "Stone Edge" }
  ],
  evs: { hp: 252, atk: 252, def: 0, spa: 0, spd: 4, spe: 0 },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  metLocation: "Route 201",
  isEgg: false,
  isParty: true,
  partyIndex: 0,
  partySlot: 1,
  slot: 1,
  source: {
    offset: 15328,
    encrypted: true
  }
}
```

Boxed Pokemon use the same object shape with box position fields:

```ts
const boxed = result.boxMons[0];

{
  speciesName: "Bulbasaur",
  level: 12,
  moves: [{ name: "Tackle" }, { name: "Growl" }],
  isParty: false,
  box: 1,
  boxIndex: 0,
  boxSlot: 1,
  boxSlotIndex: 0,
  slot: 1
}
```

Top-level box grouping is available through `result.boxes`:

```ts
{
  box: 1,
  name: "Box 1",
  pokemon: [/* ParsedPokemon[] */]
}
```

### Hall of Fame data

Hall of Fame data is returned as `result.hallOfFame` when the selected base game has a supported HoF layout and the save contains readable records.

```ts
const result = parseSave({ baseGame: "Pt", save });

if (result.hallOfFame) {
  console.log(result.hallOfFame.format);
  console.log(result.hallOfFame.clearCount);

  for (const entry of result.hallOfFame.entries) {
    console.log(`Entry ${entry.index}`, entry.date);

    for (const pokemon of entry.pokemon) {
      console.log({
        slot: pokemon.source?.slot,
        species: pokemon.speciesName,
        level: pokemon.level,
        moves: pokemon.moves?.map((move) => move.name)
      });
    }
  }
}
```

`hallOfFame.entries` is ordered by stored record index. Individual Pokemon records include the data available for that generation, such as `speciesName`, `level`, `form`, `gender`, `isShiny`, `moves`, `trainerId`, `secretId`, and a `source` object with low-level record metadata.

The return shape looks like this:

```ts
// Example ParsedHallOfFame
{
  gameKey: "platinum",
  format: "gen4-dendou",
  clearCount: 3,
  nextIndex: 3,
  entries: [
    {
      index: 0,
      clearIndex: 3,
      date: "2024-05-06",
      pokemon: [
        {
          speciesId: 491,
          speciesName: "Darkrai",
          nickname: "DARKRAI",
          level: 100,
          form: 0,
          gender: "N",
          trainerId: 12345,
          secretId: 54321,
          moves: [
            { id: 399, name: "Dark Pulse" },
            { id: 94, name: "Psychic" }
          ],
          source: { slot: 1 }
        }
      ],
      source: { physicalRecordIndex: 0 }
    }
  ],
  source: {
    checksumValid: true,
    revision: 3
  }
}
```

### Event flags and badges

Known event flags are returned as `result.eventFlags` for supported vanilla/basegame-derived profiles. Each labeled flag has an `id`, `label`, optional `category`, and boolean `value`.

```ts
const result = parseSave({ baseGame: "E", save });

const activeFlags = result.eventFlags?.activeFlags ?? [];
const activeStoryFlags = activeFlags.map((flag) => ({
  id: flag.id,
  label: flag.label
}));
```

Badge ownership is represented by labeled event flags for games whose PKHeX flag resources expose badge labels. For those games, filter the full flag list so you can show both obtained and missing badges:

```ts
import type { ParsedEventFlags } from "romhack-save-reader";

function getBadgeFlags(eventFlags?: ParsedEventFlags) {
  return (eventFlags?.flags ?? [])
    .filter((flag) => /\bbadge\b/i.test(flag.label))
    .filter((flag) => /\b(received|obtained|got|earned)\b/i.test(flag.label))
    .map((flag) => ({
      id: flag.id,
      name: flag.label.replace(/\b(Received|Obtained|Got|Earned)\b\s+/i, ""),
      obtained: flag.value
    }));
}

const badges = getBadgeFlags(result.eventFlags);
const obtainedBadges = badges.filter((badge) => badge.obtained);

console.log(`Badges: ${obtainedBadges.length}/${badges.length}`);
console.table(obtainedBadges);
```

For Emerald-derived saves, this yields labels like `Stone Badge`, `Knuckle Badge`, and `Dynamo Badge`. If `badges.length` is `0`, the save may still parse correctly, but that base game does not currently have labeled badge flags in the bundled PKHeX-derived flag table. In that case, use `eventFlags.works` only for lower-level progression counters until a title-specific badge mapping is added.

The flag return shape includes all labeled flags, the subset that are active, and non-zero EventWork counters:

```ts
// Example ParsedEventFlags
{
  gameKey: "gen3-emerald",
  flagCount: 2400,
  workCount: 256,
  flags: [
    {
      id: 2151,
      label: "Received Stone Badge",
      category: "s",
      value: true
    },
    {
      id: 2152,
      label: "Received Knuckle Badge",
      category: "s",
      value: false
    }
  ],
  activeFlags: [
    {
      id: 2151,
      label: "Received Stone Badge",
      category: "s",
      value: true
    }
  ],
  works: [
    { id: 4, value: 12 },
    { id: 17, value: 1 }
  ]
}
```

## PKHeX Reference

PKHeX is used as a reference for vanilla save layout behavior during development. It is not bundled and is not a runtime dependency.

## Supported Titles

### Base games

Use these with the preferred `parseSave({ baseGame, title?, save })` API. If `title` is omitted, the save is parsed with the base-game layout.

| Base Game | Parser | Generation |
| --- | --- | ---: |
| RB | gen12 | 1 |
| YW | gen12 | 1 |
| GS | gen12 | 2 |
| C | gen12 | 2 |
| RS | gen3 | 3 |
| E | gen3 | 3 |
| FRLG | gen3 | 3 |
| DP | gen45 | 4 |
| Pt | gen45 | 4 |
| HGSS | gen45 | 4 |
| BW | gen45 | 5 |
| BW2 | gen45 | 5 |
| XY | gen6 | 6 |
| ORAS | gen6 | 6 |
| SM | gen7 | 7 |
| USUM | gen7 | 7 |
| rad_red | radical-red | 8 |
| unbound | unbound | 8 |
| imp | emerald-imperium | 8 |
| null | pokemon-null | 8 |
| run_and_bun | run-and-bun | 8 |

### Title overrides

Known titles can be passed as `title` to enable title-specific save behavior where implemented. Title-only compatibility calls are also supported for these entries.

| Title | Parser | Generation | Base Game |
| --- | --- | ---: | --- |
| Emerald | gen3 | 3 | E |
| Fire Red | gen3 | 3 | FRLG |
| Fire Red Omega | gen3 | 3 | FRLG |
| Emerald Kaizo | gen3 | 3 | E |
| Royal Sapphire | gen3 | 3 | E |
| Autumn Red | gen3 | 3 | FRLG |
| Ruby/Sapphire | gen3 | 3 | RS |
| Diamond/Pearl | gen45 | 4 | DP |
| Platinum | gen45 | 4 | Pt |
| Platinum Kaizo | gen45 | 4 | Pt |
| Renegade Platinum | gen45 | 4 | Pt |
| Platinum Redux | gen45 | 4 | Pt |
| Heart Gold/Soul Silver | gen45 | 4 | HGSS |
| Sterling Silver | gen45 | 4 | HGSS |
| Sacred Gold/Storm Silver | gen45 | 4 | HGSS |
| Hardlove Gold | gen45 | 4 | HGSS |
| Black/White | gen45 | 5 | BW |
| Black 2/White 2 | gen45 | 5 | BW2 |
| Blaze Black/Volt White | gen45 | 5 | BW |
| Blaze Black 2/Volt White 2 Redux | gen45 | 5 | BW2 |
| Cascade White | gen45 | 5 | BW2 |
| Blinding White 2 | gen45 | 5 | BW2 |
| Vintage White Plus | gen45 | 5 | BW |
| X/Y | gen6 | 6 | XY |
| Sun/Moon | gen7 | 7 | SM |
| Ultra Sun/Ultra Moon | gen7 | 7 | USUM |
| Ancestral X | gen6 | 6 | XY |
| Photonic Sun/Prismatic Moon | gen7 | 7 | USUM |
| Radical Red | radical-red | 8 | rad_red |
| Pokemon Unbound | unbound | 8 | unbound |
| Emerald Imperium | emerald-imperium | 8 | imp |
| Pokemon Null | pokemon-null | 8 | null |
| Run and Bun | run-and-bun | 8 | run_and_bun |
