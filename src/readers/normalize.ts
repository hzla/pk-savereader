import type { ParsedBox, ParsedPokemon } from "../types.js";
import { parseShowdownMons } from "../showdown.js";

export function normalizeLegacyMons(value: unknown, isParty: boolean): ParsedPokemon[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((mon, index) => normalizeLegacyMon(mon, isParty, index + 1)).filter(Boolean) as ParsedPokemon[];
}

export function normalizeLegacyMon(input: any, isParty: boolean, fallbackSlot: number): ParsedPokemon | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const speciesName = input.speciesName || input.species || input.name;
  if (!speciesName) {
    return null;
  }
  return {
    speciesId: numberOrUndefined(input.speciesId),
    speciesName: String(speciesName),
    nickname: stringOrUndefined(input.nickname),
    level: numberOrUndefined(input.level),
    gender: normalizeGender(input.gender),
    nature: stringOrUndefined(input.natureName || input.nature),
    ability: stringOrUndefined(input.abilityName || input.ability),
    abilitySlot: numberOrUndefined(input.abilitySlot || input.abilitySlotId || input.abilityIndex),
    item: stringOrUndefined(input.itemName || input.item),
    moves: Array.isArray(input.moveNames)
      ? input.moveNames.filter(Boolean).map((name: string) => ({ name: String(name) }))
      : Array.isArray(input.moves)
        ? input.moves.map((move: any) => typeof move === "string" ? ({ name: move }) : ({ id: numberOrUndefined(move?.id), name: String(move?.name || move) }))
        : [],
    evs: arrayStats(input.evs),
    ivs: arrayStats(input.ivs),
    metLocation: stringOrUndefined(input.metLocation || input.met),
    isEgg: !!input.isEgg,
    slot: numberOrUndefined(input.slot) || (isParty ? fallbackSlot : undefined),
    box: numberOrUndefined(input.box),
    isParty,
    source: { legacy: input }
  };
}

export function monsFromShowdown(showdown: string, partyCount = 0): { party: ParsedPokemon[]; boxMons: ParsedPokemon[] } {
  const mons = parseShowdownMons(showdown, partyCount);
  return {
    party: mons.filter((mon) => mon.isParty),
    boxMons: mons.filter((mon) => !mon.isParty)
  };
}

export function assignPokemonIndexes(party: ParsedPokemon[], boxMons: ParsedPokemon[], slotsPerBox = 30): void {
  for (let index = 0; index < party.length; index++) {
    const mon = party[index];
    mon.partyIndex = index;
    mon.partySlot = index + 1;
    mon.slot = index + 1;
    mon.isParty = true;
    delete mon.boxIndex;
    delete mon.boxSlotIndex;
    delete mon.boxSlot;
  }

  for (let index = 0; index < boxMons.length; index++) {
    const mon = boxMons[index];
    const box = mon.box || Math.floor(index / slotsPerBox) + 1;
    const slot = numberOrUndefined(mon.boxSlot) || (mon.box ? numberOrUndefined(mon.slot) : undefined) || ((index % slotsPerBox) + 1);
    mon.box = box;
    mon.boxIndex = box - 1;
    mon.boxSlot = slot;
    mon.boxSlotIndex = slot - 1;
    mon.slot = slot;
    mon.isParty = false;
    delete mon.partyIndex;
    delete mon.partySlot;
  }
}

export function groupBoxes(boxMons: ParsedPokemon[], boxTitles: string[] = [], slotsPerBox = 30): ParsedBox[] {
  const boxes = new Map<number, ParsedPokemon[]>();
  for (let index = 0; index < boxMons.length; index++) {
    const mon = boxMons[index];
    const box = mon.box || Math.floor(index / slotsPerBox) + 1;
    mon.box = box;
    mon.boxIndex = box - 1;
    if (!mon.boxSlot) {
      mon.boxSlot = (index % slotsPerBox) + 1;
      mon.boxSlotIndex = mon.boxSlot - 1;
      mon.slot = mon.boxSlot;
    }
    if (!boxes.has(box)) {
      boxes.set(box, []);
    }
    boxes.get(box)!.push(mon);
  }
  return Array.from(boxes.entries()).map(([box, pokemon]) => ({
    box,
    name: boxTitles[box - 1],
    pokemon
  }));
}

function arrayStats(value: unknown): ParsedPokemon["evs"] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return {
    hp: numberOrUndefined(value[0]),
    atk: numberOrUndefined(value[1]),
    def: numberOrUndefined(value[2]),
    spe: numberOrUndefined(value[3]),
    spa: numberOrUndefined(value[4]),
    spd: numberOrUndefined(value[5])
  };
}

function numberOrUndefined(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  const text = String(value || "").trim();
  return text ? text : undefined;
}

function normalizeGender(value: unknown): ParsedPokemon["gender"] {
  return value === "M" || value === "F" || value === "N" ? value : undefined;
}
