import type { BaseGame, ParsedPokemon, SaveProfile } from "../types.js";
import { createLegacyContext } from "../legacy/runtime.js";

interface Gen12ParseOutput {
  party: ParsedPokemon[];
  boxMons: ParsedPokemon[];
  partyCount: number;
  boxTitles?: string[];
  metadata: Record<string, unknown>;
  sections: Record<string, unknown>;
}

interface GbListLayout {
  capacity: number;
  bodySize: number;
  stringLength: number;
  isParty: boolean;
}

interface Gen12Layout {
  generation: 1 | 2;
  partyOffset: number;
  boxCount: number;
  boxSlotCount: number;
  currentBoxOffset?: number;
  currentBoxIndexOffset?: number;
  boxNamesOffset?: number;
  trainerIdOffset: number;
  trainerNameOffset: number;
  partyBodySize: number;
  boxBodySize: number;
  stringLength: number;
}

const STRING_LENGTH_INT = 11;
const GEN1_PARTY_BODY_SIZE = 44;
const GEN1_BOX_BODY_SIZE = 33;
const GEN2_PARTY_BODY_SIZE = 48;
const GEN2_BOX_BODY_SIZE = 32;
const BOX_SLOT_COUNT_INT = 20;

const gen1InternalToNational = [
  0x00, 0x70, 0x73, 0x20, 0x23, 0x15, 0x64, 0x22, 0x50, 0x02, 0x67, 0x6C, 0x66, 0x58, 0x5E, 0x1D,
  0x1F, 0x68, 0x6F, 0x83, 0x3B, 0x97, 0x82, 0x5A, 0x48, 0x5C, 0x7B, 0x78, 0x09, 0x7F, 0x72, 0x00,
  0x00, 0x3A, 0x5F, 0x16, 0x10, 0x4F, 0x40, 0x4B, 0x71, 0x43, 0x7A, 0x6A, 0x6B, 0x18, 0x2F, 0x36,
  0x60, 0x4C, 0x00, 0x7E, 0x00, 0x7D, 0x52, 0x6D, 0x00, 0x38, 0x56, 0x32, 0x80, 0x00, 0x00, 0x00,
  0x53, 0x30, 0x95, 0x00, 0x00, 0x00, 0x54, 0x3C, 0x7C, 0x92, 0x90, 0x91, 0x84, 0x34, 0x62, 0x00,
  0x00, 0x00, 0x25, 0x26, 0x19, 0x1A, 0x00, 0x00, 0x93, 0x94, 0x8C, 0x8D, 0x74, 0x75, 0x00, 0x00,
  0x1B, 0x1C, 0x8A, 0x8B, 0x27, 0x28, 0x85, 0x88, 0x87, 0x86, 0x42, 0x29, 0x17, 0x2E, 0x3D, 0x3E,
  0x0D, 0x0E, 0x0F, 0x00, 0x55, 0x39, 0x33, 0x31, 0x57, 0x00, 0x00, 0x0A, 0x0B, 0x0C, 0x44, 0x00,
  0x37, 0x61, 0x2A, 0x96, 0x8F, 0x81, 0x00, 0x00, 0x59, 0x00, 0x63, 0x5B, 0x00, 0x65, 0x24, 0x6E,
  0x35, 0x69, 0x00, 0x5D, 0x3F, 0x41, 0x11, 0x12, 0x79, 0x01, 0x03, 0x49, 0x00, 0x76, 0x77, 0x00,
  0x00, 0x00, 0x00, 0x4D, 0x4E, 0x13, 0x14, 0x21, 0x1E, 0x4A, 0x89, 0x8E, 0x00, 0x51, 0x00, 0x00,
  0x04, 0x07, 0x05, 0x08, 0x06, 0x00, 0x00, 0x00, 0x00, 0x2B, 0x2C, 0x2D, 0x45, 0x46, 0x47, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
];

const gbSpecialChars: Record<number, string> = {
  0x7F: " ",
  0x9A: "(",
  0x9B: ")",
  0x9C: ":",
  0x9D: ";",
  0x9E: "[",
  0x9F: "]",
  0xE0: "'",
  0xE3: "-",
  0xE6: "?",
  0xE7: "!",
  0xE8: ".",
  0xE9: "&",
  0xEA: "e",
  0xF2: ".",
  0xF3: "/",
  0xF4: ",",
  0xF5: "F"
};

export function parseGen12Save(profile: SaveProfile, save: Uint8Array): Gen12ParseOutput {
  const baseGame = profile.baseGame;
  const layout = getGen12Layout(baseGame);
  if (save.length < 0x8000) {
    throw new Error(`${baseGame} saves must be at least 0x8000 bytes.`);
  }
  const ctx = createLegacyContext(profile);
  const partyList = save.slice(layout.partyOffset, layout.partyOffset + getGbListLength(6, layout.partyBodySize, layout.stringLength));
  if (!isValidGbListHeader(partyList, 6)) {
    throw new Error(`${baseGame} save does not match the supported international Gen ${layout.generation} layout.`);
  }

  const party = readGbPokemonList(partyList, {
    capacity: 6,
    bodySize: layout.partyBodySize,
    stringLength: layout.stringLength,
    isParty: true
  }, layout, ctx, true);
  const boxMons = readBoxes(save, layout, ctx);

  return {
    party,
    boxMons,
    partyCount: party.length,
    boxTitles: readBoxTitles(save, layout),
    metadata: {
      trainerId: readU16BE(save, layout.trainerIdOffset),
      trainerName: decodeGbText(save.slice(layout.trainerNameOffset, layout.trainerNameOffset + layout.stringLength)),
      saveSize: save.length,
      locale: "international"
    },
    sections: {}
  };
}

function getGen12Layout(baseGame: BaseGame): Gen12Layout {
  if (baseGame === "RB" || baseGame === "YW") {
    return {
      generation: 1,
      partyOffset: 0x2F2C,
      boxCount: 12,
      boxSlotCount: BOX_SLOT_COUNT_INT,
      currentBoxOffset: 0x30C0,
      currentBoxIndexOffset: 0x284C,
      trainerIdOffset: 0x2605,
      trainerNameOffset: 0x2598,
      partyBodySize: GEN1_PARTY_BODY_SIZE,
      boxBodySize: GEN1_BOX_BODY_SIZE,
      stringLength: STRING_LENGTH_INT
    };
  }
  if (baseGame === "GS" || baseGame === "C") {
    return {
      generation: 2,
      partyOffset: baseGame === "C" ? 0x2865 : 0x288A,
      boxCount: 14,
      boxSlotCount: BOX_SLOT_COUNT_INT,
      currentBoxIndexOffset: baseGame === "C" ? 0x2700 : 0x2724,
      currentBoxOffset: baseGame === "C" ? 0x2D10 : 0x2D6C,
      boxNamesOffset: baseGame === "C" ? 0x2703 : 0x2727,
      trainerIdOffset: 0x2009,
      trainerNameOffset: 0x200B,
      partyBodySize: GEN2_PARTY_BODY_SIZE,
      boxBodySize: GEN2_BOX_BODY_SIZE,
      stringLength: STRING_LENGTH_INT
    };
  }
  throw new Error(`Base game ${baseGame} is not a Gen 1/2 save layout.`);
}

function readBoxes(save: Uint8Array, layout: Gen12Layout, ctx: Record<string, any>): ParsedPokemon[] {
  const result: ParsedPokemon[] = [];
  for (let boxIndex = 0; boxIndex < layout.boxCount; boxIndex++) {
    const rawOffset = getRawBoxOffset(boxIndex, layout);
    const currentBoxIndex = layout.currentBoxIndexOffset === undefined ? -1 : save[layout.currentBoxIndexOffset] & 0x7F;
    const currentBoxHeader = layout.currentBoxOffset === undefined ? undefined : save.slice(layout.currentBoxOffset);
    const offset = boxIndex === currentBoxIndex && currentBoxHeader && currentBoxHeader[0] > 0 && isValidGbListHeader(currentBoxHeader, layout.boxSlotCount)
      ? layout.currentBoxOffset!
      : rawOffset;
    const list = save.slice(offset, offset + getGbListLength(layout.boxSlotCount, layout.boxBodySize, layout.stringLength));
    if (!isValidGbListHeader(list, layout.boxSlotCount)) {
      continue;
    }
    const pokemon = readGbPokemonList(list, {
      capacity: layout.boxSlotCount,
      bodySize: layout.boxBodySize,
      stringLength: layout.stringLength,
      isParty: false
    }, layout, ctx, false);
    for (const mon of pokemon) {
      mon.box = boxIndex + 1;
    }
    result.push(...pokemon);
  }
  return result;
}

function readGbPokemonList(
  bytes: Uint8Array,
  list: GbListLayout,
  layout: Gen12Layout,
  ctx: Record<string, any>,
  isParty: boolean
): ParsedPokemon[] {
  const count = Math.min(bytes[0] || 0, list.capacity);
  const start = 1 + list.capacity + 1;
  const bodyStart = start;
  const otStart = bodyStart + (list.capacity * list.bodySize);
  const nickStart = otStart + (list.capacity * list.stringLength);
  const pokemon: ParsedPokemon[] = [];

  for (let index = 0; index < count; index++) {
    const marker = bytes[1 + index];
    if (marker === 0 || marker === 0xFF) {
      continue;
    }
    const body = bytes.slice(bodyStart + (index * list.bodySize), bodyStart + ((index + 1) * list.bodySize));
    const speciesId = layout.generation === 1 ? gen1InternalToNational[body[0]] || 0 : body[0] || 0;
    if (!speciesId) {
      continue;
    }
    const heldItemId = layout.generation === 2 ? body[1] || 0 : 0;
    pokemon.push({
      speciesId,
      speciesName: speciesName(ctx, speciesId),
      nickname: decodeGbText(bytes.slice(nickStart + (index * list.stringLength), nickStart + ((index + 1) * list.stringLength))),
      level: layout.generation === 1
        ? (isParty ? body[0x21] || body[3] : body[3])
        : body[0x1F],
      item: heldItemId ? itemName(ctx, heldItemId) : undefined,
      trainerId: layout.generation === 1 ? readU16BE(body, 0x0C) : readU16BE(body, 0x06),
      moves: moveIdsToMoves(ctx, layout.generation === 1
        ? [body[8], body[9], body[10], body[11]]
        : [body[2], body[3], body[4], body[5]]),
      isEgg: layout.generation === 2 ? marker === 0xFD : false,
      isParty,
      source: {
        format: `gen${layout.generation}`,
        gbMarker: marker,
        rawSpeciesId: body[0],
        originalTrainerName: decodeGbText(bytes.slice(otStart + (index * list.stringLength), otStart + ((index + 1) * list.stringLength))),
        heldItemId: heldItemId || undefined,
        experience: readU24BE(body, layout.generation === 1 ? 0x0E : 0x08)
      }
    });
  }

  return pokemon;
}

function readBoxTitles(save: Uint8Array, layout: Gen12Layout): string[] | undefined {
  if (layout.boxNamesOffset === undefined) {
    return undefined;
  }
  const titles: string[] = [];
  for (let box = 0; box < layout.boxCount; box++) {
    const title = decodeGbText(save.slice(layout.boxNamesOffset + (box * 9), layout.boxNamesOffset + ((box + 1) * 9)));
    titles.push(title || `Box ${box + 1}`);
  }
  return titles;
}

function getRawBoxOffset(boxIndex: number, layout: Gen12Layout): number {
  const listLength = getGbListLength(layout.boxSlotCount, layout.boxBodySize, layout.stringLength);
  if (layout.generation === 1) {
    return boxIndex < 6 ? 0x4000 + (boxIndex * listLength) : 0x6000 + ((boxIndex - 6) * listLength);
  }
  return boxIndex < 7 ? 0x4000 + (boxIndex * (listLength + 2)) : 0x6000 + ((boxIndex - 7) * (listLength + 2));
}

function getGbListLength(capacity: number, bodySize: number, stringLength: number): number {
  return 1 + (capacity + 1) + (bodySize * capacity) + (stringLength * capacity * 2);
}

function isValidGbListHeader(bytes: Uint8Array, capacity: number): boolean {
  if (bytes.length < capacity + 2 || bytes[0] > capacity) {
    return false;
  }
  for (let index = 0; index < bytes[0]; index++) {
    if (bytes[1 + index] === 0 || bytes[1 + index] === 0xFF) {
      return false;
    }
  }
  const terminator = bytes[1 + bytes[0]];
  return terminator === 0xFF || terminator === 0;
}

function decodeGbText(bytes: Uint8Array): string | undefined {
  let value = "";
  for (const byte of bytes) {
    if (byte === 0x50 || byte === 0) {
      break;
    }
    value += decodeGbChar(byte);
  }
  const text = value.trim();
  return text || undefined;
}

function decodeGbChar(byte: number): string {
  if (byte >= 0x80 && byte <= 0x99) {
    return String.fromCharCode("A".charCodeAt(0) + byte - 0x80);
  }
  if (byte >= 0xA0 && byte <= 0xB9) {
    return String.fromCharCode("a".charCodeAt(0) + byte - 0xA0);
  }
  if (byte >= 0xF6 && byte <= 0xFF) {
    return String.fromCharCode("0".charCodeAt(0) + byte - 0xF6);
  }
  return gbSpecialChars[byte] || "";
}

function speciesName(ctx: Record<string, any>, id: number): string {
  return String(ctx.sav_pok_names?.[id] || `Species ${id}`);
}

function itemName(ctx: Record<string, any>, id: number): string | undefined {
  const value = ctx.sav_item_names?.[id];
  return value && String(value).trim() && value !== "None" ? String(value) : `Item ${id}`;
}

function moveIdsToMoves(ctx: Record<string, any>, ids: number[]) {
  return ids
    .filter((id) => id > 0)
    .map((id) => ({ id, name: String(ctx.sav_move_names?.[id] || `Move ${id}`) }));
}

function readU16BE(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 1 >= bytes.length) {
    return 0;
  }
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readU24BE(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 >= bytes.length) {
    return 0;
  }
  return (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
}
