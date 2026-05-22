import type { BaseGame, SaveProfile, SupportedTitle } from "./types.js";

const baseProfiles: SaveProfile[] = [
  { key: "base-rb", title: "Red/Blue", aliases: ["Pokemon Red", "Pokemon Blue"], parser: "gen12", generation: 1, baseGame: "RB" },
  { key: "base-yw", title: "Yellow", aliases: ["Pokemon Yellow"], parser: "gen12", generation: 1, baseGame: "YW" },
  { key: "base-gs", title: "Gold/Silver", aliases: ["Pokemon Gold", "Pokemon Silver"], parser: "gen12", generation: 2, baseGame: "GS" },
  { key: "base-c", title: "Crystal", aliases: ["Pokemon Crystal"], parser: "gen12", generation: 2, baseGame: "C" },
  { key: "base-rs", title: "Ruby/Sapphire", aliases: ["Ruby", "Sapphire", "Pokemon Ruby", "Pokemon Sapphire"], parser: "gen3", generation: 3, baseGame: "RS", runtimeBaseGame: "g3" },
  { key: "base-e", title: "Emerald", aliases: ["Pokemon Emerald"], parser: "gen3", generation: 3, baseGame: "E", runtimeBaseGame: "g3" },
  { key: "base-frlg", title: "FireRed/LeafGreen", aliases: ["Fire Red", "FireRed", "Leaf Green", "Pokemon Fire Red", "Pokemon Leaf Green"], parser: "gen3", generation: 3, baseGame: "FRLG", runtimeBaseGame: "g3" },
  { key: "base-dp", title: "Diamond/Pearl", aliases: ["Diamond", "Pearl", "Pokemon Diamond", "Pokemon Pearl"], parser: "gen45", generation: 4, baseGame: "DP" },
  { key: "base-pt", title: "Platinum", aliases: ["Pokemon Platinum"], parser: "gen45", generation: 4, baseGame: "Pt" },
  { key: "base-hgss", title: "HeartGold/SoulSilver", aliases: ["Heart Gold", "Soul Silver", "HGSS"], parser: "gen45", generation: 4, baseGame: "HGSS" },
  { key: "base-bw", title: "Black/White", aliases: ["Black", "White", "Pokemon Black", "Pokemon White"], parser: "gen45", generation: 5, baseGame: "BW", runtimeBaseGame: "BW", baseVersion: "BW" },
  { key: "base-bw2", title: "Black 2/White 2", aliases: ["Black 2", "White 2", "Pokemon Black 2", "Pokemon White 2", "B2W2"], parser: "gen45", generation: 5, baseGame: "BW2", runtimeBaseGame: "BW", baseVersion: "BW2" },
  { key: "base-xy", title: "X/Y", aliases: ["Pokemon X", "Pokemon Y"], parser: "gen6", generation: 6, baseGame: "XY", runtimeBaseGame: "g6" },
  { key: "base-oras", title: "Omega Ruby/Alpha Sapphire", aliases: ["ORAS", "Omega Ruby", "Alpha Sapphire"], parser: "gen6", generation: 6, baseGame: "ORAS", runtimeBaseGame: "g6" },
  { key: "base-sm", title: "Sun/Moon", aliases: ["Sun", "Moon", "Pokemon Sun", "Pokemon Moon"], parser: "gen7", generation: 7, baseGame: "SM", runtimeBaseGame: "g7" },
  { key: "base-usum", title: "Ultra Sun/Ultra Moon", aliases: ["Ultra Sun", "Ultra Moon", "USUM"], parser: "gen7", generation: 7, baseGame: "USUM", runtimeBaseGame: "g7" },
  { key: "base-radical-red", title: "Radical Red", aliases: [], parser: "radical-red", generation: 8, baseGame: "rad_red", runtimeBaseGame: "rad_red" },
  { key: "base-unbound", title: "Pokemon Unbound", aliases: ["Unbound"], parser: "unbound", generation: 8, baseGame: "unbound", runtimeBaseGame: "unbound" },
  { key: "base-emerald-imperium", title: "Emerald Imperium", aliases: [], parser: "emerald-imperium", generation: 8, baseGame: "imp", runtimeBaseGame: "imp" },
  { key: "base-pokemon-null", title: "Pokemon Null", aliases: ["Null"], parser: "pokemon-null", generation: 8, baseGame: "null", runtimeBaseGame: "null" },
  { key: "base-run-and-bun", title: "Run and Bun", aliases: ["Run & Bun", "Run&Bun", "Pokemon Run and Bun", "Pokemon Run & Bun"], parser: "run-and-bun", generation: 8, baseGame: "run_and_bun", runtimeBaseGame: "run_and_bun" }
];

const titleProfiles: SaveProfile[] = [
  { key: "emerald", title: "Emerald", aliases: ["Pokemon Emerald"], parser: "gen3", generation: 3, baseGame: "E", runtimeBaseGame: "g3" },
  { key: "firered", title: "Fire Red", aliases: ["Pokemon Fire Red", "FireRed", "Leaf Green", "Pokemon Leaf Green"], parser: "gen3", generation: 3, baseGame: "FRLG", runtimeBaseGame: "g3" },
  { key: "fire-red-omega", title: "Fire Red Omega", aliases: ["FireRed Omega"], parser: "gen3", generation: 3, baseGame: "FRLG", runtimeBaseGame: "g3" },
  { key: "emerald-kaizo", title: "Emerald Kaizo", aliases: [], parser: "gen3", generation: 3, baseGame: "E", runtimeBaseGame: "g3" },
  { key: "royal-sapphire", title: "Royal Sapphire", aliases: ["Royal Saphire"], parser: "gen3", generation: 3, baseGame: "RS", runtimeBaseGame: "g3" },
  { key: "autumn-red", title: "Autumn Red", aliases: [], parser: "gen3", generation: 3, baseGame: "FRLG", runtimeBaseGame: "g3" },
  { key: "ruby-sapphire", title: "Ruby/Sapphire", aliases: ["Ruby", "Sapphire", "Pokemon Ruby", "Pokemon Sapphire"], parser: "gen3", generation: 3, baseGame: "RS", runtimeBaseGame: "g3" },

  { key: "diamond-pearl", title: "Diamond/Pearl", aliases: ["Diamond", "Pearl", "Pokemon Diamond", "Pokemon Pearl"], parser: "gen45", generation: 4, baseGame: "DP" },
  { key: "platinum", title: "Platinum", aliases: ["Pokemon Platinum"], parser: "gen45", generation: 4, baseGame: "Pt" },
  { key: "platinum-kaizo", title: "Platinum Kaizo", aliases: [], parser: "gen45", generation: 4, baseGame: "Pt" },
  { key: "renegade-platinum", title: "Renegade Platinum", aliases: [], parser: "gen45", generation: 4, baseGame: "Pt" },
  { key: "platinum-redux", title: "Platinum Redux", aliases: ["Platinum Redux HC"], parser: "gen45", generation: 4, baseGame: "Pt" },
  { key: "hgss", title: "Heart Gold/Soul Silver", aliases: ["Heart Gold", "Soul Silver", "HGSS"], parser: "gen45", generation: 4, baseGame: "HGSS" },
  { key: "sterling-silver", title: "Sterling Silver", aliases: ["Sterling Silver 1.14", "Sterling Silver 1.15", "Sterling Silver 1.16"], parser: "gen45", generation: 4, baseGame: "HGSS" },
  { key: "sacred-gold-storm-silver", title: "Sacred Gold/Storm Silver", aliases: ["Sacred Gold", "Storm Silver"], parser: "gen45", generation: 4, baseGame: "HGSS" },
  { key: "hardlove-gold", title: "Hardlove Gold", aliases: ["Heart Gold Engine Rom"], parser: "gen45", generation: 4, baseGame: "HGSS", mechanics: "hge", saveExpansion: true },
  { key: "black-white", title: "Black/White", aliases: ["Black", "White", "Pokemon Black", "Pokemon White"], parser: "gen45", generation: 5, baseGame: "BW", runtimeBaseGame: "BW", baseVersion: "BW" },
  { key: "black2-white2", title: "Black 2/White 2", aliases: ["Black 2", "White 2", "Pokemon Black 2", "Pokemon White 2"], parser: "gen45", generation: 5, baseGame: "BW2", runtimeBaseGame: "BW", baseVersion: "BW2" },
  { key: "blaze-black-volt-white", title: "Blaze Black/Volt White", aliases: [], parser: "gen45", generation: 5, baseGame: "BW", runtimeBaseGame: "BW", baseVersion: "BW" },
  { key: "bb2-redux", title: "Blaze Black 2/Volt White 2 Redux", aliases: ["Blaze Black 2 Redux", "Volt White 2 Redux"], parser: "gen45", generation: 5, baseGame: "BW2", runtimeBaseGame: "BW", baseVersion: "BW2" },
  { key: "cascade", title: "Cascade White", aliases: ["Cascade"], parser: "gen45", generation: 5, baseGame: "BW2", runtimeBaseGame: "BW", baseVersion: "BW2" },
  { key: "blinding-white-2", title: "Blinding White 2", aliases: [], parser: "gen45", generation: 5, baseGame: "BW2", runtimeBaseGame: "BW", baseVersion: "BW2" },
  { key: "vintage-white-plus", title: "Vintage White Plus", aliases: [], parser: "gen45", generation: 5, baseGame: "BW", runtimeBaseGame: "BW", baseVersion: "BW" },

  { key: "x-y", title: "X/Y", aliases: ["X", "Y", "Pokemon X", "Pokemon Y"], parser: "gen6", generation: 6, baseGame: "XY", runtimeBaseGame: "g6" },
  { key: "sun-moon", title: "Sun/Moon", aliases: ["Sun", "Moon", "Pokemon Sun", "Pokemon Moon"], parser: "gen7", generation: 7, baseGame: "SM", runtimeBaseGame: "g7" },
  { key: "ultra-sun-ultra-moon", title: "Ultra Sun/Ultra Moon", aliases: ["Ultra Sun", "Ultra Moon", "USUM", "Pokemon Ultra Sun", "Pokemon Ultra Moon"], parser: "gen7", generation: 7, baseGame: "USUM", runtimeBaseGame: "g7" },
  { key: "gen6", title: "Ancestral X", aliases: ["Navy Sapphire", "Reignited Ruby", "Rising Ruby", "Sinking Sapphire", "Eternal X", "Wilting Y"], parser: "gen6", generation: 6, baseGame: "XY", runtimeBaseGame: "g6" },
  { key: "gen7", title: "Photonic Sun/Prismatic Moon", aliases: ["Photonic Sun", "Prismatic Moon", "Sun", "Moon", "Ultra Sun", "Ultra Moon"], parser: "gen7", generation: 7, baseGame: "USUM", runtimeBaseGame: "g7" },

  { key: "radical-red", title: "Radical Red", aliases: ["Radical Red 4.1", "Radical Red 4.1 Hardcore", "Radical Red 4.1 Normal"], parser: "radical-red", generation: 8, baseGame: "rad_red", runtimeBaseGame: "rad_red" },
  { key: "unbound", title: "Pokemon Unbound", aliases: ["Unbound", "Unbound 2.1.1"], parser: "unbound", generation: 8, baseGame: "unbound", runtimeBaseGame: "unbound" },
  { key: "emerald-imperium", title: "Emerald Imperium", aliases: ["Emerald Imperium 1.3"], parser: "emerald-imperium", generation: 8, baseGame: "imp", runtimeBaseGame: "imp" },
  { key: "pokemon-null", title: "Pokemon Null", aliases: ["Pokemon Null 1.2", "Null"], parser: "pokemon-null", generation: 8, baseGame: "null", runtimeBaseGame: "null" },
  { key: "run-and-bun", title: "Run and Bun", aliases: ["Run & Bun", "Run&Bun", "Pokemon Run and Bun", "Pokemon Run & Bun"], parser: "run-and-bun", generation: 8, baseGame: "run_and_bun", runtimeBaseGame: "run_and_bun" }
];

const profiles: SaveProfile[] = [...titleProfiles];

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/pokemon/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeBaseGame(value: string): string {
  return value.toLowerCase().replace(/pokemon/g, "").replace(/[^a-z0-9]+/g, "");
}

export function listSupportedTitles(): SupportedTitle[] {
  return profiles.map(({ key: _key, runtimeBaseGame: _runtimeBaseGame, ...profile }) => ({ ...profile }));
}

export function resolveBaseProfile(baseGame: string): SaveProfile {
  const normalized = normalizeBaseGame(baseGame);
  const profile = baseProfiles.find((candidate) => normalizeBaseGame(candidate.baseGame) === normalized || [candidate.title, ...candidate.aliases].some((alias) => normalizeBaseGame(alias) === normalized));
  if (!profile) {
    throw new Error(`Unsupported base game: ${baseGame}`);
  }
  return { ...profile };
}

export function tryResolveSaveProfile(title: string): SaveProfile | undefined {
  const normalized = normalizeTitle(title);
  const exact = profiles.find((profile) => [profile.title, ...profile.aliases].some((candidate) => normalizeTitle(candidate) === normalized));
  if (exact) {
    return { ...exact, title };
  }

  const partial = profiles.find((profile) => [profile.title, ...profile.aliases].some((candidate) => {
    const normalizedCandidate = normalizeTitle(candidate);
    return normalizedCandidate.length >= 3 && normalized.length >= 3 && (normalized.includes(normalizedCandidate) || normalizedCandidate.includes(normalized));
  }));
  return partial ? { ...partial, title } : undefined;
}

export function resolveSaveProfile(title: string): SaveProfile {
  const profile = tryResolveSaveProfile(title);
  if (!profile) {
    throw new Error(`Unsupported romhack title: ${title}. Pass baseGame to parse as a vanilla/base game save.`);
  }
  return profile;
}

export const internalProfiles = profiles;
export const internalBaseProfiles = baseProfiles;
