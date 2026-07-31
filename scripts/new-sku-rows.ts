/**
 * Drafts new SKU_Master.csv rows for Tally items that have no plausible match
 * anywhere in the existing master — confirmed by the user to be real, distinct
 * products (seeds, testing/lab equipment, fertilizers, and other inputs), not
 * duplicates of something already listed.
 *
 *   npx tsx --experimental-sqlite scripts/new-sku-rows.ts [outfile.csv]
 *
 * Crop/Variety/Pack Size are parsed from the Tally item name; Category is
 * inferred from keywords. Everything is ranked by value impact and flagged
 * for review — this is a draft to correct, not a final answer.
 */
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { normalizeItemName } from '../src/lib/sku/normalisation';
import type { SkuMasterRecord } from '../src/types';

const OUT = process.argv[2] || path.join(process.cwd(), 'data', 'approval', 'SKU_Master_NEW.csv');
const DB_PATH = path.join(process.cwd(), 'data', 'vardhnam.db');

const STOP = new Set([
  'kg', 'pc', 'gm', 'gms', 'pkt', 'bag', 'nos', 'ltr', 'x',
  'hyb', 'hybrid', 'seed', 'seeds', 'variety', 'not', 'available', 'applicable',
]);

function tokenize(s: string) {
  const norm = normalizeItemName(s);
  return {
    words: (norm.match(/[a-z]{2,}/g) || []).filter((w) => !STOP.has(w)),
    numbers: norm.match(/\d+(?:\.\d+)?/g) || [],
  };
}

function wordOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const w of a) if (b.has(w)) hits += 1;
  return hits / Math.max(a.size, b.size);
}

/**
 * Recognised crop names, longest first so "Water Melon" isn't swallowed by a
 * shorter unrelated token. Anything not on this list falls back to the first
 * capitalised word of the item name, flagged for manual confirmation.
 */
const KNOWN_CROPS = [
  'Water Melon', 'Bitter Gourd', 'Bittergourd', 'Bottle Gourd', 'Bhindi', 'Okra',
  'Paddy', 'Maize', 'Bajra', 'Mustard', 'Wheat', 'Mataar', 'Matar', 'Urad',
  'Palak', 'Radish', 'Cabbage', 'Cauliflower', 'Tomato', 'Chilli', 'Brinjal',
  'Cucumber', 'Pumpkin', 'Onion', 'Spinach', 'Carrot', 'Pea', 'Gram',
];

interface CategoryRule {
  category: string;
  prefix: string;
  test: RegExp;
}

// Order matters — more specific rules first, generic Seed catch-all last.
const CATEGORY_RULES: CategoryRule[] = [
  {
    category: 'Other Input',
    prefix: 'OIN',
    test: /(moisture\s*tester|tester\s*mach|machine|conveyor|treator|equipment|automation|tool|instrument|humic|npk|micronutrient|fertili[sz]er|manure|compost|bio\s*fertili[sz]er|zinc|potash|dap\b)/i,
  },
  {
    category: 'Chemical',
    prefix: 'CHE',
    test: /(mancozeb|carbendazim|deltamethrin|thiamethoxam|imidacloprid|glyphosate|fungicide|insecticide|pesticide|herbicide|acid\b|%|wp\b|ec\b|sl\b)/i,
  },
  {
    category: 'Seed Treatment',
    prefix: 'TRT',
    test: /(polymer|coating|caoting|treatment|thairam|captan|carboxin|dressing)/i,
  },
  {
    category: 'Packing Material',
    prefix: 'PAC',
    test: /(pouch|bag\b|bags\b|box\b|boxes\b|carton|sack|wrapper|laminat|packing|packet|hessian|hdpe|woven|sheet|tag\b|sticker|label|rubber|stereo|cylinder|tub\b|drum|container|jar\b)/i,
  },
];

function classify(itemName: string): { category: string; prefix: string } {
  for (const rule of CATEGORY_RULES) {
    if (rule.test.test(itemName)) return { category: rule.category, prefix: rule.prefix };
  }
  return { category: 'Seed', prefix: 'SEE' };
}

/** Matches a pack-size expression like "4 Kg x 10 Pc", "500gm*50 Pc", or "6 Kg". */
const PACK_SIZE_RE =
  /(\d+(?:\.\d+)?)\s*(kgs?|gms?|g|ltr|l)\.?\s*(?:[x*]\s*(\d+)\s*(pcs?|pkts?|bags?|nos)?\.?)?/i;

/** Pulls the pack-size expression out of the name, in a normalised display form. */
function extractPackSize(itemName: string): string {
  const m = itemName.match(PACK_SIZE_RE);
  if (!m) return 'Not Available';
  const unit = m[2].toLowerCase().startsWith('g') ? 'Gm' : 'Kg';
  if (m[3]) {
    const packUnit = m[4] ? (/pkt/i.test(m[4]) ? 'Pkt' : 'Pc') : 'Pc';
    return `${m[1]} ${unit} × ${m[3]} ${packUnit}`;
  }
  return `${m[1]} ${unit}`;
}

/**
 * Best-effort crop + variety split for Seed-category items.
 *
 * Only strips text that is clearly a pack-size expression, bracketed content,
 * or punctuation/filler words — anything else after a dash or asterisk is kept
 * as part of the variety. An earlier version blindly cut everything following
 * '-' or '*', which discarded "BIG POWER" from
 * "HYBRID BAJRA SEED VARIETY - BIG POWER", losing the one thing that actually
 * identifies the product. Losing real data is worse than an untidy variety
 * string a human can trim.
 */
function splitCropVariety(itemName: string): { crop: string; variety: string } {
  let cleaned = itemName
    .replace(/\([^)]*\)/g, ' ')
    .replace(PACK_SIZE_RE, ' ')
    .replace(/[.*]/g, ' ')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const crop of KNOWN_CROPS) {
    const re = new RegExp(`\\b${crop.replace(/\s+/g, '\\s*')}\\b`, 'i');
    if (re.test(cleaned)) {
      const varietyWords = cleaned
        .replace(re, ' ')
        .split(/\s+/)
        .filter((w) => w && w !== '-' && !STOP.has(w.toLowerCase()));
      const variety = varietyWords.join(' ').trim();
      return { crop, variety: variety || 'Not Available' };
    }
  }
  const words = cleaned.split(/\s+/).filter(Boolean);
  const crop = words[0] || 'Unclassified';
  const variety = words.slice(1).filter((w) => w !== '-').join(' ').trim();
  return { crop, variety: variety || 'Not Available' };
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

  // Same "no plausible match" test as unmapped-items.ts, kept in sync deliberately.
  function hasCandidate(itemName: string): boolean {
    const item = tokenize(itemName);
    const itemWords = new Set(item.words);
    const itemNums = new Set(item.numbers);
    for (const m of skuMaster) {
      const varietyUnknown = !m.variety || /^not (available|applicable)$/i.test(m.variety.trim());
      if (varietyUnknown) {
        const nt = tokenize(m.uniqueSkuName);
        const nw = new Set(nt.words);
        const nn = new Set(nt.numbers);
        const wScore = wordOverlap(itemWords, nw);
        const nScore = itemNums.size || nn.size ? wordOverlap(itemNums, nn) : 0.5;
        if (wScore * 0.75 + nScore * 0.25 >= 0.65 && wScore >= 0.55) return true;
      } else {
        const vt = tokenize(m.variety);
        const signals = [...new Set([...vt.words, ...vt.numbers])];
        if (!signals.length) continue;
        let hits = 0;
        for (const t of signals) if (itemWords.has(t) || itemNums.has(t)) hits += 1;
        if (hits / signals.length >= 0.6) return true;
      }
    }
    return false;
  }

  const buckets = new Map<string, { rows: number; quantity: number; unit: string | null; value: number }>();
  const collect = (rows: Record<string, unknown>[], qtyField: string, valField: string) => {
    for (const r of rows) {
      if (r.skuId) continue;
      const name = String(r.originalItemName || '').trim();
      if (!name) continue;
      const existing = buckets.get(name);
      const qty = Number(r[qtyField]) || 0;
      const val = Number(r[valField]) || 0;
      if (existing) {
        existing.rows += 1;
        existing.quantity += qty;
        existing.value += val;
      } else {
        buckets.set(name, { rows: 1, quantity: qty, unit: (r.unit as string) ?? null, value: val });
      }
    }
  };
  collect(load('sales'), 'quantity', 'value');
  collect(load('purchase'), 'quantity', 'value');
  collect(load('returns'), 'returnQuantity', 'returnValue');
  collect(load('purchase_returns'), 'returnQuantity', 'returnValue');
  collect(load('stock'), 'closingQuantity', 'closingValue');

  const candidates = Array.from(buckets.entries())
    .filter(([name]) => !hasCandidate(name))
    .map(([name, agg]) => ({ name, ...agg }))
    .sort((a, b) => b.value - a.value);

  const header = [
    'SKU_ID', 'Unique_SKU_Name', 'Crop', 'Variety', 'Pack_Size', 'Category',
    'SKU_Status', 'Mapping_Confidence', 'Review_Flag', 'Review_Reason',
  ];
  const lines = [header.join(',')];
  const counters: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  for (const c of candidates) {
    const { category, prefix } = classify(c.name);
    byCategory[category] = (byCategory[category] || 0) + 1;
    counters[prefix] = (counters[prefix] || 0) + 1;
    const skuId = `${prefix}NEW${String(counters[prefix]).padStart(3, '0')}`;

    let crop = 'Not Applicable';
    let variety = 'Not Applicable';
    let packSize = extractPackSize(c.name);

    if (category === 'Seed') {
      const split = splitCropVariety(c.name);
      crop = split.crop;
      variety = split.variety;
    } else if (packSize === 'Not Available') {
      packSize = 'Not Available';
    }

    const impact = `${c.rows} row(s), ${c.quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${c.unit ?? ''}, ₹${c.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

    lines.push(
      [
        csvCell(skuId),
        csvCell(c.name),
        csvCell(crop),
        csvCell(variety),
        csvCell(packSize),
        csvCell(category),
        csvCell('DRAFT — confirm before activating'),
        csvCell('Low'),
        csvCell('Yes'),
        csvCell(
          `DRAFT from Tally item name "${c.name}" — verify crop/variety/pack size and category (auto-classified by keyword). Impact: ${impact}`
        ),
      ].join(',')
    );
  }

  fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf-8');

  const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const totalValue = candidates.reduce((s, c) => s + c.value, 0);
  console.log(`Wrote ${candidates.length} draft SKU_Master rows to ${OUT}`);
  console.log(`  total value these unlock : ${inr(totalValue)}`);
  console.log();
  console.log('By category:');
  Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, n]) => console.log(`  ${String(n).padStart(3)}  ${cat}`));
  console.log();
  console.log('Top 20 by value:');
  candidates.slice(0, 20).forEach((c) => {
    const { category } = classify(c.name);
    console.log(`  ${inr(c.value).padStart(13)}  ${String(c.rows).padStart(3)}r  [${category.padEnd(16)}]  ${c.name.slice(0, 46)}`);
  });
}

main();
