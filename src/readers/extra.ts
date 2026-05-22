import { flagLabels } from "../data/flagLabels.js";
import { createLegacyContext } from "../legacy/runtime.js";
import { decodeGen4String, decodeUtf16LEString } from "./text.js";
import type {
  ParsedEventFlags,
  ParsedHallOfFame,
  ParsedHallOfFameEntry,
  ParsedHallOfFamePokemon,
  ParsedMove,
  ParseWarning,
  SaveProfile
} from "../types.js";

interface ExtraParseResult {
  eventFlags?: ParsedEventFlags;
  hallOfFame?: ParsedHallOfFame;
  warnings: ParseWarning[];
}

type LegacyNameContext = Record<string, any>;

const excludedParsers = new Set(["radical-red", "unbound", "emerald-imperium", "pokemon-null", "run-and-bun"]);

export function parseAdditionalSaveData(profile: SaveProfile, save: Uint8Array, detectedGame?: string): ExtraParseResult {
  if (excludedParsers.has(profile.parser)) {
    return { warnings: [] };
  }

  const ctx = createLegacyContext(profile);
  const warnings: ParseWarning[] = [];

  try {
    if (profile.parser === "gen3") {
      return { ...parseGen3Extra(profile, save, ctx, detectedGame), warnings };
    }
    if (profile.parser === "gen45") {
      return { ...parseDsExtra(profile, save, ctx), warnings };
    }
    if (profile.parser === "gen6") {
      return { ...parseGen6Extra(save, ctx, detectedGame), warnings };
    }
    if (profile.parser === "gen7") {
      return { ...parseGen7Extra(save, ctx, detectedGame), warnings };
    }
  } catch (error) {
    warnings.push({
      code: "extra-save-data-parse-failed",
      message: error instanceof Error ? error.message : String(error),
      details: { profileKey: profile.key, parser: profile.parser }
    });
  }

  return { warnings };
}

function parseGen3Extra(
  profile: SaveProfile,
  save: Uint8Array,
  ctx: LegacyNameContext,
  detectedGame?: string
): Omit<ExtraParseResult, "warnings"> {
  const logical = rebuildGen3LogicalBuffers(save);
  const gameKey = resolveGen3FlagKey(profile, detectedGame);
  const layout = gameKey === "gen3-frlg"
    ? { eventFlag: 0xEE0, eventWork: 0x1000, flagCount: 8 * 288, workCount: 0x100 }
    : { eventFlag: 0x1270, eventWork: 0x139C, flagCount: 8 * 300, workCount: 0x100 };

  return {
    eventFlags: parseKnownEventFlags(
      gameKey,
      logical.largeBuffer,
      layout.eventFlag,
      layout.flagCount,
      logical.largeBuffer,
      layout.eventWork,
      layout.workCount
    ),
    hallOfFame: parseGen3HallOfFame(save, ctx, gameKey)
  };
}

function parseDsExtra(profile: SaveProfile, save: Uint8Array, ctx: LegacyNameContext): Omit<ExtraParseResult, "warnings"> {
  if (profile.baseGame === "BW" || profile.baseGame === "BW2") {
    const isB2W2 = profile.baseVersion === "BW2";
    const gameKey = isB2W2 ? "b2w2" : "bw";
    const eventOffset = isB2W2 ? 0x1FF00 : 0x20100;
    const workCount = isB2W2 ? 0x1AF : 0x13E;
    const flagCount = isB2W2 ? 0xBF8 : 0xB60;
    return {
      eventFlags: parseKnownEventFlags(gameKey, save, eventOffset + (workCount * 2), flagCount, save, eventOffset, workCount),
      hallOfFame: parseGen5HallOfFame(save, ctx, gameKey, isB2W2)
    };
  }

  const general = getGen4GeneralBlock(profile, save);
  const isHgss = profile.baseGame === "HGSS";
  const isDp = profile.baseGame === "DP";
  const gameKey = isHgss ? "hgss" : isDp ? "diamond-pearl" : "platinum";
  const eventWork = isHgss ? 0xDE4 : isDp ? 0xD9C : 0xDAC;
  const eventFlag = isHgss ? 0x10C4 : isDp ? 0xFDC : 0xFEC;
  const workCount = (eventFlag - eventWork) >> 1;

  return {
    eventFlags: parseKnownEventFlags(gameKey, general, eventFlag, 0xB60, general, eventWork, workCount),
    hallOfFame: parseGen4HallOfFame(profile, save, ctx, gameKey)
  };
}

function parseGen6Extra(save: Uint8Array, ctx: LegacyNameContext, detectedGame?: string): Omit<ExtraParseResult, "warnings"> {
  const gameKey = detectedGame === "ORAS" || save.length >= 0x76000 ? "oras" : "xy";
  const hofOffset = gameKey === "oras" ? 0x19E00 : 0x19400;
  return {
    eventFlags: parseKnownEventFlags(gameKey, save, 0x14A00 + (0x178 * 2), 0xD00, save, 0x14A00, 0x178),
    hallOfFame: parseGen6HallOfFame(save, ctx, gameKey, hofOffset)
  };
}

function parseGen7Extra(save: Uint8Array, ctx: LegacyNameContext, detectedGame?: string): Omit<ExtraParseResult, "warnings"> {
  const gameKey = detectedGame === "USUM" || save.length >= 0x6CC00 ? "usum" : "sm";
  const eventOffset = gameKey === "usum" ? 0x01E00 : 0x01C00;
  const flagCount = gameKey === "usum" ? 4960 : 4000;
  const fameOffset = eventOffset + (gameKey === "usum" ? 0xA3C : 0x9C4);
  return {
    eventFlags: parseKnownEventFlags(gameKey, save, eventOffset + (1000 * 2), flagCount, save, eventOffset, 1000),
    hallOfFame: parseGen7HallOfFame(save, ctx, gameKey, fameOffset)
  };
}

function parseKnownEventFlags(
  gameKey: string,
  flagBytes: Uint8Array,
  flagOffset: number,
  flagCount: number,
  workBytes: Uint8Array,
  workOffset: number,
  workCount: number
): ParsedEventFlags {
  const labels = flagLabels[gameKey as keyof typeof flagLabels] || {};
  const flags = Object.entries(labels)
    .map(([rawId, info]) => {
      const id = Number(rawId);
      return {
        id,
        label: info.label,
        category: info.category,
        value: readBit(flagBytes, flagOffset, id)
      };
    })
    .sort((a, b) => a.id - b.id);

  const works = [];
  for (let id = 0; id < workCount; id++) {
    const value = readU16LE(workBytes, workOffset + (id * 2));
    if (value !== 0) {
      works.push({ id, value });
    }
  }

  return {
    gameKey,
    flagCount,
    workCount,
    flags,
    activeFlags: flags.filter((flag) => flag.value),
    works
  };
}

function parseGen3HallOfFame(save: Uint8Array, ctx: LegacyNameContext, gameKey: string): ParsedHallOfFame | undefined {
  if (save.length < 0x1E000) {
    return undefined;
  }
  const sector1 = save.slice(0x1C000, 0x1C000 + 0xF80);
  const sector2 = save.slice(0x1D000, 0x1D000 + 0xF80);
  const data = concatBytes([sector1, sector2]);
  const entries: ParsedHallOfFameEntry[] = [];

  for (let index = 0; index < 50; index++) {
    const start = index * (6 * 0x14);
    const pokemon: ParsedHallOfFamePokemon[] = [];
    for (let slot = 0; slot < 6; slot++) {
      const offset = start + (slot * 0x14);
      const packed = readU16LE(data, offset + 8);
      const rawSpecies = packed & 0x1FF;
      const level = packed >> 9;
      const speciesId = typeof ctx.g3GetNationalSpeciesId === "function" ? ctx.g3GetNationalSpeciesId(rawSpecies) : rawSpecies;
      if (!speciesId || !level) {
        continue;
      }
      pokemon.push({
        speciesId,
        speciesName: speciesName(ctx, speciesId),
        nickname: typeof ctx.g3DecodeText === "function" ? ctx.g3DecodeText(data, offset + 10, 10) : undefined,
        level,
        trainerId: readU16LE(data, offset),
        secretId: readU16LE(data, offset + 2),
        isShiny: isGen3Shiny(readU32LE(data, offset), readU32LE(data, offset + 4)),
        source: { slot: slot + 1 }
      });
    }
    if (pokemon.length) {
      entries.push({ index, pokemon });
    }
  }

  return { gameKey, format: "gen3-teams", entries };
}

function parseGen4HallOfFame(profile: SaveProfile, save: Uint8Array, ctx: LegacyNameContext, gameKey: string): ParsedHallOfFame | undefined {
  const block = getGen4HallOfFameBlock(profile, save);
  if (!block) {
    return undefined;
  }

  const recordSize = (6 * 0x3C) + 4;
  const endDataOffset = 30 * recordSize;
  const entries: ParsedHallOfFameEntry[] = [];
  for (let index = 0; index < 30; index++) {
    const recordOffset = index * recordSize;
    const year = readU16LE(block, recordOffset + recordSize - 4);
    const month = block[recordOffset + recordSize - 2] || 0;
    const day = block[recordOffset + recordSize - 1] || 0;
    const pokemon: ParsedHallOfFamePokemon[] = [];

    for (let slot = 0; slot < 6; slot++) {
      const offset = recordOffset + (slot * 0x3C);
      const speciesId = readU16LE(block, offset);
      const level = block[offset + 2] || 0;
      if (!speciesId || !level) {
        continue;
      }
      pokemon.push({
        speciesId,
        speciesName: speciesName(ctx, speciesId),
        level,
        form: block[offset + 3] || 0,
        nickname: decodeGen4String(block, offset + 0x0C, 22),
        trainerId: readU16LE(block, offset + 8),
        secretId: readU16LE(block, offset + 10),
        moves: moveIdsToMoves(ctx, [
          readU16LE(block, offset + 0x32),
          readU16LE(block, offset + 0x34),
          readU16LE(block, offset + 0x36),
          readU16LE(block, offset + 0x38)
        ]),
        source: { slot: slot + 1 }
      });
    }

    if (pokemon.length) {
      entries.push({
        index,
        date: formatDate(year, month, day),
        pokemon
      });
    }
  }

  return {
    gameKey,
    format: "gen4-dendou",
    clearCount: readU32LE(block, endDataOffset + 4),
    nextIndex: readU32LE(block, endDataOffset),
    entries,
    source: {
      checksumValid: crc16Ccitt(block.slice(0, 0x2ABE)) === readU16LE(block, 0x2ABE),
      revision: readU32LE(block, 0x2AB4)
    }
  };
}

interface Gen5HallOfFameCandidate {
  data: Uint8Array;
  offset: number;
  hasData: boolean;
  isPlausible: boolean;
  latestNumber: number;
  recordCount: number;
  savePoint: number;
}

function parseGen5HallOfFame(save: Uint8Array, ctx: LegacyNameContext, gameKey: string, isB2W2: boolean): ParsedHallOfFame | undefined {
  const primaryOffset = isB2W2 ? 0x74000 : 0x7C800;
  const backupOffset = isB2W2 ? 0x75800 : 0x7E000;
  const size = 0x155C;
  const sectionSize = 0x1800;
  if (save.length < primaryOffset + size && save.length < backupOffset + size) {
    return undefined;
  }

  const primary = readGen5HallOfFameCandidate(save, primaryOffset, size);
  const backup = readGen5HallOfFameCandidate(save, backupOffset, size);
  const selected = chooseGen5HallOfFameCandidate(primary, backup);

  if (!selected?.isPlausible) {
    return {
      gameKey,
      format: "gen5-raw",
      entries: [],
      source: {
        primaryOffset,
        backupOffset,
        size,
        sectionSize,
        primaryHasData: primary.hasData,
        backupHasData: backup.hasData,
        primaryPlausible: primary.isPlausible,
        backupPlausible: backup.isPlausible
      }
    };
  }

  const entries: ParsedHallOfFameEntry[] = [];
  for (let index = 0; index < selected.recordCount; index++) {
    const physicalIndex = normalizeGen5HallRecordIndex(selected.savePoint - 1 - index);
    const recordOffset = physicalIndex * 0x16C;
    const pokemon: ParsedHallOfFamePokemon[] = [];

    for (let slot = 0; slot < 6; slot++) {
      const offset = recordOffset + (slot * 0x3C);
      const speciesId = readU16LE(selected.data, offset);
      if (!speciesId) {
        break;
      }
      const formGender = selected.data[offset + 3] || 0;
      const idNumber = readU32LE(selected.data, offset + 8);
      pokemon.push({
        speciesId,
        speciesName: speciesName(ctx, speciesId),
        level: selected.data[offset + 2] || 0,
        form: formGender & 0x3F,
        gender: genderFromId(formGender >>> 6),
        nickname: decodeUtf16LEString(selected.data, offset + 0x0C, 22),
        trainerId: idNumber & 0xFFFF,
        secretId: idNumber >>> 16,
        moves: moveIdsToMoves(ctx, [
          readU16LE(selected.data, offset + 0x32),
          readU16LE(selected.data, offset + 0x34),
          readU16LE(selected.data, offset + 0x36),
          readU16LE(selected.data, offset + 0x38)
        ]),
        source: {
          slot: slot + 1,
          physicalRecordIndex: physicalIndex,
          personalRandom: readU32LE(selected.data, offset + 4),
          originalTrainerName: decodeUtf16LEString(selected.data, offset + 0x22, 16)
        }
      });
    }

    if (pokemon.length) {
      const dateOffset = recordOffset + 0x168;
      entries.push({
        index,
        clearIndex: selected.latestNumber - index,
        date: formatDate(readU16LE(selected.data, dateOffset), selected.data[dateOffset + 2] || 0, selected.data[dateOffset + 3] || 0),
        pokemon,
        source: { physicalRecordIndex: physicalIndex }
      });
    }
  }

  return {
    gameKey,
    format: "gen5-dendou",
    clearCount: selected.latestNumber,
    nextIndex: selected.savePoint,
    entries,
    source: {
      primaryOffset,
      backupOffset,
      size,
      sectionSize,
      selectedOffset: selected.offset,
      primaryHasData: primary.hasData,
      backupHasData: backup.hasData,
      primaryPlausible: primary.isPlausible,
      backupPlausible: backup.isPlausible
    }
  };
}

function readGen5HallOfFameCandidate(save: Uint8Array, offset: number, size: number): Gen5HallOfFameCandidate {
  const data = save.slice(offset, offset + size);
  const savePoint = readU32LE(data, 0x1554);
  const latestNumber = readU32LE(data, 0x1558);
  const hasData = hasNonEmptyData(data);
  const recordCount = Math.min(latestNumber, 15);
  return {
    data,
    offset,
    hasData,
    isPlausible: data.length >= size && savePoint <= 15 && latestNumber <= 9999,
    latestNumber,
    recordCount,
    savePoint
  };
}

function chooseGen5HallOfFameCandidate(primary: Gen5HallOfFameCandidate, backup: Gen5HallOfFameCandidate): Gen5HallOfFameCandidate | undefined {
  const candidates = [primary, backup].filter((candidate) => candidate.isPlausible || candidate.hasData);
  if (!candidates.length) {
    return primary;
  }
  return candidates.reduce((best, candidate) => {
    if (candidate.isPlausible !== best.isPlausible) {
      return candidate.isPlausible ? candidate : best;
    }
    if (candidate.latestNumber !== best.latestNumber) {
      return candidate.latestNumber > best.latestNumber ? candidate : best;
    }
    if (candidate.hasData !== best.hasData) {
      return candidate.hasData ? candidate : best;
    }
    return best;
  });
}

function normalizeGen5HallRecordIndex(index: number): number {
  let normalized = index;
  while (normalized < 0) {
    normalized += 15;
  }
  return normalized % 15;
}

function parseGen6HallOfFame(save: Uint8Array, ctx: LegacyNameContext, gameKey: string, hofOffset: number): ParsedHallOfFame | undefined {
  if (hofOffset + 0x1B40 > save.length) {
    return undefined;
  }
  const entrySize = 0x1B4;
  const entries: ParsedHallOfFameEntry[] = [];
  for (let index = 0; index < 16; index++) {
    const entryOffset = hofOffset + (index * entrySize);
    const packedIndex = readU32LE(save, entryOffset + entrySize - 4);
    const hasData = (packedIndex >>> 31) === 1;
    if (!hasData) {
      continue;
    }
    const pokemon: ParsedHallOfFamePokemon[] = [];
    for (let slot = 0; slot < 6; slot++) {
      const offset = entryOffset + (slot * 0x48);
      const speciesId = readU16LE(save, offset);
      if (!speciesId) {
        continue;
      }
      const pack = readU32LE(save, offset + 0x14);
      const itemId = readU16LE(save, offset + 0x02);
      pokemon.push({
        speciesId,
        speciesName: speciesName(ctx, speciesId),
        item: itemName(ctx, itemId),
        nickname: decodeUtf16LEString(save, offset + 0x18, 24),
        level: (pack >>> 7) & 0x7F,
        form: pack & 0x1F,
        gender: genderFromId((pack >>> 5) & 0x03),
        isShiny: ((pack >>> 14) & 1) === 1,
        trainerId: readU16LE(save, offset + 0x10),
        secretId: readU16LE(save, offset + 0x12),
        moves: moveIdsToMoves(ctx, [
          readU16LE(save, offset + 0x04),
          readU16LE(save, offset + 0x06),
          readU16LE(save, offset + 0x08),
          readU16LE(save, offset + 0x0A)
        ]),
        source: { slot: slot + 1 }
      });
    }
    entries.push({
      index,
      clearIndex: packedIndex & 0x3FFF,
      date: formatDate(2000 + ((packedIndex >>> 14) & 0xFF), (packedIndex >>> 22) & 0x0F, (packedIndex >>> 26) & 0x1F),
      pokemon
    });
  }

  return { gameKey, format: "gen6-teams", entries };
}

function parseGen7HallOfFame(save: Uint8Array, ctx: LegacyNameContext, gameKey: string, fameOffset: number): ParsedHallOfFame | undefined {
  if (fameOffset + 24 > save.length) {
    return undefined;
  }
  const first = readGen7FameSpecies(save, ctx, fameOffset, 0);
  const current = readGen7FameSpecies(save, ctx, fameOffset + 12, 1);
  const entries = [first, current].filter((entry) => entry.pokemon.length);
  return { gameKey, format: "gen7-species", entries };
}

function readGen7FameSpecies(save: Uint8Array, ctx: LegacyNameContext, offset: number, index: number): ParsedHallOfFameEntry {
  const pokemon: ParsedHallOfFamePokemon[] = [];
  for (let slot = 0; slot < 6; slot++) {
    const speciesId = readU16LE(save, offset + (slot * 2));
    if (!speciesId) {
      continue;
    }
    pokemon.push({ speciesId, speciesName: speciesName(ctx, speciesId), source: { slot: slot + 1 } });
  }
  return {
    index,
    source: { kind: index === 0 ? "first-clear-species" : "current-clear-species" },
    pokemon
  };
}

function rebuildGen3LogicalBuffers(save: Uint8Array): { largeBuffer: Uint8Array } {
  const targetSize = save.length >= 0x20000 ? 0x20000 : 0x10000;
  const bytes = save.slice(0, targetSize);
  const activeSlot = determineGen3ActiveSlot(bytes);
  const largeBuffer = new Uint8Array(4 * 0xF80);

  for (let sectionId = 1; sectionId <= 4; sectionId++) {
    const sectorOffset = activeSlot.sectorOffsets[sectionId];
    largeBuffer.set(bytes.slice(sectorOffset, sectorOffset + 0xF80), (sectionId - 1) * 0xF80);
  }

  return { largeBuffer };
}

function determineGen3ActiveSlot(bytes: Uint8Array): { sectorOffsets: number[] } {
  const slots = bytes.length >= 0x20000 ? [0, 1] : [0];
  const infos = slots.map((slot) => readGen3SlotInfo(bytes, slot)).filter((info): info is { sectorOffsets: number[]; counter: number } => !!info);
  if (!infos.length) {
    throw new Error("No valid Gen 3 save slot found for event flag parsing.");
  }
  return infos.reduce((best, info) => compareGen3Counters(info.counter, best.counter) > 0 ? info : best);
}

function readGen3SlotInfo(bytes: Uint8Array, slotIndex: number): { sectorOffsets: number[]; counter: number } | undefined {
  const slotBase = slotIndex * 0xE000;
  const sectorOffsets = new Array<number>(14);
  let sectorZeroOffset = -1;
  for (let sector = 0; sector < 14; sector++) {
    const sectorOffset = slotBase + (sector * 0x1000);
    const sectionId = readU16LE(bytes, sectorOffset + 0xFF4);
    if (sectionId >= 14 || sectorOffsets[sectionId] !== undefined) {
      return undefined;
    }
    sectorOffsets[sectionId] = sectorOffset;
    if (sectionId === 0) {
      sectorZeroOffset = sectorOffset;
    }
  }
  if (sectorZeroOffset < 0 || sectorOffsets.some((offset) => typeof offset !== "number")) {
    return undefined;
  }
  return { sectorOffsets, counter: readU32LE(bytes, sectorZeroOffset + 0xFFC) };
}

function compareGen3Counters(a: number, b: number): number {
  if (a === 0xFFFFFFFF && b !== 0xFFFFFFFE) {
    return -1;
  }
  if (b === 0xFFFFFFFF && a !== 0xFFFFFFFE) {
    return 1;
  }
  return a === b ? 0 : a > b ? 1 : -1;
}

function getGen4GeneralBlock(profile: SaveProfile, save: Uint8Array): Uint8Array {
  const generalSize = profile.baseGame === "HGSS" ? (profile.mechanics === "hge" ? 0xFFA0 : 0xF628) : profile.baseGame === "DP" ? 0xC100 : 0xCF2C;
  const firstCounter = readU32LE(save, generalSize - 16);
  const secondCounter = readU32LE(save, 0x40000 + generalSize - 16);
  const start = isInvalidDsCounter(firstCounter) || (!isInvalidDsCounter(secondCounter) && secondCounter > firstCounter) ? 0x40000 : 0;
  return save.slice(start, start + generalSize);
}

function getGen4HallOfFameBlock(profile: SaveProfile, save: Uint8Array): Uint8Array | undefined {
  const offset = profile.baseGame === "HGSS" ? 0x23000 : 0x20000;
  const first = save.slice(offset, offset + 0x3000);
  const second = save.slice(offset + 0x40000, offset + 0x40000 + 0x3000);
  const firstValid = isValidGen4HallBlock(first);
  const secondValid = isValidGen4HallBlock(second);
  if (firstValid && secondValid) {
    return readU32LE(second, 0x2AB4) > readU32LE(first, 0x2AB4) ? second : first;
  }
  if (firstValid) {
    return first;
  }
  if (secondValid) {
    return second;
  }
  if (hasNonEmptyData(first)) {
    return first;
  }
  return hasNonEmptyData(second) ? second : undefined;
}

function isValidGen4HallBlock(block: Uint8Array): boolean {
  return block.length >= 0x2AC0 && readU32LE(block, 0x2AB4) !== 0xFFFFFFFF && readU32LE(block, 0x2AB8) === 0x2AB0;
}

function resolveGen3FlagKey(profile: SaveProfile, detectedGame?: string): string {
  if (detectedGame === "FRLG" || profile.baseGame === "FRLG" || profile.key.includes("fire") || profile.title.includes("Fire")) {
    return "gen3-frlg";
  }
  return "gen3-emerald";
}

function speciesName(ctx: LegacyNameContext, id: number): string | undefined {
  const value = ctx.sav_pok_names?.[id];
  return value && String(value).trim() ? String(value) : undefined;
}

function itemName(ctx: LegacyNameContext, id: number): string | undefined {
  if (!id) {
    return undefined;
  }
  const value = ctx.sav_item_names?.[id] || ctx.g67Items?.[id];
  return value && String(value).trim() && value !== "None" ? String(value) : undefined;
}

function moveIdsToMoves(ctx: LegacyNameContext, ids: number[]): ParsedMove[] {
  return ids
    .filter((id) => id > 0)
    .map((id) => ({ id, name: String(ctx.sav_move_names?.[id] || `Move ${id}`) }));
}

function genderFromId(id: number): "M" | "F" | "N" | undefined {
  if (id === 0) {
    return "M";
  }
  if (id === 1) {
    return "F";
  }
  if (id === 2) {
    return "N";
  }
  return undefined;
}

function formatDate(year: number, month: number, day: number): string | undefined {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isGen3Shiny(id32: number, pid: number): boolean {
  const tid = id32 & 0xFFFF;
  const sid = (id32 >>> 16) & 0xFFFF;
  return (((tid ^ sid ^ (pid & 0xFFFF) ^ (pid >>> 16)) & 0xFFFF) < 8);
}

function readBit(bytes: Uint8Array, offset: number, bitIndex: number): boolean {
  const byteOffset = offset + (bitIndex >> 3);
  if (byteOffset < 0 || byteOffset >= bytes.length) {
    return false;
  }
  return (bytes[byteOffset] & (1 << (bitIndex & 7))) !== 0;
}

function readU16LE(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 1 >= bytes.length) {
    return 0;
  }
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 3 >= bytes.length) {
    return 0;
  }
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function hasNonEmptyData(bytes: Uint8Array): boolean {
  return bytes.some((byte) => byte !== 0 && byte !== 0xFF);
}

function isInvalidDsCounter(counter: number): boolean {
  return counter === 0 || counter === 0xFFFFFFFF || !Number.isFinite(counter);
}

function crc16Ccitt(bytes: Uint8Array): number {
  let crc = 0xFFFF;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc & 0xFFFF;
}
