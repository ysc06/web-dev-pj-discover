import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import { getRandomArtworkAvoiding } from "./api/ham";


// 读取环境变量中的 API Key（你已在 .env 设置了 VITE_HAM_API_KEY）
const API_KEY = import.meta.env.VITE_HAM_API_KEY;
const BASE_URL = "https://api.harvardartmuseums.org/object";

// 小工具：从记录里提取我们需要的“统一三属性 + 图片”
function mapRecordToItem(record) {
  const title = record?.title ?? "Untitled";
  const artist = record?.people?.[0]?.name ?? "Unknown";
  const culture = record?.culture ?? "Unknown";
  const dated = record?.dated ?? "Unknown";

  // 图片优先级：primaryimageurl > images[0].baseimageurl
  const imageUrl =
    record?.primaryimageurl ??
    record?.images?.[0]?.baseimageurl ??
    null;

  return { title, artist, culture, dated, imageUrl };
}


function App() {
  // 最近看过的 id（短期去重，降低重复感）
// 用数组 + 固定上限（例如保留最近 30 条）
const [seenIds, setSeenIds] = useState([]);
const SEEN_LIMIT = 30;

  // 当前显示的一条作品
  const [item, setItem] = useState(null);
  // ban 列表（字符串数组，先用 culture 来做演示）
  const [bans, setBans] = useState([]);

// 尝试随机获取一条符合条件（有图、不过 ban）的记录
async function fetchRandomArtworkAvoidingBans(bans) {
  // 先拿总页数
  const params = new URLSearchParams({
    apikey: API_KEY,
    hasimage: "1",
    size: "1",
    fields: "id,title,primaryimageurl,images,culture,dated,people",
    page: "1",
  });

  const first = await fetch(`${BASE_URL}?${params.toString()}`);
  const firstData = await first.json();
  const pages = firstData?.info?.pages ?? 1;

  // 最多重试 8 次以避开 ban
  for (let attempt = 0; attempt < 8; attempt++) {
    const page = 1 + Math.floor(Math.random() * pages);

    // 重新设置随机页
    params.set("page", String(page));

    const res = await fetch(`${BASE_URL}?${params.toString()}`);
    const data = await res.json();
    const rec = data?.records?.[0];

    if (!rec) continue;

    const mapped = mapRecordToItem(rec);

    // 没图直接跳过
    if (!mapped.imageUrl) continue;

    // 命中 ban 就再试
    const hitBan =
      (mapped.artist && bans.includes(mapped.artist)) ||
      (mapped.culture && bans.includes(mapped.culture));

    if (hitBan) continue;

    return mapped; // 合格，返回
  }

  throw new Error("No suitable artwork found after several attempts.");
}




const [loading, setLoading] = useState(false);
const [error, setError] = useState("");

const handleDiscover = async () => {
  if (!import.meta.env.VITE_HAM_API_KEY) {
    alert("Missing API key. 请在 .env 设置 VITE_HAM_API_KEY");
    return;
  }

  try {
    setLoading(true);
    setError("");
    const result = await getRandomArtworkAvoiding(bans, seenIds, 10);
    setItem(result);

    // 维护 seenIds：把新 id 放到队尾，超过上限就丢掉最旧的
    if (result?.id) {
      setSeenIds((prev) => {
        const next = [...prev, result.id];
        if (next.length > SEEN_LIMIT) next.shift();
        return next;
      });
    }
  } catch (e) {
    console.error(e);
    setError("未找到合适的作品，请清空部分 ban 或稍后再试。");
  } finally {
    setLoading(false);
  }
};


  // 点击卡片上的某个可点击属性（比如 culture）
  const handleBanClick = (field, value) => {
  if (!field || !value) return;
  const norm = (s) => (s ?? "").trim().toLowerCase();

  // 已存在则不重复加入（按 field+值 的组合判断）
  const exists = bans.some(
    (b) => b.field === field && norm(b.value) === norm(value)
  );
  if (exists) return;

  setBans((prev) => [...prev, { field, value }]);
};


  // 点击 ban 列表中的项将其移除
const handleUnban = (field, value) => {
  const norm = (s) => (s ?? "").trim().toLowerCase();
  setBans((prev) =>
    prev.filter(
      (b) => !(b.field === field && norm(b.value) === norm(value))
    )
  );
};


  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <h1>Veni Vici — Discover Art</h1>

      {/* 控件区 */}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button onClick={handleDiscover}>Discover</button>
        <div>Ban list:</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {bans.map((b) => {
  const key = `${b.field}:${(b.value ?? "").toLowerCase()}`;
  return (
    <span
      key={key}
      onClick={() => handleUnban(b.field, b.value)}
      style={{
        border: "1px solid #aaa",
        padding: "2px 8px",
        borderRadius: 12,
        cursor: "pointer",
        background: "#f6f6f6"
      }}
      title="点击移除"
    >
      {b.field}: {b.value} ✕
    </span>
  );
})}


        </div>
      </div>

      {/* 展示区：一条一图 + 三个属性（Step 2 填内容） */}
      <section style={{ marginTop: 16 }}>
        {item ? (
          <article
            style={{
              display: "grid",
              gridTemplateColumns: "320px 1fr",
              gap: 16,
              alignItems: "start",
            }}
          >
            <img
              src={item.imageUrl}
              alt={item.title || "Artwork"}
              style={{ width: 320, height: "auto", borderRadius: 8 }}
            />
            <div>
              <h2 style={{ margin: "4px 0" }}>{item.title || "Untitled"}</h2>
            
              <p>
                <strong>Artist:</strong>{" "}
                <span
                  style={{ textDecoration: "underline", cursor: "pointer" }}
                  title="点击加入 ban 列表"
                  onClick={() => handleBanClick('artist', item.artist)}
                >
                  {item.artist || "Unknown"}
                </span>
              </p>
              <p>
                <strong>Culture:</strong>{" "}
                <span
                  style={{ textDecoration: "underline", cursor: "pointer" }}
                  title="点击加入 ban 列表"
                  onClick={() => handleBanClick('culture', item.culture)}
                >
                  {item.culture || "Unknown"}
                </span>
              </p>
              <p>
                <strong>Dated:</strong> {item.dated || "Unknown"}
                <span
                  onClick={() => handleBanClick('dated', item.dated)}>
                   
                </span>
              </p>
            </div>
          </article>
        ) : (
          <p style={{ marginTop: 12, color: "#666" }}>
            Click 'Discover' to get a random art piece (photo and properties included)
          </p>
        )}
      </section>
    </main>
  );
}

export default App;
