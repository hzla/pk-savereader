import { legacySources } from "./generatedSources.js";
import { pkhexLocations } from "../data/pkhexLocations.js";
import type { SaveProfile } from "../types.js";

export type LegacyContext = Record<string, any>;

const sourceOrder = Object.keys(legacySources) as Array<keyof typeof legacySources>;

const captureNames = [
  "parseGen3SaveFile",
  "parseGen6Save",
  "parseGen7Save",
  "g67ParseSaveFile",
  "g67CRC16CCITT",
  "g67CRC16Invert",
  "resolveGen6MetLocationName",
  "resolveGen7MetLocationName",
  "g67ResolveBankedLocationName",
  "parseRadicalRedSaveFile",
  "parseUnboundSaveFile",
  "parseDeterministicPokeEmeraldSave",
  "bruteForceImportPokeEmeraldSave",
  "buildNewestLogicalSectors",
  "concatLogicalRange",
  "scanNullSaveFile",
  "nullDetermineActiveSaveBlock",
  "nullReadPartyFromActiveSection",
  "nullReadBoxFromActiveSection",
  "parsePKM",
  "read32BitIntegerFromUint8Array",
  "chooseDsPairedBlockOffset",
  "isEmptyOrInvalidDsSaveCounter",
  "buildDsSaveDeadMonFromShowdown",
  "resetParsedPokemonGlobalsForGen4Import",
  "getDsSaveLocationGameKey",
  "g3DecodeText",
  "g3GetNationalSpeciesId",
  "resolveSavLevelFromExperience",
  "get_level",
  "orderFormats"
];

export function createLegacyContext(profile: SaveProfile): LegacyContext {
  const context = buildBaseContext();
  context.window = context;
  context.globalThis = context;
  context.TITLE = profile.title;
  context.baseGame = profile.runtimeBaseGame || profile.baseGame;
  context.requestedBaseGame = profile.baseGame;
  context.baseVersion = profile.baseVersion || (context.baseGame === "BW" ? "BW" : "");
  context.mechanics = profile.mechanics || "vanilla";
  context.save_expansion = !!profile.saveExpansion;
  context.gameGen = profile.generation;
  context.gen = profile.generation;
  context.settings = {
    damageGen: profile.generation,
    gen: profile.generation,
    hasEvs: true,
    devMode: false
  };
  applyPkhexLocationTables(context);
  context.localStorage = createStorageStub();
  resetParseState(context);
  return context;
}

function buildBaseContext(): LegacyContext {
  const context: LegacyContext = {};
  context.window = context;
  context.globalThis = context;
  context.document = createDocumentStub();
  context.localStorage = createStorageStub();
  context.console = {
    log: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    info: () => undefined,
    debug: () => undefined
  };
  context.Uint8Array = Uint8Array;
  context.ArrayBuffer = ArrayBuffer;
  context.DataView = DataView;
  context.Date = Date;
  context.Math = Math;
  context.JSON = JSON;
  context.Map = Map;
  context.Set = Set;
  context.String = String;
  context.Number = Number;
  context.Boolean = Boolean;
  context.RegExp = RegExp;
  context.Error = Error;
  context.URLSearchParams = URLSearchParams;
  context.FileReader = function FileReader() {};
  context.$ = context.jQuery = createJQueryStub();
  context.alert = (message: unknown) => {
    throw new Error(String(message || "Legacy save reader alert"));
  };
  context.cleanString = (value: unknown) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  context.checkExeptions = (value: unknown) => value;
  context.getMoveChangesForTitle = () => ({});
  context.findImportedSpeciesNameFromHeader = findImportedSpeciesNameFromHeader;
  context.getNicknameFromImportHeader = getNicknameFromImportHeader;
  context.randomizeAbility = () => 0;
  context.typeChart = {};
  context.pokedex = {};
  context.poksData = {};
  context.SPECIES_BY_ID = [];
  context.TITLE = "";
  context.baseGame = "";
  context.requestedBaseGame = "";
  context.baseVersion = "";
  context.mechanics = "vanilla";
  context.save_expansion = false;
  context.gameGen = 8;
  context.gen = 8;
  context.settings = { damageGen: 8, gen: 8, hasEvs: true, devMode: false };

  for (const sourceName of sourceOrder) {
    evaluateLegacySource(context, String(sourceName), legacySources[sourceName]);
    hydrateSpeciesIndex(context);
  }
  hydrateSpeciesIndex(context);
  applyPkhexLocationTables(context);
  return context;
}

function applyPkhexLocationTables(context: LegacyContext): void {
  context.locations ||= {};
  for (const [key, names] of Object.entries(pkhexLocations)) {
    context.locations[key] = names;
  }
}

function evaluateLegacySource(context: LegacyContext, sourceName: string, source: string): void {
  const capture = captureNames
    .map((name) => `try { if (typeof ${name} !== "undefined") context[${JSON.stringify(name)}] = ${name}; } catch (_) {}`)
    .join("\n");
  const wrapped = `${source}\n\n${capture}\n//# sourceURL=${sourceName}`;
  const fn = new Function("context", `with (context) {\n${wrapped}\n}`);
  fn(context);
}

function hydrateSpeciesIndex(context: LegacyContext): void {
  if (!Array.isArray(context.sav_pok_names)) {
    return;
  }
  const map: Record<string, { name: string; id: number }> = {};
  context.sav_pok_names.forEach((name: unknown, id: number) => {
    const text = String(name || "").trim();
    if (!text) {
      return;
    }
    map[context.cleanString(text)] = { name: text, id };
  });
  for (let generation = 1; generation <= 9; generation++) {
    context.SPECIES_BY_ID[generation] = {
      ...(context.SPECIES_BY_ID[generation] || {}),
      ...map
    };
  }
}

export function resetParseState(context: LegacyContext): void {
  context.invalidSavSpeciesDebugCount = 0;
  context.decryptedChunks = [];
  context.decryptedBattleStats = [];
  context.partyMons = {};
  context.partyPIDs = [];
  context.currentParty = [];
  context.partyExpTables = [];
  context.partyExpIndexes = [];
  context.partyMovesIndexes = [];
  context.savParty = [];
  context.boxPokOffsets = {};
  context.savBox = [];
  context.boxPokOffsets = {};
}

function createStorageStub(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    removeItem: (key: string) => data.delete(key),
    setItem: (key: string, value: string) => {
      data.set(key, String(value));
    }
  };
}

function createDocumentStub(): any {
  const element = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dataset: {},
    style: {},
    value: "",
    files: []
  };
  return {
    getElementById: () => element,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    body: element
  };
}

function createJQueryStub(): any {
  const chain: any = {
    length: 0,
    0: { value: "", files: [], dataset: {}, addEventListener: () => undefined },
    ready: () => chain,
    click: () => chain,
    off: () => chain,
    on: () => chain,
    show: () => chain,
    hide: () => chain,
    attr: () => chain,
    after: () => chain,
    html: () => chain,
    val: () => "",
    css: () => chain,
    toggle: () => chain,
    removeClass: () => chain,
    addClass: () => chain,
    next: () => chain,
    remove: () => chain,
    prop: () => chain
  };
  const jquery = () => chain;
  jquery.extend = Object.assign;
  jquery.noop = () => undefined;
  return jquery;
}

function findImportedSpeciesNameFromHeader(header: string): string {
  const left = String(header || "").split(/\s+@\s+/, 1)[0].replace(/\s+\((M|F|N)\)$/, "").trim();
  const match = left.match(/\(([^()]+)\)$/);
  return (match ? match[1] : left).replace(/\s+\(Egg\)$/, "").trim();
}

function getNicknameFromImportHeader(header: string, speciesName: string): string {
  const left = String(header || "").split(/\s+@\s+/, 1)[0].replace(/\s+\((M|F|N)\)$/, "").trim();
  const suffix = `(${speciesName})`;
  return left.endsWith(suffix) ? left.slice(0, -suffix.length).trim() : "";
}
