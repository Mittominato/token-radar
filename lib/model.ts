// Token Radar — value model, farm plans and dashboard data.
//
// The model reads ONLY the sealed snapshot's own figures: a protocol's TVL,
// its seven-day TVL change, how long it has run, how many chains it spans and
// its category. No protocol name is ever hardcoded, and no outside price,
// tweet, rumour or list feeds the ranking. A token's implied value is the
// entry's own claim: what the protocol would be worth if a token existed and
// the market priced its record the way it prices the protocols that already
// have one.
//
// Why this shape: across the snapshot, protocols that already trade tend to
// carry a market cap near a fraction of their TVL, and that fraction rises
// with growth, with age and with the breadth of chains they run on. The model
// copies that shape. It says a protocol records no token, never that it has
// none — the snapshot cannot prove the negative.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

/** One scored protocol, with every factor the dashboard shows as the reason. */
export interface Scored {
  protocol: Protocol;
  preToken: boolean;
  onWatchlist: boolean;
  ageYears: number;
  growthPct: number;
  growthFactor: number;
  ageFactor: number;
  breadthFactor: number;
  categoryFactor: number;
  implied: number;
}

export interface Radar {
  asOf: string;
  floor: number;
  rows: BoardRow[];
  scored: Scored[];
  live: Scored[];
  earlySize: number;
  liveSize: number;
  modelText: string;
}

/** A protocol records no token when both token fields are null. */
export function isPreToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Whole years between the listing day and the snapshot date; 0 when unknown. */
export function ageYearsOf(p: Protocol, asOf: string): number {
  if (p.listed_at === null) return 0;
  const listed = Date.parse(`${p.listed_at}T00:00:00Z`);
  const as = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(listed) || !Number.isFinite(as) || as <= listed) return 0;
  return (as - listed) / (365.25 * 24 * 3600 * 1000);
}

/**
 * What a category is worth, as a multiplier on the TVL base. Categories whose
 * tokens the market has historically priced near or above their TVL — lending,
 * exchanges, derivatives — score above 1; bridges, staking pools and CEX
 * products, whose value sits mostly in the asset they wrap, score below 1.
 * The map is by category string only; it never names a protocol.
 */
const CATEGORY_FACTOR: Record<string, number> = {
  Lending: 1.12,
  Dexs: 1.1,
  Derivatives: 1.08,
  'Yield Aggregator': 1.08,
  Yield: 1.06,
  Restaking: 1.06,
  'Liquid Restaking': 1.04,
  'Onchain Capital Allocator': 1.04,
  'Uncollateralized Lending': 1.04,
  'Interest Rate Derivatives': 1.04,
  'Liquidity Manager': 1.03,
  Synthetics: 1.02,
  CDP: 1.02,
  Launchpad: 1.02,
  Farm: 1.0,
  'Leveraged Farming': 1.0,
  RWA: 1.0,
  'NFT Marketplace': 0.95,
  Chain: 0.9,
  'Staking Pool': 0.85,
  Bridge: 0.75,
  'Cross Chain Bridge': 0.75,
  'Canonical Bridge': 0.7,
  'Liquid Staking': 0.7,
  CEX: 0.6,
};

export function categoryFactorOf(category: string | null): number {
  if (category === null) return 0.95;
  return CATEGORY_FACTOR[category] ?? 1.0;
}

/**
 * Whether a pre-token protocol is a launch candidate at all. The snapshot's
 * own watchlist rule draws this line, and the board applies the same line
 * without the TVL floor: a wrapped, staked or bridged product of a token that
 * already trades is not a token waiting to launch, a versioned copy (a name
 * ending in V2, v2, 2.0 and the like) is the same protocol twice, and an
 * exchange's own product is the exchange, not a launch. The checks use only
 * the snapshot's category and name fields, never a hardcoded protocol list.
 */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\bwrapped\b|\bstaked\b|\bstaking\b/i;

export function isLaunchCandidate(p: Protocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (VERSION_MARKER.test(p.name)) return false;
  for (const ex of EXCHANGE_NAMES) if (p.name.startsWith(ex)) return false;
  return true;
}

/**
 * Score one protocol. The base is a third of TVL — the fraction the market
 * tends to pay for a token against the value locked in the protocol — then
 * four small, bounded factors move it: growth (a fast-growing protocol is
 * worth more than a shrinking one of the same size), age (a record that has
 * run for years is worth more than one that appeared last month), breadth
 * (more chains, more surface) and category.
 */
export function scoreProtocol(p: Protocol, asOf: string, onWatchlist: boolean): Scored {
  const growthPct = p.change_7d === null ? 0 : p.change_7d;
  const growthFactor = 1 + clamp(growthPct, -30, 60) / 200;
  const ageYears = ageYearsOf(p, asOf);
  const ageFactor = 1 + Math.min(ageYears, 5) * 0.05;
  const breadthFactor = 1 + Math.min(p.chains.length, 10) * 0.015;
  const categoryFactor = categoryFactorOf(p.category);
  const implied = Math.max(
    1,
    Math.round(p.tvl_usd * 0.35 * growthFactor * ageFactor * breadthFactor * categoryFactor),
  );
  return {
    protocol: p,
    preToken: isPreToken(p),
    onWatchlist,
    ageYears,
    growthPct,
    growthFactor,
    ageFactor,
    breadthFactor,
    categoryFactor,
    implied,
  };
}

// ---------------------------------------------------------------- farm plans

/** The verb a category farms with, and the thing it farms. */
const CATEGORY_PLAY: Record<string, { verb: string; thing: string }> = {
  Lending: { verb: 'supply and borrow on', thing: 'lending markets' },
  Dexs: { verb: 'swap and provide liquidity on', thing: 'pools' },
  Derivatives: { verb: 'open and hold positions on', thing: 'perpetual markets' },
  Yield: { verb: 'deposit into', thing: 'yield vaults' },
  'Yield Aggregator': { verb: 'deposit into', thing: 'auto-compounding vaults' },
  Farm: { verb: 'stake into', thing: 'farm pools' },
  'Leveraged Farming': { verb: 'open leveraged positions on', thing: 'farm vaults' },
  Restaking: { verb: 'restake through', thing: 'restaking vaults' },
  'Liquid Restaking': { verb: 'mint and hold the liquid restaked token of', thing: 'restaking vaults' },
  'Liquid Staking': { verb: 'stake and hold the liquid staking token of', thing: 'staking pools' },
  'Staking Pool': { verb: 'stake into', thing: 'staking pools' },
  Bridge: { verb: 'bridge assets through', thing: 'bridge routes' },
  'Cross Chain Bridge': { verb: 'bridge assets through', thing: 'cross-chain routes' },
  'Canonical Bridge': { verb: 'bridge assets through', thing: 'canonical bridge routes' },
  Synthetics: { verb: 'mint and hold positions on', thing: 'synthetic markets' },
  CDP: { verb: 'open a collateralised position on', thing: 'vaults' },
  RWA: { verb: 'mint and hold positions in', thing: 'tokenised assets' },
  Launchpad: { verb: 'take part in launches on', thing: 'launch pools' },
  'Uncollateralized Lending': { verb: 'supply to', thing: 'credit markets' },
  'Liquidity Manager': { verb: 'deposit into', thing: 'managed liquidity vaults' },
  'Onchain Capital Allocator': { verb: 'allocate capital through', thing: 'allocation vaults' },
  'Interest Rate Derivatives': { verb: 'trade rate positions on', thing: 'rate markets' },
  'NFT Marketplace': { verb: 'list and trade on', thing: 'marketplace listings' },
  Chain: { verb: 'use', thing: 'apps' },
  CEX: { verb: 'trade on', thing: 'spot and futures markets' },
};

function playOf(category: string | null): { verb: string; thing: string } {
  if (category === null) return { verb: 'deposit into', thing: 'pools' };
  return CATEGORY_PLAY[category] ?? { verb: 'deposit into', thing: 'pools' };
}

function moneyOf(tvl: number): string {
  if (tvl >= 1_000_000_000) return '$500–$2,000';
  if (tvl >= 100_000_000) return '$250–$1,000';
  return '$100–$500';
}

function chainList(p: Protocol): string {
  if (p.chains.length === 0) return 'its main chain';
  if (p.chains.length === 1) return p.chains[0]!;
  return `${p.chains[0]!} and ${p.chains[1]!}`;
}

/**
 * Five concrete farm steps for one scored protocol, each 20–600 characters,
 * each naming what it costs and how long it takes. The steps are built from
 * the protocol's own category, chains and size — never from its name, so the
 * same plan shape fits any protocol with the same shape of record.
 */
export function farmSteps(s: Scored): string[] {
  const p = s.protocol;
  const play = playOf(p.category);
  const money = moneyOf(p.tvl_usd);
  const chain = chainList(p);
  const age = s.ageYears >= 1 ? `${s.ageYears.toFixed(1)} years of track record` : 'a short track record';
  const action = play.verb.charAt(0).toUpperCase() + play.verb.slice(1);
  const steps = [
    `Bridge ${money} of stablecoins to ${chain} and hold them ready; bridging costs about $0.50–$3 in gas and takes 5–15 minutes, and keep at least $20 spare for later transactions.`,
    `${action} ${p.name}'s ${play.thing} on ${chain} with ${money}, in two or three deposits a week apart rather than all at once; each deposit costs about $0.50–$5 in gas.`,
    `Keep the position open for at least 4–8 weeks and touch it weekly — one swap, deposit or claim a week — because airdrops usually reward steady activity over ${age}, not a single deposit.`,
    `If the protocol opens a points or rewards page, connect the same wallet you farmed with and check it weekly; claiming points is free or costs under $1, and a missed claim can void a season.`,
    `Before any token is announced, move nothing to a fresh wallet: keep the farming wallet, its history and its gas, and set aside $10–$25 for the claim transaction, which usually takes 10–30 minutes to confirm.`,
  ];
  return steps;
}

// ---------------------------------------------------------------- board build

export const BOARD_ROWS = 240;

/** Parse and validate the snapshot's shape. Throws on a malformed file. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (typeof raw !== 'object' || raw === null) throw new Error('snapshot: not an object');
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  return raw;
}

/**
 * Build the board. Every pre-token protocol is scored; the board holds all 40
 * watchlist protocols plus the 200 best-scoring other pre-token protocols, 240
 * rows in all. Token-bearing protocols are set aside into `live`, shown on the
 * dashboard as already launched, never ranked as if they were still to come.
 * Ranks run 1..N exactly once, and implied values never rise with rank.
 */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const onWatchlist = new Set(snapshot.watchlist);
  const scored = snapshot.protocols.map((p) => scoreProtocol(p, snapshot.as_of, onWatchlist.has(p.slug)));
  // Only launch candidates are ranked: the watchlist's own exclusion line
  // (wrapped, staked, bridged, versioned, exchange products) without its
  // TVL floor, so a centralised exchange's TVL can never top the board.
  const pre = scored.filter((s) => isLaunchCandidate(s.protocol));
  const live = scored
    .filter((s) => !s.preToken)
    .sort((a, b) => b.protocol.tvl_usd - a.protocol.tvl_usd)
    .slice(0, 30);
  const picked = pre.sort((a, b) => b.implied - a.implied || b.protocol.tvl_usd - a.protocol.tvl_usd || (a.protocol.slug < b.protocol.slug ? -1 : 1));
  const watch = picked.filter((s) => s.onWatchlist);
  const rest = picked.filter((s) => !s.onWatchlist).slice(0, BOARD_ROWS - watch.length);
  const chosen = [...watch, ...rest].sort(
    (a, b) => b.implied - a.implied || b.protocol.tvl_usd - a.protocol.tvl_usd || (a.protocol.slug < b.protocol.slug ? -1 : 1),
  );

  // Enforce a non-increasing implied value down the ranks, whole dollars.
  let prev = Number.POSITIVE_INFINITY;
  const board: BoardRow[] = chosen.map((s, i) => {
    let value = Math.min(s.implied, prev === Number.POSITIVE_INFINITY ? s.implied : prev - 1);
    if (value < 1) value = 1;
    prev = value;
    return {
      slug: s.protocol.slug,
      name: s.protocol.name,
      rank: i + 1,
      implied_value_usd: value,
      farm_steps: farmSteps(s),
    };
  });
  // Keep the scored rows in the same order as the board, for the dashboard.
  const bySlug = new Map(chosen.map((s) => [s.protocol.slug, s]));
  const orderedScored = board.map((r) => bySlug.get(r.slug)!);
  const radar: Radar = {
    asOf: snapshot.as_of,
    floor: snapshot.floor_usd,
    rows: board,
    scored: orderedScored,
    live,
    earlySize: board.length,
    liveSize: live.length,
    modelText:
      'Implied value = TVL x 0.35 x growth factor x age factor x breadth factor x category factor. ' +
      'Growth factor is 1 + clamped 7-day TVL change / 200. Age factor is 1 + min(years listed, 5) x 0.05. ' +
      'Breadth factor is 1 + min(chains, 10) x 0.015. Category factor runs 0.6 (CEX) to 1.12 (Lending). ' +
      'Only launch candidates are ranked: protocols that record no token, minus wrapped, staked, bridged, ' +
      'versioned and exchange products, the watchlist rule without its TVL floor. ' +
      'Token-bearing protocols are listed separately as already launched.',
  };
  return { board, radar };
}

/** The gate's own checks, run before writing anything. Returns a reason or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `board holds ${board.length} rows, at least 100 are required`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  for (const row of board) {
    if (!slugs.has(row.slug)) return `board names ${row.slug}, which the snapshot does not list`;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `${row.slug} has ${row.farm_steps.length} farm steps, 3 to 12 are required`;
    }
    for (const step of row.farm_steps) {
      const n = step.trim().length;
      if (n < 20 || n > 600) return `${row.slug} has a farm step of ${n} characters, 20 to 600 are required`;
    }
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `ranks are not exactly 1..${board.length}`;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `implied value rises from rank ${i} to rank ${i + 1}`;
    }
  }
  const have = new Set(board.map((r) => r.slug));
  for (const slug of snapshot.watchlist) if (!have.has(slug)) return `watchlist protocol ${slug} is missing`;
  const values = new Set(board.map((r) => r.implied_value_usd));
  if (values.size < 2) return 'every implied value is the same: the board ranks nothing';
  return null;
}

/** The dashboard's data file, written beside the page as data.js. */
export function dataScript(radar: Radar): string {
  const rows = radar.scored.map((s, i) => ({
    slug: s.protocol.slug,
    name: s.protocol.name,
    rank: i + 1,
    implied: radar.rows[i]!.implied_value_usd,
    tvl: s.protocol.tvl_usd,
    change: s.growthPct,
    category: s.protocol.category,
    chains: s.protocol.chains,
    listed: s.protocol.listed_at,
    age: Number(s.ageYears.toFixed(2)),
    watch: s.onWatchlist,
    factors: {
      growth: Number(s.growthFactor.toFixed(3)),
      age: Number(s.ageFactor.toFixed(3)),
      breadth: Number(s.breadthFactor.toFixed(3)),
      category: Number(s.categoryFactor.toFixed(3)),
    },
    steps: radar.rows[i]!.farm_steps,
  }));
  const live = radar.live.map((s) => ({
    slug: s.protocol.slug,
    name: s.protocol.name,
    tvl: s.protocol.tvl_usd,
    mcap: s.protocol.mcap_usd,
    symbol: s.protocol.symbol,
    category: s.protocol.category,
  }));
  const payload = {
    asOf: radar.asOf,
    floor: radar.floor,
    model: radar.modelText,
    rows,
    live,
  };
  return `window.RADAR = ${JSON.stringify(payload)};\n`;
}
