/**
 * Generates a paste-ready SKU_Mapping.csv worklist for every item Tally holds
 * that has no SKU mapping, ranked by the rupee value it keeps off the dashboard.
 *
 *   npx tsx scripts/unmapped-items.ts [outfile.csv]
 *
 * Each row carries a suggested SKU_ID scored against SKU_Master. Suggestions are
 * a starting point, not an answer — anything below the high-confidence threshold
 * is flagged REVIEW so it gets human eyes before it is trusted.
 */
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { normalizeItemName } from '../src/lib/sku/normalisation';
import type { SkuMasterRecord } from '../src/types';

const OUT = process.argv[2] || path.join(process.cwd(), 'data', 'approval', 'SKU_Mapping_TODO.csv');
const DB_PATH = path.join(process.cwd(), 'data', 'vardhnam.db');

interface UnmappedRow {
  originalItemName: string;
  datasets: Set<string>;
  companies: Set<string>;
  rows: number;
  quantity: number;
  unit: string | null;
  value: number;
}

/** Splits a name into comparable word and number tokens. */
function tokenize(s: string): { words: string[]; numbers: string[] } {
  const norm = normalizeItemName(s);
  const words = norm.match(/[a-z]{2,}/g) || [];
  const numbers = norm.match(/\d+(?:\.\d+)?/g) || [];
  return { words, numbers };
}

// Words carrying no discriminating signal: units, packaging, and the filler
// SKU_Master uses when a field is unknown.
const STOP = new Set([
  'kg', 'pc', 'gm', 'gms', 'pkt', 'bag', 'nos', 'ltr', 'x',
  'hyb', 'hybrid', 'seed', 'seeds', 'variety',
  'not', 'available', 'applicable', 'bulk', 'research',
]);

const isPlaceholder = (v: string) => !v || /^not (available|applicable)$/i.test(v.trim());

export interface MatchScore {
  score: number;
  /** True when the master's variety words actually appear in the item name. */
  varietyMatched: boolean;
  /** True when the master row has no usable variety to match against. */
  varietyUnknown: boolean;
}

/** Jaccard-style overlap of word sets, for direct name-to-name comparison. */
function wordOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const w of a) if (b.has(w)) hits += 1;
  return hits / Math.max(a.size, b.size);
}

/**
 * Scores an item name against a master SKU.
 *
 * Two modes, chosen by whether the master row even has a variety:
 *
 * - Variety known (Seed-like rows): variety dominates deliberately. Crop and
 *   pack size alone are NOT enough — "Paddy Shagun (6 Kg*5 Pc)" and
 *   "Paddy Adiyogi — 6 Kg × 5 Pc" share crop and pack size exactly while being
 *   different products, so a word-overlap scorer confidently returns the
 *   wrong SKU. A suggestion is only confident when the variety itself agrees.
 *
 * - Variety unknown (Crop/Variety = "Not Applicable" — Packing Material,
 *   Chemical, Seed Treatment, Other Input): these rows have no variety to
 *   check, so the "require variety agreement" rule can never fire and every
 *   such row would be misreported as missing. Confirmed against the master:
 *   "Paddy Pouch 6kg Blue" (PAC011) and "Seed Caoting Polymer" (TRT001)
 *   already exist and were being missed this way. These instead compare the
 *   full item name directly against Unique_SKU_Name.
 */
function score(itemName: string, master: SkuMasterRecord): MatchScore {
  const item = tokenize(itemName);
  const itemWords = new Set(item.words.filter((w) => !STOP.has(w)));
  const itemNums = new Set(item.numbers);

  const varietyUnknown = isPlaceholder(master.variety);

  if (varietyUnknown) {
    const nameTokens = tokenize(master.uniqueSkuName);
    const nameWords = new Set(nameTokens.words.filter((w) => !STOP.has(w)));
    const nameNums = new Set(nameTokens.numbers);

    const wScore = wordOverlap(itemWords, nameWords);
    // Numbers absent on both sides is a NEUTRAL signal, not confirmation — giving
    // it full credit was exactly how "Paddy Prasanna" matched the bare generic
    // "Paddy" master row at 63%: Prasanna (the actual variety) went unaccounted
    // for while the missing pack-size numbers scored as if they'd agreed.
    const nScore = itemNums.size || nameNums.size ? wordOverlap(itemNums, nameNums) : 0.5;
    const nameScore = wScore * 0.75 + nScore * 0.25;

    // Word overlap must carry real weight on its own — a low word match cannot
    // be rescued by the numeric sub-score.
    const confident = nameScore >= 0.65 && wScore >= 0.55;
    return { score: nameScore, varietyMatched: confident, varietyUnknown: true };
  }

  const varietyTokens = tokenize(master.variety);
  const varietyWords = varietyTokens.words.filter((w) => !STOP.has(w));
  const varietyNums = varietyTokens.numbers;

  // Variety agreement: every distinctive token of the variety that shows up.
  const varietySignals = [...new Set([...varietyWords, ...varietyNums])];
  let varietyHits = 0;
  for (const t of varietySignals) {
    if (varietyWords.includes(t) ? itemWords.has(t) : itemNums.has(t)) varietyHits += 1;
  }
  const varietyScore = varietySignals.length ? varietyHits / varietySignals.length : 0;
  const varietyMatched = varietySignals.length > 0 && varietyScore >= 0.6;

  // Crop agreement — weak on its own, since most rows share a handful of crops.
  const cropWords = isPlaceholder(master.crop) ? [] : tokenize(master.crop).words.filter((w) => !STOP.has(w));
  const cropScore = cropWords.length && cropWords.every((w) => itemWords.has(w)) ? 1 : 0;

  // Pack size confirms an already-plausible variety match.
  const packNums = isPlaceholder(master.packSize) ? [] : tokenize(master.packSize).numbers;
  const packScore = packNums.length ? packNums.filter((n) => itemNums.has(n)).length / packNums.length : 0;

  return {
    score: varietyScore * 0.6 + cropScore * 0.15 + packScore * 0.25,
    varietyMatched,
    varietyUnknown: false,
  };
}

function csvCell(v: string | number): string {
  const s = String(v ?? '');
  return `"${s.replace(/"/g, '""')}"`;
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`No database at ${DB_PATH}. Run a Tally sync first.`);
    process.exit(1);
  }

  const db = new DatabaseSync(DB_PATH);
  const load = <T>(table: string): T[] => {
    try {
      return db.prepare(`SELECT data FROM ${table}`).all().map((r) => JSON.parse((r as { data: string }).data));
    } catch {
      return [];
    }
  };

  const skuMaster = load<SkuMasterRecord>('sku_master');
  if (skuMaster.length === 0) {
    console.error('sku_master is empty. Run a Tally sync first.');
    process.exit(1);
  }

  const buckets = new Map<string, UnmappedRow>();
  const collect = (
    dataset: string,
    rows: Record<string, unknown>[],
    qtyField: string,
    valField: string
  ) => {
    for (const r of rows) {
      if (r.skuId) continue;
      const name = String(r.originalItemName || '').trim();
      if (!name) continue;
      const existing = buckets.get(name);
      const qty = Number(r[qtyField]) || 0;
      const val = Number(r[valField]) || 0;
      if (existing) {
        existing.datasets.add(dataset);
        if (r.company) existing.companies.add(String(r.company));
        existing.rows += 1;
        existing.quantity += qty;
        existing.value += val;
      } else {
        buckets.set(name, {
          originalItemName: name,
          datasets: new Set([dataset]),
          companies: new Set(r.company ? [String(r.company)] : []),
          rows: 1,
          quantity: qty,
          unit: (r.unit as string) ?? null,
          value: val,
        });
      }
    }
  };

  collect('Sales', load('sales'), 'quantity', 'value');
  collect('Purchase', load('purchase'), 'quantity', 'value');
  collect('Sales Return', load('returns'), 'returnQuantity', 'returnValue');
  collect('Purchase Return', load('purchase_returns'), 'returnQuantity', 'returnValue');
  collect('Godown Stock', load('stock'), 'closingQuantity', 'closingValue');

  const items = Array.from(buckets.values()).sort((a, b) => b.value - a.value);

  const header = [
    'Original_Item_Name',
    'Normalised_Item_Name',
    'Source_Type',
    'Source_File',
    'SKU_ID',
    'Unique_SKU_Name',
    'Mapping_Confidence',
    'Review_Flag',
    'Mapping_Reason',
  ];

  const lines = [header.join(',')];
  let high = 0;
  let review = 0;
  let newSkuNeeded = 0;
  let newSkuValue = 0;
  let totalValue = 0;

  for (const item of items) {
    totalValue += item.value;

    const ranked = skuMaster
      .map((m) => ({ m, ...score(item.originalItemName, m) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const runnerUp = ranked[1];

    // A suggestion is only confident when the variety itself agrees. Crop and
    // pack size matching alone produced confidently wrong answers.
    const confident =
      best &&
      best.varietyMatched &&
      best.score >= 0.6 &&
      (!runnerUp || best.score - runnerUp.score >= 0.1);
    if (confident) high += 1;
    else review += 1;

    const suggestion = confident ? best.m : null;
    const alternates = ranked
      .slice(0, 3)
      .filter((r) => r.score > 0.25)
      .map((r) => `${r.m.skuId} ${r.m.uniqueSkuName} (${(r.score * 100).toFixed(0)}%)`)
      .join('; ');

    // No candidate shares this item's variety, so the product is absent from
    // SKU_Master and a new master row is needed before it can be mapped.
    const needsNewSku = !ranked.some((r) => r.varietyMatched);
    if (needsNewSku) {
      newSkuNeeded += 1;
      newSkuValue += item.value;
    }

    const reason = confident
      ? `AUTO-SUGGESTED ${(best.score * 100).toFixed(0)}% (variety matched). VERIFY PACK SIZE before accepting.`
      : needsNewSku
        ? `NO MATCHING VARIETY IN SKU_Master — likely needs a NEW master SKU row, not a mapping. Nearest by crop/pack: ${alternates || 'none'}`
        : `NEEDS REVIEW — variety uncertain. Candidates: ${alternates || 'none'}`;

    lines.push(
      [
        csvCell(item.originalItemName),
        csvCell(normalizeItemName(item.originalItemName)),
        csvCell(Array.from(item.datasets).join('/')),
        csvCell(`Tally:${Array.from(item.companies).join('/') || 'unknown'}`),
        csvCell(confident && suggestion ? suggestion.skuId : ''),
        csvCell(confident && suggestion ? suggestion.uniqueSkuName : ''),
        csvCell(confident ? 'High' : 'Low'),
        csvCell(confident ? 'No' : 'Yes'),
        csvCell(
          `${reason} | impact: ${item.rows} row(s), ${item.quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${item.unit ?? ''}, ₹${item.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
        ),
      ].join(',')
    );
  }

  fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf-8');

  const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  console.log(`Wrote ${items.length} unmapped items to ${OUT}`);
  console.log(`  auto-suggested, variety matched   : ${high}`);
  console.log(`  needs human review                : ${review}`);
  console.log(`    of which need a NEW master SKU  : ${newSkuNeeded}  (${inr(newSkuValue)})`);
  console.log(`  total value currently hidden      : ${inr(totalValue)}`);
  console.log();
  console.log('Top 20 by value impact:');
  items.slice(0, 20).forEach((i) => {
    const ranked = skuMaster
      .map((m) => ({ m, ...score(i.originalItemName, m) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const label = best?.varietyMatched
      ? `${best.m.skuId} ${best.m.uniqueSkuName.slice(0, 30)} (${(best.score * 100).toFixed(0)}%)`
      : 'NEW SKU NEEDED';
    console.log(`  ${inr(i.value).padStart(13)}  ${String(i.rows).padStart(3)}r  ${i.originalItemName.slice(0, 40).padEnd(40)} -> ${label}`);
  });
}

main();
