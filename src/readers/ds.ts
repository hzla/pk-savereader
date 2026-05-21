import type { ParseSaveOptions, SaveProfile } from "../types.js";
import { createLegacyContext, resetParseState } from "../legacy/runtime.js";

const DS_SAVE_SLOTS_PER_BOX = 30;
const GEN5_BOXES_TO_IMPORT = 7;
const GEN5_BOX_SLOT_COUNT = GEN5_BOXES_TO_IMPORT * DS_SAVE_SLOTS_PER_BOX;

export interface LegacyParseOutput {
  showdown: string;
  partyCount: number;
  boxCount: number;
  deadMons?: unknown[];
  metadata?: Record<string, unknown>;
}

export function parseDsSave(profile: SaveProfile, save: Uint8Array, options: ParseSaveOptions = {}): LegacyParseOutput {
  const ctx = createLegacyContext(profile);
  configureDsLayout(ctx);
  resetParseState(ctx);

  const view = save;
  ctx.view = view;
  ctx.saveUploaded = true;

  let smallBlockStart = 0;
  let trainerId: number | undefined;
  let secretId: number | undefined;
  let trainerIdSecret: number | undefined;

  if (ctx.baseGame === "DP" || ctx.baseGame === "Pt" || ctx.baseGame === "HGSS") {
    const smallBlock1SaveCount = ctx.read32BitIntegerFromUint8Array(view, ctx.smallBlockSize - 16);
    const smallBlock2SaveCount = ctx.read32BitIntegerFromUint8Array(view, ctx.smallBlockSize + 0x40000 - 16);
    const smallBlock1Invalid = ctx.isEmptyOrInvalidDsSaveCounter(smallBlock1SaveCount);
    const smallBlock2Invalid = ctx.isEmptyOrInvalidDsSaveCounter(smallBlock2SaveCount);
    if (smallBlock1Invalid || options.forceBlock2 || (!smallBlock2Invalid && smallBlock2SaveCount > smallBlock1SaveCount)) {
      ctx.partyCountOffset += 0x40000;
      smallBlockStart = 0x40000;
    }

    const selectedSmallBlockSaveCount = smallBlockStart === 0x40000 ? smallBlock2SaveCount : smallBlock1SaveCount;
    const bigBlock1SaveCount = ctx.read32BitIntegerFromUint8Array(view, ctx.bigBlockStart + ctx.bigBlockSize - 16);
    const bigBlock2SaveCount = ctx.read32BitIntegerFromUint8Array(view, ctx.bigBlockStart + 0x40000 + ctx.bigBlockSize - 16);
    const bigBlockOffset = ctx.chooseDsPairedBlockOffset(selectedSmallBlockSaveCount, bigBlock1SaveCount, bigBlock2SaveCount, !!options.forceBlock2);
    if (bigBlockOffset === 0x40000) {
      ctx.boxDataOffset += 0x40000;
      ctx.bigBlockStart += 0x40000;
    }

    const trainerIdOffset = smallBlockStart + (ctx.baseGame === "Pt" ? 0x78 : 0x74);
    trainerId = view[trainerIdOffset] | (view[trainerIdOffset + 1] << 8);
    secretId = view[trainerIdOffset + 2] | (view[trainerIdOffset + 3] << 8);
    trainerIdSecret = ((trainerId & 0xFFFF) | ((secretId & 0xFFFF) << 16)) >>> 0;
  } else if (ctx.baseGame === "BW") {
    const tidSid = ctx.read32BitIntegerFromUint8Array(view, 0x19414);
    trainerId = tidSid & 0xFFFF;
    secretId = (tidSid >>> 16) & 0xFFFF;
    trainerIdSecret = tidSid >>> 0;
  }

  const partyCount = Math.max(0, Math.min(view[ctx.partyCountOffset] || 0, 6));
  ctx.partyCount = partyCount;
  let showdown = "";

  let offset = ctx.partyCountOffset + 4;
  for (let i = 0; i < partyCount; i++) {
    const chunk = view.slice(offset, offset + ctx.partyPokSize);
    showdown += ctx.parsePKM(chunk, true, offset);
    offset += ctx.partyPokSize;
  }

  offset = ctx.boxDataOffset;
  let liveBoxSlotCount = 510;
  let totalBoxSlotCount = 510;
  if (ctx.save_expansion) {
    liveBoxSlotCount = 870;
    totalBoxSlotCount = 870;
  }
  if (ctx.baseGame === "BW") {
    liveBoxSlotCount = GEN5_BOX_SLOT_COUNT;
    totalBoxSlotCount = GEN5_BOX_SLOT_COUNT;
  } else if (ctx.baseGame === "DP" || ctx.baseGame === "Pt" || ctx.baseGame === "HGSS") {
    totalBoxSlotCount = 540;
  }

  const deadMons = [];
  for (let i = 0; i < totalBoxSlotCount; i++) {
    if ((ctx.baseGame === "HGSS" || ctx.baseGame === "BW") && i > 0 && i % DS_SAVE_SLOTS_PER_BOX === 0) {
      offset += 16;
    }

    const chunk = view.slice(offset, offset + 136);
    const showdownBlock = ctx.parsePKM(chunk, false, offset);
    if (i < liveBoxSlotCount) {
      showdown += showdownBlock;
    } else {
      const deadMon = ctx.buildDsSaveDeadMonFromShowdown(showdownBlock, Math.floor(i / DS_SAVE_SLOTS_PER_BOX) + 1, (i % DS_SAVE_SLOTS_PER_BOX) + 1);
      if (deadMon) {
        deadMons.push(deadMon);
      }
    }
    offset += 136;
  }

  return {
    showdown,
    partyCount,
    boxCount: liveBoxSlotCount,
    deadMons,
    metadata: { trainerId, secretId, trainerIdSecret }
  };
}

function configureDsLayout(ctx: Record<string, any>): void {
  if (ctx.TITLE === "Platinum Kaizo" && ctx.pk_pok_growths) {
    ctx.sav_pok_growths = ctx.pk_pok_growths;
  }
  if (ctx.TITLE.includes("Cascade")) {
    ctx.sav_pok_names[653] = "Sawsbuck-Summer";
    ctx.sav_pok_names[654] = "Sawsbuck-Autumn";
    ctx.sav_pok_names[655] = "Sawsbuck-Winter";
    ctx.sav_pok_names[656] = "Shellos-East";
    ctx.sav_pok_names[657] = "Gastrodon-East";
  }

  if (ctx.baseGame === "DP") {
    ctx.partyCountOffset = 0x94;
    ctx.smallBlockSize = 0xC100;
    ctx.boxDataOffset = 0xC104;
    ctx.bigBlockStart = ctx.boxDataOffset - 4;
    ctx.bigBlockSize = 0x121E0;
    ctx.footerSize = 20;
    ctx.partyPokSize = 236;
  } else if (ctx.baseGame === "Pt") {
    ctx.partyCountOffset = 0x9C;
    ctx.smallBlockSize = 0xCF2C;
    ctx.boxDataOffset = 0xCF30;
    ctx.bigBlockStart = ctx.boxDataOffset - 4;
    ctx.bigBlockSize = 0x121E4;
    ctx.footerSize = 20;
    ctx.partyPokSize = 236;
  } else if (ctx.baseGame === "HGSS") {
    ctx.partyCountOffset = 0x94;
    ctx.smallBlockSize = ctx.mechanics === "hge" ? 0xFFA0 : 0xF628;
    ctx.boxDataOffset = ctx.save_expansion ? 0x10000 : 0x0f700;
    ctx.bigBlockStart = ctx.boxDataOffset;
    ctx.bigBlockSize = 0x12310;
    ctx.footerSize = 16;
    ctx.partyPokSize = 236;
  } else if (ctx.baseGame === "BW") {
    ctx.partyCountOffset = 0x18e00 + 4;
    ctx.boxDataOffset = 0x400;
    ctx.boxSize = 0xFF0;
    ctx.partySize = 0x534;
    ctx.checksumsOffset = ctx.baseVersion === "BW2" ? 0x25F00 : 0x23F00;
    ctx.checksumEnd = ctx.baseVersion === "BW2" ? 0x25FA2 : 0x23F9A;
    ctx.checksumTableSize = ctx.baseVersion === "BW2" ? 0x94 : 0x8C;
    ctx.partyPokSize = 220;
  } else {
    throw new Error(`DS save reader does not support baseGame ${ctx.baseGame}`);
  }
  ctx.battleStatSize = (ctx.partyPokSize - 136) / 2;
}
