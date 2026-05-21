export type ParserFamily =
  | "gen12"
  | "gen3"
  | "gen45"
  | "gen6"
  | "gen7"
  | "radical-red"
  | "unbound"
  | "emerald-imperium"
  | "pokemon-null"
  | "run-and-bun";

export type BaseGame =
  | "RB"
  | "YW"
  | "GS"
  | "C"
  | "RS"
  | "E"
  | "FRLG"
  | "DP"
  | "Pt"
  | "HGSS"
  | "BW"
  | "BW2"
  | "XY"
  | "ORAS"
  | "SM"
  | "USUM"
  | "rad_red"
  | "unbound"
  | "imp"
  | "null"
  | "run_and_bun";

export type ParseSaveInput =
  | {
      baseGame: BaseGame;
      title?: string;
      save: ArrayBuffer | Uint8Array;
      options?: ParseSaveOptions;
    }
  | {
      title: string;
      save: ArrayBuffer | Uint8Array;
      options?: ParseSaveOptions;
    };

export interface ParseSaveOptions {
  includeShowdown?: boolean;
  forceBlock2?: boolean;
  boxSlots?: number;
}

export interface SupportedTitle {
  title: string;
  aliases: string[];
  parser: ParserFamily;
  generation: number;
  baseGame: BaseGame;
  baseVersion?: string;
  mechanics?: "vanilla" | "hge";
  saveExpansion?: boolean;
  notes?: string;
}

export interface SaveProfile extends SupportedTitle {
  key: string;
  runtimeBaseGame?: string;
}

export interface ParsedStats {
  hp?: number;
  atk?: number;
  def?: number;
  spa?: number;
  spd?: number;
  spe?: number;
}

export interface ParsedMove {
  id?: number;
  name: string;
}

export interface ParsedPokemon {
  speciesId?: number;
  speciesName: string;
  nickname?: string;
  level?: number;
  gender?: "M" | "F" | "N";
  nature?: string;
  ability?: string;
  abilitySlot?: number;
  item?: string;
  trainerId?: number;
  moves: ParsedMove[];
  evs?: ParsedStats;
  ivs?: ParsedStats;
  metLocation?: string;
  isEgg?: boolean;
  partyIndex?: number;
  partySlot?: number;
  boxIndex?: number;
  boxSlotIndex?: number;
  boxSlot?: number;
  slot?: number;
  box?: number;
  isParty: boolean;
  source?: Record<string, unknown>;
}

export interface ParsedBox {
  box: number;
  name?: string;
  pokemon: ParsedPokemon[];
}

export interface ParseWarning {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ParsedEventFlag {
  id: number;
  label: string;
  category?: string;
  value: boolean;
}

export interface ParsedEventWork {
  id: number;
  value: number;
}

export interface ParsedEventFlags {
  gameKey: string;
  flagCount: number;
  workCount: number;
  flags: ParsedEventFlag[];
  activeFlags: ParsedEventFlag[];
  works: ParsedEventWork[];
}

export interface ParsedHallOfFamePokemon {
  speciesId?: number;
  speciesName?: string;
  nickname?: string;
  level?: number;
  form?: number;
  gender?: "M" | "F" | "N";
  isShiny?: boolean;
  trainerId?: number;
  secretId?: number;
  moves?: ParsedMove[];
  item?: string;
  source?: Record<string, unknown>;
}

export interface ParsedHallOfFameEntry {
  index: number;
  clearIndex?: number;
  date?: string;
  pokemon: ParsedHallOfFamePokemon[];
  source?: Record<string, unknown>;
}

export interface ParsedHallOfFame {
  gameKey: string;
  format: "gen3-teams" | "gen4-dendou" | "gen5-dendou" | "gen5-raw" | "gen6-teams" | "gen7-species";
  clearCount?: number;
  nextIndex?: number;
  entries: ParsedHallOfFameEntry[];
  source?: Record<string, unknown>;
}

export interface SaveParseResult {
  title: string;
  profileKey: string;
  generation: number;
  baseGame: BaseGame;
  party: ParsedPokemon[];
  boxes: ParsedBox[];
  boxMons: ParsedPokemon[];
  warnings: ParseWarning[];
  showdown: string;
  eventFlags?: ParsedEventFlags;
  hallOfFame?: ParsedHallOfFame;
  metadata: {
    trainerId?: number;
    secretId?: number;
    trainerIdSecret?: number;
    detectedGame?: string;
    boxTitles?: string[];
    [key: string]: unknown;
  };
  sections: Record<string, unknown>;
}
