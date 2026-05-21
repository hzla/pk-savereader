import type { ParsedPokemon, ParsedStats } from "./types.js";

const statMap: Record<string, keyof ParsedStats> = {
  HP: "hp",
  Atk: "atk",
  Def: "def",
  SpA: "spa",
  SpD: "spd",
  Spe: "spe"
};

export function toShowdownText(value: { showdown?: string }): string {
  return value.showdown || "";
}

export function parseShowdownMons(showdown: string, partyCount = 0): ParsedPokemon[] {
  const blocks = String(showdown || "")
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block, index) => parseShowdownMon(block, index < partyCount, index + 1));
}

function parseShowdownMon(block: string, isParty: boolean, slot: number): ParsedPokemon {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  const header = lines.shift() || "Unknown";
  const { speciesName, nickname, gender, item, isEgg } = parseHeader(header);
  const mon: ParsedPokemon = {
    speciesName,
    nickname,
    gender,
    item,
    isEgg,
    moves: [],
    isParty,
    slot
  };

  for (const line of lines) {
    if (line.startsWith("- ")) {
      const name = line.slice(2).trim();
      if (name && name !== "(No Move)" && name !== "None") {
        mon.moves.push({ name });
      }
      continue;
    }

    let match = line.match(/^Level:\s*(\d+)/i);
    if (match) {
      mon.level = Number(match[1]);
      continue;
    }

    match = line.match(/^(.+)\s+Nature$/i);
    if (match) {
      mon.nature = match[1].trim();
      continue;
    }

    match = line.match(/^Ability:\s*(.+)$/i);
    if (match) {
      mon.ability = match[1].trim();
      continue;
    }

    match = line.match(/^Ability Slot:\s*(\d+)/i);
    if (match) {
      mon.abilitySlot = Number(match[1]);
      continue;
    }

    match = line.match(/^EVs:\s*(.+)$/i);
    if (match) {
      mon.evs = parseStats(match[1]);
      continue;
    }

    match = line.match(/^IVs:\s*(.+)$/i);
    if (match) {
      mon.ivs = parseStats(match[1]);
      continue;
    }

    match = line.match(/^Met:\s*(.*)$/i);
    if (match) {
      mon.metLocation = match[1].trim();
    }
  }

  return mon;
}

function parseHeader(header: string): Pick<ParsedPokemon, "speciesName" | "nickname" | "gender" | "item" | "isEgg"> {
  const [leftRaw, itemRaw] = header.split(/\s+@\s+/, 2);
  let left = (leftRaw || "").trim();
  const item = (itemRaw || "").trim() || undefined;
  let gender: ParsedPokemon["gender"];

  const genderMatch = left.match(/\s+\((M|F|N)\)$/);
  if (genderMatch) {
    gender = genderMatch[1] as ParsedPokemon["gender"];
    left = left.slice(0, genderMatch.index).trim();
  }

  const isEgg = /\(Egg\)$/.test(left);
  if (isEgg) {
    left = left.replace(/\s+\(Egg\)$/, "").trim();
  }

  const speciesMatch = left.match(/^(.*)\s+\(([^()]+)\)$/);
  if (speciesMatch) {
    return {
      nickname: speciesMatch[1].trim() || undefined,
      speciesName: speciesMatch[2].trim(),
      gender,
      item,
      isEgg
    };
  }

  return {
    speciesName: left || "Unknown",
    gender,
    item,
    isEgg
  };
}

function parseStats(text: string): ParsedStats {
  const stats: ParsedStats = {};
  for (const part of text.split("/")) {
    const match = part.trim().match(/^(\d+)\s+(HP|Atk|Def|SpA|SpD|Spe)$/);
    if (!match) {
      continue;
    }
    stats[statMap[match[2]]] = Number(match[1]);
  }
  return stats;
}
