import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { listSupportedTitles, parseSave, resolveSaveProfile, toShowdown } from "../src/index.js";
import { getGen3VanillaAbilityName, getGen3VanillaItemName, getGen3VanillaMoveName } from "../src/data/gen3Vanilla.js";
import { createLegacyContext } from "../src/legacy/runtime.js";
import { parseAdditionalSaveData } from "../src/readers/extra.js";
import type { SaveProfile } from "../src/types.js";

describe("registry", () => {
  it("resolves title aliases", () => {
    expect(resolveSaveProfile("Emerald Imperium 1.3").parser).toBe("emerald-imperium");
    expect(resolveSaveProfile("Pokemon Ruby")).toMatchObject({ parser: "gen3", baseGame: "RS" });
    expect(resolveSaveProfile("Pokemon Diamond")).toMatchObject({ parser: "gen45", baseGame: "DP" });
    expect(resolveSaveProfile("Renegade Platinum").parser).toBe("gen45");
    expect(resolveSaveProfile("Unbound 2.1.1").parser).toBe("unbound");
    expect(resolveSaveProfile("Pokemon Run & Bun")).toMatchObject({ parser: "run-and-bun", baseGame: "run_and_bun" });
    expect(resolveSaveProfile("Pokemon X")).toMatchObject({ parser: "gen6", baseGame: "XY" });
    expect(resolveSaveProfile("Pokemon Sun")).toMatchObject({ parser: "gen7", baseGame: "SM" });
    expect(resolveSaveProfile("Pokemon Ultra Moon")).toMatchObject({ parser: "gen7", baseGame: "USUM" });
    expect(resolveSaveProfile("Royal Sapphire")).toMatchObject({ parser: "gen3", baseGame: "RS" });
    expect(() => resolveSaveProfile("Crystal Clear")).toThrow(/Pass baseGame/);
  });

  it("lists supported titles", () => {
    expect(listSupportedTitles().length).toBeGreaterThan(20);
  });
});

describe("parseSave", () => {
  it("parses Emerald Imperium into structured party/box data and Showdown text", async () => {
    const save = await readFile("fixtures/saves/emerald-imperium-1.3.sav");
    const result = parseSave({ title: "Emerald Imperium 1.3", save });

    expect(result.party).toHaveLength(6);
    expect(result.boxMons.length).toBeGreaterThan(20);
    expect(result.party[0].speciesName).toBe("Emboar");
    expect(result.party[0]).toMatchObject({ partyIndex: 0, partySlot: 1, slot: 1, isParty: true });
    expect(result.boxMons[0]).toMatchObject({ boxIndex: 0, boxSlotIndex: 0, boxSlot: 1, slot: 1, box: 1, isParty: false });
    expect(result.party[0].moves.map((move) => move.name)).toContain("Heat Crash");
    expect(result.eventFlags).toBeUndefined();
    expect(result.hallOfFame).toBeUndefined();
    expect(toShowdown(result)).toContain("Emboar @ Sitrus Berry");
    expect(toShowdown(result)).toContain("Marowak-Alola @ Thick Club");
  });

  it("parses a Renegade Platinum DS save fixture", async () => {
    const save = await readFile("fixtures/saves/renegade-platinum.sav");
    const result = parseSave({ title: "Renegade Platinum", save });

    expect(result.party).toHaveLength(6);
    expect(result.boxMons.length).toBeGreaterThan(10);
    expect(result.party[0].speciesName).toBe("Grotle");
    expect(result.party[0]).toMatchObject({ partyIndex: 0, partySlot: 1, slot: 1, isParty: true });
    expect(result.boxMons[0]).toMatchObject({ boxIndex: 0, boxSlotIndex: 0, boxSlot: 1, slot: 1, box: 1, isParty: false });
    expect(result.metadata.trainerIdSecret).toEqual(expect.any(Number));
    expect(result.eventFlags?.gameKey).toBe("platinum");
    expect(result.eventFlags?.activeFlags.length).toBeGreaterThan(0);
    expect(result.eventFlags?.activeFlags.some((flag) => flag.label.includes("Cynthia"))).toBe(true);
  });

  it("stops Gen 4 PKM nickname decoding at the terminator", () => {
    const ctx = createLegacyContext({
      key: "renegade-platinum",
      title: "Renegade Platinum",
      aliases: [],
      parser: "gen45",
      generation: 4,
      baseGame: "Pt"
    });
    const showdown = ctx.parsePKM(makeGen4LegacyPkmWithNicknameTrash(), false, 0);

    expect(showdown.split("\n")[0]).toMatch(/^Kei \(Dusknoir\)/);
    expect(showdown).not.toContain("Keiull");
  });

  it("stops Gen 5 PKM nickname decoding at the terminator", () => {
    const ctx = createLegacyContext({
      key: "black-white",
      title: "Black/White",
      aliases: [],
      parser: "gen45",
      generation: 5,
      baseGame: "BW",
      runtimeBaseGame: "BW",
      baseVersion: "BW"
    });
    const showdown = ctx.parsePKM(makeGen5LegacyPkmWithNicknameTrash(), false, 0);

    expect(showdown.split("\n")[0]).toMatch(/^Kei \(Dusknoir\)/);
    expect(showdown).not.toContain("Keiull");
  });

  it("stops Gen 6/7 nickname decoding at erased string words", () => {
    const ctx = createLegacyContext({
      key: "x-y",
      title: "X/Y",
      aliases: [],
      parser: "gen6",
      generation: 6,
      baseGame: "XY",
      runtimeBaseGame: "g6"
    });

    expect(ctx.g67DecodeString(makeUtf16Words(["K", "e", "i", 0xFFFF, "u", "l", "l"]), 6)).toBe("Kei");
  });

  it("does not append Emerald expansion packed nickname chars after a terminator", () => {
    const ctx = createLegacyContext({
      key: "emerald-imperium",
      title: "Emerald Imperium",
      aliases: [],
      parser: "emerald-imperium",
      generation: 8,
      baseGame: "imp",
      runtimeBaseGame: "imp"
    });
    const nicknameBytes = new Uint8Array(10);
    writeGbaText(nicknameBytes, 0, 10, "Kei");

    expect(ctx.gen3DecodeExpandedNickname(nicknameBytes, ["u", "l"])).toBe("Kei");
  });

  it("keeps title overrides when baseGame is provided", async () => {
    const save = await readFile("fixtures/saves/renegade-platinum.sav");
    const result = parseSave({ baseGame: "Pt", title: "Renegade Platinum", save });

    expect(result.profileKey).toBe("renegade-platinum");
    expect(result.baseGame).toBe("Pt");
    expect(result.party[0].speciesName).toBe("Grotle");
  });

  it("warns and parses the mandatory base game when an optional title is unknown", () => {
    const result = parseSave({ baseGame: "RB", title: "Unknown Red Hack", save: buildGen1Save("RB") });

    expect(result.profileKey).toBe("base-rb");
    expect(result.warnings.some((warning) => warning.code === "unknown-title-override")).toBe(true);
    expect(result.party[0].speciesName).toBe("Bulbasaur");
  });

  it("parses synthetic international Red/Blue and Yellow saves", () => {
    for (const baseGame of ["RB", "YW"] as const) {
      const result = parseSave({ baseGame, save: buildGen1Save(baseGame) });

      expect(result.baseGame).toBe(baseGame);
      expect(result.party[0]).toMatchObject({
        speciesId: 1,
        speciesName: "Bulbasaur",
        nickname: "BULBA",
        level: 15,
        trainerId: 0x1234,
        partyIndex: 0,
        partySlot: 1
      });
      expect(result.party[0].moves.map((move) => move.name)).toEqual(["Tackle", "Growl"]);
      expect(result.boxMons[0]).toMatchObject({
        speciesId: 4,
        speciesName: "Charmander",
        nickname: "CHAR",
        level: 7,
        box: 1,
        boxIndex: 0,
        boxSlot: 1,
        boxSlotIndex: 0
      });
    }
  });

  it("parses synthetic international Gold/Silver and Crystal saves", () => {
    for (const baseGame of ["GS", "C"] as const) {
      const result = parseSave({ baseGame, title: "Crystal Clear", save: buildGen2Save(baseGame) });

      expect(result.baseGame).toBe(baseGame);
      expect(result.warnings.some((warning) => warning.code === "unknown-title-override")).toBe(true);
      expect(result.party[0]).toMatchObject({
        speciesId: 152,
        speciesName: "Chikorita",
        nickname: "CHIKO",
        level: 12,
        item: "Master Ball",
        trainerId: 0x4567,
        isEgg: false,
        partyIndex: 0,
        partySlot: 1
      });
      expect(result.boxMons[0]).toMatchObject({
        speciesId: 155,
        speciesName: "Cyndaquil",
        nickname: "CYNDA",
        level: 8,
        box: 1,
        boxSlot: 1
      });
    }
  });

  it("parses vanilla X/Y, Sun/Moon, and Ultra Sun/Ultra Moon saves", () => {
    const cases = [
      { baseGame: "XY" as const, title: "Pokemon X", detectedGame: "XY" as const, baseProfileKey: "base-xy", profileKey: "x-y" },
      { baseGame: "SM" as const, title: "Pokemon Sun", detectedGame: "SM" as const, baseProfileKey: "base-sm", profileKey: "sun-moon" },
      { baseGame: "USUM" as const, title: "Pokemon Ultra Moon", detectedGame: "USUM" as const, baseProfileKey: "base-usum", profileKey: "ultra-sun-ultra-moon" }
    ];

    for (const testCase of cases) {
      const baseResult = parseSave({ baseGame: testCase.baseGame, save: buildGen67Save(testCase.detectedGame) });
      expect(baseResult.profileKey).toBe(testCase.baseProfileKey);
      expect(baseResult.baseGame).toBe(testCase.baseGame);
      expect(baseResult.metadata.detectedGame).toBe(testCase.detectedGame);
      expect(baseResult.party[0]).toMatchObject({
        speciesId: 25,
        speciesName: "Pikachu",
        nickname: "PIKA",
        level: 21,
        partyIndex: 0,
        partySlot: 1
      });
      expect(baseResult.party[0].moves.map((move) => move.name)).toEqual(["Tackle", "Growl"]);

      const titleResult = parseSave({ title: testCase.title, save: buildGen67Save(testCase.detectedGame) });
      expect(titleResult.profileKey).toBe(testCase.profileKey);
      expect(titleResult.baseGame).toBe(testCase.baseGame);
      expect(titleResult.metadata.detectedGame).toBe(testCase.detectedGame);
    }
  });

  it("parses synthetic Run & Bun party and box data with custom names", () => {
    const result = parseSave({ baseGame: "run_and_bun", title: "Pokemon Run & Bun", save: buildRunAndBunSave() });

    expect(result.profileKey).toBe("run-and-bun");
    expect(result.baseGame).toBe("run_and_bun");
    expect(result.party).toHaveLength(1);
    expect(result.party[0]).toMatchObject({
      speciesId: 813,
      speciesName: "Scorbunny",
      nickname: "BUN",
      level: 12,
      item: "Berry Juice",
      ability: "Blaze",
      metLocation: "Littleroot Town",
      partyIndex: 0,
      partySlot: 1,
      isParty: true
    });
    expect(result.party[0].moves.map((move) => move.name)).toEqual(["Tackle", "Growl"]);
    expect(result.boxMons[0]).toMatchObject({
      speciesId: 1,
      speciesName: "Bulbasaur",
      box: 1,
      boxSlot: 1,
      boxIndex: 0,
      boxSlotIndex: 0,
      isParty: false
    });
    expect(result.eventFlags).toBeUndefined();
    expect(result.hallOfFame).toBeUndefined();
  });

  it("stops Run & Bun nickname decoding at zero padding", () => {
    const save = buildRunAndBunSave();
    const nicknameOffset = 0x1000 + 0x238 + 8;
    save[nicknameOffset + 3] = 0x00;
    save[nicknameOffset + 4] = encodeGbaChar("U");
    save[nicknameOffset + 5] = encodeGbaChar("L");
    save[nicknameOffset + 6] = encodeGbaChar("L");

    const result = parseSave({ baseGame: "run_and_bun", title: "Pokemon Run & Bun", save });

    expect(result.party[0].nickname).toBe("BUN");
  });

  it("uses PKHeX vanilla Gen 3 item and ability tables for base-game Gen 3 saves", () => {
    expect(getGen3VanillaItemName(224)).toBe("Thick Club");
    expect(getGen3VanillaItemName(537)).toBeUndefined();
    expect(getGen3VanillaAbilityName("RS", 18, 0)).toBe("Keen Eye");
    expect(getGen3VanillaAbilityName("RS", 18, 1)).toBe("Keen Eye");
    expect(getGen3VanillaAbilityName("RS", 219, 0)).toBe("Magma Armor");
    expect(getGen3VanillaAbilityName("RS", 219, 1)).toBe("Flame Body");
    expect(getGen3VanillaMoveName(354)).toBe("Psycho Boost");
    expect(getGen3VanillaMoveName(355)).toBeUndefined();

    const parsed = parseSave({ baseGame: "RS", save: buildGen3SapphireSave({ speciesId: 18, itemId: 537, abilityBit: 1, moveIds: [33, 355] }) });
    expect(parsed.party[0]).toMatchObject({
      speciesName: "Pidgeot",
      ability: "Keen Eye",
      abilitySlot: 1
    });
    expect(parsed.party[0].item).toBeUndefined();
    expect(parsed.party[0].moves.map((move) => move.name)).toEqual(["Tackle"]);
  });

  it("uses explicit Gen 7 base game routing instead of only save-size auto detection", () => {
    expect(() => parseSave({ baseGame: "SM", save: buildGen67Save("USUM") })).toThrow(/Unsupported save size for SM/);
  });

  it("decodes Gen 5 Dendou Hall of Fame records from external save data", () => {
    const save = new Uint8Array(0x80000);
    const hofOffset = 0x7C800;
    const recordOffset = hofOffset;
    writeU16LE(save, recordOffset, 1);
    save[recordOffset + 2] = 55;
    save[recordOffset + 3] = 1 << 6;
    writeU32LE(save, recordOffset + 4, 0x12345678);
    writeU32LE(save, recordOffset + 8, 0x11112222);
    writeUtf16LE(save, recordOffset + 0x0C, 11, "BULBA");
    writeUtf16LE(save, recordOffset + 0x22, 8, "TOUYA");
    writeU16LE(save, recordOffset + 0x32, 33);
    writeU16LE(save, recordOffset + 0x34, 45);
    writeU16LE(save, recordOffset + 0x168, 2024);
    save[recordOffset + 0x16A] = 5;
    save[recordOffset + 0x16B] = 6;
    writeU32LE(save, hofOffset + 0x1554, 1);
    writeU32LE(save, hofOffset + 0x1558, 1);

    const profile: SaveProfile = {
      key: "black-white",
      title: "Black/White",
      aliases: [],
      parser: "gen45",
      generation: 5,
      baseGame: "BW",
      baseVersion: "BW"
    };
    const extra = parseAdditionalSaveData(profile, save, "BW");

    expect(extra.hallOfFame?.format).toBe("gen5-dendou");
    expect(extra.hallOfFame?.clearCount).toBe(1);
    expect(extra.hallOfFame?.entries[0].date).toBe("2024-05-06");
    expect(extra.hallOfFame?.entries[0].pokemon[0]).toMatchObject({
      speciesId: 1,
      speciesName: "Bulbasaur",
      nickname: "BULBA",
      level: 55,
      gender: "F",
      trainerId: 0x2222,
      secretId: 0x1111
    });
    expect(extra.hallOfFame?.entries[0].pokemon[0].moves?.map((move) => move.name)).toEqual(["Tackle", "Growl"]);
    expect(extra.hallOfFame?.entries[0].pokemon[0].source).toMatchObject({
      originalTrainerName: "TOUYA",
      personalRandom: 0x12345678
    });
  });

  it("decodes Gen 4 Hall of Fame nicknames with the Gen 4 text table", () => {
    const save = new Uint8Array(0x80000);
    const hofOffset = 0x20000;
    const recordOffset = hofOffset;
    writeU16LE(save, recordOffset, 1);
    save[recordOffset + 2] = 55;
    writeU32LE(save, recordOffset + 4, 0x12345678);
    writeU16LE(save, recordOffset + 8, 0x2222);
    writeU16LE(save, recordOffset + 10, 0x1111);
    writeGen4Text(save, recordOffset + 0x0C, 11, "BULBA");
    writeU16LE(save, recordOffset + 0x32, 33);
    writeU16LE(save, recordOffset + 0x34, 45);
    writeU16LE(save, recordOffset + 0x168, 2024);
    save[recordOffset + 0x16A] = 5;
    save[recordOffset + 0x16B] = 6;
    writeU32LE(save, hofOffset + 0x2AB4, 1);
    writeU32LE(save, hofOffset + 0x2AB8, 0x2AB0);

    const profile: SaveProfile = {
      key: "platinum",
      title: "Platinum",
      aliases: [],
      parser: "gen45",
      generation: 4,
      baseGame: "Pt"
    };
    const extra = parseAdditionalSaveData(profile, save, "Pt");

    expect(extra.hallOfFame?.format).toBe("gen4-dendou");
    expect(extra.hallOfFame?.entries[0].date).toBe("2024-05-06");
    expect(extra.hallOfFame?.entries[0].pokemon[0]).toMatchObject({
      speciesId: 1,
      speciesName: "Bulbasaur",
      nickname: "BULBA",
      level: 55,
      trainerId: 0x2222,
      secretId: 0x1111
    });
    expect(extra.hallOfFame?.entries[0].pokemon[0].moves?.map((move) => move.name)).toEqual(["Tackle", "Growl"]);
  });
});

function writeU16LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xFF;
  bytes[offset + 1] = (value >>> 8) & 0xFF;
}

function writeU32LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xFF;
  bytes[offset + 1] = (value >>> 8) & 0xFF;
  bytes[offset + 2] = (value >>> 16) & 0xFF;
  bytes[offset + 3] = (value >>> 24) & 0xFF;
}

function writeU16BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 8) & 0xFF;
  bytes[offset + 1] = value & 0xFF;
}

function buildGen3SapphireSave(config: { speciesId: number; itemId: number; abilityBit: 0 | 1; moveIds?: number[] }): Uint8Array {
  const save = new Uint8Array(0x10000);
  for (let section = 0; section < 14; section++) {
    const sectorOffset = section * 0x1000;
    writeU16LE(save, sectorOffset + 0xFF4, section);
    writeU32LE(save, sectorOffset + 0xFFC, 1);
  }

  const partyOffset = 0x1000 + 0x234;
  save[partyOffset] = 1;
  save.set(makeGen3Mon(config), partyOffset + 4);
  return save;
}

function makeGen3Mon(config: { speciesId: number; itemId: number; abilityBit: 0 | 1; moveIds?: number[] }): Uint8Array {
  const chunk = new Uint8Array(100);
  const pid = 24;
  const otId = 0;
  const key = pid ^ otId;
  writeU32LE(chunk, 0x00, pid);
  writeU32LE(chunk, 0x04, otId);
  chunk.fill(0xFF, 0x08, 0x12);
  chunk[0x13] = 0x02;

  const decrypted = new Array<number>(12).fill(0);
  const moves = config.moveIds || [33, 45];
  decrypted[0] = (config.speciesId & 0xFFFF) | ((config.itemId & 0xFFFF) << 16);
  decrypted[3] = (moves[0] || 0) | ((moves[1] || 0) << 16);
  decrypted[4] = (moves[2] || 0) | ((moves[3] || 0) << 16);
  decrypted[10] = config.abilityBit ? 0x80000000 : 0;

  for (let i = 0; i < decrypted.length; i++) {
    writeU32LE(chunk, 0x20 + (i * 4), (decrypted[i] ^ key) >>> 0);
  }
  chunk[0x54] = 31;
  return chunk;
}

function makeGen4LegacyPkmWithNicknameTrash(): Uint8Array {
  return makeDsLegacyPkmWithNicknameTrash([
    encodeGen4EnglishChar("K"),
    encodeGen4EnglishChar("e"),
    encodeGen4EnglishChar("i"),
    0xFFFF,
    encodeGen4EnglishChar("u"),
    encodeGen4EnglishChar("l"),
    encodeGen4EnglishChar("l")
  ]);
}

function makeGen5LegacyPkmWithNicknameTrash(): Uint8Array {
  return makeDsLegacyPkmWithNicknameTrash([
    "K".charCodeAt(0),
    "e".charCodeAt(0),
    "i".charCodeAt(0),
    0xFFFF,
    "u".charCodeAt(0),
    "l".charCodeAt(0),
    "l".charCodeAt(0)
  ]);
}

function makeDsLegacyPkmWithNicknameTrash(nicknameWords: number[]): Uint8Array {
  const chunk = new Uint8Array(136);
  const pid = 24;
  const checksum = 0x1234;
  const decrypted = new Array<number>(64).fill(0);
  const monDataOffset = 0;
  const moveDataOffset = 16;
  const nicknameOffset = 32;
  const exp = 100000;

  decrypted[monDataOffset] = 477;
  decrypted[monDataOffset + 4] = exp & 0xFFFF;
  decrypted[monDataOffset + 5] = (exp >>> 16) & 0xFFFF;
  decrypted[moveDataOffset] = 33;

  for (let i = 0; i < nicknameWords.length; i++) {
    decrypted[nicknameOffset + i] = nicknameWords[i];
  }

  writeU32LE(chunk, 0, pid);
  writeU16LE(chunk, 6, checksum);
  const encryptedWords = encryptGen45Words(decrypted, checksum);
  for (let i = 0; i < encryptedWords.length; i++) {
    writeU16LE(chunk, 8 + (i * 2), encryptedWords[i]);
  }
  return chunk;
}

function makeUtf16Words(values: Array<string | number>): Uint8Array {
  const bytes = new Uint8Array(values.length * 2);
  values.forEach((value, index) => {
    const code = typeof value === "number" ? value : value.charCodeAt(0);
    writeU16LE(bytes, index * 2, code);
  });
  return bytes;
}

function encryptGen45Words(words: number[], checksum: number): number[] {
  const encrypted: number[] = [];
  let seed = checksum >>> 0;
  for (const word of words) {
    seed = (Math.imul(0x41C64E6D, seed) + 0x6073) >>> 0;
    encrypted.push((word ^ ((seed >>> 16) & 0xFFFF)) & 0xFFFF);
  }
  return encrypted;
}

function buildGen1Save(_baseGame: "RB" | "YW"): Uint8Array {
  const save = new Uint8Array(0x8000);
  writeU16BE(save, 0x2605, 0x1234);
  writeGbText(save, 0x2598, 11, "RED");
  writeGbList(save, 0x2F2C, {
    capacity: 6,
    bodySize: 44,
    stringLength: 11,
    marker: 0x99,
    body: makeGen1Mon(0x99, 15, 0x1234),
    ot: "RED",
    nickname: "BULBA"
  });
  writeGbList(save, 0x4000, {
    capacity: 20,
    bodySize: 33,
    stringLength: 11,
    marker: 0xB0,
    body: makeGen1Mon(0xB0, 7, 0x1234).slice(0, 33),
    ot: "RED",
    nickname: "CHAR"
  });
  return save;
}

function buildGen2Save(baseGame: "GS" | "C"): Uint8Array {
  const save = new Uint8Array(0x8000);
  const partyOffset = baseGame === "C" ? 0x2865 : 0x288A;
  writeU16BE(save, 0x2009, 0x4567);
  writeGbText(save, 0x200B, 11, "KRIS");
  writeGbList(save, partyOffset, {
    capacity: 6,
    bodySize: 48,
    stringLength: 11,
    marker: 152,
    body: makeGen2Mon(152, 12, 0x4567),
    ot: "KRIS",
    nickname: "CHIKO"
  });
  writeGbList(save, 0x4000, {
    capacity: 20,
    bodySize: 32,
    stringLength: 11,
    marker: 155,
    body: makeGen2Mon(155, 8, 0x4567).slice(0, 32),
    ot: "KRIS",
    nickname: "CYNDA"
  });
  return save;
}

function makeGen1Mon(rawSpecies: number, level: number, trainerId: number): Uint8Array {
  const body = new Uint8Array(44);
  body[0] = rawSpecies;
  body[3] = level;
  body[8] = 33;
  body[9] = 45;
  writeU16BE(body, 0x0C, trainerId);
  body[0x21] = level;
  return body;
}

function makeGen2Mon(species: number, level: number, trainerId: number): Uint8Array {
  const body = new Uint8Array(48);
  body[0] = species;
  body[1] = 1;
  body[2] = 33;
  body[3] = 45;
  writeU16BE(body, 0x06, trainerId);
  body[0x1F] = level;
  return body;
}

function writeGbList(
  save: Uint8Array,
  offset: number,
  config: { capacity: number; bodySize: number; stringLength: number; marker: number; body: Uint8Array; ot: string; nickname: string }
): void {
  save[offset] = 1;
  save[offset + 1] = config.marker;
  save[offset + 2] = 0xFF;
  const start = offset + 1 + config.capacity + 1;
  save.set(config.body, start);
  const otStart = start + (config.capacity * config.bodySize);
  const nickStart = otStart + (config.capacity * config.stringLength);
  writeGbText(save, otStart, config.stringLength, config.ot);
  writeGbText(save, nickStart, config.stringLength, config.nickname);
}

function writeGbText(bytes: Uint8Array, offset: number, length: number, value: string): void {
  bytes.fill(0x50, offset, offset + length);
  for (let i = 0; i < Math.min(length - 1, value.length); i++) {
    bytes[offset + i] = encodeGbChar(value[i]);
  }
}

function encodeGbChar(char: string): number {
  if (char >= "A" && char <= "Z") {
    return 0x80 + char.charCodeAt(0) - "A".charCodeAt(0);
  }
  if (char >= "a" && char <= "z") {
    return 0xA0 + char.charCodeAt(0) - "a".charCodeAt(0);
  }
  if (char >= "0" && char <= "9") {
    return 0xF6 + char.charCodeAt(0) - "0".charCodeAt(0);
  }
  return 0x7F;
}

function writeUtf16LE(bytes: Uint8Array, offset: number, slots: number, value: string): void {
  for (let i = 0; i < slots; i++) {
    const code = i < value.length ? value.charCodeAt(i) : 0xFFFF;
    writeU16LE(bytes, offset + (i * 2), code);
    if (i >= value.length) {
      break;
    }
  }
}

function writeGen4Text(bytes: Uint8Array, offset: number, slots: number, value: string): void {
  for (let i = 0; i < slots; i++) {
    const code = i < value.length ? encodeGen4EnglishChar(value[i]) : 0xFFFF;
    writeU16LE(bytes, offset + (i * 2), code);
    if (i >= value.length) {
      break;
    }
  }
}

function encodeGen4EnglishChar(char: string): number {
  if (char >= "0" && char <= "9") {
    return 0x121 + char.charCodeAt(0) - "0".charCodeAt(0);
  }
  if (char >= "A" && char <= "Z") {
    return 0x12B + char.charCodeAt(0) - "A".charCodeAt(0);
  }
  if (char >= "a" && char <= "z") {
    return 0x145 + char.charCodeAt(0) - "a".charCodeAt(0);
  }
  if (char === " ") {
    return 0x1DE;
  }
  throw new Error(`Unsupported Gen 4 test character: ${char}`);
}

type Gen67Game = "XY" | "SM" | "USUM";

const gen67Configs: Record<Gen67Game, {
  generation: 6 | 7;
  saveSize: number;
  metadataOffset: number;
  checksum: "ccitt" | "invert";
  requiredBlocks: Record<string, { id: number; offset: number; length: number }>;
}> = {
  XY: {
    generation: 6,
    saveSize: 0x65600,
    metadataOffset: 0x65400,
    checksum: "ccitt",
    requiredBlocks: {
      boxLayout: { id: 12, offset: 0x04400, length: 0x0440 },
      party: { id: 18, offset: 0x14200, length: 0x061C },
      boxes: { id: 53, offset: 0x22600, length: 0x34AD0 }
    }
  },
  SM: {
    generation: 7,
    saveSize: 0x6BE00,
    metadataOffset: 0x6BC00,
    checksum: "invert",
    requiredBlocks: {
      party: { id: 4, offset: 0x01400, length: 0x061C },
      boxLayout: { id: 13, offset: 0x04800, length: 0x05E6 },
      boxes: { id: 14, offset: 0x04E00, length: 0x36600 }
    }
  },
  USUM: {
    generation: 7,
    saveSize: 0x6CC00,
    metadataOffset: 0x6CA00,
    checksum: "invert",
    requiredBlocks: {
      party: { id: 4, offset: 0x01600, length: 0x061C },
      boxLayout: { id: 13, offset: 0x04C00, length: 0x05E6 },
      boxes: { id: 14, offset: 0x05200, length: 0x36600 }
    }
  }
};

const gen67BlockPositions = [
  0, 1, 2, 3, 0, 1, 3, 2, 0, 2, 1, 3, 0, 3, 1, 2,
  0, 2, 3, 1, 0, 3, 2, 1, 1, 0, 2, 3, 1, 0, 3, 2,
  2, 0, 1, 3, 3, 0, 1, 2, 2, 0, 3, 1, 3, 0, 2, 1,
  1, 2, 0, 3, 1, 3, 0, 2, 2, 1, 0, 3, 3, 1, 0, 2,
  2, 3, 0, 1, 3, 2, 0, 1, 1, 2, 3, 0, 1, 3, 2, 0,
  2, 1, 3, 0, 3, 1, 2, 0, 2, 3, 1, 0, 3, 2, 1, 0,
  0, 1, 2, 3, 0, 1, 3, 2, 0, 2, 1, 3, 0, 3, 1, 2,
  0, 2, 3, 1, 0, 3, 2, 1, 1, 0, 2, 3, 1, 0, 3, 2
];

function buildGen67Save(game: Gen67Game): Uint8Array {
  const config = gen67Configs[game];
  const save = new Uint8Array(config.saveSize);
  const partyBlock = config.requiredBlocks.party;
  save.set(makeEncryptedGen67PartyMon(), partyBlock.offset);
  save[partyBlock.offset + (6 * 0x104)] = 1;
  writeU32LE(save, config.metadataOffset + 0x10, 0x42454546);
  writeU32LE(save, save.length - 0x1F0, 0x42454546);

  for (const block of Object.values(config.requiredBlocks)) {
    const footerOffset = config.metadataOffset + 0x14 + (block.id * 8);
    writeU32LE(save, footerOffset, block.length);
    writeU16LE(save, footerOffset + 4, block.id);
    writeU16LE(save, footerOffset + 6, checksumGen67(save.subarray(block.offset, block.offset + block.length), config.checksum));
  }

  return save;
}

const runAndBunSubstructOrders = [
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

function buildRunAndBunSave(): Uint8Array {
  const save = new Uint8Array(0x20000);
  for (let sectionId = 0; sectionId < 14; sectionId++) {
    const sectorOffset = sectionId * 0x1000;
    writeU16LE(save, sectorOffset + 0xFF4, sectionId);
    writeU32LE(save, sectorOffset + 0xFFC, 1);
  }

  const section1 = 0x1000;
  writeU32LE(save, section1 + 0x234, 1);
  save.set(makeRunAndBunMon({ species: 813, level: 12, item: 53, nickname: "BUN", personality: 0x12345678, isParty: true }), section1 + 0x238);

  const storage = 5 * 0x1000;
  writeU32LE(save, storage, 0);
  save.set(makeRunAndBunMon({ species: 1, level: 8, item: 1, nickname: "BULBA", personality: 0x87654321, isParty: false }), storage + 4);
  return save;
}

function makeRunAndBunMon(config: { species: number; level: number; item: number; nickname: string; personality: number; isParty: boolean }): Uint8Array {
  const size = config.isParty ? 100 : 80;
  const mon = new Uint8Array(size);
  const otId = 0x00001234;
  const key = (config.personality ^ otId) >>> 0;
  const growth = [
    (config.species | (config.item << 16)) >>> 0,
    runAndBunMediumSlowExp(config.level) >>> 0,
    ((255 << 8) | (3 << 16)) >>> 0
  ];
  const attacks = [
    (33 | (45 << 16)) >>> 0,
    0,
    (35 | (40 << 8)) >>> 0
  ];
  const evs = [0, 0, 0];
  const metFlags = (config.level | (3 << 7) | (4 << 11)) >>> 0;
  const ivFlags = ((31 << 1) | (31 << 6) | (31 << 11) | (31 << 16) | (31 << 21) | (31 << 26)) >>> 0;
  const misc = [metFlags << 16, ivFlags, 0];
  const substructs = [growth, attacks, evs, misc];
  const order = runAndBunSubstructOrders[config.personality % 24];

  writeU32LE(mon, 0, config.personality);
  writeU32LE(mon, 4, otId);
  writeGbaText(mon, 8, 10, config.nickname);
  writeGbaText(mon, 20, 7, "HZLA");
  for (let logicalIndex = 0; logicalIndex < 4; logicalIndex++) {
    const encryptedIndex = order[logicalIndex];
    for (let wordIndex = 0; wordIndex < 3; wordIndex++) {
      writeU32LE(mon, 32 + (encryptedIndex * 12) + (wordIndex * 4), (substructs[logicalIndex][wordIndex] ^ key) >>> 0);
    }
  }
  if (config.isParty) {
    mon[84] = config.level;
  }
  return mon;
}

function runAndBunMediumSlowExp(level: number): number {
  return Math.floor((6 * (level ** 3)) / 5) - (15 * (level ** 2)) + (100 * level) - 140;
}

function writeGbaText(bytes: Uint8Array, offset: number, length: number, value: string): void {
  bytes.fill(0xFF, offset, offset + length);
  for (let i = 0; i < Math.min(length - 1, value.length); i++) {
    bytes[offset + i] = encodeGbaChar(value[i]);
  }
}

function encodeGbaChar(char: string): number {
  if (char >= "A" && char <= "Z") {
    return 0xBB + char.charCodeAt(0) - "A".charCodeAt(0);
  }
  if (char >= "a" && char <= "z") {
    return 0xD5 + char.charCodeAt(0) - "a".charCodeAt(0);
  }
  if (char >= "0" && char <= "9") {
    return 0xA1 + char.charCodeAt(0) - "0".charCodeAt(0);
  }
  return 0;
}

function makeEncryptedGen67PartyMon(): Uint8Array {
  const data = new Uint8Array(0x104);
  const pv = 0x12345678;
  writeU32LE(data, 0x00, pv);
  writeU16LE(data, 0x04, 0);
  writeU16LE(data, 0x08, 25);
  writeU16LE(data, 0x0A, 0);
  data[0x14] = 9;
  writeGen67String(data, 0x40, 13, "PIKA");
  writeU16LE(data, 0x5A, 33);
  writeU16LE(data, 0x5C, 45);
  writeU32LE(data, 0x74, 0x80000000 | 0x1F | (0x1F << 5) | (0x1F << 10) | (0x1F << 15) | (0x1F << 20) | (0x1F << 25));
  data[0xEC] = 21;
  writeU16LE(data, 0x06, checksumGen67(data.subarray(0x08, 0xE8), "add16"));
  return encryptGen67(data);
}

function encryptGen67(decrypted: Uint8Array): Uint8Array {
  const encrypted = new Uint8Array(decrypted);
  const pv = readU32LE(encrypted, 0x00);
  const sv = (pv >>> 13) & 31;
  const order = gen67BlockPositions.slice(sv * 4, (sv * 4) + 4);
  const unshuffled = encrypted.slice(0x08, 0xE8);
  const shuffled = new Uint8Array(unshuffled.length);
  for (let i = 0; i < 4; i++) {
    shuffled.set(unshuffled.subarray(i * 56, (i + 1) * 56), order[i] * 56);
  }
  encrypted.set(shuffled, 0x08);
  cryptGen67(encrypted.subarray(0x08, 0xE8), pv);
  cryptGen67(encrypted.subarray(0xE8), pv);
  return encrypted;
}

function writeGen67String(bytes: Uint8Array, offset: number, slots: number, value: string): void {
  for (let i = 0; i < Math.min(slots - 1, value.length); i++) {
    writeU16LE(bytes, offset + (i * 2), value.charCodeAt(i));
  }
}

function cryptGen67(bytes: Uint8Array, seed: number): void {
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    seed = (Math.imul(0x41C64E6D, seed) + 0x6073) >>> 0;
    const word = (bytes[i] | (bytes[i + 1] << 8)) ^ ((seed >>> 16) & 0xFFFF);
    bytes[i] = word & 0xFF;
    bytes[i + 1] = (word >>> 8) & 0xFF;
  }
}

function checksumGen67(bytes: Uint8Array, kind: "add16" | "ccitt" | "invert"): number {
  if (kind === "add16") {
    let checksum = 0;
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      checksum = (checksum + (bytes[i] | (bytes[i + 1] << 8))) & 0xFFFF;
    }
    return checksum;
  }
  if (kind === "ccitt") {
    let top = 0xFF;
    let bot = 0xFF;
    for (const byte of bytes) {
      let x = (byte ^ top) & 0xFF;
      x ^= x >>> 4;
      top = (bot ^ (x >>> 3) ^ ((x << 4) & 0xFF)) & 0xFF;
      bot = (x ^ ((x << 5) & 0xFF)) & 0xFF;
    }
    return ((top << 8) | bot) >>> 0;
  }
  let crc = 0xFFFF;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 1) ? ((crc >>> 1) ^ 0xA001) : (crc >>> 1);
    }
  }
  return (~crc) & 0xFFFF;
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}
