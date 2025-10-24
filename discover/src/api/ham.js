function normalize(s) {
  return (s ?? "").trim().toLowerCase();
}

/**
 * 将结构化 bans 数组（{field, value}）转为 { artist:Set, culture:Set, dated:Set }
 */
function buildBanSets(bansArray = []) {
  const result = {
    artist: new Set(),
    culture: new Set(),
    dated: new Set(),
  };
  for (const b of bansArray) {
    const f = (b?.field ?? "").toLowerCase();
    const v = normalize(b?.value);
    if (!f || !v) continue;
    if (result[f]) result[f].add(v);
  }
  return result;
}


// src/api/ham.js

const API_KEY = import.meta.env.VITE_HAM_API_KEY;
const BASE_URL = "https://api.harvardartmuseums.org/object";

// 统一：把原始记录映射到 UI 需要的结构（固定展示字段）
export function mapRecordToItem(record) {
  const title = record?.title ?? "Untitled";
  const artist = record?.people?.[0]?.name ?? "Unknown";
  const culture = record?.culture ?? "Unknown";
  const dated = record?.dated ?? "Unknown";

  const imageUrl =
    record?.primaryimageurl ??
    record?.images?.[0]?.baseimageurl ??
    null;

  return { id: record?.id, title, artist, culture, dated, imageUrl };
}

// 轻量 sleep（用于退避重试）
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 记忆总页数，避免每次都请求一次 page=1
let cachedTotalPages = null;

/**
 * 拿到 Harvard Art Museums 的总页数（只查一次后缓存）
 */
async function getTotalPages() {
  if (cachedTotalPages) return cachedTotalPages;

  const params = new URLSearchParams({
    apikey: API_KEY,
    hasimage: "1",
    size: "1",
    fields: "id",
    page: "1",
  });

  const res = await fetch(`${BASE_URL}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to get pages: ${res.status}`);
  }
  const data = await res.json();
  cachedTotalPages = data?.info?.pages ?? 1;
  return cachedTotalPages;
}

/**
 * 抽一条记录（随机页，size=1）
 */
async function fetchOneRandomRaw() {
  const pages = await getTotalPages();
  const page = 1 + Math.floor(Math.random() * pages);

  const params = new URLSearchParams({
    apikey: API_KEY,
    hasimage: "1",
    size: "1",
    // 固定你要展示的字段，保持“跨请求一致属性”
    fields: "id,title,primaryimageurl,images,culture,dated,people",
    page: String(page),
  });

  const res = await fetch(`${BASE_URL}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status}`);
  }
  const data = await res.json();
  return data?.records?.[0] ?? null;
}

/**
 * 业务规则检查：是否命中 ban 或无图或重复
 */
function violatesRules(mapped, banSets, seenSet) {
  if (!mapped?.imageUrl) return true;

  const a = normalize(mapped.artist);
  const c = normalize(mapped.culture);
  const d = normalize(mapped.dated);

  // 忽略把“unknown”类值加入 ban 的影响（可选优化）
  const isUnknown = (x) => !x || x === "unknown" || x === "n/a";

  const hitBan =
    (!isUnknown(a) && banSets.artist.has(a)) ||
    (!isUnknown(c) && banSets.culture.has(c)) ||
    (!isUnknown(d) && banSets.dated.has(d));

  if (hitBan) return true;

  if (mapped.id && seenSet.has(mapped.id)) return true;

  return false;
}


/**
 * 核心服务：返回一条“合格”的作品
 * - 避开 ban
 * - 避开最近 seen（去重缓冲）
 * - 最多重试 maxTries 次；带轻微退避（100ms * 尝试序号）
 */
export async function getRandomArtworkAvoiding(bansArray, seenIdsArray, maxTries = 10) {
  if (!API_KEY) {
    throw new Error("Missing VITE_HAM_API_KEY");
  }

  const banSets = buildBanSets(bansArray);
  const seenSet = new Set(seenIdsArray ?? []);

  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const raw = await fetchOneRandomRaw();
    if (!raw) {
      await sleep(50 * attempt);
      continue;
    }
    const mapped = mapRecordToItem(raw);

    if (violatesRules(mapped, banSets, seenSet)) {
      await sleep(100 * attempt);
      continue;
    }
    return mapped;
  }

  throw new Error("No suitable artwork found after retries.");
}

