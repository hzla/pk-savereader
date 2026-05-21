import { pkhexLocations } from "../data/pkhexLocations.js";
import {
  runAndBunAbilities,
  runAndBunGrowthCurves,
  runAndBunItems,
  runAndBunMons,
  runAndBunMoves,
  runAndBunNatures
} from "../data/runAndBun.js";
import type { ParsedPokemon, SaveParseResult } from "../types.js";

const SECTOR_SIZE = 0x1000;
const SECTOR_DATA_SIZE = 0x0F80;
const MAIN_SECTION_COUNT = 14;
const SAVE_SLOT_SIZE = SECTOR_SIZE * MAIN_SECTION_COUNT;
const FULL_SAVE_SIZE = 0x20000;
const TRAILING_RTC_SIZE = 0x10;
const PARTY_COUNT_OFFSET = 0x234;
const PARTY_BASE_OFFSET = 0x238;
const PARTY_STRUCT_SIZE = 100;
const BOX_STRUCT_SIZE = 80;
const BOX_COUNT = 14;
const SLOTS_PER_BOX = 30;
const SUBSTRUCT_ORDERS = [
  [0, 1, 2, 3],
  [0, 1, 3, 2],
  [0, 2, 1, 3],
  [0, 3, 1, 2],
  [0, 2, 3, 1],
  [0, 3, 2, 1],
  [1, 0, 2, 3],
  [1, 0, 3, 2],
  [2, 0, 1, 3],
  [3, 0, 1, 2],
  [2, 0, 3, 1],
  [3, 0, 2, 1],
  [1, 2, 0, 3],
  [1, 3, 0, 2],
  [2, 1, 0, 3],
  [3, 1, 0, 2],
  [2, 3, 0, 1],
  [3, 2, 0, 1],
  [1, 2, 3, 0],
  [1, 3, 2, 0],
  [2, 1, 3, 0],
  [3, 1, 2, 0],
  [2, 3, 1, 0],
  [3, 2, 1, 0]
];

interface RunAndBunParseResult {
  party: ParsedPokemon[];
  boxMons: ParsedPokemon[];
  partyCount: number;
  boxTitles?: string[];
  warnings: SaveParseResult["warnings"];
  metadata: SaveParseResult["metadata"];
  sections: Record<string, unknown>;
}

interface SlotInfo {
  slotIndex: number;
  sectorOffsets: number[];
  counter: number;
}

interface RunAndBunRawMon {
  personality: number;
  otId: number;
  nickname: string;
  otName: string;
  species: number;
  heldItem: number;
  experience: number;
  friendship: number;
  hiddenNature: number;
  moves: number[];
  pp: number[];
  evs: number[];
  ivs: number[];
  metLocation: number;
  metLevel: number;
  metGame: number;
  pokeball: number;
  otGender: number;
  altAbility: number;
  level: number;
}

export function parseRunAndBunSave(saveInput: Uint8Array): RunAndBunParseResult {
  const save = normalizeSaveSize(saveInput);
  const activeSlot = determineActiveSlot(save);
  const warnings: SaveParseResult["warnings"] = [];
  const teamSectorOffset = activeSlot.sectorOffsets[1];
  const storageSectorOffset = activeSlot.sectorOffsets[5];
  const storageContinuationOffset = activeSlot.sectorOffsets[6] ?? 0;
  const partyCount = Math.max(0, Math.min(readU32LE(save, teamSectorOffset + PARTY_COUNT_OFFSET), 6));
  const party: ParsedPokemon[] = [];

  for (let index = 0; index < partyCount; index++) {
    const offset = teamSectorOffset + PARTY_BASE_OFFSET + (index * PARTY_STRUCT_SIZE);
    const raw = readRunAndBunMon(save, offset, true);
    if (raw) {
      party.push(toParsedPokemon(raw, true, index + 1));
    }
  }

  const currentBox = readU32LE(save, storageSectorOffset) + 1;
  const boxReadA = readRunAndBunBoxSegment(save, storageSectorOffset + 4, 1);
  const missedBytes = save.slice(storageSectorOffset + SECTOR_DATA_SIZE - boxReadA.missedByteCount, storageSectorOffset + SECTOR_DATA_SIZE);
  const boxReadB = readRunAndBunBoxSegment(save, storageContinuationOffset + 4, boxReadA.nextSlot, missedBytes);
  const boxMons = [...boxReadA.mons, ...boxReadB.mons];

  if (!party.length && !boxMons.length) {
    warnings.push({
      code: "run-and-bun-empty-save",
      message: "Run & Bun save parsed successfully, but no occupied party or box slots were found."
    });
  }

  return {
    party,
    boxMons,
    partyCount,
    warnings,
    metadata: {
      detectedGame: "Run and Bun",
      currentBox,
      activeSlot: activeSlot.slotIndex,
      saveCounter: activeSlot.counter,
      teamSectorOffset,
      storageSectorOffset,
      storageContinuationOffset
    },
    sections: {
      activeSlot,
      currentBox
    }
  };
}

function normalizeSaveSize(save: Uint8Array): Uint8Array {
  if (save.length === FULL_SAVE_SIZE + TRAILING_RTC_SIZE) {
    return save.slice(0, FULL_SAVE_SIZE);
  }
  if (save.length < SAVE_SLOT_SIZE * 2) {
    throw new Error(`Run & Bun save is too small: 0x${save.length.toString(16)}`);
  }
  return save.length >= FULL_SAVE_SIZE ? save.slice(0, FULL_SAVE_SIZE) : save;
}

function determineActiveSlot(save: Uint8Array): SlotInfo {
  const candidates = [readSlotInfo(save, 0), readSlotInfo(save, 1)].filter((slot): slot is SlotInfo => !!slot);
  if (!candidates.length) {
    throw new Error("No valid Run & Bun Gen 3 save slot found.");
  }
  return candidates.reduce((best, candidate) => candidate.counter > best.counter ? candidate : best);
}

function readSlotInfo(save: Uint8Array, slotIndex: number): SlotInfo | null {
  const slotBase = slotIndex * SAVE_SLOT_SIZE;
  if (slotBase + SAVE_SLOT_SIZE > save.length) {
    return null;
  }

  const sectorOffsets = new Array<number>(MAIN_SECTION_COUNT);
  let counter = 0;
  for (let sector = 0; sector < MAIN_SECTION_COUNT; sector++) {
    const sectorOffset = slotBase + (sector * SECTOR_SIZE);
    const sectionId = readU16LE(save, sectorOffset + 0xFF4);
    if (sectionId >= MAIN_SECTION_COUNT || sectorOffsets[sectionId] !== undefined) {
      return null;
    }
    sectorOffsets[sectionId] = sectorOffset;
    counter = Math.max(counter, readU32LE(save, sectorOffset + 0xFFC));
  }

  if (typeof sectorOffsets[1] !== "number" || typeof sectorOffsets[5] !== "number") {
    return null;
  }
  return { slotIndex, sectorOffsets, counter };
}

function readRunAndBunMon(bytes: Uint8Array, offset: number, isParty: boolean): RunAndBunRawMon | null {
  const personality = readU32LE(bytes, offset);
  if (!personality) {
    return null;
  }

  const otId = readU32LE(bytes, offset + 4);
  const order = SUBSTRUCT_ORDERS[personality % 24];
  const key = (personality ^ otId) >>> 0;
  const words = [new Array<number>(3), new Array<number>(3), new Array<number>(3), new Array<number>(3)];

  for (let logicalIndex = 0; logicalIndex < 4; logicalIndex++) {
    const encryptedIndex = order[logicalIndex];
    for (let wordIndex = 0; wordIndex < 3; wordIndex++) {
      words[logicalIndex][wordIndex] = (readU32LE(bytes, offset + 32 + (encryptedIndex * 12) + (wordIndex * 4)) ^ key) >>> 0;
    }
  }

  const growth = words[0];
  const attacks = words[1];
  const evs = words[2];
  const misc = words[3];
  const flags = (misc[0] >>> 16) >>> 0;
  const ivFlags = misc[1] >>> 0;
  const ribbonFlags = misc[2] >>> 0;
  const species = growth[0] & 0xFFFF;
  if (species <= 0 || species > runAndBunMons.length) {
    return null;
  }

  const experience = growth[1] >>> 0;
  return {
    personality,
    otId,
    nickname: decodeGbaText(bytes.subarray(offset + 8, offset + 18)),
    otName: decodeGbaText(bytes.subarray(offset + 20, offset + 27)),
    species,
    heldItem: growth[0] >>> 16,
    experience,
    friendship: (growth[2] >>> 8) & 0xFF,
    hiddenNature: (growth[2] >>> 16) & 0x1F,
    moves: [attacks[0] & 0xFFFF, attacks[0] >>> 16, attacks[1] & 0xFFFF, attacks[1] >>> 16],
    pp: [attacks[2] & 0xFF, (attacks[2] >>> 8) & 0xFF, (attacks[2] >>> 16) & 0xFF, attacks[2] >>> 24],
    evs: [evs[0] & 0xFF, (evs[0] >>> 8) & 0xFF, (evs[0] >>> 16) & 0xFF, evs[0] >>> 24, evs[1] & 0xFF, (evs[1] >>> 8) & 0xFF],
    metLocation: (misc[0] >>> 8) & 0xFF,
    metLevel: flags & 0x7F,
    metGame: (flags >>> 7) & 0xF,
    pokeball: (flags >>> 11) & 0xF,
    otGender: (flags >>> 15) & 0x1,
    ivs: [
      (ivFlags >>> 1) & 0x1F,
      (ivFlags >>> 6) & 0x1F,
      (ivFlags >>> 11) & 0x1F,
      (ivFlags >>> 16) & 0x1F,
      (ivFlags >>> 21) & 0x1F,
      (ivFlags >>> 26) & 0x1F
    ],
    altAbility: (ribbonFlags >>> 29) & 3,
    level: isParty ? readU8(bytes, offset + 84) : getRunAndBunLevel(experience, species)
  };
}

function readRunAndBunBoxSegment(
  save: Uint8Array,
  offset: number,
  startSlot: number,
  missedBytes?: Uint8Array
): { mons: ParsedPokemon[]; missedByteCount: number; nextSlot: number } {
  let readOffset = offset;
  let slot = startSlot;
  const mons: ParsedPokemon[] = [];

  if (missedBytes?.length) {
    const missingBytes = save.slice(offset, offset + BOX_STRUCT_SIZE - missedBytes.length);
    const mergedBytes = new Uint8Array(missedBytes.length + missingBytes.length);
    mergedBytes.set(missedBytes);
    mergedBytes.set(missingBytes, missedBytes.length);
    readOffset -= missingBytes.length;
    const raw = readRunAndBunMon(mergedBytes, 0, false);
    if (raw) {
      mons.push(toParsedPokemon(raw, false, slot));
    }
    slot++;
  }

  for (; readOffset < offset + SECTOR_DATA_SIZE; readOffset += BOX_STRUCT_SIZE) {
    const raw = readRunAndBunMon(save, readOffset, false);
    if (raw) {
      mons.push(toParsedPokemon(raw, false, slot));
    }
    slot++;
  }

  return {
    mons,
    missedByteCount: readOffset - (offset + SECTOR_DATA_SIZE),
    nextSlot: slot
  };
}

function toParsedPokemon(raw: RunAndBunRawMon, isParty: boolean, slot: number): ParsedPokemon {
  const absoluteSlot = slot - 1;
  const moves = raw.moves
    .filter((moveId) => moveId > 0)
    .map((moveId) => {
      const name = getRunAndBunMoveName(moveId);
      return { id: moveId, name: name === "Hidden Power" ? `${name} ${getRunAndBunHiddenPowerType(raw)}` : name };
    });
  const ability = getRunAndBunAbility(raw.species, raw.altAbility);
  const item = runAndBunItems[raw.heldItem] || (raw.heldItem ? `Item ${raw.heldItem}` : undefined);
  const metLocation = pkhexLocations.E?.[raw.metLocation] || (raw.metLocation ? `Location ${raw.metLocation}` : undefined);
  const box = isParty ? undefined : Math.floor(absoluteSlot / SLOTS_PER_BOX) + 1;
  const boxSlot = isParty ? undefined : (absoluteSlot % SLOTS_PER_BOX) + 1;

  return {
    speciesId: raw.species,
    speciesName: runAndBunMons[raw.species - 1] || `Pokemon ${raw.species}`,
    nickname: raw.nickname,
    level: raw.level,
    nature: getRunAndBunNature(raw),
    ability,
    abilitySlot: raw.altAbility,
    item,
    trainerId: raw.otId & 0xFFFF,
    moves,
    evs: {
      hp: raw.evs[0],
      atk: raw.evs[1],
      def: raw.evs[2],
      spe: raw.evs[3],
      spa: raw.evs[4],
      spd: raw.evs[5]
    },
    ivs: {
      hp: raw.ivs[0],
      atk: raw.ivs[1],
      def: raw.ivs[2],
      spe: raw.ivs[3],
      spa: raw.ivs[4],
      spd: raw.ivs[5]
    },
    metLocation,
    slot: isParty ? slot : boxSlot,
    box,
    boxSlot,
    isParty,
    source: {
      format: "run-and-bun-gen3",
      personality: raw.personality,
      otId: raw.otId,
      otName: raw.otName,
      heldItemId: raw.heldItem,
      moveIds: raw.moves,
      pp: raw.pp,
      metLocationId: raw.metLocation,
      metLevel: raw.metLevel,
      metGame: raw.metGame,
      pokeball: raw.pokeball,
      otGender: raw.otGender,
      hiddenNature: raw.hiddenNature,
      friendship: raw.friendship,
      storageSlot: isParty ? undefined : slot
    }
  };
}

function getRunAndBunMoveName(moveId: number): string {
  return runAndBunMoves[moveId] || `Move ${moveId}`;
}

function getRunAndBunHiddenPowerType(raw: RunAndBunRawMon): string {
  const hiddenPowerType = Math.floor(((raw.ivs[0] % 2)
    + (2 * (raw.ivs[1] % 2))
    + (4 * (raw.ivs[2] % 2))
    + (8 * (raw.ivs[3] % 2))
    + (16 * (raw.ivs[4] % 2))
    + (32 * (raw.ivs[5] % 2))) * 5 / 21);
  return [
    "Fighting",
    "Flying",
    "Poison",
    "Ground",
    "Rock",
    "Bug",
    "Ghost",
    "Steel",
    "Fire",
    "Water",
    "Grass",
    "Electric",
    "Psychic",
    "Ice",
    "Dragon",
    "Dark"
  ][hiddenPowerType] || "Fighting";
}

function getRunAndBunAbility(species: number, abilitySlot: number): string | undefined {
  const abilities = runAndBunAbilities[species + 1] || runAndBunAbilities[species] || [];
  let ability = abilities[abilitySlot];
  if (!ability || ability === "None") {
    ability = abilities[0];
  }
  return ability && ability !== "None" ? ability : undefined;
}

function getRunAndBunNature(raw: RunAndBunRawMon): string | undefined {
  const index = raw.hiddenNature === 26 ? raw.personality % 25 : raw.hiddenNature;
  return runAndBunNatures[index];
}

function getRunAndBunLevel(exp: number, species: number): number {
  let level = 1;
  while (level < 100 && exp >= getRunAndBunExpRequired(species, level + 1)) {
    level++;
  }
  return level;
}

function getRunAndBunExpRequired(species: number, level: number): number {
  const curve = runAndBunGrowthCurves[species - 1] ?? 0;
  switch (curve) {
    case 1:
      return level <= 50
        ? Math.floor(((100 - level) * (level ** 3)) / 50)
        : level <= 68
          ? Math.floor(((150 - level) * (level ** 3)) / 100)
          : level <= 98
            ? Math.floor((Math.floor((1911 - (10 * level)) / 3) * (level ** 3)) / 500)
            : Math.floor(((160 - level) * (level ** 3)) / 100);
    case 2:
      return level < 15
        ? Math.floor((Math.floor((level + 1) / 3) + 24) * (level ** 3) / 50)
        : level <= 36
          ? Math.floor((level + 14) * (level ** 3) / 50)
          : Math.floor((Math.floor(level / 2) + 32) * (level ** 3) / 50);
    case 3:
      return Math.floor((6 * (level ** 3)) / 5) - (15 * (level ** 2)) + (100 * level) - 140;
    case 4:
      return Math.floor((4 * (level ** 3)) / 5);
    case 5:
      return Math.floor((5 * (level ** 3)) / 4);
    default:
      return level ** 3;
  }
}

function decodeGbaText(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) {
    if (byte === 0xFF) {
      break;
    }
    text += decodeGbaChar(byte);
  }
  return text.trim();
}

function decodeGbaChar(byte: number): string {
  if (byte === 0x00) return " ";
  if (byte >= 0xA1 && byte <= 0xAA) return String(byte - 0xA1);
  if (byte >= 0xBB && byte <= 0xD4) return String.fromCharCode("A".charCodeAt(0) + byte - 0xBB);
  if (byte >= 0xD5 && byte <= 0xEE) return String.fromCharCode("a".charCodeAt(0) + byte - 0xD5);
  if (byte === 0xB0) return ".";
  if (byte === 0xB1) return "-";
  if (byte === 0xB2) return ".";
  if (byte === 0xB4) return "'";
  if (byte === 0xB7) return "$";
  if (byte === 0xB8) return ",";
  if (byte === 0xB9) return "*";
  if (byte === 0xBA) return "/";
  if (byte === 0xAB) return "!";
  if (byte === 0xAC) return "?";
  return "";
}

function readU8(bytes: Uint8Array, offset: number): number {
  return bytes[offset] || 0;
}

function readU16LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8)) >>> 0;
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}
