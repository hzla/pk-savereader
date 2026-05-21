import type { ParseSaveInput, ParseSaveOptions, ParseWarning, SaveParseResult } from "./types.js";
import { resolveBaseProfile, resolveSaveProfile, listSupportedTitles, tryResolveSaveProfile } from "./registry.js";
import { parseWithProfile } from "./readers/index.js";
import { toShowdownText } from "./showdown.js";

export type {
  ParsedBox,
  ParsedEventFlag,
  ParsedEventFlags,
  ParsedEventWork,
  ParsedHallOfFame,
  ParsedHallOfFameEntry,
  ParsedHallOfFamePokemon,
  ParsedMove,
  ParsedPokemon,
  ParsedStats,
  ParserFamily,
  BaseGame,
  ParseSaveInput,
  ParseSaveOptions,
  ParseWarning,
  SaveParseResult,
  SaveProfile,
  SupportedTitle
} from "./types.js";

export { listSupportedTitles, resolveBaseProfile, resolveSaveProfile };

export function parseSave(input: ParseSaveInput): SaveParseResult {
  if (!input || typeof input !== "object") {
    throw new Error("parseSave requires an input object.");
  }
  if (!input.save) {
    throw new Error("parseSave requires save bytes as an ArrayBuffer or Uint8Array.");
  }
  const warnings: ParseWarning[] = [];
  const title = "title" in input ? input.title : undefined;

  if ("baseGame" in input && input.baseGame) {
    const baseProfile = resolveBaseProfile(input.baseGame);
    let profile = baseProfile;
    if (title?.trim()) {
      const titleProfile = tryResolveSaveProfile(title);
      if (titleProfile) {
        if (titleProfile.baseGame !== baseProfile.baseGame) {
          throw new Error(`Title "${title}" is registered for base game ${titleProfile.baseGame}, not ${baseProfile.baseGame}.`);
        }
        profile = titleProfile;
      } else {
        profile = { ...baseProfile, title };
        warnings.push({
          code: "unknown-title-override",
          message: `No title-specific save adjustments are registered for "${title}"; parsed as ${baseProfile.baseGame}.`,
          details: { title, baseGame: baseProfile.baseGame }
        });
      }
    }
    return parseWithProfile(profile, input.save, input.options || {}, warnings);
  }

  if (typeof title !== "string" || !title.trim()) {
    throw new Error("parseSave requires baseGame, or a supported romhack title for compatibility.");
  }
  return parseWithProfile(resolveSaveProfile(title), input.save, input.options || {});
}

export function toShowdown(result: SaveParseResult): string {
  return toShowdownText(result);
}
