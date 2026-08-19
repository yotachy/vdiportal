// M9 — 샘플 7종의 국면 분포 실측. 읽기 전용(프로덕션 OHLC 프록시 GET 만).
const FC = require("/home/jschoi0223/projects/vdiportal/map/forge-core.js");
const https = require("https");

const SYMS = ["NVDA","AAPL","MSFT","GOOGL","AMZN","BTC/USD","ETH/USD"];
const TFS  = [["1day",60],["1week",52],["1month",12]];
const BASE = "https://parksvc.mycafe24.com/map/forge-api.php";

// sampleGraph 는 20종만 태운다. 앱이 보여주는 것은 32종이므로 빠진 13종을 같은 배선으로 채운다.
const MISSING = ["pivot","psar","gann","keltner","donchian","cci","williams","aroon","mfi","roc","ao","cmf","pattern"];
function fullGraph() {
  const g = FC.sampleGraph();
  g.nodes.forEach(n => { if (n.conviction) n.conviction = 0; });      // 확신 바이어스 제거 = 순수 엔진 판정
  const price = g.nodes.find(n => n.blockType === "price");
  const comb  = g.nodes.find(n => n.blockType === "combine");
  const vol   = g.nodes.find(n => n.blockType === "volume");
  MISSING.forEach(t => {
    const id = "x_" + t;
    g.nodes.push({ id, blockType: t, x: 0, y: 0, title: t, weight: 50 });
    g.edges.push({ from: price.id, fromSide: "right", to: id, toSide: "left" });
    g.edges.push({ from: id, fromSide: "right", to: comb.id, toSide: "left" });
    // mfi·cmf 는 실거래량 노드를 물어야 한다(안 물리면 합성 거래량으로 떨어진다)
    if ((t === "mfi" || t === "cmf") && vol) g.edges.push({ from: vol.id, fromSide: "right", to: id, toSide: "left" });
  });
  return g;
}
const NON = new Set(["ticker","price","combine","predict"]);

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { "User-Agent": "m9-regime-probe" } }, r => {
      let b = ""; r.on("data", d => b += d); r.on("end", () => { try { res(JSON.parse(b)); } catch (e) { rej(new Error("파싱 실패 " + b.slice(0,120))); } });
    }).on("error", rej);
  });
}

(async () => {
  const G = fullGraph();
  const indCount = G.nodes.filter(n => n.blockType && !NON.has(n.blockType)).length;
  console.log("엔진", FC.version || "?", "· 그래프 지표", indCount + "/" + FC.indicatorCount, "종\n");
  const rows = [];
  for (const sym of SYMS) {
    for (const [tf, futW] of TFS) {
      const url = BASE + "?ohlc=1&symbol=" + encodeURIComponent(sym) + "&tf=" + tf;
      let j; try { j = await get(url); } catch (e) { rows.push({ sym, tf, err: e.message }); continue; }
      if (!j || !j.ok || !j.candles || !j.candles.length) { rows.push({ sym, tf, err: (j && j.error) || "no data" }); continue; }
      const candle = j.candles.map(c => ({ o:+c.o, h:+c.h, l:+c.l, c:+c.c, v:+(c.v||0), t:c.t }));
      const price = candle.map(c => c.c);
      const data = { price, candle };
      let r; try { r = FC.run(G, data, { futW, timeframe: tf }); }
      catch (e) { rows.push({ sym, tf, err: "run: " + e.message }); continue; }
      const v = r.verdict, p = r.prediction, ctx = (v && v.context) || {};
      const up = FC.aggUpProb ? FC.aggUpProb(p) : null;
      rows.push({
        sym, tf, bars: price.length, src: j.source,
        regime: v.regime, score: Math.round(v.score),
        up: up == null ? null : Math.round(up),
        state: ctx.state, rel: ctx.reliability,
        chg: +(((p.target / p.anchor) - 1) * 100).toFixed(2),
        conf: v.confluence ? v.confluence.agree + "/" + v.confluence.total : "-",
        gap: ctx.gapRisk ? "있음" : "해당없음",
        relS: ctx.relSector ? "섹터" : (ctx.relStrength ? "SPY" : "없음"),
      });
      process.stderr.write(".");
    }
  }
  process.stderr.write("\n\n");
  console.log(JSON.stringify(rows, null, 1));
})();
