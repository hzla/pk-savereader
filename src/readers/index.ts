import type { ParseSaveOptions, SaveParseResult, SaveProfile } from "../types.js";
import { createLegacyContext } from "../legacy/runtime.js";
import { parseAdditionalSaveData } from "./extra.js";
import { parseDsSave } from "./ds.js";
import { parseGen12Save } from "./gen12.js";
import { assignPokemonIndexes, groupBoxes, monsFromShowdown, normalizeLegacyMons } from "./normalize.js";
import { parseRunAndBunSave } from "./run-and-bun.js";

export function parseWithProfile(profile: SaveProfile, saveInput: ArrayBuffer | Uint8Array, options: ParseSaveOptions = {}, initialWarnings: SaveParseResult["warnings"] = []): SaveParseResult {
  const save = toUint8Array(saveInput);
  const legacy = parseLegacy(profile, save, options);
  const showdown = legacy.showdown || "";
  const party = legacy.party.length ? legacy.party : monsFromShowdown(showdown, legacy.partyCount).party;
  const boxMons = legacy.boxMons.length ? legacy.boxMons : monsFromShowdown(showdown, party.length || legacy.partyCount).boxMons;
  assignPokemonIndexes(party, boxMons);
  const boxes = groupBoxes(boxMons, legacy.boxTitles);
  const extra = parseAdditionalSaveData(profile, save, legacy.metadata.detectedGame);
  const sections = {
    ...legacy.sections,
    ...(extra.eventFlags ? { eventFlags: extra.eventFlags } : {}),
    ...(extra.hallOfFame ? { hallOfFame: extra.hallOfFame } : {})
  };

  return {
    title: profile.title,
    profileKey: profile.key,
    generation: profile.generation,
    baseGame: profile.baseGame,
    party,
    boxes,
    boxMons,
    warnings: [...initialWarnings, ...legacy.warnings, ...extra.warnings],
    showdown,
    eventFlags: extra.eventFlags,
    hallOfFame: extra.hallOfFame,
    metadata: legacy.metadata,
    sections
  };
}

function parseLegacy(profile: SaveProfile, save: Uint8Array, options: ParseSaveOptions): {
  showdown: string;
  party: ReturnType<typeof normalizeLegacyMons>;
  boxMons: ReturnType<typeof normalizeLegacyMons>;
  partyCount: number;
  boxTitles?: string[];
  warnings: SaveParseResult["warnings"];
  metadata: SaveParseResult["metadata"];
  sections: Record<string, unknown>;
} {
  const ctx = createLegacyContext(profile);
  const warnings: SaveParseResult["warnings"] = [];

  switch (profile.parser) {
    case "gen12": {
      const result = parseGen12Save(profile, save);
      return {
        showdown: "",
        party: result.party,
        boxMons: result.boxMons,
        partyCount: result.partyCount,
        boxTitles: result.boxTitles,
        warnings,
        metadata: result.metadata,
        sections: result.sections
      };
    }
    case "gen45": {
      const result = parseDsSave(profile, save, options);
      return {
        showdown: result.showdown,
        party: [],
        boxMons: [],
        partyCount: result.partyCount,
        warnings,
        metadata: result.metadata || {},
        sections: { deadMons: result.deadMons || [] }
      };
    }
    case "gen3": {
      const result = ctx.parseGen3SaveFile(save.buffer.slice(save.byteOffset, save.byteOffset + save.byteLength));
      return resultFromLegacy(result, "partyMons", "boxMons", warnings);
    }
    case "gen6": {
      const result = ctx.parseGen6Save(save.buffer.slice(save.byteOffset, save.byteOffset + save.byteLength));
      return resultFromLegacy(result, "partyMons", "boxMons", warnings);
    }
    case "gen7": {
      const result = ctx.parseGen7Save(save.buffer.slice(save.byteOffset, save.byteOffset + save.byteLength));
      return resultFromLegacy(result, "partyMons", "boxMons", warnings);
    }
    case "radical-red": {
      const result = ctx.parseRadicalRedSaveFile(save);
      return resultFromLegacy(result, "parsedParty", "parsedBoxes", warnings);
    }
    case "unbound": {
      const result = ctx.parseUnboundSaveFile(save);
      return resultFromLegacy(result, "parsedParty", "parsedBoxes", warnings, { boxTitles: result.boxTitles });
    }
    case "emerald-imperium": {
      const dataView = new DataView(save.buffer, save.byteOffset, save.byteLength);
      const partyCount = readEmeraldImperiumPartyCount(ctx, dataView);
      try {
        const result = ctx.parseDeterministicPokeEmeraldSave(dataView);
        return {
          showdown: result.showdownText || "",
          party: [],
          boxMons: [],
          partyCount,
          warnings,
          metadata: {},
          sections: {
            deadMons: result.deadMons || [],
            importedMonsMetadata: result.importedMonsMetadata || [],
            tmPocketEntries: result.tmPocketEntries || []
          }
        };
      } catch (error) {
        warnings.push({
          code: "emerald-imperium-deterministic-fallback",
          message: error instanceof Error ? error.message : String(error)
        });
        const showdown = ctx.bruteForceImportPokeEmeraldSave(dataView, {});
        return { showdown, party: [], boxMons: [], partyCount, warnings, metadata: {}, sections: {} };
      }
    }
    case "pokemon-null": {
      const dataView = new DataView(save.buffer, save.byteOffset, save.byteLength);
      const saveBlockInfo = ctx.nullDetermineActiveSaveBlock(dataView);
      const partyReadResult = ctx.nullReadPartyFromActiveSection(dataView, saveBlockInfo);
      const boxReadResult = ctx.nullReadBoxFromActiveSection(dataView, saveBlockInfo, options.boxSlots || 120);
      return {
        showdown: (partyReadResult.showdownText || "") + (boxReadResult.showdownText || ""),
        party: normalizeLegacyMons(partyReadResult.mons, true),
        boxMons: normalizeLegacyMons(boxReadResult.mons, false),
        partyCount: partyReadResult.partyCount || 0,
        warnings,
        metadata: {},
        sections: { saveBlockInfo }
      };
    }
    case "run-and-bun": {
      const result = parseRunAndBunSave(save);
      return {
        showdown: "",
        party: result.party,
        boxMons: result.boxMons,
        partyCount: result.partyCount,
        boxTitles: result.boxTitles,
        warnings: result.warnings,
        metadata: result.metadata,
        sections: result.sections
      };
    }
    default:
      throw new Error(`No parser implementation for ${profile.parser}`);
  }
}

function resultFromLegacy(
  result: any,
  partyKey: string,
  boxKey: string,
  warnings: SaveParseResult["warnings"],
  extra: { boxTitles?: string[] } = {}
): ReturnType<typeof parseLegacy> {
  const party = normalizeLegacyMons(result?.[partyKey], true);
  const boxMons = normalizeLegacyMons(result?.[boxKey], false);
  return {
    showdown: result?.showdownImport || result?.showdownText || "",
    party,
    boxMons,
    partyCount: result?.partyCount ?? party.length,
    boxTitles: extra.boxTitles || result?.boxTitles,
    warnings,
    metadata: {
      detectedGame: result?.detectedGame,
      trainerId: result?.trainerId,
      secretId: result?.secretId,
      trainerIdSecret: result?.trainerIdSecret,
      fileSignature: result?.fileSignature,
      profileKey: result?.profileKey,
      rrSaveInfo: result?.rrSaveInfo
    },
    sections: { deadMons: result?.deadMons || [] }
  };
}

function toUint8Array(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function readEmeraldImperiumPartyCount(ctx: any, saveFile: DataView): number {
  try {
    const logical = ctx.buildNewestLogicalSectors(saveFile);
    const saveBlock1 = ctx.concatLogicalRange(logical, 1, 16);
    const count = saveBlock1.getUint8(0x234);
    return Number.isFinite(count) ? Math.max(0, Math.min(count, 6)) : 0;
  } catch {
    return 0;
  }
}
