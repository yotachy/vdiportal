  /* palette constants (matching chart.html closely) */
  const FC_ACC  = "#34e6dc";   /* teal accent (chart.html --acc) */
  const FC_ORA  = "#E6A23C";   /* orange oscillator */
  const FC_BLU  = "#5B8FF9";   /* blue oscillator */
  let   FC_GOLD = "#e8b463";   /* forge gold (candle / price) — 테마 --gold 따라감 */
  const FC_ETH  = "#8a92b2";   /* signal line */
  const FC_BULL = "#46c28e";   /* bull candle */
  const FC_BEAR = "#e06a6a";   /* bear candle */
  const FC_DIM  = "#5A6478";   /* axis labels (중간 슬레이트 — 명/암 배경 모두 판독) */
  let   FC_GRID = "#1b2334";   /* grid lines — chart-bg 밝기 따라 명/암 전환 */
  let   FC_OSC  = "#e8b463";   /* 오실레이터 서브패널 액센트 — UI(패널) 밝기 따라 골드/슬레이트 */
  let   _warmRGB = "232,180,99", _oscRGB = "232,180,99";   /* rgba 헬퍼용 (히어로/서브패널) */
  const _lumOf = v => { const m = (v || "").match(/#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})/); return m ? (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) : 0; };
  function _warmA(a) { return "rgba(" + _warmRGB + "," + a + ")"; }   /* 히어로 warm 액센트(alpha) */
  function _oscA(a)  { return "rgba(" + _oscRGB + "," + a + ")"; }    /* 서브패널 액센트(alpha) */
  /* 차트 캔버스 색을 현재 테마에 동기화. 히어로 액센트(FC_GOLD)=차트배경(--chart-bg) 밝기 기준, 서브패널 액센트(FC_OSC)=UI(--panel) 밝기 기준(다크→골드·라이트→슬레이트). FC_BULL/FC_BEAR(가격 방향)는 상수. */
  const _SLATE = "#3a4656", _SLATE_RGB = "58,70,86", _GOLD = "#e8b463", _GOLD_RGB = "232,180,99";
  function _syncChartColors() {
    try {
      const cs = getComputedStyle(document.documentElement);
      const cbLum = _lumOf((cs.getPropertyValue("--chart-bg").trim()) || "#0b0f14");
      const pnLum = _lumOf((cs.getPropertyValue("--panel").trim()) || "#121822");
      const uiGold = (cs.getPropertyValue("--gold").trim()) || "#e8b463";   // 테마 액센트(다크=골드/청록/퍼플…, 라이트=슬레이트)
      const uiLight = pnLum > 140;
      FC_GRID = cbLum > 140 ? "#dbe1ea" : "#1b2334";   // 밝은 차트=옅은 회색 격자
      // 히어로(차트배경): 밝은차트=슬레이트 · 어두운차트=테마색(라이트테마는 --gold가 슬레이트라 다크차트서 안 보임 → 골드 폴백)
      if (cbLum > 140) { FC_GOLD = _SLATE; _warmRGB = _SLATE_RGB; } else { FC_GOLD = uiLight ? _GOLD : uiGold; _warmRGB = _GOLD_RGB; }
      // 서브패널(UI 표면): 라이트=슬레이트 · 다크=테마색(청록/퍼플 등 유지)
      if (uiLight) { FC_OSC = _SLATE; _oscRGB = _SLATE_RGB; } else { FC_OSC = uiGold; _oscRGB = _GOLD_RGB; }
    } catch (e) {}
  }
  /* 작도 스타일 토큰(정교·절제): stroke 폭 + 세밀 점선 패턴 — 한 곳에서 관리 */
  const CW = { hair: 0.85, thin: 1, base: 1.25, bold: 1.6, halo: 1.2 };
  const CDASH = { fine: [1, 3.5], std: [2, 4], long: [4.5, 4.5] };   // 정밀 점선(가늘고 여백 넉넉 · 라운드캡과 함께 고급감)

  /* ── fcFit: DPR-correct canvas sizing (port of chart.html fit()) ── */
  function fcFit(cv, h, cap) {
    // 시연 중엔 기기 DPR만(매 프레임 재작도 과부하 방지), 정지 시엔 약간 슈퍼샘플(선명)
    const dpr = _playing ? Math.min(devicePixelRatio || 1, 2) : Math.min(Math.max(devicePixelRatio || 1, 2), cap || 3);   // 정지 시 floor 2(작은 라벨 선명)
    const w = cv.clientWidth;
    cv.width  = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  }
  /* fcFit과 동일하나 크기 변동 없으면 백버퍼 재할당 생략(재생 프레임마다 호출용 — 호출부가 clearRect 직접 수행). */
  function fcFitKeep(cv, h, cap) {
    const dpr = _playing ? Math.min(devicePixelRatio || 1, 2) : Math.min(Math.max(devicePixelRatio || 1, 1.5), cap || 2.5);
    const W = Math.round(cv.clientWidth * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  }

  /* ── fcSizeMain: main chart auto-height from clientWidth ── */
  function fcSizeMain(cv) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const cw  = cv.clientWidth || 300;
    const ch  = Math.round(cw * 0.54);
    cv.width  = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c, cw, ch };
  }

  /* ── fcDrawMain: candles + signal strip + prediction cone ── */
  function fcDrawMain(candles, signal, predPath, predLo, predHi, futW, predAnchor) {
    const cv = document.getElementById("fcMain");
    if (!cv) return;
    const { c, cw, ch } = fcSizeMain(cv);
    const n = candles.length;
    if (!n) return;

    /* price range: candles + prediction */
    let pmin = Infinity, pmax = -Infinity;
    candles.forEach(cd => { if (cd.l < pmin) pmin = cd.l; if (cd.h > pmax) pmax = cd.h; });
    if (predHi.length) predHi.forEach(v => { if (v > pmax) pmax = v; });
    if (predLo.length) predLo.forEach(v => { if (v < pmin) pmin = v; });
    const pspan = (pmax - pmin) || 1;
    const padTop = 6, padBot = 4;

    /* layout: upper candle region + lower signal strip */
    const SIG_FRAC = signal.length ? 0.18 : 0;
    const candleBase = ch * (1 - SIG_FRAC);

    const toY  = v => padTop + (pmax - v) / pspan * (candleBase - padTop - padBot);
    const totalBars = n + futW;
    const barW = cw / totalBars;
    const toX  = i => (i + 0.5) * barW;
    const predStartX = n * barW;

    c.clearRect(0, 0, cw, ch);

    /* horizontal grid */
    const gridStep = Math.pow(10, Math.floor(Math.log10(pspan / 4)));
    const gridStart = Math.ceil(pmin / gridStep) * gridStep;
    c.strokeStyle = FC_GRID; c.lineWidth = 1;
    c.fillStyle = FC_DIM; c.font = "10px ui-monospace,monospace";
    for (let v = gridStart; v < pmax; v += gridStep) {
      const y = toY(v);
      if (y < padTop || y > candleBase - padBot) continue;
      c.beginPath(); c.moveTo(0, y); c.lineTo(predStartX, y); c.stroke();
      c.fillText(v.toFixed(0), 2, y - 2);
    }

    /* prediction zone background + seam */
    c.fillStyle = "rgba(52,230,220,.04)";
    c.fillRect(predStartX, 0, cw - predStartX, candleBase);
    c.strokeStyle = "rgba(52,230,220,.5)"; c.lineWidth = 1.5;
    c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(predStartX, 0); c.lineTo(predStartX, candleBase);
    c.stroke(); c.setLineDash([]);
    c.fillStyle = "rgba(52,230,220,.85)"; c.font = "10px ui-monospace,monospace";
    c.fillText("지금", predStartX - 28, candleBase - 7);
    c.fillText("예측 →", predStartX + 6, 13);

    /* prediction cone */
    if (predPath.length) {
      const anchorV = (predAnchor != null) ? predAnchor : candles[n - 1].c;
      const anchorY = toY(anchorV);
      /* filled band lo–hi (seam에서 시작) */
      c.beginPath();
      c.moveTo(predStartX, anchorY);
      for (let k = 0; k < predPath.length; k++) c.lineTo(toX(n + k), toY(predHi[k]));
      for (let k = predPath.length - 1; k >= 0; k--) c.lineTo(toX(n + k), toY(predLo[k]));
      c.lineTo(predStartX, anchorY);
      c.closePath();
      c.fillStyle = _warmA(.09);
      c.fill();
      /* path line (seam에서 시작) */
      c.strokeStyle = FC_GOLD; c.lineWidth = 1.3; c.setLineDash(CDASH.std);
      c.beginPath();
      c.moveTo(predStartX, anchorY);
      for (let k = 0; k < predPath.length; k++) c.lineTo(toX(n + k), toY(predPath[k]));
      c.stroke(); c.setLineDash([]);
      /* seam dot at last real close */
      c.fillStyle = FC_GOLD; c.beginPath();
      c.arc(predStartX, anchorY, 3, 0, Math.PI * 2); c.fill();
    }

    /* candles */
    const bodyMinH = 1;
    const bw = Math.max(1, barW * 0.72);
    candles.forEach((cd, i) => {
      const x = toX(i);
      const isUp = cd.c >= cd.o;
      const col = isUp ? FC_BULL : FC_BEAR;
      /* wick */
      c.strokeStyle = col; c.lineWidth = Math.max(0.7, bw * 0.15);
      c.beginPath(); c.moveTo(x, toY(cd.h)); c.lineTo(x, toY(cd.l)); c.stroke();
      /* body */
      const top = toY(Math.max(cd.o, cd.c)), bot = toY(Math.min(cd.o, cd.c));
      c.fillStyle = col;
      c.fillRect(x - bw / 2, top, bw, Math.max(bodyMinH, bot - top));
    });

    /* signal strip */
    if (signal.length && SIG_FRAC > 0) {
      const sy0 = candleBase;
      const sH   = ch - sy0;
      /* strip bg */
      c.fillStyle = "rgba(11,15,20,.7)";
      c.fillRect(0, sy0, predStartX, sH);
      /* separator */
      c.strokeStyle = "#222b39"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, sy0); c.lineTo(predStartX, sy0); c.stroke();
      /* zero line */
      const midY = sy0 + sH / 2;
      c.strokeStyle = "#2a3346"; c.setLineDash([2, 3]);
      c.beginPath(); c.moveTo(0, midY); c.lineTo(predStartX, midY); c.stroke();
      c.setLineDash([]);
      /* signal curve */
      const amp = sH / 2 - 2;
      c.strokeStyle = FC_ETH; c.lineWidth = 1.3;
      c.beginPath(); let sf = true;
      for (let i = 0; i < Math.min(signal.length, n); i++) {
        const sx = toX(i), sy = midY - (signal[i] / 100) * amp;
        if (sf) { c.moveTo(sx, sy); sf = false; } else c.lineTo(sx, sy);
      }
      c.stroke();
      /* signal label */
      c.fillStyle = FC_ETH; c.font = "10px ui-monospace,monospace";
      c.fillText("시그널", 3, sy0 + 11);
    }
  }

  /* ── fcDrawPdm: PDM spectrum (port of chart.html drawScore()) ── */
  function fcDrawPdm(curve, bestP) {
    const cv = document.getElementById("fcPdm");
    if (!cv) return;
    const ch = 140, c = fcFit(cv, ch);
    const cw = cv.clientWidth || 300;
    c.clearRect(0, 0, cw, ch);

    if (!curve || !curve.length) {
      c.fillStyle = FC_DIM; c.font = "11px ui-monospace,monospace";
      c.fillText("파동 스캔 지표를 추가하세요 (지배 주기 스펙트럼)", 10, 20);
      return;
    }

    const SP   = curve.map(d => d.P);
    const Pmin = SP[0], Pmax = SP[SP.length - 1];
    /* convert theta → commonality % (1-theta)*100, like chart.html */
    const comm = curve.map(d => isNaN(d.theta) ? null : 100 * (1 - d.theta));
    let Ymax = 0;
    comm.forEach(v => { if (v != null && v > Ymax) Ymax = v; });
    Ymax = Math.max(Ymax + 6, 35);
    const Ymin = -5;

    const sX = p => 44 + (p - Pmin) / (Pmax - Pmin) * (cw - 58);
    const sY = v => 14 + (1 - (v - Ymin) / (Ymax - Ymin)) * (ch - 40);

    /* grid + y-axis labels */
    c.strokeStyle = FC_GRID; c.lineWidth = 1;
    c.fillStyle = FC_DIM; c.font = "10px ui-monospace,monospace";
    for (let v = 0; v <= Math.ceil(Ymax / 10) * 10; v += 10) {
      const y = sY(v);
      c.beginPath(); c.moveTo(44, y); c.lineTo(cw - 14, y); c.stroke();
      c.fillText(v + "%", 4, y + 3);
    }
    /* x-axis ticks */
    const pRange = Pmax - Pmin, pStep = Math.ceil(pRange / 5 / 5) * 5 || 10;
    for (let p = Math.ceil(Pmin / pStep) * pStep; p <= Pmax; p += pStep) {
      const x = sX(p);
      c.strokeStyle = "#161d2b"; c.beginPath(); c.moveTo(x, 14); c.lineTo(x, ch - 26); c.stroke();
      c.fillStyle = FC_DIM; c.fillText(p.toFixed(0), x - 8, ch - 12);
    }
    c.fillStyle = FC_DIM; c.fillText("주기 →", cw - 46, ch - 2);

    /* zero baseline */
    const y0 = sY(0);
    c.strokeStyle = "#2a3346"; c.setLineDash([2, 3]);
    c.beginPath(); c.moveTo(44, y0); c.lineTo(cw - 14, y0); c.stroke();
    c.setLineDash([]);

    /* commonality curve (가늘고 정밀하게) */
    c.strokeStyle = FC_ACC; c.lineWidth = 1.4; c.lineJoin = "round";
    c.beginPath(); let st = false;
    for (let i = 0; i < SP.length; i++) {
      const v = comm[i];
      if (v == null) { st = false; continue; }
      const x = sX(SP[i]), y = sY(v);
      if (!st) { c.moveTo(x, y); st = true; } else c.lineTo(x, y);
    }
    c.stroke();

    /* best P* dot + vertical line */
    const bestIdx = curve.reduce((bi, d, i) =>
      Math.abs(d.P - bestP) < Math.abs(curve[bi].P - bestP) ? i : bi, 0);
    const bestComm = comm[bestIdx];
    if (bestComm != null) {
      const xo = sX(bestP), yo = sY(bestComm);
      c.fillStyle = FC_ACC; c.shadowColor = FC_ACC; c.shadowBlur = 10;
      c.beginPath(); c.arc(xo, yo, 4.5, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
    }
    /* current-P vertical marker (white, like chart.html) */
    const xc = sX(bestP);
    c.strokeStyle = "#fff"; c.lineWidth = 1.5; c.shadowColor = "#fff"; c.shadowBlur = 8;
    c.beginPath(); c.moveTo(xc, 12); c.lineTo(xc, ch - 26); c.stroke(); c.shadowBlur = 0;
    c.fillStyle = "#fff"; c.font = "10px ui-monospace,monospace";
    c.fillText(bestP.toFixed(0) + "봉 주기", Math.min(xc + 4, cw - 58), 22);
  }

  /* ── fcDrawRsi: RSI oscillator sub-panel (0–100) ── */
  // 오실레이터 '계산되는 중' 효과 — 그려진 그림의 우측(미공개)을 지우고 진행 선단에 글로우. reveal 0→1
  function _osReveal(c, cw, ch, reveal) {
    if (reveal == null || reveal >= 1) return;
    const rx = cw * Math.max(0, Math.min(1, reveal));
    c.clearRect(rx, 0, cw - rx + 3, ch + 3);
    c.save(); c.fillStyle = FC_ACC; c.shadowColor = FC_ACC; c.shadowBlur = 9; c.fillRect(rx - 1.4, 2, 2.4, ch - 4); c.restore();
  }
  function fcDrawRsi(rsi, reveal) {
    const cv = document.getElementById("fcRsi"); if (!cv) return;
    const ch = cv.clientHeight || 120, c = fcFit(cv, ch), cw = cv.clientWidth || 400;
    c.clearRect(0, 0, cw, ch);
    const s = (rsi && rsi.series) || [];
    if (s.length < 2) { c.fillStyle = FC_DIM; c.font = "11px ui-monospace,monospace"; c.textAlign = "center"; c.fillText("RSI 데이터 없음", cw / 2, ch / 2); c.textAlign = "left"; return; }
    const padL = 6, padR = 28, padV = 8, plotW = cw - padL - padR, plotH = ch - 2 * padV;
    const yOf = v => padV + (1 - v / 100) * plotH, xOf = i => padL + (i / (s.length - 1)) * plotW;
    c.fillStyle = "rgba(224,106,106,.06)"; c.fillRect(padL, yOf(100), plotW, yOf(70) - yOf(100));
    c.fillStyle = "rgba(70,194,142,.06)"; c.fillRect(padL, yOf(30), plotW, yOf(0) - yOf(30));
    c.strokeStyle = "#2b3647"; c.lineWidth = 1; c.setLineDash([3, 3]);
    [30, 50, 70].forEach(lv => { const y = yOf(lv); c.beginPath(); c.moveTo(padL, y); c.lineTo(padL + plotW, y); c.stroke(); c.fillStyle = "#8a92b2"; c.font = "10px ui-monospace,monospace"; c.fillText(lv, padL + plotW + 3, y + 3); });
    c.setLineDash([]);
    // 라인 아래 그라디언트 채움(가독성 · 이미지3 차용)
    const rgrad = c.createLinearGradient(0, padV, 0, padV + plotH);
    rgrad.addColorStop(0, _oscA(.30)); rgrad.addColorStop(.6, _oscA(.08)); rgrad.addColorStop(1, _oscA(0));
    c.fillStyle = rgrad; c.beginPath();
    s.forEach((v, i) => { const x = xOf(i), y = yOf(v); i ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.lineTo(xOf(s.length - 1), padV + plotH); c.lineTo(xOf(0), padV + plotH); c.closePath(); c.fill();
    c.strokeStyle = FC_OSC; c.lineWidth = 1.05; c.lineJoin = "round"; c.lineCap = "round"; c.shadowColor = _oscA(.4); c.shadowBlur = 3.5; c.beginPath();
    s.forEach((v, i) => { const x = xOf(i), y = yOf(v); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); c.shadowBlur = 0;
    const lx = xOf(s.length - 1), ly = yOf(rsi.last);
    c.fillStyle = FC_OSC; c.beginPath(); c.arc(lx, ly, 2.4, 0, 7); c.fill();
    if (rsi.divergence && rsi.divergence.pricePts) {
      const col = rsi.divergence.type === "bullish" ? "#46c28e" : "#e06a6a";
      rsi.divergence.pricePts.forEach(p => { const i = p.idx; if (i < 0 || i >= s.length) return; const x = xOf(i), y = yOf(s[i]); c.fillStyle = col; c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); });
    }
    { const meta = document.getElementById("fcRsiMeta"); if (meta) { const z = rsi.zone === "overbought" ? ["과열 · 되돌림 주의", "dn"] : rsi.zone === "oversold" ? ["과매도 · 반등 기대", "up"] : ["중립대", "fl"]; meta.innerHTML = "RSI " + Math.round(rsi.last) + " <span class='fc-verdit " + z[1] + "'>" + z[0] + "</span>" + '<span class="os-gauge">' + _hbarRsi(rsi.last, 30, 70) + '</span>'; } } _osReveal(c, cw, ch, reveal);
  }

  /* ── fcDrawMfi: MFI 서브패널 (0–100, 20/80 밴드) — RSI와 동형(자금흐름) ── */
  function fcDrawMfi(mfi, reveal) {
    const cv = document.getElementById("fcMfi"); if (!cv) return;
    const ch = cv.clientHeight || 120, c = fcFit(cv, ch), cw = cv.clientWidth || 400;
    c.clearRect(0, 0, cw, ch);
    const s = (mfi && mfi.series) || [];
    if (s.length < 2) { c.fillStyle = FC_DIM; c.font = "11px ui-monospace,monospace"; c.textAlign = "center"; c.fillText("MFI 데이터 없음", cw / 2, ch / 2); c.textAlign = "left"; return; }
    const padL = 6, padR = 28, padV = 8, plotW = cw - padL - padR, plotH = ch - 2 * padV;
    const yOf = v => padV + (1 - v / 100) * plotH, xOf = i => padL + (i / (s.length - 1)) * plotW;
    c.fillStyle = "rgba(224,106,106,.06)"; c.fillRect(padL, yOf(100), plotW, yOf(80) - yOf(100));
    c.fillStyle = "rgba(70,194,142,.06)"; c.fillRect(padL, yOf(20), plotW, yOf(0) - yOf(20));
    c.strokeStyle = "#2b3647"; c.lineWidth = 1; c.setLineDash([3, 3]);
    [20, 50, 80].forEach(lv => { const y = yOf(lv); c.beginPath(); c.moveTo(padL, y); c.lineTo(padL + plotW, y); c.stroke(); c.fillStyle = "#8a92b2"; c.font = "10px ui-monospace,monospace"; c.fillText(lv, padL + plotW + 3, y + 3); });
    c.setLineDash([]);
    const grd = c.createLinearGradient(0, padV, 0, padV + plotH);
    grd.addColorStop(0, "rgba(200,145,47,.30)"); grd.addColorStop(.6, "rgba(200,145,47,.08)"); grd.addColorStop(1, "rgba(200,145,47,0)");
    c.fillStyle = grd; c.beginPath();
    s.forEach((v, i) => { const x = xOf(i), y = yOf(v); i ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.lineTo(xOf(s.length - 1), padV + plotH); c.lineTo(xOf(0), padV + plotH); c.closePath(); c.fill();
    c.strokeStyle = "#c8912f"; c.lineWidth = 1.05; c.lineJoin = "round"; c.lineCap = "round"; c.shadowColor = "rgba(200,145,47,.4)"; c.shadowBlur = 3.5; c.beginPath();
    s.forEach((v, i) => { const x = xOf(i), y = yOf(v); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); c.shadowBlur = 0;
    c.fillStyle = FC_OSC; c.beginPath(); c.arc(xOf(s.length - 1), yOf(mfi.last), 2.4, 0, 7); c.fill();
    { const meta = document.getElementById("fcMfiMeta"); if (meta) { const z = mfi.last >= 80 ? ["과열 · 되돌림 주의", "dn"] : mfi.last <= 20 ? ["과매도 · 반등 기대", "up"] : mfi.last >= 50 ? ["자금 유입", "up"] : ["자금 이탈", "dn"]; meta.innerHTML = "MFI " + Math.round(mfi.last) + " <span class='fc-verdit " + z[1] + "'>" + z[0] + "</span>" + '<span class="os-gauge">' + _hbarRsi(mfi.last, 20, 80) + '</span>'; } } _osReveal(c, cw, ch, reveal);
  }

  /* ── fcDrawWilliams: Williams %R 서브패널 (−100..0, −20/−80 밴드) ── */
  function fcDrawWilliams(w, reveal) {
    const cv = document.getElementById("fcWilliams"); if (!cv) return;
    const ch = cv.clientHeight || 120, c = fcFit(cv, ch), cw = cv.clientWidth || 400;
    c.clearRect(0, 0, cw, ch);
    const s = (w && w.series) || [];
    if (s.length < 2) { c.fillStyle = FC_DIM; c.font = "11px ui-monospace,monospace"; c.textAlign = "center"; c.fillText("Williams %R 데이터 없음", cw / 2, ch / 2); c.textAlign = "left"; return; }
    const padL = 6, padR = 30, padV = 8, plotW = cw - padL - padR, plotH = ch - 2 * padV;
    const yOf = v => padV + (-v / 100) * plotH, xOf = i => padL + (i / (s.length - 1)) * plotW;   // v: 0(위)~−100(아래)
    c.fillStyle = "rgba(224,106,106,.06)"; c.fillRect(padL, yOf(0), plotW, yOf(-20) - yOf(0));      // 과매수(상단)
    c.fillStyle = "rgba(70,194,142,.06)"; c.fillRect(padL, yOf(-80), plotW, yOf(-100) - yOf(-80));   // 과매도(하단)
    c.strokeStyle = "#2b3647"; c.lineWidth = 1; c.setLineDash([3, 3]);
    [-20, -50, -80].forEach(lv => { const y = yOf(lv); c.beginPath(); c.moveTo(padL, y); c.lineTo(padL + plotW, y); c.stroke(); c.fillStyle = "#8a92b2"; c.font = "10px ui-monospace,monospace"; c.fillText(lv, padL + plotW + 3, y + 3); });
    c.setLineDash([]);
    const grd = c.createLinearGradient(0, padV, 0, padV + plotH);
    grd.addColorStop(0, "rgba(181,111,214,.28)"); grd.addColorStop(.7, "rgba(181,111,214,.06)"); grd.addColorStop(1, "rgba(181,111,214,0)");
    c.fillStyle = grd; c.beginPath();
    s.forEach((v, i) => { const x = xOf(i), y = yOf(v); i ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.lineTo(xOf(s.length - 1), padV + plotH); c.lineTo(xOf(0), padV + plotH); c.closePath(); c.fill();
    c.strokeStyle = "#b56fd6"; c.lineWidth = 1.05; c.lineJoin = "round"; c.lineCap = "round"; c.shadowColor = "rgba(181,111,214,.4)"; c.shadowBlur = 3.5; c.beginPath();
    s.forEach((v, i) => { const x = xOf(i), y = yOf(v); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); c.shadowBlur = 0;
    c.fillStyle = FC_OSC; c.beginPath(); c.arc(xOf(s.length - 1), yOf(w.last), 2.4, 0, 7); c.fill();
    { const meta = document.getElementById("fcWilliamsMeta"); if (meta) { const z = w.last >= -20 ? ["과매수 · 되돌림 주의", "dn"] : w.last <= -80 ? ["과매도 · 반등 기대", "up"] : ["중립대", "fl"]; meta.innerHTML = "%R " + Math.round(w.last) + " <span class='fc-verdit " + z[1] + "'>" + z[0] + "</span>" + '<span class="os-gauge">' + _hbarRsi(w.last + 100, 20, 80) + '</span>'; } } _osReveal(c, cw, ch, reveal);
  }

  /* ── fcDrawCci: CCI 서브패널 (0 중심 대칭, ±100 밴드) ── */
  function fcDrawCci(cci, reveal) {
    const cv = document.getElementById("fcCci"); if (!cv) return;
    const ch = cv.clientHeight || 120, c = fcFit(cv, ch), cw = cv.clientWidth || 400;
    c.clearRect(0, 0, cw, ch);
    const s = (cci && cci.series) || [];
    if (s.length < 2) { c.fillStyle = FC_DIM; c.font = "11px ui-monospace,monospace"; c.textAlign = "center"; c.fillText("CCI 데이터 없음", cw / 2, ch / 2); c.textAlign = "left"; return; }
    const padL = 6, padR = 32, padV = 8, plotW = cw - padL - padR, plotH = ch - 2 * padV;
    let mx = 120; for (let i = 0; i < s.length; i++) mx = Math.max(mx, Math.abs(s[i])); mx *= 1.1;
    const yOf = v => padV + (1 - (v + mx) / (2 * mx)) * plotH, xOf = i => padL + (i / (s.length - 1)) * plotW;
    c.fillStyle = "rgba(224,106,106,.06)"; c.fillRect(padL, yOf(mx), plotW, yOf(100) - yOf(mx));       // 과열대(+100~상단)
    c.fillStyle = "rgba(70,194,142,.06)"; c.fillRect(padL, yOf(-100), plotW, yOf(-mx) - yOf(-100));    // 과매도대(−100~하단)
    c.strokeStyle = "#2b3647"; c.lineWidth = 1; c.setLineDash([3, 3]);
    [100, 0, -100].forEach(lv => { const y = yOf(lv); c.beginPath(); c.moveTo(padL, y); c.lineTo(padL + plotW, y); c.stroke(); c.fillStyle = "#8a92b2"; c.font = "10px ui-monospace,monospace"; c.fillText(lv, padL + plotW + 3, y + 3); });
    c.setLineDash([]);
    c.strokeStyle = "#e6785a"; c.lineWidth = 1.15; c.lineJoin = "round"; c.lineCap = "round"; c.shadowColor = "rgba(230,120,90,.4)"; c.shadowBlur = 3.5; c.beginPath();
    s.forEach((v, i) => { const x = xOf(i), y = yOf(v); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); c.shadowBlur = 0;
    c.fillStyle = FC_OSC; c.beginPath(); c.arc(xOf(s.length - 1), yOf(cci.last), 2.4, 0, 7); c.fill();
    { const meta = document.getElementById("fcCciMeta"); if (meta) { const z = cci.last >= 100 ? ["과열 · 되돌림 주의", "dn"] : cci.last <= -100 ? ["과매도 · 반등 기대", "up"] : ["중립대", "fl"]; meta.innerHTML = "CCI " + Math.round(cci.last) + " <span class='fc-verdit " + z[1] + "'>" + z[0] + "</span>" + '<span class="os-gauge">' + _hbarRsi((Math.max(-200, Math.min(200, cci.last)) + 200) / 4, 25, 75) + '</span>'; } } _osReveal(c, cw, ch, reveal);
  }

  /* ── fcDrawMacd: MACD 서브패널 (히스토그램 + MACD/시그널 라인 + 0선) ── */
  function fcDrawMacd(m, reveal) {
    const cv = document.getElementById("fcMacd"); if (!cv) return;
    const ch = cv.clientHeight || 120, c = fcFit(cv, ch), cw = cv.clientWidth || 400;
    c.clearRect(0, 0, cw, ch);
    const macd = (m && m.macd) || [], sig = (m && m.sig) || [], hist = (m && m.hist) || [];
    if (macd.length < 2) { c.fillStyle = FC_DIM; c.font = "11px ui-monospace,monospace"; c.textAlign = "center"; c.fillText("MACD 데이터 없음", cw / 2, ch / 2); c.textAlign = "left"; return; }
    const padL = 6, padR = 30, padV = 10, plotW = cw - padL - padR, plotH = ch - 2 * padV;
    let mx = 1e-9; for (let i = 0; i < macd.length; i++) mx = Math.max(mx, Math.abs(macd[i]), Math.abs(sig[i]), Math.abs(hist[i])); mx *= 1.1;
    const yOf = v => padV + (1 - (v + mx) / (2 * mx)) * plotH, xOf = i => padL + (i / (macd.length - 1)) * plotW;
    c.strokeStyle = "#2b3647"; c.lineWidth = 1; c.beginPath(); c.moveTo(padL, yOf(0)); c.lineTo(padL + plotW, yOf(0)); c.stroke();
    const bw = Math.max(1, plotW / macd.length * 0.7);
    for (let i = 0; i < hist.length; i++) { const x = xOf(i), y0 = yOf(0), y = yOf(hist[i]); c.fillStyle = hist[i] >= 0 ? "rgba(70,194,142,.55)" : "rgba(224,106,106,.55)"; c.fillRect(x - bw / 2, Math.min(y0, y), bw, Math.abs(y - y0) || 1); }
    const drawLine = (arr, col, wid) => { c.strokeStyle = col; c.lineWidth = wid; c.lineJoin = "round"; c.beginPath(); arr.forEach((v, i) => { const x = xOf(i), y = yOf(v); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); };
    drawLine(macd, "#e0a86a", 1.7); drawLine(sig, "#8fb4f0", 1.4);
    { const meta = document.getElementById("fcMacdMeta"); if (meta) { const g = m.bias > 0.1 ? [((m.cross && m.cross.type === "golden") ? "골든크로스 · " : "") + "상승 모멘텀", "up"] : m.bias < -0.1 ? [((m.cross && m.cross.type === "dead") ? "데드크로스 · " : "") + "하락 모멘텀", "dn"] : ["모멘텀 중립", "fl"]; meta.innerHTML = "Hist " + (m.last.hist >= 0 ? "+" : "") + m.last.hist.toFixed(1) + " <span class='fc-verdit " + g[1] + "'>" + g[0] + "</span>"; } } _osReveal(c, cw, ch, reveal);
  }
  /* ── fcDrawAdx: ADX/DMI 서브패널 (ADX + +DI/-DI + 20/40 임계선) ── */
  function fcDrawAdx(a, reveal) {
    const cv = document.getElementById("fcAdx"); if (!cv) return;
    const ch = cv.clientHeight || 120, c = fcFit(cv, ch), cw = cv.clientWidth || 400;
    c.clearRect(0, 0, cw, ch);
    const adx = (a && a.adx) || [], pDI = (a && a.plusDI) || [], mDI = (a && a.minusDI) || [];
    if (adx.length < 2) { c.fillStyle = FC_DIM; c.font = "11px ui-monospace,monospace"; c.textAlign = "center"; c.fillText("ADX 데이터 없음", cw / 2, ch / 2); c.textAlign = "left"; return; }
    const padL = 6, padR = 30, padV = 8, plotW = cw - padL - padR, plotH = ch - 2 * padV;
    const yOf = v => padV + (1 - Math.max(0, Math.min(100, v)) / 100) * plotH, xOf = i => padL + (i / (adx.length - 1)) * plotW;
    c.strokeStyle = "#2b3647"; c.lineWidth = 1; c.setLineDash([3, 3]);
    [20, 40].forEach(lv => { const y = yOf(lv); c.beginPath(); c.moveTo(padL, y); c.lineTo(padL + plotW, y); c.stroke(); c.fillStyle = "#8a92b2"; c.font = "10px ui-monospace,monospace"; c.fillText(lv, padL + plotW + 3, y + 3); });
    c.setLineDash([]);
    const drawLine = (arr, col, wid) => { c.strokeStyle = col; c.lineWidth = wid; c.lineJoin = "round"; c.beginPath(); arr.forEach((v, i) => { const x = xOf(i), y = yOf(v); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); };
    drawLine(pDI, "#46c28e", 1.1); drawLine(mDI, "#e06a6a", 1.1); drawLine(adx, FC_OSC, 1.7);
    // 끝점 라벨 + '읽는 법' 캡션(초보 인지성)
    { const _le = adx.length - 1; c.font = "9px Pretendard,'Malgun Gothic',sans-serif"; c.textAlign = "left";
      c.fillStyle = "#46c28e"; c.fillText("+DI", padL + plotW + 3, yOf(pDI[_le]) + 3);
      c.fillStyle = "#e06a6a"; c.fillText("−DI", padL + plotW + 3, yOf(mDI[_le]) + 3); }
    { const meta = document.getElementById("fcAdxMeta"); if (meta) { const strong = a.last.adx >= 40 ? "매우 강한 추세" : a.last.adx >= 25 ? "추세 형성" : "추세 약함(횡보)"; const weak = a.last.adx < 25; const ac = weak ? "fl" : a.dir > 0 ? "up" : a.dir < 0 ? "dn" : "fl"; const dir = a.dir > 0 ? " · 상승 우위" : a.dir < 0 ? " · 하락 우위" : ""; meta.innerHTML = "ADX " + a.last.adx.toFixed(0) + " <span class='fc-verdit " + ac + "'>" + strong + (weak ? "" : dir) + "</span>"; } } _osReveal(c, cw, ch, reveal);
  }

  /* ── fcDrawVol: 거래량 막대 서브패널 (상승하락색·급증골드·OBV라인) ── */
  function fcDrawVol(va, reveal) {
    const cv = document.getElementById("fcVol"); if (!cv) return;
    const cw = cv.clientWidth || 300, ch = cv.clientHeight || 120;
    const c = fcFit(cv, ch); c.clearRect(0, 0, cw, ch);
    const s = (va && va.series) || [];
    if (s.length < 2) { c.fillStyle = "#8a92b2"; c.font = "12px Pretendard,'Malgun Gothic',sans-serif"; c.fillText("거래량 데이터 없음", 10, ch / 2); return; }
    const pad = 6, w = cw - pad * 2, h = ch - pad * 2 - 14;
    const n = s.length, obv = va.obv || [];
    // 막대 다운샘플: 너무 많으면(성능·가독성) ~76개 버킷 평균으로 축약 → 눈에 유의미한 정도만
    const MAXB = 76, step = Math.max(1, Math.ceil(n / MAXB)), nb = Math.ceil(n / step);
    const bvals = [], bup = []; let bmax = 1;
    for (let b = 0; b < nb; b++) {
      const i0 = b * step, i1 = Math.min(n, i0 + step);
      let sv = 0; for (let i = i0; i < i1; i++) sv += s[i];
      const avg = sv / Math.max(1, i1 - i0); bvals.push(avg); if (avg > bmax) bmax = avg;
      const li = i1 - 1; bup.push(li > 0 && obv[li] >= obv[Math.max(0, i0 - 1)]);
    }
    const bw = Math.max(1.5, w / nb - 1.6);
    for (let b = 0; b < nb; b++) {
      const bh = (bvals[b] / bmax) * h, x = pad + (b / nb) * w, y = pad + h - bh;
      const spike = va.state === "spike" && b >= nb - 2;
      c.fillStyle = spike ? _oscA(.42) : bup[b] ? "rgba(70,194,142,.13)" : "rgba(224,106,106,.13)";   // 막대는 아주 흐리게(배경 보조)
      c.fillRect(x, y, bw, bh);
    }
    // OBV 라인(보조 스케일)
    if (obv.length === n) {
      let omin = Math.min.apply(null, obv), omax = Math.max.apply(null, obv); const orng = (omax - omin) || 1;
      const _oc = va.obvTrend > 0.05 ? "#46c28e" : va.obvTrend < -0.05 ? "#e06a6a" : "#c7cede";   // OBV 추이선 = 주인공(가늘고 정밀하게)
      c.save(); c.strokeStyle = _oc; c.lineWidth = 1.2; c.lineJoin = "round"; c.lineCap = "round"; c.shadowColor = _oc; c.shadowBlur = 4.5; c.beginPath();
      for (let i = 0; i < n; i++) { const x = pad + (i / n) * w, y = pad + h - ((obv[i] - omin) / orng) * h; i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke(); c.restore();
    }
    // 상태 라벨
    { const meta = document.getElementById("fcVolMeta"); if (meta) { const st = va.state === "spike" ? "급증" : va.state === "contract" ? "위축" : "평이"; const oc = va.obvTrend > 0.1 ? ["OBV 상승 확인", "up"] : va.obvTrend < -0.1 ? ["OBV 하락", "dn"] : ["OBV 횡보", "fl"]; meta.innerHTML = st + " " + va.ratio.toFixed(2) + "x <span class='fc-verdit " + oc[1] + "'>" + oc[0] + "</span>"; } } _osReveal(c, cw, ch, reveal);
  }

  /* ── fcDrawFold: phase-fold trace (port of chart.html drawFold()) ── */
  /* seriesArr: number[], color: hex, P: period, PHI: phase offset, ACC: accent */
  function fcDrawFold(cv, seriesArr, label, color, P, PHI) {
    if (!cv) return;
    const ch = 100, c = fcFit(cv, ch);
    const cw = cv.clientWidth || 180;
    c.clearRect(0, 0, cw, ch);

    if (!seriesArr || !seriesArr.length || !P) {
      c.fillStyle = FC_DIM; c.font = "10px ui-monospace,monospace";
      c.fillText("데이터 없음", 8, 18);
      return;
    }

    const n = seriesArr.length;
    const padT = 22, padB = 10, padL = 6, padR = 6;
    const gh = ch - padT - padB, gw = cw - padL - padR;

    /* range */
    let mn = Infinity, mx = -Infinity;
    seriesArr.forEach(v => { if (v < mn) mn = v; if (v > mx) mx = v; });
    const span = (mx - mn) || 1;
    /* high value at canvas top (standard finance) */
    const yOf = v => padT + (mx - v) / span * gh;
    const xOf = ph => padL + ph * gw;

    /* frame */
    c.strokeStyle = FC_GRID; c.lineWidth = 1;
    c.strokeRect(padL, padT, gw, gh);
    /* quarter phase grid */
    c.strokeStyle = "#161d2b";
    for (let q = 1; q < 4; q++) {
      const x = padL + gw * q / 4;
      c.beginPath(); c.moveTo(x, padT); c.lineTo(x, padT + gh); c.stroke();
    }

    /* overlay each cycle: later cycles are brighter (port of chart.html) */
    const nseg = Math.ceil(n / P);
    for (let s = 0; s < nseg; s++) {
      const alpha = 0.30 + 0.5 * (s / Math.max(1, nseg - 1));
      const hex = Math.round(alpha * 120 + 40).toString(16).padStart(2, "0");
      c.strokeStyle = color + hex;
      c.lineWidth = 1.3;
      c.beginPath(); let started = false;
      const startI = Math.ceil(PHI + s * P), endI = Math.min(n - 1, Math.floor(PHI + (s + 1) * P));
      for (let i = Math.max(0, startI); i <= endI; i++) {
        const ph = (i - (PHI + s * P)) / P;
        const x = xOf(ph), y = yOf(seriesArr[i]);
        if (!started) { c.moveTo(x, y); started = true; } else c.lineTo(x, y);
      }
      c.stroke();
    }

    /* binned mean ± sd envelope (live, port of chart.html drawFold) */
    const NB = 64;
    const sum = new Float64Array(NB), cnt = new Int32Array(NB), sq = new Float64Array(NB);
    for (let i = 0; i < n; i++) {
      let ph = ((((i - PHI) % P) + P) % P) / P;
      let b = Math.floor(ph * NB); if (b >= NB) b = NB - 1;
      sum[b] += seriesArr[i]; cnt[b]++; sq[b] += seriesArr[i] * seriesArr[i];
    }
    /* band fill */
    const topPts = [], botPts = [];
    for (let b = 0; b < NB; b++) {
      if (cnt[b] > 0) {
        const m = sum[b] / cnt[b];
        const sd = Math.sqrt(Math.max(0, sq[b] / cnt[b] - m * m));
        topPts.push([(b + .5) / NB, m - sd]);
        botPts.push([(b + .5) / NB, m + sd]);
      }
    }
    if (topPts.length > 1) {
      c.beginPath();
      c.moveTo(xOf(topPts[0][0]), yOf(topPts[0][1]));
      for (const p of topPts) c.lineTo(xOf(p[0]), yOf(p[1]));
      for (let i = botPts.length - 1; i >= 0; i--) c.lineTo(xOf(botPts[i][0]), yOf(botPts[i][1]));
      c.closePath(); c.fillStyle = FC_ACC + "14"; c.fill();
    }
    /* mean line */
    c.strokeStyle = FC_ACC; c.lineWidth = 2;
    c.beginPath(); let drawn = false;
    for (let b = 0; b < NB; b++) {
      if (cnt[b] > 0) {
        const m = sum[b] / cnt[b];
        const x = xOf((b + .5) / NB), y = yOf(m);
        if (!drawn) { c.moveTo(x, y); drawn = true; } else c.lineTo(x, y);
      }
    }
    c.stroke();

    /* axis labels */
    c.fillStyle = color; c.font = "10px ui-monospace,monospace";
    c.fillText(label, padL + 1, padT - 8);
    c.fillStyle = FC_DIM;
    c.fillText("φ=0", padL, ch - 1);
    c.fillText("1", cw - padR - 5, ch - 1);
  }

  /* 이미지 가격 보정(드래그식): cal = {ay,by(기준선 y비율 0..1), nx(현재선 x비율), ap,bp(기준선 가격), np(현재가)} */
  const fmtNum = v => Math.round(v).toLocaleString();
  // 통화 기호 — 국내주식(6자리 코드·.kr)이면 ₩, 그 외 $
  function _curSym() { const t = boardState.nodes.find(n => n.blockType === "ticker" && n.params && n.params.symbol); return /^\d{6}(\.kr)?$/i.test(String(t ? t.params.symbol : "")) ? "₩" : "$"; }
  function ensureCal(n) {
    const c = n.cal || (n.cal = {});
    if (c.ay == null) c.ay = 0.22; if (c.by == null) c.by = 0.78; if (c.nx == null) c.nx = 0.82;
    if (!("ap" in c)) c.ap = null; if (!("bp" in c)) c.bp = null; if (!("np" in c)) c.np = null;
    return c;
  }
  function calComplete(c) {
    return c && isFinite(c.ap) && isFinite(c.bp) && c.ap !== c.bp && isFinite(c.np)
      && c.ay != null && c.by != null && c.nx != null;
  }
  /* 히어로용: 완성된 보정만 반환 */
  function priceCal() {
    const p = boardState.nodes.find(n => n.blockType === "price");
    return calComplete(p && p.cal) ? p.cal : null;
  }
  /* 표시 이미지 사각형(object-fit:contain letterbox). 이미지 로드 전엔 전체 박스로 폴백(가이드 즉시 표시). */
  function coneGeo(cv, imgEl) {
    const box = cv && cv.parentElement; if (!box) return null;
    const W = box.clientWidth, H = box.clientHeight; if (!W || !H) return null;
    const nw = (imgEl && imgEl.naturalWidth) || 0, nh = (imgEl && imgEl.naturalHeight) || 0;
    if (!nw || !nh) return { W, H, dw: W, dh: H, ox: 0, oy: 0, est: true };   // 임시(이미지 미로드)
    const sc = Math.min(W / nw, H / nh), dw = nw * sc, dh = nh * sc;
    return { W, H, dw, dh, ox: (W - dw) / 2, oy: (H - dh) / 2 };
  }
  /* cv 크기를 부모 박스에 맞춤(dpr) — 항상 호출. img 미로드면 false */
  function sizeOverlay(cv) {
    const box = cv && cv.parentElement; const W = box ? box.clientWidth : 0, H = box ? box.clientHeight : 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (W && H) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + "px"; cv.style.height = H + "px"; }
    const c = cv.getContext("2d"); if (c) { c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H); }
    return { c, W, H };
  }
  /* 보정 콘 렌더. interactive=true면 기준선/현재선 + 그립(편집기 미리보기). 미완성이면 가이드만. */
  function drawCalCone(cv, imgEl, pred, cal, interactive) {
    if (!cv) return false;
    const { c, W, H } = sizeOverlay(cv);
    if (!c) return false;
    const g = coneGeo(cv, imgEl);
    if (!g) return false;   // 박스 0크기 → 재시도
    cv._cg = g;
    const { dw, dh, ox, oy } = g;
    const aY = oy + cal.ay * dh, bY = oy + cal.by * dh, nowX = ox + cal.nx * dw;
    const complete = calComplete(cal);
    const yOf = p => aY + (p - cal.ap) * (bY - aY) / (cal.bp - cal.ap);
    c.font = "10px ui-monospace,monospace"; c.lineWidth = 1;
    if (interactive) {
      /* A·B 기준선(파랑) */
      [[aY, "A", cal.ap], [bY, "B", cal.bp]].forEach(([y, nm, pr]) => {
        c.strokeStyle = "rgba(124,200,255,.55)"; c.setLineDash([4, 3]);
        c.beginPath(); c.moveTo(ox, y); c.lineTo(ox + dw, y); c.stroke(); c.setLineDash([]);
        c.fillStyle = "rgba(150,205,245,.95)"; c.textAlign = "left";
        c.fillText(nm + "선 " + (isFinite(pr) ? fmtNum(pr) : "가격?"), ox + 5, y - 4);
        c.fillStyle = "#7cc8ff"; c.beginPath(); c.arc(ox + dw - 9, y, 4.5, 0, 7); c.fill();
      });
      /* 현재선(세로, 골드) */
      c.strokeStyle = _warmA(.6); c.setLineDash([4, 3]);
      c.beginPath(); c.moveTo(nowX, oy); c.lineTo(nowX, oy + dh); c.stroke(); c.setLineDash([]);
      c.fillStyle = _warmA(.95); c.textAlign = "left"; c.fillText("현재선", nowX + 3, oy + 11);
      c.fillStyle = FC_GOLD; c.beginPath(); c.arc(nowX, oy + 20, 4.5, 0, 7); c.fill();
    }
    if (!complete) { return interactive; }   // 미완성: 편집기는 가이드만, 히어로는 false(안내)
    /* 예측 콘(현재선에서 시작, 이미지 가격축으로) */
    const path = (pred && pred.path) || [], lo = (pred && pred.lo) || [], hi = (pred && pred.hi) || [];
    const a = (pred && pred.anchor != null) ? pred.anchor : (path[0] || 0);
    const up = v => cal.np * (1 + (a ? (v - a) / a : 0));
    const x0 = nowX, x1 = ox + dw * 0.99;
    const xOf = k => x0 + (path.length > 1 ? k / (path.length - 1) : 0) * (x1 - x0);
    const ynow = yOf(cal.np);
    c.strokeStyle = _warmA(.55); c.setLineDash([4, 3]); c.lineWidth = 1;
    c.beginPath(); c.moveTo(ox, ynow); c.lineTo(x1, ynow); c.stroke(); c.setLineDash([]);
    if (path.length) {
      c.beginPath(); c.moveTo(x0, ynow);
      for (let k = 0; k < path.length; k++) c.lineTo(xOf(k), yOf(up(hi[k])));
      for (let k = path.length - 1; k >= 0; k--) c.lineTo(xOf(k), yOf(up(lo[k])));
      c.closePath(); c.fillStyle = _warmA(.10); c.fill();
      c.strokeStyle = FC_GOLD; c.lineWidth = 1.8; c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(x0, ynow);
      for (let k = 0; k < path.length; k++) c.lineTo(xOf(k), yOf(up(path[k])));
      c.stroke(); c.setLineDash([]);
      const endP = up(path[path.length - 1]);
      c.fillStyle = FC_ETH; c.textAlign = "right";
      c.fillText(fmtNum(endP), x1 - 2, Math.max(10, Math.min(H - 3, yOf(endP) - 5))); c.textAlign = "left";
    }
    c.fillStyle = FC_GOLD; c.beginPath(); c.arc(x0, ynow, 3.5, 0, 7); c.fill();
    c.fillStyle = _warmA(.95); c.textAlign = "left";
    c.fillText("현재가 " + fmtNum(cal.np), x0 + 7, ynow - 6);
    return true;
  }
  /* 미보정 안내(히어로) — 떠다니는 분리 콘 대신 이미지 위 작은 안내 */
  function drawConeHint(cv, imgEl) {
    const { c, W, H } = sizeOverlay(cv); if (!c) return false;
    const g = coneGeo(cv, imgEl); if (!g) return false;
    c.font = "12px Pretendard,'Malgun Gothic',system-ui,sans-serif"; c.textAlign = "center";
    const txt = "☁ 웹분석 — 이 이미지를 판독해 시계열을 만들면 포지결과가 자동 계산됩니다";
    const tw = c.measureText(txt).width + 22;
    c.fillStyle = "rgba(11,15,20,.66)"; c.fillRect((W - tw) / 2, H - 30, tw, 22);
    c.fillStyle = _warmA(.95); c.fillText(txt, W / 2, H - 15);
    return true;
  }
  /* 편집기 미리보기 콘 드래그(기준선/현재선) */
  function bindConeDrag(cv, n) {
    if (!cv || cv._coneBound) return; cv._coneBound = true;
    cv.style.pointerEvents = "auto";
    const hit = e => {
      const g = cv._cg; if (!g) return null;
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const aY = g.oy + n.cal.ay * g.dh, bY = g.oy + n.cal.by * g.dh, nowX = g.ox + n.cal.nx * g.dw;
      if (Math.abs(x - nowX) < 9 && y > g.oy - 4 && y < g.oy + g.dh + 4) return "nx";
      if (Math.abs(y - aY) < 10) return "ay";
      if (Math.abs(y - bY) < 10) return "by";
      return null;
    };
    let drag = null;
    cv.addEventListener("pointerdown", e => {
      const h = hit(e); if (!h) return;
      drag = h; try { cv.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault();
    });
    cv.addEventListener("pointermove", e => {
      const g = cv._cg; if (!g) return;
      if (!drag) { const h = hit(e); cv.style.cursor = h ? (h === "nx" ? "ew-resize" : "ns-resize") : "default"; return; }
      const r = cv.getBoundingClientRect();
      if (drag === "nx") n.cal.nx = _clamp01((e.clientX - r.left - g.ox) / g.dw);
      else n.cal[drag] = _clamp01((e.clientY - r.top - g.oy) / g.dh);
      const im = cv.parentElement && cv.parentElement.querySelector("img");
      drawCalCone(cv, im, lastResult && lastResult.prediction, n.cal, true);   // 드래그 중 직접 재그리기
    });
    const end = e => { if (!drag) return; drag = null; try { cv.releasePointerCapture(e.pointerId); } catch (_) {} markDirty(); };
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  }

  /* ── fcDrawFuture: draw prediction cone + dashed path on #fcFuture ── */
  function fcDrawFuture(pred) {
    const cv = document.getElementById("fcFuture"); if (!cv) return;
    const ch = cv.clientHeight || 240, c = fcFit(cv, ch);
    const cw = cv.clientWidth || 200;
    c.clearRect(0, 0, cw, ch);
    const path = (pred && pred.path) || [], lo = (pred && pred.lo) || [], hi = (pred && pred.hi) || [];
    if (!path.length) {
      c.fillStyle = FC_DIM; c.font = "11px ui-monospace,monospace"; c.textAlign = "center";
      c.fillText("예측 미리보기", cw / 2, ch / 2); c.textAlign = "left"; return;
    }
    let loMin = Infinity, hiMax = -Infinity;
    for (let i = 0; i < path.length; i++) { loMin = Math.min(loMin, lo[i]); hiMax = Math.max(hiMax, hi[i]); }
    if (pred.anchor != null) { loMin = Math.min(loMin, pred.anchor); hiMax = Math.max(hiMax, pred.anchor); }
    const pad = (hiMax - loMin) * 0.1 || 1; loMin -= pad; hiMax += pad;
    const toY = v => 16 + (1 - (v - loMin) / ((hiMax - loMin) || 1)) * (ch - 32);
    const toX = k => 8 + (k / Math.max(1, path.length - 1)) * (cw - 14);
    const anchorY = toY(pred.anchor != null ? pred.anchor : path[0]);
    /* seam ("지금") */
    c.strokeStyle = "#2b3647"; c.lineWidth = 1; c.beginPath(); c.moveTo(8, 0); c.lineTo(8, ch); c.stroke();
    c.fillStyle = FC_DIM; c.font = "10px ui-monospace,monospace"; c.fillText("지금", 11, 12);
    /* cone fill */
    c.beginPath(); c.moveTo(8, anchorY);
    for (let k = 0; k < path.length; k++) c.lineTo(toX(k), toY(hi[k]));
    for (let k = path.length - 1; k >= 0; k--) c.lineTo(toX(k), toY(lo[k]));
    c.lineTo(8, anchorY); c.closePath(); c.fillStyle = _warmA(.09); c.fill();
    /* path line */
    c.strokeStyle = FC_GOLD; c.lineWidth = 1.8; c.setLineDash([5, 4]);
    c.beginPath(); c.moveTo(8, anchorY);
    for (let k = 0; k < path.length; k++) c.lineTo(toX(k), toY(path[k]));
    c.stroke(); c.setLineDash([]);
  }

  let _comets = {}, _cometRAF = null;
  function _reduceMotion() { try { return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }
  function _drawComets() {
    _cometRAF = null;
    const cm = document.getElementById("fcComet"), main = document.getElementById("fcMainChart");
    if (!cm || !main) return;
    // 웹분석 전(미확정)엔 예측 코멧(진앙지 펄스·흐르는 점)을 절대 그리지 않음 — 캔버스 비우고 루프 정지(스포일러 차단·트리거 무관 방어)
    if (typeof window !== "undefined" && window._fcPreview) { const cx0 = cm.getContext("2d"); if (cx0) { cx0.setTransform(1, 0, 0, 1, 0, 0); cx0.clearRect(0, 0, cm.width, cm.height); } return; }
    const keys = Object.keys(_comets).filter(k => _comets[k] && _comets[k].pts && _comets[k].pts.length > 1);
    const W = main.clientWidth || 1, H = main.clientHeight || 1;
    const dpr = Math.min(Math.max(devicePixelRatio || 1, 1.5), 2.5);
    const ww = Math.round(W * dpr), hh = Math.round(H * dpr);
    if (cm.width !== ww || cm.height !== hh) { cm.width = ww; cm.height = hh; }
    cm.style.width = W + "px"; cm.style.height = H + "px";
    const cx = cm.getContext("2d"); cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, W, H);
    if (!keys.length) return;
    cx.save();
    if (typeof _heroZoom === "object" && _heroZoom) { cx.translate(_heroZoom.tx || 0, _heroZoom.ty || 0); cx.scale(_heroZoom.s || 1, _heroZoom.s || 1); }
    const t = (performance.now() % 2800) / 2800;   // 흐르는 점
    const pt = (performance.now() % 1500) / 1500;   // 펄스 사이클(공통)
    keys.forEach(k => {
      const cmt = _comets[k], pts = cmt.pts, col = cmt.col;
      const fk = t * (pts.length - 1), i0 = Math.floor(fk), fr = fk - i0;
      const a = pts[i0], b = pts[Math.min(pts.length - 1, i0 + 1)];
      const x = a[0] + (b[0] - a[0]) * fr, y = a[1] + (b[1] - a[1]) * fr;
      if (isFinite(x) && isFinite(y)) {
        cx.save(); cx.globalAlpha = .5; cx.shadowColor = col; cx.shadowBlur = 13; cx.fillStyle = col; cx.beginPath(); cx.arc(x, y, 4.6, 0, 7); cx.fill(); cx.restore();
        cx.save(); cx.shadowColor = "#fff"; cx.shadowBlur = 7; cx.fillStyle = "#fff"; cx.beginPath(); cx.arc(x, y, 2.2, 0, 7); cx.fill(); cx.restore();
      }
      const ep = pts[pts.length - 1];   // 끝점 펄스 — 1/2/3차 공통, 확률 클수록 크게
      if (ep && isFinite(ep[0]) && isFinite(ep[1])) {
        const psc = 0.55 + (isFinite(cmt.prob) ? cmt.prob : 50) / 100, r = 3.5 + pt * 15 * psc, al = (1 - pt) * 0.5;
        cx.save(); cx.globalAlpha = al; cx.strokeStyle = col; cx.lineWidth = 2; cx.beginPath(); cx.arc(ep[0], ep[1], r, 0, 7); cx.stroke(); cx.restore();
      }
    });
    if (_comets._start && isFinite(_comets._start.x)) {   // 예측 시작점(현재가) 흰색 펄스
      const sx = _comets._start.x, sy = _comets._start.y, r = 3 + pt * 11, al = (1 - pt) * 0.5;
      cx.save(); cx.globalAlpha = al; cx.strokeStyle = "#fff"; cx.lineWidth = 1.8; cx.beginPath(); cx.arc(sx, sy, r, 0, 7); cx.stroke(); cx.restore();
    }
    cx.restore();
    _cometRAF = requestAnimationFrame(_drawComets);
  }
  function _startComets() { if (_reduceMotion()) { _drawComets(); return; } if (!_cometRAF) _cometRAF = requestAnimationFrame(_drawComets); }
  function _renderChartLegend(pd) {
    const el = document.getElementById("fcLegend"); if (!el) return;
    const band = pd > 0 ? "rgba(70,194,142,.72)" : pd < 0 ? "rgba(224,106,106,.72)" : _warmA(.72);
    const core = pd > 0 ? "#46c28e" : pd < 0 ? "#e06a6a" : FC_GOLD;
    const c3 = pd > 0 ? "#e06a6a" : "#46c28e";
    const items = [
      ["기술적 최대범위", band, "sq", "기술적으로 도달 가능한 최저~최고 경계입니다. 피보나치·구조 스윙·매물대·볼린저·일목·VWAP를 종합해 산출하며, 예측이 이 범위를 벗어나기는 어렵습니다."],
      ["1차 종합지표", core, "", "전체 지표를 융합한 종합 예측선입니다. 가장 신뢰도 높은 기본 시나리오예요."],
      ["2차 선택지표", "#4dd0ff", "", "범례에서 표시(체크)한 지표 조합만으로 다시 계산한 예측선입니다. 특정 관점으로 비교할 때 씁니다."],
      ["3차 최대역치", c3, "", "예상과 반대로 움직였을 때 가격이 향할 가장 가까운 지지/저항 레벨(반대 시나리오)입니다."]
    ];
    el.style.display = "flex";
    el.innerHTML = '<span class="fc-leg-grip" title="드래그하여 범례 이동">⠿</span>' + items.map(it => `<span class="fc-leg-item"><span class="fc-leg-sw${it[2] === "sq" ? " sq" : ""}" style="background:${it[1]}"></span>${esc(it[0])}<span class="fc-leg-tip">${esc(it[3])}</span></span>`).join("");
    if (_legPos) { el.style.left = _legPos.x + "px"; el.style.top = _legPos.y + "px"; el.style.right = "auto"; }   // 드래그 위치 유지
    _legDragInit();
  }
  let _legPos = null, _legDragBound = false;
  function _legDragInit() {
    if (_legDragBound) return; _legDragBound = true;   // 문서 위임(범례는 재렌더되므로)
    document.addEventListener("pointerdown", e => {
      const grip = e.target && e.target.closest && e.target.closest(".fc-leg-grip"); if (!grip) return;
      const lg = document.getElementById("fcLegend"), host = lg && lg.parentElement; if (!lg || !host) return;
      e.preventDefault();
      const hr = host.getBoundingClientRect(), lr = lg.getBoundingClientRect(), ox = e.clientX - lr.left, oy = e.clientY - lr.top;
      const mv = ev => {
        let x = Math.max(2, Math.min(hr.width - lr.width - 2, ev.clientX - hr.left - ox));
        let y = Math.max(2, Math.min(hr.height - lr.height - 2, ev.clientY - hr.top - oy));
        _legPos = { x, y }; lg.style.left = x + "px"; lg.style.top = y + "px"; lg.style.right = "auto";
      };
      const up = () => { document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); };
      document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up);
    });
  }
  function fcDrawMainChart(series, pred) {
    const cv = document.getElementById("fcMainChart"); if (!cv) return;
    // 높이는 hero(부모) 기준 — evidence 캔버스와 동일 기준(정합). fullscreen서 height:100%가 부모 height:auto로 미해결→캔버스가 작아져 캔들과 작도값(evidence)이 어긋나던 버그 방지.
    const _hero = cv.parentElement;
    const ch = (_hero && _hero.clientHeight) || cv.clientHeight || 260;
    cv.style.height = ch + "px";   // 명시적 높이로 고정(부모 auto와 무관하게 evidence와 같은 높이)
    const c = fcFitKeep(cv, ch, 3);
    const cw = cv.clientWidth || (_hero && _hero.clientWidth) || 600;
    _comets = {};   // 이번 프레임 예측선 코멧 경로 재수집
    { const _lg0 = document.getElementById("fcLegend"); if (_lg0) _lg0.style.display = "none"; }
    c.clearRect(0, 0, cw, ch);
    c.lineJoin = "round"; c.lineCap = "round";   // 폴리라인 부드럽게(고급감)
    const N = (series || []).length;
    if (!_chartWin.count || _chartWin.start + _chartWin.count > N || _chartWin.start < 0) {
      _chartWin.count = Math.min(_chartWin.count || 180, N); _chartWin.start = Math.max(0, N - _chartWin.count);
    }
    const wStart = _chartWin.start, wCount = _chartWin.count;
    const hist = (series || []).slice(wStart, wStart + wCount);
    const atLatest = (wStart + wCount >= N);
    const path = atLatest ? ((pred && pred.path) || []) : [], lo = atLatest ? ((pred && pred.lo) || []) : [], hi = atLatest ? ((pred && pred.hi) || []) : [];
    if (hist.length < 2) {
      c.fillStyle = FC_DIM; c.font = "11px ui-monospace,monospace"; c.textAlign = "center";
      c.fillText("분석 데이터 없음", cw / 2, ch / 2); c.textAlign = "left"; return;
    }
    c.save(); c.translate(_heroZoom.tx, _heroZoom.ty); c.scale(_heroZoom.s, _heroZoom.s);
    const anchor = (pred && pred.anchor != null) ? pred.anchor : hist[hist.length - 1];
    const _oh = (typeof priceOHLC === "function") ? priceOHLC() : null;
    const _ohW = (_oh && _oh.length === N) ? _oh.slice(wStart, wStart + wCount) : null;
    let loV = Infinity, hiV = -Infinity;
    if (_ohW) {
      // robust: 몸통(시·종가) 범위 + 위크는 과도 이탈 제한 → 단일 이상치 위크가 세로 스케일을 지배해 화면 낭비하던 문제 방지
      let bLo = Infinity, bHi = -Infinity, wLo = Infinity, wHi = -Infinity;
      for (const d of _ohW) { const b0 = Math.min(d.o, d.c), b1 = Math.max(d.o, d.c); if (b0 < bLo) bLo = b0; if (b1 > bHi) bHi = b1; if (d.l < wLo) wLo = d.l; if (d.h > wHi) wHi = d.h; }
      const br = (bHi - bLo) || 1;
      loV = Math.max(wLo, bLo - br * 0.6); hiV = Math.min(wHi, bHi + br * 0.6);   // 위크는 몸통범위 60%까지만(초과분은 잘림)
    } else {
      // robust(선 시계열/붙여넣기·웹분석): 극단 2% 절단 → 단일 이상치가 세로 스케일을 통째로 벌려 '전부 다 보여주는' 문제 방지(벗어난 점은 잘림)
      const srt = hist.filter(v => isFinite(v)).slice().sort((a, b) => a - b);
      if (srt.length >= 8) { const q = p => srt[Math.min(srt.length - 1, Math.max(0, Math.round(p * (srt.length - 1))))]; loV = q(0.02); hiV = q(0.98); }
      else { for (const v of hist) { if (v < loV) loV = v; if (v > hiV) hiV = v; } }
    }
    if (atLatest) {
      loV = Math.min(loV, anchor); hiV = Math.max(hiV, anchor);   // '지금'(앵커=현재가) 포함
      // 예측 밴드(음영=이론적 min/max)를 세로 스케일에 포함 → 예측 영역 전체가 프레임 안에 들어와 1/2/3차 라인이 화면 밖으로 튀지 않음.
      // 캔들 과소축소 방지: 밴드가 캔들 범위의 3배를 넘으면 초과분만 잘림(라인 클램프가 안전망).
      if (lo.length && hi.length) {
        const _cR = (hiV - loV) || 1, _cap = 3;
        let _bLo = loV, _bHi = hiV;
        for (const v of lo) if (isFinite(v)) _bLo = Math.min(_bLo, v);
        for (const v of hi) if (isFinite(v)) _bHi = Math.max(_bHi, v);
        loV = Math.max(_bLo, hiV - _cR * _cap);
        hiV = Math.min(_bHi, loV + _cR * _cap);
        loV = Math.min(loV, anchor); hiV = Math.max(hiV, anchor);
      }
    }
    if (!isFinite(loV) || !isFinite(hiV)) { loV = 0; hiV = 1; }
    const padV = (hiV - loV) * 0.08 || 1; loV -= padV; hiV += padV;
    if (_yScale.mode === "manual" && isFinite(_yScale.lo) && isFinite(_yScale.hi) && _yScale.hi > _yScale.lo) { loV = _yScale.lo; hiV = _yScale.hi; }
    const padX = 8, padTop = 16, padBot = 26, axisW = 46;   // padBot=시간축 눈금·드래그 스트립 공간
    const plotW = cw - padX - axisW;
    // 축 스트립 어포던스(드래그로 배율 조정 가능 느낌) — y축(우)·시간축(하) 은은한 밴드 + 그립
    { const yStripX = padX + plotW, yStripW = cw - yStripX, plotH2 = ch - padTop - padBot;
      c.save();
      const gy = c.createLinearGradient(yStripX, 0, cw, 0); gy.addColorStop(0, "rgba(138,146,178,0)"); gy.addColorStop(1, "rgba(138,146,178,.06)");
      c.fillStyle = gy; c.fillRect(yStripX, padTop, yStripW, plotH2);
      const gx = c.createLinearGradient(0, ch - padBot, 0, ch); gx.addColorStop(0, "rgba(138,146,178,0)"); gx.addColorStop(1, "rgba(138,146,178,.06)");
      c.fillStyle = gx; c.fillRect(padX, ch - padBot, plotW, padBot);
      c.fillStyle = "rgba(138,146,178,.4)";   // y 스트립 그립(⋮, 세로 중앙)
      const gcx = yStripX + yStripW / 2, gcy = padTop + plotH2 / 2;
      for (let i = -1; i <= 1; i++) c.fillRect(gcx - 1, gcy + i * 5 - 1, 2, 2);
      c.restore();
    }
    const total = hist.length + path.length;
    // 히스토리·미래 봉당 가로폭 동일 → 예상구간이 캔들 폭만큼 확장(확대해도 미래가 압축되지 않음)
    const histW = plotW * (hist.length / total);
    const seamX = padX + histW;
    const _lo = tvLog(loV, _logChart), _hi = tvLog(hiV, _logChart);
    const toY = v => padTop + (1 - (tvLog(v, _logChart) - _lo) / ((_hi - _lo) || 1)) * (ch - padTop - padBot);
    const toXh = i => padX + (i / (hist.length - 1)) * histW;
    const toXf = k => seamX + ((k + 1) / Math.max(1, path.length)) * (plotW - histW);
    /* 예측 밴드 세로 범위(줌 세로중심용) */
    let bandTop = toY(anchor), bandBot = toY(anchor);
    for (let k = 0; k < path.length; k++) { bandTop = Math.min(bandTop, toY(hi[k])); bandBot = Math.max(bandBot, toY(lo[k])); }
    /* 호버 툴팁 + 근거작도용 기하 stash(CSS px 공간) */
    cv._mainGeo = { padX, histW, seamX, plotW, padTop, padBot, ch, loV, hiV, bandTop, bandBot, histLen: hist.length, pathLen: path.length, hist, path, lo, hi, anchor, unit: tfUnit(), log: _logChart, start: wStart, count: wCount, winN: N, plotRight: padX + plotW, anchorY: toY(anchor), atLatest };
    if (typeof updateFitBtn === "function") updateFitBtn();   // 예측 구간 프레이밍 버튼 표시/숨김 갱신
    _axisLabelBoxes = [];   // 이번 프레임 축 라벨 박스 초기화
    // grid + 세로축 가격 눈금(각 그리드선의 가격 — 우측, 어두운 pill로 가독)
    c.strokeStyle = FC_GRID; c.lineWidth = 1;
    { const _plotH = ch - padTop - padBot, _loL = tvLog(loV, _logChart), _hiL = tvLog(hiV, _logChart);
      for (let g = 0; g <= 3; g++) {
        const gy = padTop + g / 3 * _plotH;
        c.strokeStyle = FC_GRID; c.beginPath(); c.moveTo(padX, gy); c.lineTo(padX + plotW, gy); c.stroke();
        if (g === 0 || g === 3) {   // 위/아래 두 눈금만(복잡함 완화)
          const _vL = _loL + (1 - g / 3) * (_hiL - _loL), pv = _logChart ? Math.exp(_vL) : _vL, t = _hzFmt(pv);
          c.font = "9.5px ui-monospace,monospace"; c.textAlign = "right"; const tw = c.measureText(t).width;
          c.fillStyle = "rgba(11,15,20,.66)"; c.fillRect(padX + plotW - tw - 6, gy - 5, tw + 6, 11); _axisLabelBoxes.push({ x: padX + plotW - tw - 6, y: gy - 6, w: tw + 8, h: 13 });
          c.fillStyle = "#8892a8"; c.fillText(t, padX + plotW - 2, gy + 3); c.textAlign = "left";
        }
      }
    }
    // 시간축 눈금(하단) — 실제 날짜(티커 데이터 있을 때) 또는 상대 봉('−N{단위}') + 짧은 틱 + 은은한 세로 그리드
    { const uAx = tfUnit(), TN = 5, ay = ch - padBot;
      const _times = priceTimes(), _tfk = activeTF() || "", _useDate = !!(_times && _times.length === N);
      let _prevY = null;
      c.font = "10px ui-monospace,monospace"; c.textAlign = "center";
      for (let i = 0; i <= TN; i++) {
        const wi = Math.round(i / TN * (hist.length - 1)), x = toXh(wi), absIdx = wStart + wi, ago = (N - 1) - absIdx, isNow = ago <= 0;
        let lbl;
        if (_useDate && _times[absIdx]) { const d = _fmtAxisDate(_times[absIdx], _tfk, _prevY); lbl = d.text; _prevY = d.year; }
        else lbl = isNow ? "지금" : "−" + ago + uAx;
        if (i > 0 && i < TN) { c.strokeStyle = FC_GRID; c.globalAlpha = .5; c.lineWidth = 1; c.beginPath(); c.moveTo(x, padTop); c.lineTo(x, ay); c.stroke(); c.globalAlpha = 1; }
        c.strokeStyle = FC_GRID; c.lineWidth = 1; c.beginPath(); c.moveTo(x, ay); c.lineTo(x, ay + 4); c.stroke();
        c.fillStyle = (isNow && !_useDate) ? FC_GOLD : FC_DIM; c.fillText(lbl, Math.max(padX + 20, Math.min(padX + plotW - 20, x)), ay + 15);
      }
      c.textAlign = "left";
    }
    // history: 캔들(OHLC 있을 때) 또는 선
    if (_ohW && _ohW.length === hist.length) {
      const bw = Math.max(1, (histW / hist.length) * 0.7);
      for (let i = 0; i < hist.length; i++) {
        const d = _ohW[i], x = toXh(i), up = d.c >= d.o, col = up ? "#46c28e" : "#e06a6a";
        c.strokeStyle = col; c.lineWidth = Math.max(0.7, bw * 0.16);
        c.beginPath(); c.moveTo(x, toY(d.h)); c.lineTo(x, toY(d.l)); c.stroke();
        const yt = toY(Math.max(d.o, d.c)), yb = toY(Math.min(d.o, d.c));
        c.fillStyle = col; c.fillRect(x - bw / 2, yt, bw, Math.max(1, yb - yt));
      }
    } else {
      c.strokeStyle = FC_GOLD; c.lineWidth = 2; c.beginPath();
      hist.forEach((v, i) => { const x = toXh(i), y = toY(v); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
    }
    // seam ("지금") + forecast cone + path — 예측 path 있을 때만(없으면 과거가 전폭, y라벨 겹침 방지)
    if (path.length) {
      const _prev = (typeof window !== "undefined" && window._fcPreview);   // 웹분석 전 = 예측 미표시(존만 비워 표시)
      c.strokeStyle = "#2b3647"; c.lineWidth = 1; c.setLineDash([3, 3]);
      c.beginPath(); c.moveTo(seamX, padTop - 6); c.lineTo(seamX, ch - padBot); c.stroke(); c.setLineDash([]);
      c.fillStyle = FC_DIM; c.font = "10px ui-monospace,monospace"; c.fillText("지금", seamX + 3, padTop - 2);
      // 현재가 수평선 + 우측 골드 pill(항상 표시 — 어디서든 현재가 기준선)
      { const yA = toY(anchor); c.save(); c.strokeStyle = _warmA(.38); c.lineWidth = 1; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(padX, yA); c.lineTo(padX + plotW, yA); c.stroke(); c.setLineDash([]); c.restore(); }   // 현재가 기준선만(pill 제거)
      if (_prev) {
        // 웹분석 전: 예측을 아예 그리지 않음(존은 배경 그대로 비움) + 중앙 안내 — '확정 결과'로 안 보이게
        if (typeof _clearComets === "function") _clearComets();   // 이전 분석 프레임 예측선 펄스 잔상 제거
        c.save();
        c.textAlign = "center"; c.textBaseline = "middle";
        const _fx = seamX + (padX + plotW - seamX) / 2, _fy = padTop + (ch - padBot - padTop) / 2;
        c.fillStyle = FC_DIM; c.font = "12px ui-sans-serif,system-ui,sans-serif";
        c.fillText("웹분석하면 예측이 표시됩니다", _fx, _fy - 8);
        c.fillStyle = "rgba(138,146,178,.55)"; c.font = "10px ui-sans-serif,system-ui,sans-serif";
        c.fillText("종목 선택만으로는 미확정", _fx, _fy + 9);
        c.textAlign = "left"; c.textBaseline = "alphabetic"; c.restore();
      } else {
      const coneR = toXf(path.length - 1);
      // 방향 색조(약한 적/녹) — 하락/상승 예측을 국면과 정합되게 한눈에
      const _pEnd = path[path.length - 1];
      const _pd = (_pEnd > anchor * 1.004) ? 1 : (_pEnd < anchor * 0.996) ? -1 : 0;
      const CT = _pd > 0 ? { fa: "rgba(70,194,142,.22)", fb: "rgba(70,194,142,.03)", edge: "rgba(70,194,142,.34)", core: "#46c28e", glow: "rgba(70,194,142,.5)" }
        : _pd < 0 ? { fa: "rgba(224,106,106,.22)", fb: "rgba(224,106,106,.03)", edge: "rgba(224,106,106,.34)", core: "#e06a6a", glow: "rgba(224,106,106,.5)" }
          : { fa: _warmA(.22), fb: _warmA(.03), edge: _warmA(.3), core: FC_GOLD, glow: _warmA(.5) };
      // 밴드 채움: 현재(씨앗)에서 진하게 → 먼 미래로 갈수록 옅게(불확실성↑ 시각화)
      c.beginPath(); c.moveTo(seamX, toY(anchor));
      for (let k = 0; k < path.length; k++) c.lineTo(toXf(k), toY(hi[k]));
      for (let k = path.length - 1; k >= 0; k--) c.lineTo(toXf(k), toY(lo[k]));
      c.closePath();
      const gcone = c.createLinearGradient(seamX, 0, coneR, 0);
      gcone.addColorStop(0, CT.fa); gcone.addColorStop(1, CT.fb);
      c.fillStyle = gcone; c.fill();
      // 내부 신뢰밴드(중앙값 ±절반) — 겹쳐 그려 코어가 더 진해짐(고확률 구간 강조, fan-chart 2단)
      c.beginPath(); c.moveTo(seamX, toY(anchor));
      for (let k = 0; k < path.length; k++) c.lineTo(toXf(k), toY(path[k] + (hi[k] - path[k]) * 0.5));
      for (let k = path.length - 1; k >= 0; k--) c.lineTo(toXf(k), toY(path[k] - (path[k] - lo[k]) * 0.5));
      c.closePath(); c.fillStyle = gcone; c.fill();
      // 밴드 경계(은은한 헤어라인 점선)
      c.strokeStyle = CT.edge; c.lineWidth = CW.hair; c.setLineDash(CDASH.fine);
      c.beginPath(); c.moveTo(seamX, toY(anchor)); for (let k = 0; k < path.length; k++) c.lineTo(toXf(k), toY(hi[k])); c.stroke();
      c.beginPath(); c.moveTo(seamX, toY(anchor)); for (let k = 0; k < path.length; k++) c.lineTo(toXf(k), toY(lo[k])); c.stroke();
      c.setLineDash([]);
      // 중앙 예측선: 솔리드 + 소프트 글로우(방향 색조)
      c.save();
      c.strokeStyle = CT.core; c.lineWidth = 2.9; c.shadowColor = CT.glow; c.shadowBlur = 12;   // 예측 중앙선 = 핵심 산출물 → 굵게·강한 글로우로 강조
      const _cyM = y => Math.max(padTop + 1, Math.min(ch - padBot - 1, y));   // 극단 예측도 플롯 안에 유지(축이 밴드를 넘는 경우 안전망)
      c.beginPath(); c.moveTo(seamX, _cyM(toY(anchor)));
      for (let k = 0; k < path.length; k++) c.lineTo(toXf(k), _cyM(toY(path[k])));
      c.stroke(); c.restore();
      // 반대 시나리오: '예상대로 가지 않았을 때'의 데이터 기반 대안 경로(엔진 pred.counter — 거울상 반사 아님)
      const _counter = pred && pred.counter;
      if (_pd !== 0 && Array.isArray(_counter) && _counter.length === path.length) {
        let _cs = 0, _cw = 0; for (let k = 0; k < path.length; k++) { const wt = 1 / Math.sqrt(k + 1); _cs += _upProb(path[k], hi[k], anchor) * wt; _cw += wt; }
        const _upP = _cw ? _cs / _cw : 50, _cProb = Math.round(_pd > 0 ? (100 - _upP) : _upP);
        const _cUp = _counter[_counter.length - 1] >= anchor;   // 반대 경로 방향(끝점 vs 현재가)
        const _cCol = _cUp ? "70,194,142" : "224,106,106";      // 반대 상승=녹 / 반대 하락=적
        const _cA = Math.max(0.34, Math.min(0.8, _cProb / 100 * 1.15));
        const _cYc = k => Math.max(padTop + 4, Math.min(ch - padBot - 4, toY(_counter[k])));
        c.save();
        c.strokeStyle = "rgba(" + _cCol + "," + Math.max(0.78, _cA) + ")"; c.lineWidth = 2.8; c.lineJoin = "round"; c.setLineDash([6, 4]); c.shadowColor = "rgba(" + _cCol + ",.5)"; c.shadowBlur = 7;
        c.beginPath(); c.moveTo(seamX, toY(anchor));
        for (let k = 0; k < _counter.length; k++) c.lineTo(toXf(k), _cYc(k));
        c.stroke(); c.setLineDash([]); c.shadowBlur = 0;
        _predEndDeco(c, _counter, seamX, coneR, toY, { padX, plotW, padTop, padBot, ch }, "rgb(" + _cCol + ")", "3차\u00b7" + _cProb + "%", (_cUp ? -12 : 14), true);
        _comets.p3 = { pts: _counter.map((v, k) => [toXf(k), _cYc(k)]), col: "rgb(" + _cCol + ")", prob: _cProb };
        c.restore();
      }
      // 1차(종합) 끝단: 흘러가는 점 + 진앙지 + 명칭(+ 방향 달성확률)
      let _p1s = 0, _p1w = 0; for (let k = 0; k < path.length; k++) { const wt = 1 / Math.sqrt(k + 1); _p1s += _upProb(path[k], hi[k], anchor) * wt; _p1w += wt; }
      const _p1up = _p1w ? _p1s / _p1w : 50, _p1disp = Math.round(_pd >= 0 ? _p1up : (100 - _p1up));
      _predEndDeco(c, path, seamX, coneR, toY, { padX, plotW, padTop, padBot, ch }, CT.core, "1차\u00b7" + _p1disp + "%", -12, true);
      _comets.p1 = { pts: path.map((v, k) => [toXf(k), Math.max(padTop + 2, Math.min(ch - padBot - 2, toY(v)))]), col: CT.core, prob: _p1disp };
      _comets._start = { x: seamX, y: toY(anchor) };
      if (typeof _startComets === "function") _startComets();
      // 현재가 = 예측 시작점(1·2·3차가 갈라지는 원점) — 중립 흰색 마커
      { const _mx = seamX, _my = toY(anchor); c.save();
        c.strokeStyle = "rgba(255,255,255,.22)"; c.lineWidth = 1; c.beginPath(); c.arc(_mx, _my, 9.5, 0, 7); c.stroke();
        c.shadowColor = "rgba(255,255,255,.9)"; c.shadowBlur = 10; c.strokeStyle = "rgba(255,255,255,.92)"; c.lineWidth = 1.7; c.beginPath(); c.arc(_mx, _my, 4.6, 0, 7); c.stroke();
        c.shadowBlur = 0; c.fillStyle = "#fff"; c.beginPath(); c.arc(_mx, _my, 2.3, 0, 7); c.fill(); c.restore(); }
      if (typeof _renderChartLegend === "function") _renderChartLegend(_pd);   // 예측선 범례 = DOM(호버 설명·큰 폰트)
      }   // else(!_prev) 끝 — 웹분석 후에만 예측 작도
    }
    // y labels (right)
    c.fillStyle = FC_DIM; c.font = "10px ui-monospace,monospace"; c.textAlign = "left";
    const lx = padX + plotW + 4;
    c.fillText(Math.round(hiV).toLocaleString(), lx, padTop + 4);
    c.fillText(Math.round(loV).toLocaleString(), lx, ch - padBot);
    // 예측 최대/최저 pill — 현재가 골드 pill과 동형(초록=예측 최대값, 빨강=예측 최저값)
    if (path.length) {
      let hiMax = -Infinity, loMin = Infinity;
      for (let k = 0; k < path.length; k++) { if (hi[k] > hiMax) hiMax = hi[k]; if (lo[k] < loMin) loMin = lo[k]; }
      const _predPill = (val, bg) => {
        if (!isFinite(val)) return;
        const yv = Math.max(padTop + 8, Math.min(ch - padBot - 8, toY(val)));
        const t = _hzFmt(val); c.font = "700 10px ui-monospace,monospace"; c.textAlign = "right"; const tw = c.measureText(t).width;
        c.fillStyle = bg; c.fillRect(padX + plotW - tw - 7, yv - 7, tw + 7, 14); _axisLabelBoxes.push({ x: padX + plotW - tw - 8, y: yv - 8, w: tw + 9, h: 16 });
        c.fillStyle = "#0b0f14"; c.fillText(t, padX + plotW - 3, yv + 3.3); c.textAlign = "left";
      };
      _predPill(hiMax, "rgba(150,158,175,.92)"); _predPill(loMin, "rgba(150,158,175,.92)");   // 기술적 최대범위 = 회색
    }
    // 데모(예시) 안내 — 중앙 워터마크 + 상단 배지. 불러온(fetched) 실티커가 없으면 예시로 간주.
    if (!boardState.nodes.some(n => n.blockType === "ticker" && n.params && n.params.fetched)) {
      c.save(); c.textAlign = "center"; c.fillStyle = _warmA(.07); c.font = "800 42px Pretendard,'Malgun Gothic',sans-serif";
      c.fillText("예시 데이터", padX + plotW / 2, padTop + (ch - padTop - padBot) / 2 + 12); c.restore();
      c.font = "700 10.5px Pretendard,'Malgun Gothic',system-ui,sans-serif"; c.textAlign = "left";
      const txt = "예시 차트입니다 — 위 티커에 종목을 입력해 ‘불러오기’ 하세요";
      const tw = c.measureText(txt).width + 18;
      c.fillStyle = _warmA(.18); if (c.roundRect) { c.beginPath(); c.roundRect(padX + 4, padTop + 48, tw, 19, 5); c.fill(); } else c.fillRect(padX + 4, padTop + 48, tw, 19);
      c.fillStyle = "rgba(240,200,120,.98)"; c.fillText(txt, padX + 13, padTop + 60.5); c.textAlign = "left";
    }
    drawEvidence();
    _drawRiskLevels(c, { toY, padX, plotW, padTop, padBot, ch });   // 리스크 진단 라인(진입/손절/목표)
    c.restore();
    if (typeof updateAxisBtns === "function") updateAxisBtns();   // A/L 버튼 상태 초기 렌더에도 동기화
  }

  /* ── 노드별 근거 작도(추세선·피보·파동 등) 누적 오버레이 ───────── */
  let _evidenceSet = new Set();
  /* 손그림 진행형 작도: _skFrac(0~1, null=평상시 전체). 모든 도구가 동시에 이 진행도로 그려짐. */
  let _skFrac = null;
  function _polyLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) { const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1]; L += Math.hypot(dx, dy); } return L; }
  function _skStroke(c, len) {   // len=경로 길이. 진행 중이면 dash로 앞부분만 그림(펜이 긋는 느낌)
    if (_skFrac == null || _skFrac >= 1 || !(len > 0)) { c.stroke(); return; }
    const pd = c.getLineDash(), po = c.lineDashOffset;
    c.setLineDash([len, len + 4]); c.lineDashOffset = len * (1 - Math.max(0, _skFrac));
    c.stroke(); c.setLineDash(pd); c.lineDashOffset = po;
  }
  function _skReady() { return _skFrac == null || _skFrac >= 0.82; }   // 라벨·마커·점은 선이 거의 다 그려진 뒤 등장
  let _evReveal = {};   // 시연 중 노드별 작도 레이어 출현 상한(nodeId→layer). 비재생=전체(∞)
  let _evidenceShow = true;
  let _focusInd = null;          // 포커스 지표 blockType | null(전체) — 클릭 잠금
  let _evHover = null;           // 범례 hover 임시 포커스(프리뷰) blockType | null
  let _legendCollapsed = (typeof window !== "undefined" && window.innerWidth <= 860);   // 범례 플로팅 접기(모바일 기본 접힘)
  const EV_DEFAULT_VISIBLE = ["trend", "bollinger", "fib", "rsi", "macd", "adx", "structure", "smc", "cycle", "vwap", "supertrend", "pivot", "psar", "gann", "pattern"];   // 기본 표시(나머지는 범례 클릭으로 켜기)
  let _evVisible = new Set(EV_DEFAULT_VISIBLE);   // 차트에 그릴 지표 집합
  let _legendHits = [];          // [{x,y,w,h,key}] 범례 칩 히트영역(로직좌표)
  let _evLabelBoxes = [];        // 라벨 겹침 회피용 박스 레지스트리(_drawEvidence마다 리셋)
  let _axisLabelBoxes = [];      // 세로축 눈금·현재가 pill 박스(라벨 회피용으로 미리 예약)
  let _labelMode = "key";        // 기본 "key"=중요 라벨만(차트 정돈) / "all"=전체(토글)
  const _KEYLBL = /목표|반대|지지|저항|골든포켓|장기|중기|단기/;   // 중요 라벨 판별(목표·S/R·반대·주요 추세선)
  document.addEventListener("click", function (e) {   // 중앙 보드 패널 접기/펼치기(헤더 클릭)
    const ph = e.target.closest && e.target.closest(".board-pane .fc-phead"); if (!ph) return;
    if (e.target.closest("button,input,select,a,textarea")) return;   // 헤더 내 컨트롤은 제외
    const panel = ph.closest(".fc-panel"); if (panel) panel.classList.toggle("collapsed");
  });
  const EV_COLORS = { ma: "#5b8def", trend: "#46c28e", fib: FC_GOLD, elliott: "#c47ae0", rsi: "#e06a6a", phasefold: "#3fb6c0", volume: "#8a92b2", bollinger: "#8fb4f0", macd: "#e0a86a", adx: "#7ecf9a", volumeprofile: "#d0b25a", ichimoku: "#8fd0c0", structure: "#f0a3c0", atr: "#9aa8c0", smc: "#5fd0ff", cycle: "#d07ab0", vwap: "#c9a86a", supertrend: "#66c8b0", stochastic: "#d87ab8", pivot: "#e0b0a0", psar: "#c0a8e0", keltner: "#7fc0d0", donchian: "#d0c080", cci: "#e6785a", williams: "#b56fd6", roc: "#8fb46a", ao: "#5a9ad0", aroon: "#8b7ee0", mfi: "#c8912f", cmf: "#5ac0a0", gann: "#c9a26b", pattern: "#e6a3c8" };
  /* 지표 도구 안내 — 편집창에 목적(p)·정의(d)·해석법(h) 표시 */
  const INDICATOR_INFO = {
    ma: { p: "추세의 방향·기울기를 매끄럽게 파악.", d: "최근 N봉 종가의 단순/지수 평균선.", h: "가격이 선 위=상승 우위, 아래=하락 우위. 단·장기선 정배열·골든/데드크로스로 전환 판단." },
    trend: { p: "현재 추세의 방향과 강도를 회귀로 정량화.", d: "다중 구간 로그가격 회귀기울기(R²가중) + 피벗 지지·저항.", h: "기울기 상향=상승추세. 회귀채널 상·하단은 되돌림 기준선." },
    rsi: { p: "모멘텀의 과열·과매도를 판단.", d: "최근 N봉 상승/하락폭 비율(0~100).", h: "70+ 과열·30- 과매도. 다이버전스=추세 약화. 50선(국면)으로 추세 지속 확인." },
    bollinger: { p: "변동성 기반 가격 위치·확장/수축 파악.", d: "중심 SMA ± 표준편차×k 밴드.", h: "상단 근접=과열·하단=과매도. 밴드 수축(스퀴즈)=변동성 확대 임박." },
    macd: { p: "추세 모멘텀과 전환을 포착.", d: "단기EMA−장기EMA(MACD)와 시그널선·히스토그램.", h: "MACD>시그널·0선 상향=상승 모멘텀. 골든/데드크로스·히스토그램 방향 확인." },
    adx: { p: "추세의 강도(방향 무관)와 방향 우위 측정.", d: "ADX(강도) + +DI/−DI(방향).", h: "ADX 25+=강한 추세, +DI>−DI=상승 우위. ADX<20=횡보(추세매매 자제)." },
    volumeprofile: { p: "거래가 몰린 가격대(매물대)를 파악.", d: "구간 내 가격대별 거래량 분포·POC(최대거래 가격).", h: "POC·밸류에어리어는 지지/저항. 가격이 매물대 위=수용(상승), 아래=저항." },
    ichimoku: { p: "추세·지지저항·모멘텀을 한 판에 종합.", d: "전환·기준선, 선행스팬 구름, 후행스팬.", h: "가격이 구름 위=상승. 전환선>기준선·구름 두께로 추세 강도 판단." },
    structure: { p: "고점·저점 구조로 추세 전환(BOS/CHoCH) 식별.", d: "스윙 고·저점의 갱신 패턴 분석.", h: "고점·저점 동반 상승=상승구조. 구조 붕괴(CHoCH)=추세 전환 경보." },
    atr: { p: "변동성 크기를 측정(손절·목표폭 기준).", d: "최근 N봉 트루레인지 평균.", h: "방향 신호는 없음. 값이 크면 변동성↑ → 손절·예측폭을 넓게. 배수로 트레일링 스톱." },
    smc: { p: "기관 수요·공급 흔적(FVG·오더블록) 추적.", d: "급격한 변위로 생긴 미체결 갭·오더블록 존(실 OHLC 필요).", h: "미채운 FVG·OB는 되돌림 목표·지지저항. 존 방향으로 반응 기대." },
    pattern: { p: "고전 차트 패턴(H&S·깃발) 자동 감지.", d: "스윙 구조에서 헤드앤숄더·역H&S·불/베어 플래그를 탐지(신뢰도 스코어).", h: "감지 시 반전(H&S)·지속(플래그) 방향. 넥라인/채널 돌파=확정(강), 형성 중=약. 미감지 시 침묵." },
    cycle: { p: "가격의 주기적 리듬·위상 파악.", d: "지배 주기 탐지(PDM)와 현재 위상.", h: "위상 저점=반등 기대·고점=조정. 주기 길이로 다음 변곡 시점 추정." },
    vwap: { p: "거래량 가중 평균가 대비 위치 파악.", d: "기간 내 (가격×거래량) 누적 / 거래량 누적.", h: "가격이 VWAP 위=매수 우위(기관 평단 위). 이탈·회귀로 되돌림 판단." },
    supertrend: { p: "추세 방향과 추적 손절선 제공.", d: "ATR 기반 밴드로 추세 상태를 전환.", h: "가격>슈퍼트렌드=상승(선이 지지). 선 관통 시 추세 전환·손절." },
    stochastic: { p: "단기 과열·과매도와 교차 신호.", d: "최근 구간 내 종가 위치(%K)와 평활(%D).", h: "80+ 과매수·20- 과매도. %K>%D 골든크로스=반등. 다이버전스 주의." },
    fib: { p: "되돌림·확장 목표 가격대 산출.", d: "지배 스윙에 0.382·0.5·0.618 등 비율 적용.", h: "되돌림 후 0.5~0.618(골든존) 지지=추세 지속. 확장 1.618은 목표가." },
    elliott: { p: "파동 구조로 추세 국면·다음 파동 예측.", d: "임펄스 5파·조정 3파(ABC) 카운팅.", h: "1·3·5 추진파 방향으로 순응. 조정(ABC)은 되돌림. 3파 최장·규칙 위반 시 재카운트." },
    volume: { p: "가격 움직임의 신뢰도(참여) 확인.", d: "봉별 거래량과 OBV 누적.", h: "상승+거래량 증가=신뢰. 가격·OBV 다이버전스=추세 약화. 방향이 아닌 확인 지표." },
    phasefold: { p: "숨은 지배 주기를 스캔·정합.", d: "위상 접기(PDM)+FFT로 주기 강도 탐지.", h: "θ가 작을수록 뚜렷한 주기. 지배 주기의 위상으로 리듬 추종." },
    pivot: { p: "당일 지지·저항 기준선 제공.", d: "직전 기간 고·저·종가로 P·R1~3·S1~3 산출.", h: "종가가 P 위=강세. R=저항(돌파 시 상승)·S=지지. 레벨 이탈로 방향 판단." },
    gann: { p: "추세의 각도·속도를 기하학적으로 판정.", d: "직전 지배 스윙에 1×1(=지배 추세 기울기) 기준 부채꼴(2×1~1×4)을 투영.", h: "종가가 1×1 위=추세보다 강함(가속). 2×1·3×1 상단각 돌파=강가속. 1×2·1×4 아래 이탈=둔화." },
    psar: { p: "추세 방향·추적 손절·전환 시점.", d: "가속계수(AF)로 따라붙는 SAR 점열.", h: "점이 가격 아래=상승(지지). 가격이 점 관통=추세 전환·청산 신호." },
    keltner: { p: "ATR 기반 추세·변동성 채널.", d: "중심 EMA ± ATR×배수.", h: "상단 돌파=강한 상승·하단=하락. 볼린저가 켈트너 안=스퀴즈(변동성 확대 임박)." },
    donchian: { p: "돌파(브레이크아웃) 매매 기준.", d: "최근 N봉 최고가·최저가·중앙선.", h: "상단 돌파=매수·하단 돌파=매도(터틀). 중앙선은 추세 기준·추적 손절." },
    cci: { p: "평균 대비 이탈로 과열·추세 강도 측정.", d: "(전형가−이동평균)/(0.015×평균편차).", h: "+100 위=강한 상승·−100 아래=강한 하락. 0선 교차로 모멘텀 전환. 국면 반영." },
    williams: { p: "단기 과매수·과매도 포착.", d: "최근 구간 고저 대비 종가 위치(−100~0).", h: "−20 위=과매수·−80 아래=과매도. 스토캐스틱과 유사, 반전·되돌림 타이밍." },
    roc: { p: "가격 변화 속도(모멘텀)를 측정.", d: "(종가/N봉전−1)×100.", h: "0선 위=상승 모멘텀·아래=하락. 0선 교차·기울기로 가속/둔화 판단." },
    ao: { p: "중기 대비 단기 모멘텀의 힘.", d: "SMA(중앙값,5)−SMA(중앙값,34) 히스토그램.", h: "0선 위=상승 우위. 0선 교차·색 전환·새서(3봉 반전)로 진입." },
    aroon: { p: "추세의 방향과 신선도(경과) 측정.", d: "신고가·신저가 이후 경과봉으로 Up·Down(0~100).", h: "Up 높고 Down 낮음=상승추세. Up−Down 오실레이터로 추세 강도·전환." },
    mfi: { p: "거래량 가중 자금 유입·이탈 측정.", d: "전형가×거래량 기반 자금흐름지수(0~100).", h: "80+ 과열·20- 과매도. 50 위=자금 유입. 실거래량 있을 때 유효." },
    cmf: { p: "매집·분산(자금 흐름 방향) 판단.", d: "봉 내 종가 위치×거래량 누적 비율.", h: ">0=매집(자금 유입)·<0=분산. 가격과 다이버전스로 추세 신뢰도. 실거래량 필요." },
  };
  const EV_LABEL = { ma: "이동평균", trend: "추세선(다각도)", fib: "피보나치", elliott: "엘리어트", rsi: "RSI", phasefold: "주기", volume: "거래량", bollinger: "볼린저밴드", macd: "MACD", adx: "ADX 추세강도", volumeprofile: "볼륨 프로파일(매물대)", ichimoku: "일목균형표", structure: "시장구조(BOS/CHoCH)", atr: "ATR 변동성", smc: "스마트머니(FVG·OB)", cycle: "사이클(주기 위상)", vwap: "VWAP(거래량가중)", supertrend: "슈퍼트렌드", stochastic: "스토캐스틱", pivot: "피벗 포인트(S/R)", gann: "Gann 각도", psar: "Parabolic SAR(추세전환)", keltner: "Keltner 채널(ATR 밴드)", donchian: "Donchian 채널(N봉 돌파)", cci: "CCI(상품채널지수)", williams: "Williams %R", roc: "ROC/모멘텀", ao: "Awesome Oscillator", aroon: "Aroon", mfi: "MFI(자금흐름지수)", cmf: "CMF(자금흐름·매집분산)", pattern: "차트 패턴(H&S·깃발)" };
  function evIndicatorNodes() {
    const order = ["ma", "trend", "fib", "elliott", "rsi", "bollinger", "macd", "adx", "volumeprofile", "ichimoku", "structure", "atr", "smc", "pattern", "cycle", "vwap", "supertrend", "stochastic", "pivot", "gann", "psar", "keltner", "donchian", "cci", "williams", "roc", "ao", "aroon", "mfi", "cmf", "phasefold", "volume"];
    return boardState.nodes.filter(n => n.kind === "block" && order.includes(n.blockType))
      .sort((a, b) => order.indexOf(a.blockType) - order.indexOf(b.blockType));
  }
  function toggleLabelMode() { _labelMode = _labelMode === "key" ? "all" : "key"; const b = document.getElementById("lblChk"); if (b) b.classList.toggle("on", _labelMode === "all"); drawEvidence(); }   // 체크=전체(all)·미체크=핵심만(key, 기본)
  function _toggleEvOpt(e) { if (e) e.stopPropagation(); const p = document.getElementById("evOptPop"); if (p) p.classList.toggle("open"); }
  document.addEventListener("click", function (e) { const p = document.getElementById("evOptPop"); if (p && p.classList.contains("open") && !e.target.closest(".ev-split")) p.classList.remove("open"); });
  function toggleEvidence() {
    _evidenceShow = !_evidenceShow;
    document.body.classList.toggle("evhide", !_evidenceShow);
    const b = document.getElementById("evToggle"); if (b) b.classList.toggle("on", _evidenceShow);
  }
  /* ── 지표별 bias 기여 가중치 튜닝 모달 ── */
  const TUNE_TYPES = [["trend", "추세선"], ["ma", "이동평균"], ["fib", "피보나치"], ["elliott", "엘리어트"], ["rsi", "RSI"], ["bollinger", "볼린저밴드"], ["macd", "MACD"], ["adx", "ADX"], ["volume", "거래량"], ["volumeprofile", "볼륨 프로파일"], ["ichimoku", "일목균형표"], ["structure", "시장구조"], ["atr", "ATR 변동성"], ["smc", "스마트머니"], ["pattern", "차트 패턴"], ["cycle", "사이클"], ["vwap", "VWAP"], ["supertrend", "슈퍼트렌드"], ["stochastic", "스토캐스틱"], ["pivot", "피벗 포인트"], ["gann", "Gann 각도"], ["psar", "Parabolic SAR"], ["keltner", "Keltner 채널"], ["donchian", "Donchian 채널"], ["cci", "CCI"], ["williams", "Williams %R"], ["roc", "ROC/모멘텀"], ["ao", "Awesome Oscillator"], ["aroon", "Aroon"], ["mfi", "MFI"], ["cmf", "CMF"]];
  let _tuneRunT = null;
  function _tw(t) { return (typeof _driftW[t] === "number" && isFinite(_driftW[t])) ? _driftW[t] : 1; }
  function toggleTunePop() {
    const ex = document.getElementById("tuneModal"); if (ex) { ex.remove(); return; }
    const m = document.createElement("div"); m.id = "tuneModal"; m.className = "tune-modal";
    // 이 포지에 추가된 지표만 — 도구별 하나의 가중치(0~3×)로 일원화
    const added = TUNE_TYPES.filter(([t]) => boardState.nodes.some(n => n.kind === "block" && n.blockType === t));
    const rows = added.map(([t, label]) => { const v = _tw(t); return `<div class="tune-row"><span class="tune-lbl" style="border-left:3px solid ${EV_COLORS[t] || "#8a92b2"};padding-left:8px">${label}</span><input type="range" min="0" max="3" step="0.05" value="${v}" data-tw="${t}"><span class="tune-val" data-tv="${t}">${Math.round(v * 100)}%</span></div>`; }).join("");
    m.innerHTML = `<div class="tune-box"><div class="tune-head">지표 가중치 <button class="tune-x" onclick="toggleTunePop()" aria-label="닫기">✕</button></div>
      <div class="tune-hint">각 지표가 <b>예측·시그널</b>에 얼마나 반영될지 조절합니다. <b>0%</b>=무시 · <b>100%</b>=기본 · <b>300%</b>=최대. (레일 바 클릭·드래그와 동기화)</div>
      <div class="tune-list">${rows || '<div class="na-empty" style="padding:14px 4px;color:var(--eth)">사이드바 블록 도구로 지표를 추가하세요</div>'}</div>
      <div class="tune-foot"><button class="tune-reset" onclick="resetTune()">기본값(100%)</button><button class="tune-save" onclick="_saveTuneWeights()">저장</button></div></div>`;
    document.body.appendChild(m);
    m.addEventListener("pointerdown", e => { m._downBg = (e.target === m); });   // 배경에서 눌러 시작했을 때만 닫기(드래그 종료로 닫힘 방지)
    m.addEventListener("click", e => { if (e.target === m && m._downBg) toggleTunePop(); });
    m.addEventListener("input", e => {
      const t = e.target.getAttribute("data-tw"); if (!t) return;
      const v = +e.target.value; _driftW[t] = v;
      // 통합: 이 지표 노드의 중요도(n.weight)도 함께 스케일 → 예측 콘·시그널 양쪽에 하나의 가중치로 반영(0×→0, 1×→50, 3×→150)
      boardState.nodes.forEach(n => { if (n.kind === "block" && n.blockType === t) n.weight = Math.round(50 * v); });
      const lab = m.querySelector(`[data-tv="${t}"]`); if (lab) lab.textContent = Math.round(v * 100) + "%";
      if (typeof renderIndRail === "function") renderIndRail();
      saveDriftW(); markDirty(); clearTimeout(_tuneRunT); _tuneRunT = setTimeout(() => runForge(), 180);
    });
  }
  function resetTune() {
    _driftW = {}; saveDriftW();
    boardState.nodes.forEach(n => { if (n.kind === "block") n.weight = 50; });
    const m = document.getElementById("tuneModal");
    if (m) m.querySelectorAll("[data-tw]").forEach(sl => { sl.value = 1; const t = sl.getAttribute("data-tw"); const lab = m.querySelector(`[data-tv="${t}"]`); if (lab) lab.textContent = "100%"; });
    if (typeof renderIndRail === "function") renderIndRail();
    runForge();
  }
  function updateTuneBtn() { const b = document.getElementById("tuneBtn"); if (b) b.classList.toggle("on", TUNE_TYPES.some(([t]) => _tw(t) !== 1)); }

  /* ── 리스크 진단 (메타 도구) ── */
  let _riskPref = (function () { try { return JSON.parse(localStorage.getItem("scoopforge_risk") || "{}") || {}; } catch (e) { return {}; } })();
  let _riskDir = "long";
  let _riskProfile = "base";   // 보수/기본/공격 — 손절·목표 자동 산출 프로필
  let _riskLevels = null;      // {entry, stop, target, dir} — 차트 오버레이용
  let _riskShowChart = _riskPref.showChart !== false;   // 기본 표시
  let _riskRepaintT = null;
  function _riskRepaint() { clearTimeout(_riskRepaintT); _riskRepaintT = setTimeout(() => { try { if (typeof hasRealSeries === "function" && hasRealSeries() && typeof lastResult !== "undefined" && lastResult) renderChart(lastResult, currentData()); } catch (e) {} }, 90); }
  // 천단위 쉼표 유틸(정수부만 그룹핑, 소수·음수 보존)
  const _grp = s => String(s).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  function _nfc(x) { if (x == null || !isFinite(x)) return ""; const neg = x < 0, r = Math.round(Math.abs(x) * 1e4) / 1e4; const p = String(r).split("."); return (neg ? "-" : "") + _grp(p[0]) + (p[1] ? "." + p[1] : ""); }   // 정수부 쉼표 + 소수 보존(최대 4자리)
  const _unComma = v => Number(String(v).replace(/,/g, ""));
  // 입력 중 실시간 쉼표 포맷 + 커서 보존(자릿수 기준)
  function _commaInput(e) {
    const el = e.target, v = el.value, selEnd = el.selectionStart || 0, neg = /^\s*-/.test(v);
    const cleaned = v.replace(/[^\d.]/g, ""), dot = cleaned.indexOf(".");
    let intp = (dot >= 0 ? cleaned.slice(0, dot) : cleaned).replace(/^0+(?=\d)/, "");
    const decp = dot >= 0 ? cleaned.slice(dot + 1).replace(/[^\d]/g, "") : null;
    const out = (neg ? "-" : "") + _grp(intp || (decp != null ? "0" : "")) + (decp != null ? "." + decp : "");
    const digitsBefore = v.slice(0, selEnd).replace(/[^\d]/g, "").length;
    el.value = out;
    let pos = 0, seen = 0; while (pos < out.length && seen < digitsBefore) { if (/\d/.test(out[pos])) seen++; pos++; }
    try { el.setSelectionRange(pos, pos); } catch (x) {}
  }
  // 엔진 근거 데이터(진입·손절 후보·변동성·국면) 수집
  function _riskCtx() {
    const v = (typeof lastResult !== "undefined" && lastResult) ? lastResult.verdict : null;
    const p = (typeof lastResult !== "undefined" && lastResult) ? lastResult.prediction : null;
    const data = (typeof currentData === "function") ? currentData() : null;
    const price = (data && data.price) || [];
    const cur = price.length ? price[price.length - 1] : null;
    let atr = null; try { atr = ForgeCore.analyzeATR(price, { period: 14, mult: 2 }); } catch (e) {}
    return { v, p, price, cur, atr, ctx: v && v.context };
  }
  // 스마트 손절/목표 3프리셋(보수/기본/공격) — 콘·ATR·구조 근거, 방향별
  function _riskPresets() {
    const { v, p, atr, cur } = _riskCtx();
    const entry = (p && isFinite(p.anchor)) ? p.anchor : cur;
    if (entry == null || !isFinite(entry)) return null;
    const a = (atr && isFinite(atr.atr) && atr.atr > 0) ? atr.atr : entry * 0.02;
    const coneLo = (p && p.lo && p.lo.length) ? p.lo[p.lo.length - 1] : null;
    const coneHi = (p && p.hi && p.hi.length) ? p.hi[p.hi.length - 1] : null;
    const tgt = (v && isFinite(v.target)) ? v.target : entry * 1.1;
    const inval = (v && isFinite(v.invalidation)) ? v.invalidation : null;
    const long = _riskDir === "long";
    return {
      entry,
      aggressive: { stop: long ? entry - 1.5 * a : entry + 1.5 * a, target: tgt },
      base: { stop: inval != null ? inval : (long ? entry - 2 * a : entry + 2 * a), target: tgt },
      conservative: {
        stop: long ? (coneLo != null ? Math.min(coneLo, entry - 3 * a) : entry - 3 * a) : (coneHi != null ? Math.max(coneHi, entry + 3 * a) : entry + 3 * a),
        target: long ? (coneHi != null ? coneHi : tgt) : (coneLo != null ? coneLo : tgt),
      },
    };
  }
  // 백테스트 근거 리스크 등급 + 근거
  function _riskGrade(RR, lev) {
    const { ctx, atr } = _riskCtx();
    const long = _riskDir === "long", reasons = []; let score = 0;
    const opp = ctx && ctx.opportunity;
    if (opp && opp.kind === "buy" && long) { score -= 2; reasons.push(["good", "검증된 지지반등 자리 — 백테스트 승률 57%"]); }
    const st = ctx && ctx.state, rel = ctx && ctx.reliability;
    if (st === "up") { if (long) { score -= 1; reasons.push(["good", "상승추세 순응(롱)"]); } else { score += 2; reasons.push(["bad", "상승추세에 숏 — 역추세 진입"]); } }
    else if (st === "down") { if (!long) { score -= 1; reasons.push(["good", "하락추세 순응(숏)"]); } else { score += 2; reasons.push(["bad", "하락추세에 롱 — 떨어지는 칼"]); } }
    else if (st === "range") { reasons.push(["warn", "횡보장 — 방향보다 지지/저항 레벨 중심"]); }
    if (rel === "low") { score += 1; reasons.push(["warn", "추세 강함 — 엔진 방향 신호 신뢰 낮음(추세 순응 권장)"]); }
    if (RR >= 2) { score -= 1; reasons.push(["good", "손익비 " + RR.toFixed(1) + " 양호(2:1↑)"]); }
    else if (RR > 0 && RR < 1) { score += 2; reasons.push(["bad", "손익비 " + RR.toFixed(1) + " — 위험이 보상보다 큼"]); }
    else if (RR >= 1) { reasons.push(["warn", "손익비 " + RR.toFixed(1) + " 보통"]); }
    const atrPct = atr && isFinite(atr.pct) ? atr.pct : null;
    if (atrPct != null && atrPct > 4) { score += 1; reasons.push(["warn", "고변동성(ATR " + atrPct.toFixed(1) + "%) — 손절 여유 필요"]); }
    if (lev > 2) { score += 1; reasons.push(["warn", "레버리지 " + lev.toFixed(1) + "× 필요 — 과도 주의"]); }
    const grade = score >= 2 ? ["높음", "bad"] : score <= -2 ? ["낮음", "good"] : ["보통", "warn"];
    return { grade, reasons: reasons.slice(0, 4) };
  }
  // 기대값·켈리(검증된 신호일 때만 승률 근거)
  function _riskEV(RR) {
    const { ctx } = _riskCtx();
    const opp = ctx && ctx.opportunity, long = _riskDir === "long";
    const validated = !!(opp && opp.kind === "buy" && long);
    if (!validated || !(RR > 0)) return { validated: false };
    const pWin = 0.574;
    const ev = pWin * RR - (1 - pWin);            // 기대값(R 단위)
    const kelly = pWin - (1 - pWin) / RR;         // 켈리 비율(자본 대비)
    return { validated: true, pWin, ev, kelly, halfK: Math.max(0, kelly / 2) };
  }
  // 차트 오버레이: 진입/손절/목표 라인 + 손실·이익 영역
  function _drawRiskLevels(c, geo) {
    if (!_riskLevels || !_riskShowChart) return;
    const { entry, stop, target } = _riskLevels;
    if (![entry, stop, target].every(isFinite)) return;
    const { toY, padX, plotW, padTop, padBot, ch } = geo;
    const x0 = padX, x1 = padX + plotW, plotBot = ch - padBot;
    const cl = y => Math.max(padTop, Math.min(plotBot, y));
    const yE = cl(toY(entry)), yS = cl(toY(stop)), yT = cl(toY(target));
    c.save();
    c.globalAlpha = .07;
    c.fillStyle = FC_BEAR; c.fillRect(x0, Math.min(yE, yS), x1 - x0, Math.abs(yS - yE));
    c.fillStyle = FC_BULL; c.fillRect(x0, Math.min(yE, yT), x1 - x0, Math.abs(yT - yE));
    c.globalAlpha = 1;
    const line = (v, y, col, lab) => {
      c.strokeStyle = col; c.lineWidth = 1.1; c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); c.setLineDash([]);
      c.font = "700 10px Pretendard,'Malgun Gothic',system-ui,sans-serif";
      const t = lab + " " + _hzFmt(v), tw = c.measureText(t).width + 12;
      c.fillStyle = col; if (c.roundRect) { c.beginPath(); c.roundRect(x1 - tw - 2, y - 8, tw, 16, 4); c.fill(); } else c.fillRect(x1 - tw - 2, y - 8, tw, 16);
      c.fillStyle = "#0b0f14"; c.textAlign = "left"; c.fillText(t, x1 - tw + 4, y + 3.5);
    };
    line(target, yT, FC_BULL, "목표");
    line(entry, yE, FC_GOLD, "진입");
    line(stop, yS, FC_BEAR, "손절");
    c.restore();
  }
  function _riskDefaults() {
    const v = lastResult && lastResult.verdict, p = lastResult && lastResult.prediction;
    const entry = (p && isFinite(p.anchor)) ? p.anchor : (v && isFinite(v.target) ? v.target : null);
    const target = (v && isFinite(v.target)) ? v.target : (entry != null ? entry * 1.1 : null);
    let stop = (v && isFinite(v.invalidation)) ? v.invalidation : null;
    const dir = (v && v.regime === "bear") ? "short" : "long";
    if (stop == null && entry != null) stop = dir === "short" ? entry * 1.05 : entry * 0.95;   // 손절 폴백 ±5%
    return { entry, stop, target, dir };
  }
  function openRiskTool() {
    const ex = document.getElementById("riskModal"); if (ex) { ex.remove(); _riskRepaint(); return; }
    const d = _riskDefaults();
    _riskDir = d.dir;
    const m = document.createElement("div"); m.id = "riskModal"; m.className = "risk-modal";
    m.innerHTML = `<div class="risk-box">
      <div class="risk-head"><span class="risk-title">리스크 진단</span>
        <span class="risk-dir ${_riskDir}" id="riskDir" title="클릭해 롱/숏 전환">${_riskDir === "short" ? "숏 ▼" : "롱 ▲"}</span>
        <button class="risk-x" onclick="openRiskTool()" aria-label="닫기">✕</button></div>
      <div class="risk-sub">분석·백테스트가 자동으로 진단합니다 — 위험 성향과 투자 금액만 정하세요.</div>
      <div class="risk-diag" id="rkDiag"></div>
      <div class="risk-sec">트레이드 셋업 <span class="risk-sec-x">손절·목표는 분석에서 자동 산출</span></div>
      <div class="risk-profiles" id="rkPresets">
        <button class="rkpf" data-preset="conservative"><b>보수적</b><span>넓은 손절</span></button>
        <button class="rkpf on" data-preset="base"><b>기본</b><span>추천</span></button>
        <button class="rkpf" data-preset="aggressive"><b>공격적</b><span>좁은 손절</span></button>
      </div>
      <div class="risk-ladder">
        <div class="rl-head">
          <span class="rl-e stop">손절 <b id="rlStopV">–</b> <span class="rl-pct" id="rlLoss">–</span></span>
          <span class="rl-rr">손익비 <b id="rrRatio">–</b></span>
          <span class="rl-e tgt">목표 <b id="rlTgtV">–</b> <span class="rl-pct" id="rlProfit">–</span></span>
        </div>
        <div class="rr-bar"><div class="rr-risk" id="rrRisk"></div><div class="rr-reward" id="rrReward"></div></div>
        <div class="rl-foot"><span class="rl-entry" id="rlEntry">진입 –</span></div>
      </div>
      <div class="risk-ev" id="rkEV" style="display:none"></div>
      <div class="risk-sec">투자 시뮬레이션 <span class="risk-sec-x">넣을 금액을 정하면 손익이 계산됩니다</span></div>
      <div class="risk-invest">
        <div class="risk-fld"><label>투자 금액</label><input type="text" inputmode="numeric" data-comma id="rkAmt" placeholder="예: 5,000,000"></div>
        <div class="ri-out">
          <div class="ri-cell"><span class="ri-k">예상 수량</span><span class="ri-v" id="rkQtyOut">–</span></div>
          <div class="ri-cell"><span class="ri-k">최대 손실</span><span class="ri-v neg" id="rkLoss">–</span></div>
          <div class="ri-cell"><span class="ri-k">기대 수익</span><span class="ri-v pos" id="rkProfit">–</span></div>
        </div>
      </div>
      <div class="risk-warn" id="rkWarn"></div>
      <label class="risk-toggle"><input type="checkbox" id="rkShow" ${_riskShowChart ? "checked" : ""}> 차트에 진입·손절·목표 라인 표시</label>
    </div>`;
    document.body.appendChild(m);
    m.addEventListener("pointerdown", e => { m._downBg = (e.target === m); });   // 배경에서 눌러 시작했을 때만 닫기(드래그 종료로 닫힘 방지)
    m.addEventListener("click", e => { if (e.target === m && m._downBg) openRiskTool(); });
    m.addEventListener("input", e => { if (e.target && e.target.hasAttribute && e.target.hasAttribute("data-comma")) _commaInput(e); computeRisk(); });
    document.getElementById("riskDir").addEventListener("click", () => { _riskDir = _riskDir === "long" ? "short" : "long"; const el = document.getElementById("riskDir"); el.className = "risk-dir " + _riskDir; el.textContent = _riskDir === "short" ? "숏 ▼" : "롱 ▲"; computeRisk(); });
    m.querySelectorAll(".rkpf").forEach(b => { b.classList.toggle("on", b.dataset.preset === _riskProfile); b.addEventListener("click", () => { m.querySelectorAll(".rkpf").forEach(x => x.classList.remove("on")); b.classList.add("on"); _riskProfile = b.dataset.preset; computeRisk(); }); });
    document.getElementById("rkShow").addEventListener("change", e => { _riskShowChart = e.target.checked; _riskPref.showChart = _riskShowChart; try { localStorage.setItem("scoopforge_risk", JSON.stringify(_riskPref)); } catch (x) {} _riskRepaint(); });
    computeRisk();
  }
  function computeRisk() {
    const set = (id, txt, cls) => { const el = document.getElementById(id); if (!el) return; el.textContent = txt; if (cls != null) el.className = cls; };
    const P = _riskPresets();
    if (!P || !isFinite(P.entry)) {
      set("rkWarn", "분석 데이터가 없습니다 — 종목을 불러와 웹분석을 먼저 실행하세요.", "risk-warn warn");
      const dd = document.getElementById("rkDiag"); if (dd) dd.style.display = "none";
      return;
    }
    const entry = P.entry, lv = P[_riskProfile] || P.base, stop = lv.stop, tgt = lv.target;
    const riskPU = Math.abs(entry - stop), rewPU = Math.abs(tgt - entry);
    const RR = riskPU > 0 ? rewPU / riskPU : 0;
    const lossPct = (riskPU > 0 && entry > 0) ? riskPU / entry * 100 : null;
    const profPct = (rewPU > 0 && entry > 0) ? rewPU / entry * 100 : null;
    // 리스크 래더(손절·목표 자동)
    const rw = (RR > 0) ? (RR / (1 + RR)) * 100 : 50;
    const rRisk = document.getElementById("rrRisk"), rRew = document.getElementById("rrReward");
    if (rRisk && rRew) { rRisk.style.width = (100 - rw) + "%"; rRew.style.width = rw + "%"; }
    set("rlStopV", _nfc(stop)); set("rlTgtV", _nfc(tgt));
    set("rrRatio", RR > 0 ? "1 : " + RR.toFixed(2) : "–");
    set("rlLoss", lossPct != null ? "−" + lossPct.toFixed(1) + "%" : "–");
    set("rlProfit", profPct != null ? "+" + profPct.toFixed(1) + "%" : "–");
    set("rlEntry", "진입 " + _nfc(entry) + " (현재가 기준)");
    // 투자 시뮬레이션 — 금액만 입력하면 수량·손익 자동
    const amtEl = document.getElementById("rkAmt"), amt = amtEl ? _unComma(amtEl.value) : NaN;
    const units = (amt > 0 && entry > 0) ? Math.floor(amt / entry) : 0;
    const fmt = x => isFinite(x) ? fmtNum(Math.round(x)) : "–";
    set("rkQtyOut", units > 0 ? _nfc(units) + "주" : "–");
    set("rkLoss", units > 0 ? "−" + fmt(units * riskPU) : (lossPct != null ? "−" + lossPct.toFixed(1) + "%" : "–"));
    set("rkProfit", units > 0 ? "+" + fmt(units * rewPU) : (profPct != null ? "+" + profPct.toFixed(1) + "%" : "–"));
    // 진단 등급
    const diag = document.getElementById("rkDiag");
    if (diag) {
      if (riskPU > 0 && rewPU > 0) {
        const G = _riskGrade(RR, 0);
        const rows = G.reasons.map(r => `<div class="rd-r rd-${r[0]}">${r[0] === "good" ? "✓" : r[0] === "bad" ? "✕" : "·"} ${r[1]}</div>`).join("");
        diag.innerHTML = `<div class="rd-head"><span class="rd-k">리스크 진단</span><span class="rd-grade rd-${G.grade[1]}">${G.grade[0]}</span></div><div class="rd-rs">${rows}</div>`;
        diag.style.display = "block";
      } else diag.style.display = "none";
    }
    // 기대값·켈리(검증된 신호 한정)
    const evEl = document.getElementById("rkEV");
    if (evEl) {
      const E = _riskEV(RR);
      if (E.validated) {
        const recPct = Math.min(E.halfK * 100 / 2, 3);   // 실전 권장 = 1/4 켈리, 최대 3%
        evEl.innerHTML = `<div class="rev-k">수학적 기대값 <span class="mut">(검증 승률 57% 가정)</span></div>`
          + `<div class="rev-row"><span>기대값</span><b class="${E.ev >= 0 ? "pos" : "neg"}">${E.ev >= 0 ? "+" : ""}${E.ev.toFixed(2)}R</b></div>`
          + `<div class="rev-row"><span>실전 권장 리스크 <span class="mut">(1/4 켈리·최대 3%)</span></span><b class="pos">${recPct.toFixed(1)}%</b></div>`
          + `<div class="rev-note">${E.ev >= 0 ? "기대값 양(+) — 반복하면 통계적 우위." : "기대값 음(−) — 다른 성향을 고르거나 재고하세요."}</div>`;
        evEl.style.display = "block";
      } else { evEl.style.display = "none"; }
    }
    // 경고
    let cls = "risk-warn warn", msg = "투자 금액을 입력하면 예상 손익이 계산됩니다.";
    if (!(riskPU > 0)) { cls = "risk-warn bad"; msg = "손절과 진입이 같습니다 — 분석을 다시 실행하세요."; }
    else if (RR < 1) { cls = "risk-warn bad"; msg = "손익비 " + RR.toFixed(2) + " — 위험이 보상보다 큽니다. 다른 성향을 고르거나 진입을 재고하세요."; }
    else if (RR >= 2) { cls = "risk-warn good"; msg = "손익비 " + RR.toFixed(2) + " — 양호(2:1 이상)."; }
    else { cls = "risk-warn warn"; msg = "손익비 " + RR.toFixed(2) + " — 보통(1~2)."; }
    set("rkWarn", msg, cls);
    // 차트 오버레이 레벨 갱신
    _riskLevels = { entry, stop, target: tgt, dir: _riskDir }; _riskRepaint();
  }

  /* ── 파라미터 최적화 서피스 (메타 도구) ── */
  const OPT_SPECS = {
    ma: { label: "이동평균", fn: (p, o) => ForgeCore.analyzeMA(p, o), params: [{ key: "len", label: "길이", lo: 5, hi: 60 }] },
    rsi: { label: "RSI", fn: (p, o) => ForgeCore.analyzeRSI(p, o), params: [{ key: "period", label: "기간", lo: 5, hi: 30 }] },
    fib: { label: "피보나치", fn: (p, o) => ForgeCore.analyzeFib(p, o), params: [{ key: "len", label: "구간", lo: 60, hi: 160 }] },
    structure: { label: "시장구조", fn: (p, o) => ForgeCore.analyzeStructure(p, o), params: [{ key: "swing", label: "스윙민감도(%)", lo: 1, hi: 8, dec: true, div: 100 }] },
    bollinger: { label: "볼린저밴드", fn: (p, o) => ForgeCore.analyzeBollinger(p, o), params: [{ key: "len", label: "기간", lo: 10, hi: 40 }, { key: "k", label: "σ배수", lo: 1, hi: 3, dec: true }] },
    macd: { label: "MACD", fn: (p, o) => ForgeCore.analyzeMACD(p, o), params: [{ key: "fast", label: "단기", lo: 5, hi: 20 }, { key: "slow", label: "장기", lo: 20, hi: 45 }], valid: (a, b) => a < b },
    adx: { label: "ADX", fn: (p, o) => ForgeCore.analyzeADX(p, o), params: [{ key: "period", label: "기간", lo: 7, hi: 30 }] }
  };
  function optRange(p, N) { const out = []; for (let i = 0; i < N; i++) { let v = p.lo + (p.hi - p.lo) * i / (N - 1); v = p.dec ? Math.round(v * 10) / 10 : Math.round(v); out.push(v); } return [...new Set(out)]; }
  function optOpts(spec, v1, v2) { const o = {}; const P = spec.params; o[P[0].key] = P[0].div ? v1 / P[0].div : v1; if (P[1] && v2 != null) o[P[1].key] = P[1].div ? v2 / P[1].div : v2; return o; }
  function backtestCombo(fn, opts, price, h, thr) {
    let hit = 0, tot = 0, edge = 0;
    for (let t = 40; t < price.length - h; t += 2) {
      let b; try { b = fn(price.slice(0, t + 1), opts).bias; } catch (e) { b = 0; }
      if (!isFinite(b) || Math.abs(b) < thr) continue;
      const fwd = (price[t + h] - price[t]) / price[t]; if (fwd === 0) continue;
      tot++; edge += Math.sign(b) * fwd; if (Math.sign(b) === Math.sign(fwd)) hit++;
    }
    return { hit: tot ? hit / tot : 0, edge: tot ? edge / tot : 0, n: tot };
  }
  function openOptTool() {
    const ex = document.getElementById("optModal"); if (ex) { ex.remove(); return; }
    const present = boardState.nodes.filter(n => n.kind === "block" && OPT_SPECS[n.blockType]).map(n => n.blockType);
    const uniq = [...new Set(present)];
    const opts = uniq.length ? uniq.map(t => `<option value="${t}">${OPT_SPECS[t].label}</option>`).join("") : Object.keys(OPT_SPECS).map(t => `<option value="${t}">${OPT_SPECS[t].label}</option>`).join("");
    const m = document.createElement("div"); m.id = "optModal"; m.className = "opt-modal";
    m.innerHTML = `<div class="opt-box">
      <div class="opt-head"><span class="opt-title">파라미터 최적화 서피스</span><button class="opt-x" onclick="openOptTool()" aria-label="닫기">✕</button></div>
      <div class="opt-sub">지표 설정을 <b>과거 데이터로 워크포워드 백테스트</b>해, 방향 <b>적중률</b>이 높은 파라미터 조합을 지형으로 보여줍니다. (봉 <span id="optH">–</span>개 앞 방향 기준)</div>
      <div class="opt-ctrls">
        <div class="opt-fld"><label>지표</label><select id="optSel">${opts}</select></div>
        <button class="opt-run" id="optRun" onclick="runOptimize()">최적화 실행</button>
      </div>
      <div class="opt-result" id="optResult"><div class="opt-empty">지표를 고르고 <b>최적화 실행</b>을 누르세요.</div></div>
    </div>`;
    document.body.appendChild(m);
    m.addEventListener("pointerdown", e => { m._downBg = (e.target === m); });   // 배경에서 눌러 시작했을 때만 닫기(드래그 종료로 닫힘 방지)
    m.addEventListener("click", e => { if (e.target === m && m._downBg) openOptTool(); });
    const h = Math.max(3, Math.round(visionFutW() / 3)); const he = document.getElementById("optH"); if (he) he.textContent = h;
  }
  function runOptimize() {
    const sel = document.getElementById("optSel"); if (!sel) return;
    const type = sel.value, spec = OPT_SPECS[type];
    const price = (currentData().price || []).map(Number).filter(isFinite);
    const res = document.getElementById("optResult");
    if (price.length < 70) { res.innerHTML = `<div class="opt-empty">데이터가 부족합니다(70봉 이상 필요, 현재 ${price.length}). 티커를 불러오거나 종가를 더 붙여넣으세요.</div>`; return; }
    res.innerHTML = `<div class="opt-busy">⏳ 백테스트 중… 조합 계산</div>`;
    const btn = document.getElementById("optRun"); if (btn) btn.disabled = true;
    setTimeout(() => {
      try {
        const h = Math.max(3, Math.round(visionFutW() / 3)), thr = 0.05;
        const P = spec.params, v1s = optRange(P[0], 11), v2s = P[1] ? optRange(P[1], 9) : [null];
        const grid = []; let best = null;
        for (const v1 of v1s) for (const v2 of v2s) {
          if (spec.valid && v2 != null && !spec.valid(v1, v2)) { grid.push({ v1, v2, score: NaN, n: 0 }); continue; }
          const r = backtestCombo(spec.fn, optOpts(spec, v1, v2), price, h, thr);
          const cell = { v1, v2, score: r.hit, edge: r.edge, n: r.n };
          grid.push(cell);
          if (r.n >= 5 && (!best || cell.score > best.score)) best = cell;
        }
        // 현재 노드 파라미터 기준선
        const node = boardState.nodes.find(n => n.kind === "block" && n.blockType === type);
        let curScore = null;
        if (node) { const cv1 = (node.params && node.params[P[0].key]) ?? P[0].lo, cv2 = P[1] ? ((node.params && node.params[P[1].key]) ?? P[1].lo) : null; curScore = backtestCombo(spec.fn, optOpts(spec, cv1, cv2), price, h, thr).hit; }
        renderOptResult(type, spec, v1s, v2s, grid, best, curScore);
      } catch (e) { res.innerHTML = `<div class="opt-empty">최적화 오류: ${esc(String(e && e.message || e))}</div>`; }
      if (btn) btn.disabled = false;
    }, 40);
  }
  let _optBest = null, _optType = null;
  function renderOptResult(type, spec, v1s, v2s, grid, best, curScore) {
    _optBest = best; _optType = type;
    const P = spec.params, is2D = !!P[1];
    const res = document.getElementById("optResult");
    if (!best) { res.innerHTML = `<div class="opt-empty">유효한 신호가 부족해 최적값을 찾지 못했습니다. 다른 지표나 더 긴 데이터로 시도하세요.</div>`; return; }
    const bestTxt = is2D
      ? `<b>${P[0].label} ${best.v1}</b> · <b>${P[1].label} ${best.v2}</b>`
      : `<b>${P[0].label} ${best.v1}</b>`;
    const cur = (curScore != null) ? `<div class="ob-cur">현재 설정 적중률 ${Math.round(curScore * 100)}%</div>` : "";
    res.innerHTML = `<div class="opt-canvas-wrap"><canvas id="optSurface" width="1040" height="${is2D ? 460 : 300}"></canvas></div>
      <div class="opt-legend"><span>낮음(적중↓)</span><span class="bar"></span><span>높음(적중↑)</span></div>
      <div class="opt-best"><div class="ob-txt">최적 조합 ${bestTxt} → 적중률 <b>${Math.round(best.score * 100)}%</b> · 표본 ${best.n}${cur}<div class="ob-cur">지형의 <b>칸을 클릭</b>하면 최적값이 아닌 그 값으로도 적용됩니다</div></div>
        <button class="opt-apply" onclick="applyOptBest()">최적값 적용</button></div>`;
    const _sf = document.getElementById("optSurface");
    drawOptSurface(_sf, spec, v1s, v2s, grid, best);
    if (_sf) { _sf.style.cursor = "pointer"; _sf.onclick = e => onOptSurfaceClick(_sf, e); }
  }
  function _optColor(s, mn, mx) { // 그리드 자체 min~max에 적응(상대 지형) → 적~회~녹
    if (!isFinite(s)) return "#161d26";
    const t = (mx > mn) ? Math.max(0, Math.min(1, (s - mn) / (mx - mn))) : 0.5;
    const lo = [224, 106, 106], mi = [122, 130, 143], hi = [70, 194, 142];
    const mix = (a, b, u) => a.map((x, i) => Math.round(x + (b[i] - x) * u));
    const c = t < 0.5 ? mix(lo, mi, t * 2) : mix(mi, hi, (t - 0.5) * 2);
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  function drawOptSurface(cv, spec, v1s, v2s, grid, best) {
    if (!cv) return; const c = cv.getContext("2d"); const W = cv.width, H = cv.height;
    c.clearRect(0, 0, W, H); c.font = "13px Pretendard,'Malgun Gothic',sans-serif";
    const P = spec.params, is2D = !!P[1];
    const scores = grid.filter(g => isFinite(g.score) && g.n >= 5).map(g => g.score);
    const mn = scores.length ? Math.min(...scores) : 0, mx = scores.length ? Math.max(...scores) : 1;
    const padL = 64, padB = 40, padT = 14, padR = 16;
    const gx = padL, gy = padT, gw = W - padL - padR, gh = H - padT - padB;
    const at = (v1, v2) => grid.find(c2 => c2.v1 === v1 && (v2 == null || c2.v2 === v2));
    cv._optGeo = { is2D, gx, gy, gw, gh, v1s, v2s, cw: is2D ? gw / v2s.length : 0, chc: is2D ? gh / v1s.length : 0, bw: is2D ? 0 : gw / v1s.length };
    if (is2D) {
      const cols = v2s.length, rows = v1s.length, cw = gw / cols, ch = gh / rows;
      for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
        const cell = at(v1s[r], v2s[col]); const x = gx + col * cw, y = gy + r * ch;
        c.fillStyle = _optColor(cell ? cell.score : NaN, mn, mx); c.fillRect(x + 1, y + 1, cw - 1, ch - 1);
        if (best && cell && cell.v1 === best.v1 && cell.v2 === best.v2) { c.strokeStyle = FC_GOLD; c.lineWidth = 2.5; c.strokeRect(x + 1.5, y + 1.5, cw - 2, ch - 2); c.fillStyle = "#1a1206"; c.font = "bold 15px Pretendard"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("★", x + cw / 2, y + ch / 2); c.font = "13px Pretendard,'Malgun Gothic',sans-serif"; }
      }
      c.fillStyle = "rgba(138,146,178,.9)"; c.textAlign = "center"; c.textBaseline = "top";
      for (let col = 0; col < cols; col++) c.fillText(String(v2s[col]), gx + col * cw + cw / 2, gy + gh + 7);
      c.textAlign = "right"; c.textBaseline = "middle";
      for (let r = 0; r < rows; r++) c.fillText(String(v1s[r]), gx - 8, gy + r * ch + ch / 2);
      c.fillStyle = "rgba(224,229,239,.85)"; c.textAlign = "center"; c.textBaseline = "top"; c.fillText(P[1].label, gx + gw / 2, H - 18);
      c.save(); c.translate(16, gy + gh / 2); c.rotate(-Math.PI / 2); c.textAlign = "center"; c.fillText(P[0].label, 0, 0); c.restore();
    } else {
      // 1D: 적중률 프로파일(막대)
      const n = v1s.length, bw = gw / n, base = gy + gh;
      for (let i = 0; i < n; i++) { const cell = at(v1s[i], null); const s = cell ? cell.score : 0; const bh = gh * Math.max(0, Math.min(1, s)); const x = gx + i * bw; c.fillStyle = _optColor(s, mn, mx); c.fillRect(x + 3, base - bh, bw - 6, bh); if (best && cell && cell.v1 === best.v1) { c.strokeStyle = FC_GOLD; c.lineWidth = 2; c.strokeRect(x + 2, base - bh, bw - 4, bh); c.fillStyle = FC_GOLD; c.font = "bold 14px Pretendard"; c.textAlign = "center"; c.fillText("★", x + bw / 2, base - bh - 8); c.font = "13px Pretendard,'Malgun Gothic',sans-serif"; } }
      c.strokeStyle = "rgba(138,146,178,.3)"; c.lineWidth = 1; const y50 = base - gh * 0.5; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(gx, y50); c.lineTo(gx + gw, y50); c.stroke(); c.setLineDash([]);
      c.fillStyle = "rgba(138,146,178,.7)"; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText("50%", gx + gw - 30, y50 - 8);
      c.fillStyle = "rgba(138,146,178,.9)"; c.textAlign = "center"; c.textBaseline = "top";
      for (let i = 0; i < n; i++) c.fillText(String(v1s[i]), gx + i * bw + bw / 2, base + 7);
      c.fillStyle = "rgba(224,229,239,.85)"; c.fillText(P[0].label, gx + gw / 2, H - 18);
    }
  }
  function applyOptValue(v1, v2, tag) {
    if (!_optType) return;
    const spec = OPT_SPECS[_optType], node = boardState.nodes.find(n => n.kind === "block" && n.blockType === _optType);
    if (!node) { bToast("해당 지표 블록이 보드에 없습니다"); return; }
    node.params = node.params || {};
    node.params[spec.params[0].key] = v1;
    if (spec.params[1] && v2 != null) node.params[spec.params[1].key] = v2;
    fireBoardChange(); runForge();
    if (sel.length === 1 && sel[0] === node.id) renderParams();
    const lbl = spec.params[0].label + " " + v1 + (spec.params[1] && v2 != null ? " · " + spec.params[1].label + " " + v2 : "");
    bToast(spec.label + " " + (tag || lbl) + " 적용 · 재분석");
    openOptTool();
  }
  function applyOptBest() { if (_optBest && _optType) applyOptValue(_optBest.v1, _optBest.v2, "최적값"); }
  // 서피스 칸 클릭 → 그 값으로 적용(사용자가 최적값 외 다른 값 직접 선택)
  function onOptSurfaceClick(cv, e) {
    const g = cv && cv._optGeo; if (!g) return;
    const r = cv.getBoundingClientRect();
    const sx = (e.clientX - r.left) * (cv.width / r.width), sy = (e.clientY - r.top) * (cv.height / r.height);
    if (g.is2D) {
      const col = Math.floor((sx - g.gx) / g.cw), row = Math.floor((sy - g.gy) / g.chc);
      if (col < 0 || row < 0 || col >= g.v2s.length || row >= g.v1s.length) return;
      applyOptValue(g.v1s[row], g.v2s[col]);
    } else {
      const i = Math.floor((sx - g.gx) / g.bw);
      if (i < 0 || i >= g.v1s.length) return;
      applyOptValue(g.v1s[i], null);
    }
  }
  function updateAxisBtns() {
    // A는 상태 토글이 아니라 매번 동작하는 액션 버튼(눌린 것처럼 보여 안 눌리는 오해 방지). L만 토글 상태.
    const l = document.getElementById("logBtn"); if (l) l.classList.toggle("on", _logChart);
  }
  function toggleLogChart() {
    _logChart = !_logChart;
    updateAxisBtns();
    if (hasRealSeries() && lastResult) renderChart(lastResult, currentData());
    markDirty();
  }
  function _linreg(arr) {
    const n = arr.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += arr[i]; sxx += i * i; sxy += i * arr[i]; }
    const d = (n * sxx - sx * sx) || 1, a = (n * sxy - sx * sy) / d; return { a, b: (sy - a * sx) / n };
  }
  /* 작도용 재계산 헬퍼 — 표시 시계열(price)에서 직접 산출(lastResult 의존 제거 → 항상 정합) */
  function _sma(arr, len) {
    const n = arr.length, out = new Array(n); let sum = 0;
    for (let i = 0; i < n; i++) { sum += arr[i]; if (i >= len) sum -= arr[i - len]; out[i] = i >= len - 1 ? sum / len : sum / (i + 1); }
    return out;
  }
  /* RSI 전체 시계열(Wilder 평활) — 다이버전스 판정용 */
  function _zigzag(price, minPct) {
    minPct = minPct || 0.18; const n = price.length; if (n < 3) return [];
    const piv = []; let extI = 0, extP = price[0], dir = 0;
    for (let i = 1; i < n; i++) {
      const p = price[i];
      if (dir === 0) { if (p > extP * (1 + minPct)) { dir = 1; extI = i; extP = p; } else if (p < extP * (1 - minPct)) { dir = -1; extI = i; extP = p; } else if (p > extP) { extP = p; extI = i; } }
      else if (dir === 1) { if (p > extP) { extP = p; extI = i; } else if (p < extP * (1 - minPct)) { piv.push({ i: extI, p: extP }); dir = -1; extP = p; extI = i; } }
      else { if (p < extP) { extP = p; extI = i; } else if (p > extP * (1 + minPct)) { piv.push({ i: extI, p: extP }); dir = 1; extP = p; extI = i; } }
    }
    piv.push({ i: extI, p: extP });
    return piv;
  }
  const _EWLAB = ["1", "2", "3", "4", "5", "A", "B", "C"];
  let _evW = 0, _evH = 0;   // 현재 작도 캔버스 논리 크기(라벨 클램프용)
  // 라벨: 반투명 pill 배경 + 경계 클램프. align "left"(기본)|"right"
  function _evLabel(c, text, x, y, color, align) {
    if (_labelMode === "key" && !_KEYLBL.test(text)) return;   // 중요 라벨만 모드: 목표·반대·지지/저항 외 생략
    c.font = "600 11px Pretendard, ui-monospace, monospace";
    try { c.letterSpacing = "-0.2px"; } catch (_) {}
    const w = c.measureText(text).width, h = 14, M = 3, pad = 5;
    let bx = (align === "right") ? x - w - pad : x;          // 박스 좌상 x
    bx = Math.max(M, Math.min(bx, (_evW || 1e4) - w - 2 * pad - M));
    let by = y - h;                                          // 박스 좌상 y(텍스트 baseline 위)
    by = Math.max(M, Math.min(by, (_evH || 1e4) - h - M));
    const bw = w + 2 * pad, bh = h + 2;
    // 겹침 회피: 충돌하면 아래/위로 밀어 빈 슬롯 탐색(라벨이 사라지지 않고 계단식으로 정렬). 정말 못 놓으면 생략.
    const _ov = yy => _evLabelBoxes.some(r => bx < r.x + r.w && bx + bw > r.x && yy < r.y + r.h && yy + bh > r.y);
    if (_ov(by)) {
      let ok = false;
      for (let stp = 1; stp <= 18 && !ok; stp++) {
        for (const dr of [1, -1]) {
          const ny = by + dr * stp * (bh + 1);
          if (ny >= M && ny <= (_evH || 1e4) - bh - M && !_ov(ny)) { by = ny; ok = true; break; }
        }
      }
      if (!ok) return;
    }
    _evLabelBoxes.push({ x: bx, y: by, w: bw, h: bh });
    c.fillStyle = "rgba(11,15,20,.74)";
    if (c.roundRect) { c.beginPath(); c.roundRect(bx, by, w + 2 * pad, h + 2, 4); c.fill(); }
    else c.fillRect(bx, by, w + 2 * pad, h + 2);
    c.fillStyle = color; c.textAlign = "left";
    c.fillText(text, bx + pad, by + h - 1);
    try { c.letterSpacing = "0px"; } catch (_) {}   // 공유 컨텍스트 오염 방지(다른 텍스트에 안 번지게)
  }
  function _evLegend(c, x0, topY, items) {
    if (typeof window !== "undefined" && window.innerWidth > 860) { _legendHits = []; return; }   // 데스크톱=지표 레일이 대체(범례 숨김) · 모바일 유지
    _legendHits = [];
    const px = x0, py = topY + 8;
    c.textAlign = "left"; c.textBaseline = "alphabetic";
    if (_legendCollapsed) {   // 접힘: 작은 '범례 ▸' 알약만
      c.font = "10px Pretendard,'Malgun Gothic',system-ui,sans-serif";
      const label = "☰ 범례 ▸", w = c.measureText(label).width + 16, h = 20;
      c.fillStyle = "rgba(11,15,20,.82)";
      if (c.roundRect) { c.beginPath(); c.roundRect(px, py, w, h, 6); c.fill(); } else c.fillRect(px, py, w, h);
      c.fillStyle = "rgba(224,229,239,.9)"; c.fillText(label, px + 8, py + 14);
      _legendHits.push({ x: px, y: py, w: w, h: h, key: "__toggle__" });
      return;
    }
    const focus = _evHover || _focusInd;
    const allVis = items.length && items.every(it => _evVisible.has(it._key));
    const rows = [{ col: "#8a92b2", t: allVis ? "전체 표시" : "전체 표시(클릭)", key: null }].concat(items.map(it => ({ col: it.col, t: it.t, key: it._key })));
    const _gc = ((getComputedStyle(document.documentElement).getPropertyValue("--gold") || "").trim()) || FC_GOLD;
    const hint = "클릭=표시 토글 · 더블클릭=단독 · 전체표시=모두";
    c.font = "9.5px Pretendard,'Malgun Gothic',system-ui,sans-serif"; let maxW = c.measureText(hint).width;
    c.font = "11.5px Pretendard,'Malgun Gothic',system-ui,sans-serif"; for (const it of rows) maxW = Math.max(maxW, c.measureText(it.t).width);
    const panelW = 28 + maxW + 12, panelH = rows.length * 23 + 30;
    c.fillStyle = "rgba(11,15,20,.82)";
    if (c.roundRect) { c.beginPath(); c.roundRect(px, py, panelW, panelH, 7); c.fill(); } else c.fillRect(px, py, panelW, panelH);
    // 접기 토글(우상단 −)
    const tbW = 17, tbX = px + panelW - tbW - 4, tbY = py + 4;
    c.fillStyle = "rgba(138,146,178,.2)"; if (c.roundRect) { c.beginPath(); c.roundRect(tbX, tbY, tbW, 15, 4); c.fill(); } else c.fillRect(tbX, tbY, tbW, 15);
    c.fillStyle = "rgba(224,229,239,.9)"; c.textAlign = "center"; c.fillText("−", tbX + tbW / 2, tbY + 12); c.textAlign = "left";
    _legendHits.push({ x: tbX, y: tbY, w: tbW, h: 15, key: "__toggle__" });
    c.fillStyle = "rgba(138,146,178,.75)"; c.font = "9.5px Pretendard,'Malgun Gothic',system-ui,sans-serif"; c.fillText(hint, px + 9, py + 13);
    c.font = "11.5px Pretendard,'Malgun Gothic',system-ui,sans-serif";
    let y = py + 32;
    for (const it of rows) {
      const isAll = it.key === null;
      const visible = isAll ? true : _evVisible.has(it.key);
      const active = focus ? (it.key === focus) : false;                 // 선택/포커스 대상
      const dim = focus ? !active : !visible;
      if (active) {   // 선택된 도구 = 명확한 선택 표시(테마 액센트 보더+텍스트)
        c.fillStyle = "rgba(255,255,255,.1)"; c.fillRect(px + 4, y - 6, panelW - 8, 22);
        c.strokeStyle = _gc; c.lineWidth = 1.2; c.strokeRect(px + 4.5, y - 5.5, panelW - 9, 21);
      }
      c.globalAlpha = active ? 1 : dim ? 0.3 : 1;
      c.fillStyle = it.col; c.fillRect(px + 10, y + 1, 12, 12);
      c.fillStyle = active ? _gc : "rgba(224,229,239,.95)";
      if (active) c.font = "700 11.5px Pretendard,'Malgun Gothic',system-ui,sans-serif";
      c.fillText(it.t, px + 28, y + 11);
      if (active) c.font = "11.5px Pretendard,'Malgun Gothic',system-ui,sans-serif";
      if (!isAll && !visible && !focus) { c.strokeStyle = "rgba(224,229,239,.6)"; c.lineWidth = 1; c.beginPath(); c.moveTo(px + 28, y + 6); c.lineTo(px + 28 + c.measureText(it.t).width, y + 6); c.stroke(); }
      c.globalAlpha = 1;
      _legendHits.push({ x: px, y: y - 6, w: panelW, h: 23, key: it.key });
      y += 23;
    }
  }
  // 다각도 추세 4레이어 작도(차트·오버레이 공용). M=좌표 매퍼.
  // 예측구간 투영 강조: 다크 헤일로 + 글로우 + 굵은 점선 (포커스 지표의 미래 작도를 눈에 띄게)
  function _drawProjLine(c, pts, col) {
    if (!pts || pts.length < 2) return;
    c.save(); c.lineJoin = "round"; c.lineCap = "round"; c.setLineDash([]);
    c.strokeStyle = "rgba(11,15,20,.9)"; c.lineWidth = 4.4;
    c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
    c.shadowColor = col; c.shadowBlur = 9; c.globalAlpha = 1;
    c.strokeStyle = col; c.lineWidth = 2.7; c.setLineDash([7, 4]);
    c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
    c.restore();
  }
  function _predDir() {   // 메인 예상 방향(+1 상승 / -1 하락)
    try { const p = lastResult && lastResult.prediction && lastResult.prediction.path; const px = (currentData().price || []); if (p && p.length && px.length) return p[p.length - 1] >= px[px.length - 1] ? 1 : -1; } catch (e) {}
    return 1;
  }
  function _projMarkScale(endV, base) { return ((endV >= base ? 1 : -1) === _predDir()) ? 1 : (1 / 3); }   // 반대지표 끝점=메인예상 대비 1/3
  function _projMark(c, x, y, col, scale) {
    if (!isFinite(x) || !isFinite(y)) return;
    const sc = scale || 1, op = sc < 1;
    c.save();
    c.shadowColor = col; c.shadowBlur = 11 * sc; c.fillStyle = col; c.globalAlpha = op ? 0.6 : 1;
    c.beginPath(); c.arc(x, y, 4.8 * sc, 0, 7); c.fill();
    c.shadowBlur = 0; c.strokeStyle = "rgba(11,15,20,.92)"; c.lineWidth = 1.6; c.stroke();
    c.globalAlpha = op ? 0.5 : .92; c.fillStyle = "#fff"; c.beginPath(); c.arc(x, y, 1.7 * sc, 0, 7); c.fill();
    c.restore();
  }
  // 지진 진앙지형 마커 — 동심원 파문 + 글로우 코어. scale<1이면 축소·감광(반대 예상선 끝점=1/3)
  function _epicenterMark(c, x, y, col, scale) {
    if (!isFinite(x) || !isFinite(y)) return;
    const sc = Math.max(0.46, scale || 1);   // 1/3이라도 최소 크기 확보(작지만 진앙지로 식별)
    c.save(); c.lineCap = "round";
    c.globalAlpha = 1; c.shadowColor = col; c.shadowBlur = 9 * sc; c.fillStyle = col;   // 코어만(파문 링은 코멧 애니메이션 펄스로)
    c.beginPath(); c.arc(x, y, 3.2 * sc, 0, 7); c.fill();
    c.shadowBlur = 0; c.globalAlpha = 1; c.fillStyle = "#fff"; c.beginPath(); c.arc(x, y, Math.max(1, 1.2 * sc), 0, 7); c.fill();
    c.restore();
  }
  // 예측선 끝단 장식(3개 공용): 흘러가는 마일스톤 점 + 끝점 진앙지(동일 갯수) + 명칭 라벨
  function _predEndDeco(c, pathArr, seamX, coneR, toY, box, col, label, labelDy, showPx) {
    const pl = pathArr && pathArr.length; if (!pl) return;
    const tX = k => seamX + ((k + 1) / pl) * (coneR - seamX);
    try {
      const mhs = _hzList(tfUnit(), pl);
      for (const h of mhs) { if (h < 1 || h >= pl) continue; const mx = tX(h - 1), my = toY(pathArr[h - 1]); if (isFinite(mx) && isFinite(my)) { c.fillStyle = col; c.beginPath(); c.arc(mx, my, 2, 0, 7); c.fill(); c.strokeStyle = "#0b0f14"; c.lineWidth = 1; c.stroke(); } }
    } catch (e) {}
    const ex = Math.min(coneR, box.padX + box.plotW - 12), ey = Math.max(box.padTop + 14, Math.min(box.ch - box.padBot - 14, toY(pathArr[pl - 1])));
    _epicenterMark(c, ex, ey, col, 1);
    if (label) {
      c.save(); c.font = "800 11px Pretendard,'Malgun Gothic',sans-serif"; c.textAlign = "right";
      const _lw = c.measureText(label).width, _lx = ex - 10, _ly = ey + (labelDy != null ? labelDy : -13);
      c.fillStyle = "rgba(11,15,20,.86)"; if (c.roundRect) { c.beginPath(); c.roundRect(_lx - _lw - 7, _ly - 10, _lw + 10, 15, 4); c.fill(); } else c.fillRect(_lx - _lw - 7, _ly - 10, _lw + 10, 15);
      c.strokeStyle = col; c.globalAlpha = .5; c.lineWidth = 1; if (c.roundRect) { c.beginPath(); c.roundRect(_lx - _lw - 6.5, _ly - 9.5, _lw + 9, 14, 4); c.stroke(); } c.globalAlpha = 1;
      c.fillStyle = col; c.fillText(label, _lx, _ly); c.restore();
    }
    if (showPx && isFinite(pathArr[pl - 1])) {   // 끝점 예측가 = 라인색 폰트(끝점 옆)
      c.save(); c.font = "800 10.5px ui-monospace,monospace"; c.textAlign = "right";
      const _pv = _hzFmt(pathArr[pl - 1]), _pw = c.measureText(_pv).width;
      const _pxx = ex - 8, _pyy = Math.max(box.padTop + 9, Math.min(box.ch - box.padBot - 4, ey - (labelDy != null ? labelDy : -13)));
      c.fillStyle = "rgba(11,15,20,.72)"; if (c.roundRect) { c.beginPath(); c.roundRect(_pxx - _pw - 6, _pyy - 10, _pw + 9, 14, 3); c.fill(); }
      c.fillStyle = col; c.fillText(_pv, _pxx - 1, _pyy); c.restore();
    }
  }
  // 시계열을 최근 봉당 기울기로 감쇠 연장 → 예측구간에 강조 투영 + 도달 라벨(포커스 지표 공용)
  function _projFwd(c, series, nowFi, seam, xr, fb, pToY, col, label) {
    if (!series || !isFinite(seam) || !isFinite(xr) || !fb) return;
    const w = Math.min(24, Math.max(6, Math.round(fb / 2)));
    const base = series[nowFi], prev = series[Math.max(0, nowFi - w)];
    if (!isFinite(base) || !isFinite(prev)) return;
    const slPer = (base - prev) / w, pts = [[seam, pToY(base)]]; let endV = base;
    for (let k = 1; k <= fb; k++) { endV = base + slPer * k * Math.exp(-k / (fb * 1.5)); pts.push([seam + (xr - seam) * k / fb, pToY(endV)]); }
    _drawProjLine(c, pts, col); _projMark(c, pts[pts.length - 1][0], pts[pts.length - 1][1], col, _projMarkScale(endV, base));
    _evLabel(c, label + " \u2248 " + _hzFmt(endV), xr, pToY(endV), col, "right");
  }
  // 경량 투영선(라벨·마커 없음): 계열을 최근 봉당 기울기로 감쇠 연장한 흐린 점선 — 채널 밴드용
  function _projFaintLine(c, series, nowFi, seam, xr, fb, pToY, col, alpha) {
    if (!series || !isFinite(seam) || !isFinite(xr) || !fb) return;
    const w = Math.min(24, Math.max(6, Math.round(fb / 2)));
    const base = series[nowFi], prev = series[Math.max(0, nowFi - w)];
    if (!isFinite(base) || !isFinite(prev)) return;
    const slPer = (base - prev) / w, pts = [[seam, pToY(base)]];
    for (let k = 1; k <= fb; k++) { const v = base + slPer * k * Math.exp(-k / (fb * 1.5)); pts.push([seam + (xr - seam) * k / fb, pToY(v)]); }
    c.save(); c.setLineDash([5, 4]); c.strokeStyle = col; c.lineWidth = CW.hair; c.globalAlpha = alpha != null ? alpha : 0.45;
    c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
    c.restore();
  }
  // 수평 유지 투영선(라벨 없음): 현재값을 미래로 평평하게 연장(롤링 max/min 등 후행 밴드용 — 가짜 기울기 금지)
  function _projHeldLine(c, val, seam, xr, pToY, col, alpha) {
    const y = pToY(val); if (!isFinite(y) || !isFinite(seam) || !isFinite(xr)) return;
    c.save(); c.setLineDash([5, 4]); c.strokeStyle = col; c.lineWidth = CW.hair; c.globalAlpha = alpha != null ? alpha : 0.4;
    c.beginPath(); c.moveTo(seam, y); c.lineTo(xr, y); c.stroke();
    c.restore();
  }
  function _drawTrendLayers(c, ta, M) {
    c.save();
    const { fiToX, pToY, nowFi, xNow, xRight, futBars, fiMin = 0 } = M;
    const COL = { long: "#46c28e", mid: "#5b8def", short: FC_GOLD };
    const DASH = { long: [], mid: [], short: CDASH.std };
    function winLine(w, key) {
      if (!w) return;
      // 차트 스케일에 맞는 회귀선: 로그차트면 로그공간 적합(지수추세, 로그축에서 직선) / 선형차트면 선형 적합
      const valAt = _logChart
        ? (fi => Math.exp(w.bLog + w.slopeLog * (fi - w.startIdx)))
        : (fi => w.bRaw + w.slopeRaw * (fi - w.startIdx));
      const fiL = Math.max(w.startIdx, fiMin);
      const xb = xNow, yb = pToY(valAt(nowFi));
      // 히스토리 구간 다점 샘플 → 로그차트에서 직선근사 bow 제거(회귀선이 로그축에서 곡선)
      const HS = 24, hp = [];
      for (let s = 0; s <= HS; s++) { const fi = fiL + (nowFi - fiL) * s / HS; const x = fiToX(fi), y = pToY(valAt(fi)); if (isFinite(x) && isFinite(y)) hp.push([x, y]); }
      if (hp.length < 2 || !isFinite(yb)) return;
      const stroke = pts => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); };
      const pstroke = pts => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); _skStroke(c, _polyLen(pts)); };   // 진행형(손그림)
      const rq = (w.r2Log != null ? w.r2Log : w.r2), weak = rq < 0.15;   // 저신뢰(노이즈성) 추세선 — 흐리게+방향 화살표 생략
      const emph = key === _domKey;   // 지배창(ta.dominant/최고 R²)만 강조 — 공통 위계 규약
      const _pctS = (Math.exp(w.slopeLog) - 1) * 100;   // 이 창의 추세 방향(%/봉)
      const dcol = _pctS > 0.05 ? FC_BULL : _pctS < -0.05 ? FC_BEAR : "#8a92b2";   // 상승=초록·하락=빨강·횡보=중립(위계는 굵기·alpha·라벨로)
      const lw = weak ? CW.hair : emph ? CW.bold : CW.base;
      c.setLineDash([]);
      if (!weak && emph) { c.strokeStyle = "rgba(11,15,20,.8)"; c.lineWidth = lw + CW.halo; pstroke(hp); }   // 지배창만 헤일로
      c.globalAlpha = weak ? 0.28 : emph ? 1 : 0.5;   // 지배창 강조·나머지 디밍
      c.strokeStyle = dcol; c.lineWidth = lw; c.setLineDash(weak ? CDASH.fine : DASH[key]); pstroke(hp);
      c.globalAlpha = 1;
      // 투영(현재→미래): 신뢰도 낮으면 생략. 손그림 중엔 본선 다 그려진 뒤 등장.
      if (!weak && _skReady()) {
        const FS = 12, fp = [[xb, yb]];
        for (let s = 1; s <= FS; s++) { const fi = nowFi + futBars * s / FS, x = xb + (xRight - xb) * s / FS, y = pToY(valAt(fi)); if (isFinite(x) && isFinite(y)) fp.push([x, y]); }
        if (fp.length >= 2) {
          if (M.focused) { _drawProjLine(c, fp, dcol); if (emph) _projMark(c, fp[fp.length - 1][0], fp[fp.length - 1][1], dcol, _projMarkScale(valAt(nowFi + futBars), valAt(nowFi))); }
          else { c.globalAlpha = .6; c.setLineDash(CDASH.std); stroke(fp); c.globalAlpha = 1; c.setLineDash([]); }
        }
      }
      c.setLineDash([]);
      if (!_skReady()) return;   // 라벨은 선이 거의 다 그려진 뒤
      if (!emph && _labelMode !== "all") return;   // 클러터 방지: 지배창만 라벨(전체 라벨 모드는 예외)
      // 강도/각도 라벨 — 저신뢰는 화살표 대신 '약함' + 흐린 색
      const pct = (Math.exp(w.slopeLog) - 1) * 100, dir = weak ? "· 약함" : pct > 0.05 ? "▲" : pct < -0.05 ? "▼" : "—";
      // 기본=축약(단기 ▲ — 뭉침 방지), '전체 라벨 표시'(_labelMode==='all') 켜면 상세(%/봉·R²)
      const _full = (typeof _labelMode !== "undefined" && _labelMode === "all") && ((typeof window === "undefined") || window.innerWidth >= 560);
      const lab = (key === "long" ? "장기" : key === "mid" ? "중기" : "단기") + " " + (_full ? (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%/봉 R²" + rq.toFixed(2) + " " + dir : (weak ? "·약" : pct > 0.05 ? "▲" : pct < -0.05 ? "▼" : "—"));
      _evLabel(c, lab, Math.min(xb, xRight - 4) + 3, yb - 4, weak ? "rgba(138,146,178,.92)" : dcol, "left");
      if (M.focused && !weak && emph) { const endV = valAt(nowFi + futBars); if (isFinite(endV)) _evLabel(c, "\ucd94\uc138 \ub3c4\ub2ec \u2248 " + _hzFmt(endV), xRight, pToY(endV), dcol, "right"); }   // 추세 도달 ≈
    }
    // 채널(장기 ±k·σ) — 로그차트면 로그공간(지수) 중심±σ, 다점 샘플로 곡선 정합
    if (ta.channel) {
      const ch = ta.channel, Wl = ta.windows.long, sL = (ta.blend && ta.blend.channelSigmaLog) || 0, k = ch.k;
      const _pctCh = (Wl && isFinite(Wl.slopeLog)) ? (Math.exp(Wl.slopeLog) - 1) * 100 : 0;   // 장기 채널 방향
      const chCol = _pctCh > 0.05 ? FC_BULL : _pctCh < -0.05 ? FC_BEAR : "#8a92b2";   // 상승채널=초록·하락채널=빨강·횡보=중립
      const logCh = _logChart && Wl && isFinite(Wl.bLog);
      const upAt = fi => logCh ? pToY(Math.exp(Wl.bLog + Wl.slopeLog * (fi - Wl.startIdx) + k * sL)) : pToY(ch.bRaw + ch.slopeRaw * fi + k * ch.sigma);
      const loAt = fi => logCh ? pToY(Math.exp(Wl.bLog + Wl.slopeLog * (fi - Wl.startIdx) - k * sL)) : pToY(ch.bRaw + ch.slopeRaw * fi - k * ch.sigma);
      const CS = 20, up = [], lo = [];
      for (let s = 0; s <= CS; s++) { const fi = fiMin + (nowFi - fiMin) * s / CS, x = fiToX(fi), yu = upAt(fi), yl = loAt(fi); if (isFinite(x) && isFinite(yu) && isFinite(yl)) { up.push([x, yu]); lo.push([x, yl]); } }
      if (up.length >= 2) {
        c.globalAlpha = .06; c.fillStyle = chCol; c.beginPath();
        up.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
        for (let i = lo.length - 1; i >= 0; i--) c.lineTo(lo[i][0], lo[i][1]);
        c.closePath(); c.fill(); c.globalAlpha = 1;
        c.strokeStyle = chCol; c.lineWidth = CW.hair; c.setLineDash(CDASH.fine); c.globalAlpha = .45;
        c.beginPath(); up.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
        c.beginPath(); lo.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
        c.globalAlpha = 1; c.setLineDash([]);
      }
    }
    // 회귀 3중 — 지배창(ta.dominant 또는 최고 R²)만 강조, 나머지 디밍(공통 위계 규약)
    const _domKey = (ta.dominant && ta.windows[ta.dominant]) ? ta.dominant : (function () { let bk = null, bv = -1; for (const k of ["long", "mid", "short"]) { const w = ta.windows[k]; if (!w) continue; const rq = (w.r2Log != null ? w.r2Log : w.r2) || 0; if (rq > bv) { bv = rq; bk = k; } } return bk; })();
    winLine(ta.windows.long, "long"); winLine(ta.windows.mid, "mid"); winLine(ta.windows.short, "short");
    // 피봇 지지/저항
    function pivLine(L, col) {
      if (!L) return;
      const fiL = Math.max(L.fromIdx, fiMin), PS = 16, pts = [];
      for (let s = 0; s <= PS; s++) { const fi = fiL + (nowFi - fiL) * s / PS, x = fiToX(fi), y = pToY(L.slope * fi + L.b); if (isFinite(x) && isFinite(y)) pts.push([x, y]); }   // 다점 샘플 → 로그차트 곡선 정합
      if (pts.length < 2) return;
      c.strokeStyle = col; c.lineWidth = CW.hair; c.setLineDash(CDASH.fine); c.globalAlpha = .5;   // 피봇 S/R = 디밍 컨텍스트(공통 규약)
      c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); c.globalAlpha = 1; c.setLineDash([]);
    }
    pivLine(ta.pivots.support, "#46c28e"); pivLine(ta.pivots.resistance, "#e06a6a");
    c.restore();
  }
  // 다중 MA 작도(차트·오버레이 공용). M=좌표 매퍼.
  function _drawMALayers(c, ma, M) {
    c.save();
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity } = M;
    const COL = { short: "#7fb0ff", mid: "#5b8def", long: "#3b62c0" };
    const WID = { short: 1.15, mid: 1.4, long: 1.7 };
    function strokeSeries(series, key, srOn) {
      const pts = [];
      for (let fi = Math.max(fiMin, 0); fi <= nowFi; fi++) {
        const v = series[fi]; if (!isFinite(v)) continue;
        const x = fiToX(fi), y = pToY(v); if (isFinite(x) && isFinite(y)) pts.push([x, y]);
      }
      if (pts.length < 2) return;
      c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
      _skStroke(c, _polyLen(pts));   // 진행형 스트로크(손그림)
    }
    function drawMA(s, key) {
      if (!s) return;
      const srOn = ma.sr.ma === key;
      if (key === "long") { c.setLineDash([]); c.strokeStyle = "rgba(11,15,20,.8)"; c.lineWidth = WID[key] + CW.halo; strokeSeries(s.series, key); }
      c.strokeStyle = COL[key]; c.lineWidth = srOn ? WID[key] + 1 : WID[key]; c.setLineDash(srOn ? CDASH.std : []);
      strokeSeries(s.series, key); c.setLineDash([]);
    }
    if (reveal >= 1) { drawMA(ma.mas.long, "long"); drawMA(ma.mas.mid, "mid"); drawMA(ma.mas.short, "short"); }
    // 크로스 마커
    if (reveal >= 2 && ma.cross.type && ma.cross.barsAgo != null && ma.mas.short) {
      const fi = Math.max(fiMin, nowFi - ma.cross.barsAgo), v = ma.mas.short.series[fi];
      if (isFinite(v)) {
        const x = fiToX(fi), y = pToY(v);
        if (isFinite(x) && isFinite(y)) {
          const gold = ma.cross.type === "golden";
          c.fillStyle = gold ? "#46c28e" : "#e06a6a";
          c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill();
          _evLabel(c, (gold ? "골든 " : "데드 ") + ma.cross.barsAgo + "봉", x, y - 7, gold ? "#46c28e" : "#e06a6a", "left");
        }
      }
    }
    // 배열 라벨
    if (reveal >= 3 && ma.mas.short) {
      const x = fiToX(nowFi), y = pToY(ma.mas.short.last);
      if (isFinite(x) && isFinite(y)) {
        const o = ma.align.order;
        _evLabel(c, (o === "bull" ? "정배열 ▲" : o === "bear" ? "역배열 ▼" : "혼조 –") + (ma.sr.ma ? " · " + (ma.sr.side === "support" ? "지지" : "저항") : ""), x + 4, y - 6, o === "bull" ? "#46c28e" : o === "bear" ? "#e06a6a" : "#8a92b2", "left");
      }
    }
    // 미래 투영(포커스 시): 장기 MA를 최근 봉당 기울기로 감쇠 연장 → "이 지표가 이렇게 이어져 예측에 기여"하는 독립 해석 시각화
    if (M.focused && M.xNow != null && M.futBars && ma.mas.long && ma.mas.long.series) {
      const ls = ma.mas.long.series, w = Math.min(24, Math.max(6, Math.round((ma.mas.long.period || 60) / 3)));
      const base = ls[nowFi], prev = ls[Math.max(0, nowFi - w)];
      if (isFinite(base) && isFinite(prev) && w > 0) {
        const slPer = (base - prev) / w, seam = M.xNow, xr = M.xRight, fb = M.futBars;
        const _maCol = slPer > 0 ? FC_BULL : slPer < 0 ? FC_BEAR : "#8a92b2";   // MA 투영 방향색(상승=초록·하락=빨강)
        const pp = [[seam, pToY(base)]]; let endV = base;
        for (let k = 1; k <= fb; k++) { endV = base + slPer * k * Math.exp(-k / (fb * 1.5)); pp.push([seam + (xr - seam) * k / fb, pToY(endV)]); }
        _drawProjLine(c, pp, _maCol); _projMark(c, pp[pp.length - 1][0], pp[pp.length - 1][1], _maCol, _projMarkScale(endV, base));
        _evLabel(c, "이동평균 투영 \u2248 " + _hzFmt(endV), xr, pToY(endV), _maCol, "right");
      }
    }
    c.restore();
  }
  // 피보 작도(차트·오버레이 공용, reveal 인지). M=좌표 매퍼.
  function _drawFibLayers(c, fib, M) {
    c.save();
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity, xRight, top, bot } = M;
    const xL = fiToX(Math.max(fiMin, 0)), xR = (xRight != null ? xRight : fiToX(nowFi)), GOLD = FC_GOLD, DIM = FC_GOLD;
    const _near = (a, arr) => arr.some(k => Math.abs(a - k) < 0.002);
    const KEYR = [0.382, 0.5, 0.618], KEYE = [1.618, 2.618];   // 되돌림·확장 핵심(골든 포켓)
    // 교차-degree 합류: 전 degree(단/중/장)의 핵심 레벨 가격을 근접 클러스터 → 2+ degree 겹침 = 최강 S/R
    const _conflPrices = (function () {
      if (!fib.degrees || fib.degrees.length < 2) return [];
      const KEYALL = KEYR.concat(KEYE), pts = [];
      for (const dg of fib.degrees) for (const L of (dg.levels || [])) if (KEYALL.some(k => Math.abs(L.ratio - k) < 1e-6)) pts.push({ price: L.price, deg: dg.name });
      if (pts.length < 2) return [];
      let pmin = Infinity, pmax = -Infinity; for (const p of pts) { if (p.price < pmin) pmin = p.price; if (p.price > pmax) pmax = p.price; }
      const tol = ((pmax > pmin) ? (pmax - pmin) : Math.abs(pmax) || 1) * 0.012, out = [];
      for (let i = 0; i < pts.length; i++) { const degs = new Set([pts[i].deg]); let sum = pts[i].price, cnt = 1; for (let j = i + 1; j < pts.length; j++) if (Math.abs(pts[j].price - pts[i].price) <= tol) { degs.add(pts[j].deg); sum += pts[j].price; cnt++; } if (degs.size >= 2) out.push({ price: sum / cnt, tol }); }
      return out;
    })();
    const _isConfl = price => _conflPrices.some(c => Math.abs(c.price - price) <= c.tol);
    function levelLine(L) {
      const y = pToY(L.price); if (![y, xL, xR].every(isFinite)) return;
      const ext = L.kind === "ext";
      const isKey = ext ? _near(L.ratio, KEYE) : _near(L.ratio, KEYR);   // 핵심 비율(항상 강조·라벨)
      const xconf = L.confluent || _isConfl(L.price);                     // 합류(단기 내 or 교차-degree)
      const emph = isKey || xconf;                                        // 강조 선(핵심 or 합류)
      // 선: 합류=최강조, 핵심=강조, 그 외=아주 흐리게(강약 대비 뚜렷)
      c.setLineDash(xconf ? [] : ext ? CDASH.std : CDASH.fine);
      c.strokeStyle = emph ? GOLD : _warmA(.38);
      c.lineWidth = xconf ? CW.bold : isKey ? CW.base : CW.hair;
      c.globalAlpha = xconf ? 0.95 : emph ? 0.9 : 0.28;
      const xE = (_skFrac == null || _skFrac >= 1) ? xR : xL + (xR - xL) * Math.max(0, _skFrac);   // 좌→우로 그어짐(dash 스타일 보존)
      c.beginPath(); c.moveTo(xL, y); c.lineTo(xE, y); c.stroke();
      c.globalAlpha = 1; c.setLineDash([]);
      if (!_skReady()) return;   // 라벨은 선이 거의 다 그려진 뒤
      // 라벨은 핵심 비율만(0.382/0.5/0.618 · 1.618/2.618 목표) — 합류는 선만 강조·라벨 생략(수치 클러터 감소)
      if (!isKey) return;
      const _txt = (xconf ? "✦ " : "") + L.ratio.toFixed(3) + (ext ? " 목표" : "") + " · " + fmtNum(L.price);
      if (ext) _evLabel(c, _txt, xR - 3, y - 2, GOLD, "right");   // 확장 목표는 우측(가격축 근처에서 읽기)
      else _evLabel(c, _txt, xL + 3, y - 2, GOLD, "left");
    }
    if (reveal >= 1) fib.levels.filter(L => L.kind === "retr").forEach(levelLine);
    if (reveal >= 2) fib.levels.filter(L => L.kind === "ext").forEach(levelLine);
    if (reveal >= 3) {
      const z = fib.zone;
      if (z && isFinite(z.goldenLo) && isFinite(z.goldenHi)) {
        const yH = pToY(z.goldenHi), yL = pToY(z.goldenLo);
        if (isFinite(yH) && isFinite(yL)) { c.globalAlpha = .09; c.fillStyle = FC_GOLD; c.fillRect(xL, Math.min(yH, yL), Math.max(2, xR - xL), Math.abs(yL - yH)); c.globalAlpha = 1; }
      }
      if (z && z.nearest) {
        const y = pToY(z.nearest.price);
        if (isFinite(y)) { _evLabel(c, (z.inGolden ? "골든포켓 · " : "") + (z.nearest.side === "support" ? "지지" : "저항"), xR - 3, y - 3, z.inGolden ? GOLD : DIM, "right"); }
      }
      if (fib.swing) {
        [[fib.swing.fromIdx, fib.swing.fromPrice], [fib.swing.toIdx, fib.swing.toPrice]].forEach(pr => {
          const x = fiToX(Math.max(fiMin, pr[0])), y = pToY(pr[1]);
          if (isFinite(x) && isFinite(y)) { c.fillStyle = DIM; c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); }
        });
      }
    }
    // ── 중기·장기 degree: 핵심 레벨(0.382/0.5/0.618)+스윙 스팬. 공통 위계 규약(골드+CW.hair·alpha 위계, 합류=최강조) ──
    if (reveal >= 1 && fib.degrees && fib.degrees.length > 1) {
      const KEY = [0.382, 0.5, 0.618];
      const REG = { "중기": { a: 0.5, dot: 2.6 }, "장기": { a: 0.32, dot: 3.0 } };   // degree 위계=alpha(단기>중기>장기), 색은 골드 단일
      for (const dg of fib.degrees) {
        const rg = REG[dg.name]; if (!rg) continue;   // 단기는 위에서 이미 전체 그리드로 작도
        // 스윙 스팬(얇은 연결선) — 이 degree가 어느 구간을 보는지
        if (dg.swing) {
          const x0 = fiToX(Math.max(fiMin, dg.swing.fromIdx)), y0 = pToY(dg.swing.fromPrice), x1 = fiToX(Math.max(fiMin, dg.swing.toIdx)), y1 = pToY(dg.swing.toPrice);
          if ([x0, y0, x1, y1].every(isFinite)) { c.save(); c.globalAlpha = rg.a * 0.7; c.strokeStyle = GOLD; c.lineWidth = CW.hair; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.restore(); }
          [[dg.swing.fromIdx, dg.swing.fromPrice], [dg.swing.toIdx, dg.swing.toPrice]].forEach(pr => {
            const x = fiToX(Math.max(fiMin, pr[0])), y = pToY(pr[1]);
            if (isFinite(x) && isFinite(y)) { c.globalAlpha = rg.a; c.fillStyle = GOLD; c.beginPath(); c.arc(x, y, rg.dot, 0, 7); c.fill(); c.globalAlpha = 1; }
          });
        }
        // 핵심 되돌림 레벨
        for (const L of dg.levels) {
          if (L.kind !== "retr" || !KEY.some(k => Math.abs(L.ratio - k) < 1e-9)) continue;
          const y = pToY(L.price); if (![y, xL, xR].every(isFinite)) continue;
          const xconf = _isConfl(L.price);   // 교차-degree 합류 = 최강조
          // 화면 밖(장기 레벨이 현재 y스케일 범위 밖) → 가장자리에 방향 마커+가격으로 표시(놓치지 않게)
          if (top != null && bot != null && (y < top || y > bot)) {
            if (L.golden || xconf) { const cy = y < top ? top + 7 : bot - 3, arw = y < top ? "▲" : "▼"; _evLabel(c, arw + " " + (xconf ? "✦ " : "") + dg.name.charAt(0) + " " + L.ratio.toFixed(3) + " " + fmtNum(L.price), xR - 3, cy, GOLD, "right"); }
            continue;
          }
          // 합류=최강조(bold), 골든=중간, 나머지=디밍(공통 규약: 골드+globalAlpha 위계)
          c.setLineDash(xconf ? [] : L.golden ? CDASH.std : CDASH.fine);
          c.strokeStyle = GOLD; c.lineWidth = xconf ? CW.bold : CW.hair; c.globalAlpha = xconf ? 0.95 : L.golden ? 0.6 : rg.a;
          c.beginPath(); c.moveTo(xL, y); c.lineTo(xR, y); c.stroke();
          c.globalAlpha = 1; c.setLineDash([]);
          // 라벨은 합류 or 각 degree의 골든(0.618)만(수치 클러터 감소)
          if (xconf) _evLabel(c, "✦ " + dg.name.charAt(0) + " " + L.ratio.toFixed(3) + " · " + fmtNum(L.price), xL + 3, y - 2, GOLD, "left");
          else if (L.golden) _evLabel(c, dg.name.charAt(0) + " " + L.ratio.toFixed(3) + " · " + fmtNum(L.price), xL + 3, y - 2, GOLD, "left");
        }
      }
    }
    c.restore();
  }
  // 엘리어트 작도(차트·오버레이 공용, reveal 인지). M=좌표 매퍼.
  function _drawElliottLayers(c, ea, M) {
    c.save();
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity, xRight, top, bot } = M;
    const _by = (M.badgeY != null) ? M.badgeY : 14;
    const COL = "#c47ae0", BAD = "#e06a6a";
    const fmt = v => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100);
    // layer1: 파동 폴리라인 + 라벨
    if (reveal >= 1 && ea.waves.length) {
      const pts = [];
      for (const w of ea.waves) { const x = fiToX(Math.max(fiMin, w.idx)), y = pToY(w.price); if (isFinite(x) && isFinite(y)) pts.push([x, y, w]); }
      if (pts.length >= 2) {
        c.strokeStyle = COL; c.lineWidth = 1.4; c.setLineDash([]);
        c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
        _skStroke(c, _polyLen(pts));   // 지그재그 진행형 작도
      }
      if (_skReady()) for (const p of pts) {   // 점·라벨은 선이 다 그려진 뒤
        c.fillStyle = COL; c.beginPath(); c.arc(p[0], p[1], 2.2, 0, 7); c.fill();
        _evLabel(c, p[2].label, p[0] + 3, p[1] - 3, COL, "left");
      }
    }
    // layer2: 유효도/구조 배지(우상단)
    if (reveal >= 2 && _skReady()) {
      const _cl = ea.current.label, _isL = /[A-Z]/.test(_cl);
      const stx = ea.structure === "impulse_up" ? "임펄스↑" : ea.structure === "impulse_down" ? "임펄스↓" : ea.structure === "corrective" ? "조정 진행(" + _cl + ")" : _isL ? "되돌림 진행(" + _cl + ")" : (ea.waves.length >= 2 ? "발달중(" + _cl + "파)" : "불확실");
      const ok = [ea.rules.r1, ea.rules.r2, ea.rules.r3].filter(Boolean).length;
      const bcol = ea.structure.indexOf("impulse") === 0 ? COL : ea.structure === "corrective" ? FC_GOLD : "#8a92b2";
      const xb = (xRight != null ? xRight : fiToX(nowFi));
      _evLabel(c, stx + " " + ok + "/3 유효" + ea.rules.score.toFixed(2), xb, _by, bcol, "right");
    }
    // layer3: 다음 파동 투영선
    if (reveal >= 3 && _skReady() && ea.next && ea.waves.length) {
      const lw = ea.waves[ea.waves.length - 1];
      const x0 = fiToX(Math.max(fiMin, lw.idx)), y0 = pToY(lw.price);
      const xR = (xRight != null ? xRight : fiToX(nowFi)), yT = pToY(ea.next.target);
      if ([x0, y0, xR, yT].every(isFinite)) {
        c.strokeStyle = COL; c.globalAlpha = .65; c.setLineDash(CDASH.std); c.beginPath(); c.moveTo(x0, y0); c.lineTo(xR, yT); c.stroke(); c.globalAlpha = 1; c.setLineDash([]);
        _evLabel(c, "→" + ea.next.label + " " + fmt(ea.next.target), xR, yT, COL, "right");
      }
    }
    // ── 대형(primary) degree: 굵은 선 + 괄호 라벨 + 별도 구조 배지 ──
    if (ea.primary && ea.primary.waves && ea.primary.waves.length) {
      const pw = ea.primary.waves;
      if (reveal >= 1) {
        c.save();
        c.globalAlpha = 0.85; c.strokeStyle = COL; c.lineWidth = 1.9; c.setLineDash([]);
        c.beginPath(); let pst = false;
        for (const w of pw) { const x = fiToX(Math.max(fiMin, w.idx)), y = pToY(w.price); if (!isFinite(x) || !isFinite(y)) continue; pst ? c.lineTo(x, y) : c.moveTo(x, y); pst = true; }
        c.stroke();
        for (const w of pw) {
          const x = fiToX(Math.max(fiMin, w.idx)), y = pToY(w.price); if (!isFinite(x) || !isFinite(y)) continue;
          // 대형 파동 꼭짓점이 현재 y스케일 밖 → 가장자리에 ▲/▼ (라벨) 가격 마커(피보와 동일 정책)
          if (top != null && bot != null && (y < top || y > bot)) {
            const cy = y < top ? top + 7 : bot - 3, arw = y < top ? "▲" : "▼";
            _evLabel(c, arw + "(" + w.label + ") " + fmt(w.price), x + 4, cy, COL, "left");
            continue;
          }
          c.fillStyle = COL; c.beginPath(); c.arc(x, y, 2.8, 0, 7); c.fill();
          _evLabel(c, "(" + w.label + ")", x + 4, y - 4, COL, "left");
        }
        c.restore();
      }
      // 대형 구조 배지(소형 배지 아래 슬롯)
      if (reveal >= 2) {
        const pst2 = ea.primary.structure === "impulse_up" ? "임펄스↑" : ea.primary.structure === "impulse_down" ? "임펄스↓" : ea.primary.structure === "corrective" ? "ABC 조정" : "불확실";
        const pok = [ea.primary.rules.r1, ea.primary.rules.r2, ea.primary.rules.r3].filter(Boolean).length;
        const pbcol = ea.primary.structure.indexOf("impulse") === 0 ? COL : ea.primary.structure === "corrective" ? FC_GOLD : "#8a92b2";
        const xb = (xRight != null ? xRight : fiToX(nowFi));
        _evLabel(c, "대형 " + pst2 + " " + pok + "/3", xb, _by + 15, pbcol, "right");
      }
      // 대형 다음 파동 투영선(있으면 더 굵은 점선)
      if (reveal >= 3 && ea.primary.next && pw.length) {
        const lw = pw[pw.length - 1];
        const x0 = fiToX(Math.max(fiMin, lw.idx)), y0 = pToY(lw.price);
        const xR = (xRight != null ? xRight : fiToX(nowFi)), yT = pToY(ea.primary.next.target);
        if ([x0, y0, xR, yT].every(isFinite)) {
          const offT = top != null && bot != null && (yT < top || yT > bot);
          const yTc = offT ? (yT < top ? top : bot) : yT;   // 목표가 화면 밖이면 가장자리로 클램프
          c.save(); c.strokeStyle = COL; c.globalAlpha = .55; c.lineWidth = 1.5; c.setLineDash(CDASH.long);
          c.beginPath(); c.moveTo(x0, y0); c.lineTo(xR, yTc); c.stroke(); c.restore();
          const arw = offT ? (yT < top ? "▲" : "▼") : "";
          _evLabel(c, arw + "→(" + ea.primary.next.label + ") " + fmt(ea.primary.next.target), xR, offT ? (yT < top ? top + 7 : bot - 3) : yT, COL, "right");
        }
      }
    }
    c.restore();
  }
  // RSI hero 작도(차트·오버레이, reveal). 다이버전스 선 + 값/구간 배지.
  function _drawRsiLayers(c, rsi, M) {
    c.save();
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity, xRight } = M;
    const _by = (M.badgeY != null) ? M.badgeY : 28;
    if (reveal >= 1 && rsi.divergence.type && rsi.divergence.pricePts) {
      const a = rsi.divergence.pricePts[0], b = rsi.divergence.pricePts[1];
      const xa = fiToX(Math.max(fiMin, a.idx)), ya = pToY(a.price), xb = fiToX(Math.max(fiMin, b.idx)), yb = pToY(b.price);
      if ([xa, ya, xb, yb].every(isFinite)) {
        const col = rsi.divergence.type === "bullish" ? "#46c28e" : "#e06a6a";
        c.strokeStyle = col; c.lineWidth = 1.8; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(xa, ya); c.lineTo(xb, yb); c.stroke(); c.setLineDash([]);
        _evLabel(c, (rsi.divergence.type === "bullish" ? "강세" : "약세") + " 다이버전스", xb, yb, col, "left");
      }
    }
    if (reveal >= 2) {
      const zt = rsi.zone === "overbought" ? "과열" : rsi.zone === "oversold" ? "과매도" : "중립";
      const col = rsi.zone === "overbought" ? "#e06a6a" : rsi.zone === "oversold" ? "#46c28e" : "#8a92b2";
      const xb = (xRight != null ? xRight : fiToX(nowFi));
      _evLabel(c, "RSI " + Math.round(rsi.last) + " \xb7 " + zt, xb, _by, col, "right");
    }
    c.restore();
  }
  /* 거래량 hero 작도 — 다이버전스 선(reveal≥1) + 급증 마커·상태 배지(reveal≥2) */
  function _drawVolumeLayers(c, va, M) {
    if (!va) return;
    const { fiToX, pToY, fiMin, reveal, xRight } = M;
    const _by = (M.badgeY != null) ? M.badgeY : 28;
    c.save();
    // 레이어1: 가격-OBV 다이버전스 선
    if (reveal >= 1 && va.divergence.type && va.divergence.pricePts) {
      const col = va.divergence.type === "bullish" ? "#46c28e" : "#e06a6a";
      const a = va.divergence.pricePts[0], b = va.divergence.pricePts[1];
      const xa = fiToX(Math.max(fiMin, a.idx)), ya = pToY(a.price);
      const xb = fiToX(Math.max(fiMin, b.idx)), yb = pToY(b.price);
      if ([xa, ya, xb, yb].every(isFinite)) {
        c.strokeStyle = col; c.lineWidth = 2; c.setLineDash([5, 4]);
        c.beginPath(); c.moveTo(xa, ya); c.lineTo(xb, yb); c.stroke(); c.setLineDash([]);
        _evLabel(c, (va.divergence.type === "bullish" ? "강세" : "약세") + " 거래량 다이버전스", (xa + xb) / 2, Math.min(ya, yb) - 8, col, "center");
      }
    }
    // 레이어2: 급증 마커 + 상태/관계 배지
    if (reveal >= 2) {
      const relTxt = va.relationship === "confirm" ? "상승 확인" : va.relationship === "weakening" ? "추진력 약화" : va.relationship === "selling" ? "매도 압력" : "투매 진정";
      const relCol = (va.relationship === "confirm" || va.relationship === "capitulation") ? "#46c28e" : "#e06a6a";
      const stTxt = va.state === "spike" ? "거래량 급증" : va.state === "contract" ? "거래량 위축" : "거래량 평이";
      // 급증 시 마지막 봉(현재) 가격 위에 짧은 골드 수직 틱
      if (va.state === "spike" && isFinite(M.lastPrice)) {
        const x = fiToX(Math.max(fiMin, M.nowFi)), y = pToY(M.lastPrice);
        if (isFinite(x) && isFinite(y)) { c.strokeStyle = FC_GOLD; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x, y - 14); c.lineTo(x, y - 4); c.stroke(); }
      }
      _evLabel(c, stTxt + " \xb7 " + relTxt, xRight - 6, _by, relCol, "right");
    }
    c.restore();
  }
  // VWAP hero 작도 — VWAP 선 + ±σ 밴드(reveal≥1) + 위치 배지(reveal≥2)
  function _drawVwapLayers(c, vw, M) {
    if (!vw || !vw.vwap || !vw.vwap.length) return;
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity, xRight, col = "#c9a86a" } = M;
    c.save();
    if (reveal >= 1) {
      c.strokeStyle = "rgba(201,168,106,.26)"; c.lineWidth = 1; c.setLineDash([4, 4]);
      for (const arr of [vw.upper, vw.lower]) {
        c.beginPath(); let started = false;
        for (let fi = Math.max(fiMin, 0); fi <= nowFi; fi++) { const v = arr[fi]; if (!isFinite(v)) continue; const x = fiToX(fi), y = pToY(v); if (!isFinite(x) || !isFinite(y)) continue; if (!started) { c.moveTo(x, y); started = true; } else c.lineTo(x, y); }
        c.stroke();
      }
      c.setLineDash([]);
      c.strokeStyle = col; c.lineWidth = 2.2; c.beginPath(); let started = false;
      for (let fi = Math.max(fiMin, 0); fi <= nowFi; fi++) { const v = vw.vwap[fi]; if (!isFinite(v)) continue; const x = fiToX(fi), y = pToY(v); if (!isFinite(x) || !isFinite(y)) continue; if (!started) { c.moveTo(x, y); started = true; } else c.lineTo(x, y); }
      c.stroke();
    }
    if (reveal >= 2) {
      const _by = (M.badgeY != null) ? M.badgeY : 28, up = vw.pct > 0.1, dn = vw.pct < -0.1;
      const t = "VWAP " + (!up && !dn ? "근접" : (up ? "상단 +" : "하단 ") + vw.pct.toFixed(1) + "%");
      _evLabel(c, t, (xRight != null ? xRight : fiToX(nowFi)) - 6, _by, up ? "#46c28e" : dn ? "#e06a6a" : "#8a92b2", "right");
    }
    if (M.focused && M.xNow != null && M.futBars) _projFwd(c, vw.vwap, nowFi, M.xNow, (xRight != null ? xRight : fiToX(nowFi)), M.futBars, pToY, col, "VWAP \ud22c\uc601");
    c.restore();
  }
  // 슈퍼트렌드 hero 작도 — 추세별 색(상승 초록/하락 빨강) 추적선 + 플립 마커 + 배지
  function _drawSupertrendLayers(c, st, M) {
    if (!st || !st.line || !st.line.length) return;
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity, xRight } = M;
    c.save();
    if (reveal >= 1) {
      c.lineWidth = 2.4;
      let px = null, py = null, pt = null;
      for (let fi = Math.max(fiMin, 0); fi <= nowFi; fi++) {
        const v = st.line[fi]; if (!isFinite(v)) { px = null; continue; }
        const x = fiToX(fi), y = pToY(v); if (!isFinite(x) || !isFinite(y)) { px = null; continue; }
        const tr = st.trend[fi];
        if (px != null && pt === tr) { c.strokeStyle = tr === 1 ? "#46c28e" : "#e06a6a"; c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke(); }
        px = x; py = y; pt = tr;
      }
      if (st.flip && st.flip.barsAgo != null) {
        const ffi = nowFi - st.flip.barsAgo, v = st.line[ffi];
        if (isFinite(v)) { const x = fiToX(ffi), y = pToY(v), up = st.flip.dir === 1; if (isFinite(x) && isFinite(y)) { c.fillStyle = up ? "#46c28e" : "#e06a6a"; c.beginPath(); if (up) { c.moveTo(x, y + 8); c.lineTo(x - 5, y + 15); c.lineTo(x + 5, y + 15); } else { c.moveTo(x, y - 8); c.lineTo(x - 5, y - 15); c.lineTo(x + 5, y - 15); } c.closePath(); c.fill(); } }
      }
    }
    if (reveal >= 2) {
      const _by = (M.badgeY != null) ? M.badgeY : 28, up = st.dir === 1, dn = st.dir === -1;
      const t = "슈퍼트렌드 " + (up ? "상승 ▲" : dn ? "하락 ▼" : "중립") + (st.flip && st.flip.barsAgo <= 3 ? " · 전환" : "");
      _evLabel(c, t, (xRight != null ? xRight : fiToX(nowFi)) - 6, _by, up ? "#46c28e" : dn ? "#e06a6a" : "#8a92b2", "right");
    }
    if (M.focused && M.xNow != null && M.futBars && st.line) _projFwd(c, st.line, nowFi, M.xNow, (xRight != null ? xRight : fiToX(nowFi)), M.futBars, pToY, (st.dir === 1 ? "#46c28e" : st.dir === -1 ? "#e06a6a" : "#8fb4f0"), "\uc288\ud37c\ud2b8\ub80c\ub4dc \ud22c\uc601");
    c.restore();
  }
  // 스토캐스틱 hero 작도 — 배지만(%K/%D + 구간 + 교차)
  function _drawStochLayers(c, st, M) {
    if (!st || (M.reveal != null && M.reveal < 2)) return;
    const { xRight } = M, _by = (M.badgeY != null) ? M.badgeY : 28;
    const zt = st.state === "overbought" ? "과매수" : st.state === "oversold" ? "과매도" : "중립";
    const cr = st.cross ? (st.cross.type === "bull" ? " · 골든" : " · 데드") : "";
    const col = st.bias > 0.15 ? "#46c28e" : st.bias < -0.15 ? "#e06a6a" : "#8a92b2";
    c.save();
    _evLabel(c, "스토캐스틱 " + Math.round(st.last.k) + "/" + Math.round(st.last.d) + " · " + zt + cr, (xRight != null ? xRight : 0) - 6, _by, col, "right");
    c.restore();
  }
  // CCI hero 작도 — 배지만(현재값 + 구간 + 국면), 서브패널 없음(Phase B 오실레이터 관례)
  function _drawCciLayers(c, a, M) {
    if (!a || (M.reveal != null && M.reveal < 2)) return;
    const { xRight } = M, _by = (M.badgeY != null) ? M.badgeY : 28;
    const zt = a.last > 100 ? "과열" : a.last < -100 ? "과매도" : "중립";
    const rt = a.regime > 0 ? " · 강세국면" : a.regime < 0 ? " · 약세국면" : "";
    const col = a.bias > 0.15 ? "#46c28e" : a.bias < -0.15 ? "#e06a6a" : "#8a92b2";
    c.save();
    _evLabel(c, "CCI " + Math.round(a.last) + " · " + zt + rt, (xRight != null ? xRight : 0) - 6, _by, col, "right");
    c.restore();
  }
  // Williams %R hero 작도 — 배지만(현재값 + 구간), 서브패널 없음(Phase B 오실레이터 관례)
  function _drawWilliamsLayers(c, a, M) {
    if (!a || (M.reveal != null && M.reveal < 2)) return;
    const { xRight } = M, _by = (M.badgeY != null) ? M.badgeY : 28;
    const zt = a.last > -20 ? "과매수" : a.last < -80 ? "과매도" : "중립";
    const col = a.bias > 0.15 ? "#46c28e" : a.bias < -0.15 ? "#e06a6a" : "#8a92b2";
    c.save();
    _evLabel(c, "Williams %R " + Math.round(a.last) + " · " + zt, (xRight != null ? xRight : 0) - 6, _by, col, "right");
    c.restore();
  }
  // ROC/모멘텀 hero 작도 — 배지만(현재값 + 모멘텀 방향), 서브패널 없음(Phase B 오실레이터 관례)
  function _drawRocLayers(c, a, M) {
    if (!a || (M.reveal != null && M.reveal < 2)) return;
    const { xRight } = M, _by = (M.badgeY != null) ? M.badgeY : 28;
    const col = a.bias > 0.15 ? "#46c28e" : a.bias < -0.15 ? "#e06a6a" : "#8a92b2";
    c.save();
    _evLabel(c, "ROC " + a.last.toFixed(1) + "% · " + (a.last > 0 ? "상승 모멘텀" : a.last < 0 ? "하락 모멘텀" : "중립"), (xRight != null ? xRight : 0) - 6, _by, col, "right");
    c.restore();
  }
  // Awesome Oscillator hero 작도 — 배지만(현재값 + 0선 교차/부호), 서브패널 없음(Phase B 오실레이터 관례)
  function _drawAoLayers(c, a, M) {
    if (!a || (M.reveal != null && M.reveal < 2)) return;
    const { xRight } = M, _by = (M.badgeY != null) ? M.badgeY : 28;
    const col = a.bias > 0.15 ? "#46c28e" : a.bias < -0.15 ? "#e06a6a" : "#8a92b2";
    c.save();
    _evLabel(c, "AO " + a.last.toFixed(2) + " · " + (a.cross > 0 ? "0선 상향돌파" : a.cross < 0 ? "0선 하향돌파" : a.last > 0 ? "양(+)" : a.last < 0 ? "음(−)" : "중립"), (xRight != null ? xRight : 0) - 6, _by, col, "right");
    c.restore();
  }
  // Aroon hero 작도 — 배지만(Up/Down + 추세 국면), 서브패널 없음(Phase B 오실레이터 관례)
  function _drawAroonLayers(c, a, M) {
    if (!a || (M.reveal != null && M.reveal < 2)) return;
    const { xRight } = M, _by = (M.badgeY != null) ? M.badgeY : 28;
    const col = a.bias > 0.15 ? "#46c28e" : a.bias < -0.15 ? "#e06a6a" : "#8a92b2";
    c.save();
    _evLabel(c, "Aroon " + Math.round(a.up) + "/" + Math.round(a.down) + " · " + (a.osc > 30 ? "상승 추세" : a.osc < -30 ? "하락 추세" : "중립"), (xRight != null ? xRight : 0) - 6, _by, col, "right");
    c.restore();
  }
  // MFI hero 작도 — 배지만(현재값 + 구간/국면), 서브패널 없음(Phase B 오실레이터 관례)
  function _drawMfiLayers(c, a, M) {
    if (!a || (M.reveal != null && M.reveal < 2)) return;
    const { xRight } = M, _by = (M.badgeY != null) ? M.badgeY : 28;
    const col = a.bias > 0.15 ? "#46c28e" : a.bias < -0.15 ? "#e06a6a" : "#8a92b2";
    c.save();
    _evLabel(c, "MFI " + Math.round(a.last) + " · " + (a.last > 80 ? "과열" : a.last < 20 ? "과매도" : a.last > 50 ? "자금 유입" : "자금 이탈"), (xRight != null ? xRight : 0) - 6, _by, col, "right");
    c.restore();
  }
  // CMF hero 작도 — 배지만(현재값 + 매집/분산 국면), 서브패널 없음(Phase B/C 오실레이터 관례)
  function _drawCmfLayers(c, a, M) {
    if (!a || (M.reveal != null && M.reveal < 2)) return;
    const { xRight } = M, _by = (M.badgeY != null) ? M.badgeY : 28;
    const col = a.bias > 0.15 ? "#46c28e" : a.bias < -0.15 ? "#e06a6a" : "#8a92b2";
    c.save();
    _evLabel(c, "CMF " + a.last.toFixed(2) + " · " + (a.last > 0 ? "매집(자금 유입)" : a.last < 0 ? "분산(자금 이탈)" : "중립"), (xRight != null ? xRight : 0) - 6, _by, col, "right");
    c.restore();
  }
  // 볼린저 밴드 작도 — 상/중/하 밴드 + 채움 + 상태 배지(진행형 스트로크 인지)
  function _drawBollingerLayers(c, bb, M) {
    c.save();
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity, xRight } = M;
    const COL = "#8fb4f0";
    if (!bb.mid || bb.mid.length < 2) { c.restore(); return; }
    const collect = series => { const pts = []; for (let fi = Math.max(fiMin, 0); fi <= nowFi; fi++) { const v = series[fi]; if (!isFinite(v)) continue; const x = fiToX(fi), y = pToY(v); if (isFinite(x) && isFinite(y)) pts.push([x, y]); } return pts; };
    const stroke = (series, dash, wid) => { const pts = collect(series); if (pts.length < 2) return; c.setLineDash(dash || []); c.lineWidth = wid; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); _skStroke(c, _polyLen(pts)); c.setLineDash([]); };
    if (reveal >= 1) {
      const up = collect(bb.upper), lo = collect(bb.lower);
      if (up.length > 1 && lo.length > 1 && _skReady()) {   // 밴드 채움
        c.globalAlpha = .06; c.fillStyle = COL; c.beginPath();
        up.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
        for (let i = lo.length - 1; i >= 0; i--) c.lineTo(lo[i][0], lo[i][1]);
        c.closePath(); c.fill(); c.globalAlpha = 1;
      }
      c.strokeStyle = "rgba(143,180,240,.5)"; stroke(bb.upper, [3, 3], 1); stroke(bb.lower, [3, 3], 1);
      c.strokeStyle = COL; stroke(bb.mid, [], 1.4);
    }
    if (reveal >= 2 && _skReady()) {
      const x = (xRight != null ? xRight : fiToX(nowFi)), y = pToY(bb.last.mid);
      const st = bb.state, sTxt = st === "breakout_up" ? "상단 돌파" : st === "breakout_dn" ? "하단 이탈" : st === "upper" ? "밴드 상단" : st === "lower" ? "밴드 하단" : "밴드 중앙";
      const col = bb.bias > 0.15 ? "#46c28e" : bb.bias < -0.15 ? "#e06a6a" : COL;
      if (isFinite(x) && isFinite(y)) _evLabel(c, "BB " + sTxt + (bb.squeeze ? " · 스퀴즈" : "") + " · %B" + bb.last.pctB.toFixed(2), x - 6, y, col, "right");
    }
    if (M.focused && M.xNow != null && M.futBars) _projFwd(c, bb.mid, nowFi, M.xNow, (xRight != null ? xRight : fiToX(nowFi)), M.futBars, pToY, COL, "\ubcfc\ub9b0\uc800 \uc911\uc2ec \ud22c\uc601");
    c.restore();
  }
  // MACD 근거 배지(상세는 서브패널) — 히스토그램/교차 상태
  function _drawMacdLayers(c, m, M) {
    if (!_skReady()) return;
    const { xRight, nowFi, fiToX, badgeY } = M;
    const x = (xRight != null ? xRight : fiToX(nowFi)), y = (badgeY != null ? badgeY : 14);
    const cross = m.cross && m.cross.type ? (m.cross.type === "bull" ? "골든" : "데드") + m.cross.barsAgo + "봉" : "교차없음";
    const col = m.bias > 0.15 ? "#46c28e" : m.bias < -0.15 ? "#e06a6a" : "#e0a86a";
    if (isFinite(x) && isFinite(y)) _evLabel(c, "MACD " + (m.last.hist >= 0 ? "+" : "") + m.last.hist.toFixed(1) + " · " + cross, x, y, col, "right");
  }
  // ADX 근거 배지(상세는 서브패널) — 추세 강도·방향
  function _drawAdxLayers(c, a, M) {
    if (!_skReady()) return;
    const { xRight, nowFi, fiToX, badgeY } = M;
    const x = (xRight != null ? xRight : fiToX(nowFi)), y = (badgeY != null ? badgeY : 14);
    const sTxt = a.strength === "very_strong" ? "매우강" : a.strength === "strong" ? "강함" : a.strength === "developing" ? "형성중" : "약함";
    const col = a.dir > 0 && a.last.adx >= 20 ? "#46c28e" : a.dir < 0 && a.last.adx >= 20 ? "#e06a6a" : "#8a92b2";
    if (isFinite(x) && isFinite(y)) _evLabel(c, "ADX " + a.last.adx.toFixed(0) + " 추세" + sTxt + (a.dir > 0 ? " ▲" : a.dir < 0 ? " ▼" : ""), x, y, col, "right");
  }
  // 볼륨 프로파일(매물대) — 우측에 가격대별 수평 거래량 막대 + POC·밸류에어리어(이미지3식)
  function _drawVolumeProfileLayers(c, vp, M) {
    c.save();
    const { pToY, xRight, reveal = Infinity } = M;
    if (!vp.bins || !vp.bins.length || !vp.maxVol) { c.restore(); return; }
    const xR = (xRight != null ? xRight : 0), maxW = 66, prog = (_skFrac != null ? Math.max(0, _skFrac) : 1);
    if (reveal >= 1) {
      for (const bin of vp.bins) {
        const y0 = pToY(bin.hi), y1 = pToY(bin.lo); if (!isFinite(y0) || !isFinite(y1)) continue;
        const h = Math.max(1, Math.abs(y1 - y0) - 1), w = (bin.vol / vp.maxVol) * maxW * prog;
        const inVA = bin.mid >= vp.val && bin.mid <= vp.vah, isPOC = Math.abs(bin.mid - vp.poc) < vp.binWidth * 0.6;
        c.fillStyle = isPOC ? _warmA(.6) : inVA ? "rgba(201,163,255,.34)" : "rgba(201,163,255,.16)";
        c.fillRect(xR - w, Math.min(y0, y1), w, h);
      }
    }
    if (reveal >= 2 && _skReady()) {
      const y = pToY(vp.poc);
      if (isFinite(y)) _evLabel(c, "POC " + fmtNum(vp.poc), xR - 4, y, FC_GOLD, "right");
    }
    c.restore();
  }
  // 일목균형표 — 전환/기준선 + 선행스팬 구름(전방 +26 이동, 예측영역까지) + 상태 배지
  function _drawIchimokuLayers(c, ic, M) {
    c.save();
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity, xNow, xRight } = M;
    if (!ic.tenkan || ic.tenkan.length < 2) { c.restore(); return; }
    const shift = ic.shift || 26, fb = M.futBars || shift, seam = (xNow != null ? xNow : fiToX(nowFi)), xr = (xRight != null ? xRight : seam + 80);
    const xAt = fi => fi <= nowFi ? fiToX(fi) : (seam + Math.min(1, (fi - nowFi) / fb) * (xr - seam));
    if (reveal >= 1) {
      const topPts = [], botPts = [];
      for (let i = Math.max(fiMin, 0); i <= nowFi + shift; i++) {
        const src = i - shift; if (src < 0) continue;
        const a = ic.spanA[src], b = ic.spanB[src]; if (!isFinite(a) || !isFinite(b)) continue;
        const x = xAt(i); if (!isFinite(x)) continue;
        topPts.push([x, pToY(Math.max(a, b))]); botPts.push([x, pToY(Math.min(a, b))]);
      }
      if (topPts.length > 1 && _skReady()) {
        const bull = ic.cloud === "bull";
        c.globalAlpha = .13; c.fillStyle = bull ? "#46c28e" : "#e06a6a";
        c.beginPath(); topPts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
        for (let i = botPts.length - 1; i >= 0; i--) c.lineTo(botPts[i][0], botPts[i][1]);
        c.closePath(); c.fill(); c.globalAlpha = 1;
        c.strokeStyle = bull ? "rgba(70,194,142,.45)" : "rgba(224,106,106,.45)"; c.lineWidth = 1; c.setLineDash([]);
        c.beginPath(); topPts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
        c.beginPath(); botPts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
      }
      const line = (series, col, wid) => { const pts = []; for (let fi = Math.max(fiMin, 0); fi <= nowFi; fi++) { const v = series[fi]; if (!isFinite(v)) continue; const x = fiToX(fi), y = pToY(v); if (isFinite(x) && isFinite(y)) pts.push([x, y]); } if (pts.length < 2) return; c.strokeStyle = col; c.lineWidth = wid; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); _skStroke(c, _polyLen(pts)); };
      line(ic.kijun, "#e0a86a", 1.4); line(ic.tenkan, "#8fd0c0", 1.2);
    }
    if (reveal >= 2 && _skReady()) {
      const x = (xRight != null ? xRight : fiToX(nowFi)), y = pToY(ic.last.price);
      const pos = ic.pricePos === "above" ? "구름 위" : ic.pricePos === "below" ? "구름 아래" : "구름 안";
      const col = ic.bias > 0.15 ? "#46c28e" : ic.bias < -0.15 ? "#e06a6a" : "#8a92b2";
      if (isFinite(x) && isFinite(y)) _evLabel(c, "일목 " + pos + " · " + (ic.cloud === "bull" ? "양운" : ic.cloud === "bear" ? "음운" : "중립"), x - 6, y - 14, col, "right");
    }
    if (M.focused && _skReady() && ic.spanA && ic.spanB) {   // 포커스: 미래 구름 도달 밴드(선행스팬 26앞 투영)
      const a = ic.spanA[nowFi], b = ic.spanB[nowFi];
      if (isFinite(a) && isFinite(b)) { const mid = (a + b) / 2, col2 = ic.cloud === "bull" ? "#46c28e" : ic.cloud === "bear" ? "#e06a6a" : "#8a92b2"; _projMark(c, xr, pToY(a), col2); _projMark(c, xr, pToY(b), col2); _evLabel(c, "일목 구름 \u2248 " + _hzFmt(Math.min(a, b)) + "~" + _hzFmt(Math.max(a, b)), xr, pToY(mid), col2, "right"); }
    }
    c.restore();
  }
  // 시장구조 노드 — 다중스케일 티어(대/중/소): 스윙점 + HH/HL/LH/LL 라벨(대형 강조) + BOS/CHoCH.
  function _drawStructureLayers(c, st, M) {
    c.save();
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity, xRight } = M;
    const xR = (xRight != null ? xRight : fiToX(nowFi));
    const tiers = (st.tiers && st.tiers.length) ? st.tiers : null;
    if (!tiers) {   // 폴백(하위호환): 기존 단일 스윙
      if (reveal >= 1) [st.swingHigh, st.swingLow].forEach(sw => { if (!sw) return; const y = pToY(sw.price); if (!isFinite(y)) return; c.strokeStyle = "rgba(240,163,192,.5)"; c.lineWidth = 1; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(fiToX(Math.max(fiMin, sw.idx)), y); c.lineTo(xR, y); c.stroke(); c.setLineDash([]); });
      c.restore(); return;
    }
    tiers.forEach((t, ti) => {
      const emph = ti === 0;   // 대형(유의도 최상위) 강조
      if (reveal < (emph ? 1 : 2)) return;
      const rad = emph ? 3 : ti === 1 ? 2 : 1.4;
      const baseAlpha = emph ? 0.85 : ti === 1 ? 0.45 : 0.22;
      for (const p of (t.swings || [])) {
        const x = fiToX(Math.max(fiMin, p.idx)), y = pToY(p.price);
        if (!isFinite(x) || !isFinite(y)) continue;
        const col = p.type === "H" ? "224,106,106" : "70,194,142";
        c.fillStyle = "rgba(" + col + "," + baseAlpha.toFixed(2) + ")";
        c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill();
        // 라벨은 대형 + 유의도 상위 스윙만(클러터 방지)
        if (emph && _skReady() && p.significance >= 0.5) _evLabel(c, p.label, x, y - (p.type === "H" ? 6 : -12), p.type === "H" ? "#e06a6a" : "#46c28e", "center");
      }
      // BOS/CHoCH 이벤트 라벨
      if (_skReady() && t.event !== "none" && isFinite(t.eventPrice)) {
        const up = t.event.indexOf("up") >= 0, choch = t.event.indexOf("CHoCH") >= 0;
        const y = pToY(t.eventPrice), col = up ? "#46c28e" : "#e06a6a";
        if (isFinite(y)) { c.globalAlpha = emph ? 1 : 0.5; _evLabel(c, (choch ? "CHoCH " : "BOS ") + (up ? "▲" : "▼"), xR - 6, y - 2, col, "right"); c.globalAlpha = 1; }
      }
    });
    c.restore();
  }
  // ATR — ±ATR·배수 손절/목표 밴드 + 변동성 배지
  function _drawAtrLayers(c, at, M) {
    c.save();
    const { pToY, xRight, padX, reveal = Infinity } = M;
    if (!at.last) { c.restore(); return; }
    const xL = (padX != null ? padX : 0), xR = (xRight != null ? xRight : 0);
    if (reveal >= 1 && _skReady()) {
      [[at.stopLong, "rgba(224,106,106,.4)"], [at.stopShort, "rgba(70,194,142,.4)"]].forEach(pair => { const y = pToY(pair[0]); if (!isFinite(y)) return; c.strokeStyle = pair[1]; c.lineWidth = 1; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(xL, y); c.lineTo(xR, y); c.stroke(); c.setLineDash([]); });
      const y2 = pToY(at.stopShort), rg = at.regime === "expanding" ? "변동성↑" : at.regime === "contracting" ? "변동성↓" : "보통";
      if (isFinite(y2)) _evLabel(c, "ATR " + at.pct.toFixed(1) + "% · " + rg, xR - 6, y2, "#9aa8c0", "right");
    }
    c.restore();
  }
  // 스마트머니(SMC) — FVG(공정가치갭)·오더블록 존을 우측으로 연장한 사각형(이미지3 유동성 존식)
  function _drawSmcLayers(c, smc, M) {
    c.save();
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity, xRight } = M;
    if (!smc.ok) { c.restore(); return; }
    const xR = (xRight != null ? xRight : fiToX(nowFi));
    const zone = (z, isOB) => {
      const x0 = fiToX(Math.max(fiMin, z.idx)); if (!isFinite(x0)) return;
      const yH = pToY(z.hi), yL = pToY(z.lo); if (!isFinite(yH) || !isFinite(yL)) return;
      const col = z.type === "bull" ? "70,194,142" : "224,106,106", top = Math.min(yH, yL), h = Math.max(2, Math.abs(yL - yH)), w = Math.max(2, xR - x0);
      c.fillStyle = "rgba(" + col + "," + (isOB ? 0.15 : 0.09) + ")"; c.fillRect(x0, top, w, h);
      if (isOB) { c.strokeStyle = "rgba(" + col + ",.5)"; c.lineWidth = 1; c.setLineDash([3, 3]); c.strokeRect(x0, top, w, h); c.setLineDash([]); }
    };
    if (reveal >= 1) { for (const g of smc.fvgs) zone(g, false); for (const o of smc.obs) zone(o, true); }
    if (reveal >= 2 && _skReady()) {
      const lab = (z, txt) => { const y = pToY((z.hi + z.lo) / 2); if (isFinite(y)) _evLabel(c, txt, xR - 4, y, z.type === "bull" ? "#46c28e" : "#e06a6a", "right"); };
      if (smc.obs.length) { const o = smc.obs[smc.obs.length - 1]; lab(o, o.type === "bull" ? "수요 OB" : "공급 OB"); }
      if (smc.fvgs.length) { const g = smc.fvgs[smc.fvgs.length - 1]; lab(g, g.type === "bull" ? "FVG ↑" : "FVG ↓"); }
    }
    c.restore();
  }
  // 차트 패턴(H&S·깃발) — 감지 시에만 넥라인/폴+채널 작도
  function _drawPatternLayers(c, pt, M) {
    c.save();
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity, xRight } = M;
    if (!pt || !pt.detected || !pt.geom) { c.restore(); return; }
    const xR = (xRight != null ? xRight : fiToX(nowFi));
    const g = pt.geom, up = pt.dir > 0, col = up ? "#46c28e" : "#e06a6a";
    const X = p => fiToX(Math.max(fiMin, p.idx)), Y = p => pToY(p.price);
    if (g.kind === "hns") {
      if (reveal >= 1) [g.shoulders[0], g.head, g.shoulders[1]].forEach(p => { const x = X(p), y = Y(p); if (isFinite(x) && isFinite(y)) { c.fillStyle = col; c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill(); } });
      if (reveal >= 2) {
        const b = g.neckline[0], d = g.neckline[1], x0 = X(b), y0 = Y(b), yR = pToY(b.price + (d.price - b.price) * ((nowFi - b.idx) / ((d.idx - b.idx) || 1)));
        if ([x0, y0, xR, yR].every(isFinite)) { c.strokeStyle = col; c.setLineDash(CDASH.std); c.beginPath(); c.moveTo(x0, y0); c.lineTo(xR, yR); c.stroke(); c.setLineDash([]); }
        if (_skReady()) _evLabel(c, pt.label + (pt.confirmed ? " ✓" : ""), xR - 4, Y(g.head), col, "right");
      }
    } else if (g.kind === "flag") {
      if (reveal >= 1) { const f = g.pole[0], t = g.pole[1], xf = X(f), yf = Y(f), xt = X(t), yt = Y(t); if ([xf, yf, xt, yt].every(isFinite)) { c.strokeStyle = col; c.lineWidth = CW.bold; c.beginPath(); c.moveTo(xf, yf); c.lineTo(xt, yt); c.stroke(); c.lineWidth = CW.base; } }
      if (reveal >= 2) {
        const xt = X(g.pole[1]);
        [g.hi, g.lo].forEach(v => { const y = pToY(v); if (isFinite(y) && isFinite(xt)) { c.strokeStyle = col; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(xt, y); c.lineTo(xR, y); c.stroke(); c.setLineDash([]); } });
        if (_skReady()) _evLabel(c, pt.label + (pt.confirmed ? " ✓" : ""), xR - 4, pToY(g.hi), col, "right");
      }
    }
    c.restore();
  }
  // 사이클(주기 위상) — 적합 파동을 과거에 그리고 다음 전환까지 미래로 투영 + 전환 지점 마커
  function _drawCycleLayers(c, cy, M) {
    c.save();
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity, xNow, xRight, futBars, col } = M;
    if (!cy.period || !cy.fit || cy.fit.length < 2) { c.restore(); return; }
    const COL = col || "#d07ab0";
    const seam = (xNow != null ? xNow : fiToX(nowFi)), xr = (xRight != null ? xRight : seam + 80), fb = futBars || 24;
    const futX = fi => seam + Math.min(1, (fi - nowFi) / fb) * (xr - seam);
    const xAt = fi => fi <= nowFi ? fiToX(fi) : futX(fi);
    const cyVal = fi => (cy.icpt + cy.slope * fi) + cy.amp * Math.cos(cy.w * fi - cy.phi);
    // 미래 투영은 진폭을 감쇠(추세선으로 수렴) → 단주기 사이클이 예측구간에서 급격히 꺾여 보이던 현상 완화. k=1은 감쇠 1(이음매 연속).
    const cyFut = fi => { const kk = fi - nowFi; const cd = kk > 0 ? Math.exp(-(kk - 1) / (fb * 0.5)) : 1; return (cy.icpt + cy.slope * fi) + cy.amp * Math.cos(cy.w * fi - cy.phi) * cd; };
    if (reveal >= 1) {
      const pts = [];
      for (let fi = Math.max(fiMin, 0); fi <= nowFi; fi++) { const x = fiToX(fi), y = pToY(cy.fit[fi]); if (isFinite(x) && isFinite(y)) pts.push([x, y]); }
      const proj = Math.min(fb, Math.max(1, (cy.nextTurn ? cy.nextTurn.bars : 0) + 2));
      for (let k = 1; k <= proj; k++) { const fi = nowFi + k, x = futX(fi), y = pToY(cyFut(fi)); if (isFinite(x) && isFinite(y)) pts.push([x, y]); }
      if (pts.length > 1 && _skReady()) {
        c.strokeStyle = COL; c.globalAlpha = .6; c.lineWidth = 1.2; c.setLineDash([]);
        c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
        _skStroke(c, _polyLen(pts)); c.globalAlpha = 1;
      }
    }
    if (reveal >= 2 && _skReady() && cy.nextTurn) {
      const tfi = nowFi + cy.nextTurn.bars, tx = xAt(tfi), ty = pToY(cyFut(tfi));
      if (isFinite(tx) && isFinite(ty)) {
        c.setLineDash([3, 3]); c.strokeStyle = "rgba(208,122,176,.5)"; c.lineWidth = 1;
        c.beginPath(); c.moveTo(tx, ty - 14); c.lineTo(tx, ty + 14); c.stroke(); c.setLineDash([]);
        c.fillStyle = COL; c.beginPath(); c.arc(tx, ty, 3, 0, 7); c.fill();
        _evLabel(c, (cy.nextTurn.type === "peak" ? "▲고점" : "▼저점") + " ~" + cy.nextTurn.bars + "봉", tx, ty + (cy.nextTurn.type === "peak" ? -8 : 14), COL, "right");
      }
      _evLabel(c, "주기 " + Math.round(cy.period) + "봉 · " + (cy.dir === "rising" ? "상승 국면" : cy.dir === "falling" ? "하락 국면" : "전환 구간"), (xRight != null ? xRight : fiToX(nowFi)), pToY(cy.fit[nowFi]) - 16, COL, "right");
    }
    c.restore();
  }
  // 피벗 노드 S/R — 다중스케일 스윙레벨 클러스터(강조/디밍·터치수 라벨) + 고전 피벗 P만 참고선.
  function _drawPivotLayers(c, piv, M) {
    c.save();
    const { pToY, xRight, padX, top, bot, reveal = Infinity } = M;
    if (!piv || !piv.P) { c.restore(); return; }
    const xL = (padX != null ? padX : 0), xR = (xRight != null ? xRight : 0), GOLD = FC_GOLD;
    // 화면 밖 레벨은 가장자리 마커
    function offMark(price, label, color) {
      const y = pToY(price); if (!isFinite(y)) return false;
      if (top != null && bot != null && (y < top || y > bot)) {
        const cy = y < top ? top + 7 : bot - 3, arw = y < top ? "▲" : "▼";
        _evLabel(c, arw + " " + label + " " + fmtNum(price), xR - 3, cy, color, "right");
        return true;
      }
      return false;
    }
    // 고전 피벗 P: 흐린 점선 참고선(R/S는 렌더 생략 — 데이터·bias엔 존속)
    if (reveal >= 1 && !offMark(piv.P, "P", GOLD)) {
      const yP = pToY(piv.P);
      if (isFinite(yP)) {
        c.setLineDash(CDASH.fine); c.strokeStyle = GOLD; c.lineWidth = CW.hair; c.globalAlpha = 0.35;
        c.beginPath(); c.moveTo(xL, yP); c.lineTo(xR, yP); c.stroke();
        c.globalAlpha = 1; c.setLineDash([]);
        _evLabel(c, "P " + fmtNum(piv.P), xR - 3, yP - 2, GOLD, "right");
      }
    }
    // 스윙레벨 클러스터
    const levels = (piv.srLevels || []).slice();
    const K = 3;   // 상위 강조 개수
    levels.forEach((L, i) => {
      const emph = i < K;   // 유의도 상위 K개 강조(정렬됨)
      if (reveal < (emph ? 1 : 2)) return;   // 강조 먼저 노출
      const col = L.side === "support" ? "#46c28e" : "#e06a6a";
      if (offMark(L.price, L.side === "support" ? "지지" : "저항", col)) return;
      const y = pToY(L.price); if (!isFinite(y)) return;
      const alpha = emph ? 0.9 : Math.max(0.12, 0.15 + L.significance * 0.4);
      c.setLineDash(emph ? [] : CDASH.fine);
      c.strokeStyle = col; c.lineWidth = emph ? CW.bold : CW.hair; c.globalAlpha = alpha;
      c.beginPath(); c.moveTo(xL, y); c.lineTo(xR, y); c.stroke();
      c.globalAlpha = 1; c.setLineDash([]);
      if (emph && _skReady()) _evLabel(c, (L.side === "support" ? "지지" : "저항") + " ×" + L.touches + " " + fmtNum(L.price), xR - 3, y - 2, col, "right");
    });
    // 포커스 시: 정적 S/R이라 선은 이미 미래까지 수평 연장됨 → P 강조 + 도달 라벨(9지표 parity)
    if (M.focused && reveal >= 1) {
      const yP = pToY(piv.P);
      if (isFinite(yP) && !(top != null && bot != null && (yP < top || yP > bot))) {
        c.setLineDash(CDASH.fine); c.strokeStyle = GOLD; c.lineWidth = CW.base; c.globalAlpha = 0.8;
        c.beginPath(); c.moveTo(xL, yP); c.lineTo(xR, yP); c.stroke();
        c.globalAlpha = 1; c.setLineDash([]);
        _projMark(c, xR, yP, GOLD, 1);
        _evLabel(c, "피벗 P 투영 ≈ " + _hzFmt(piv.P), xR, yP, GOLD, "right");
      }
    }
    c.restore();
  }
  // Gann 각도팬 — 앵커점(직전 지배 스윙)에서 우측 끝까지 1×1(굵은 골드)+2×1~1×4(흐린 점선) 직선 투영
  function _drawGannLayers(c, gn, M) {
    c.save();
    const { toY, fiToX, nowFi, futN, xRight, fiMin = 0, top, bot, reveal = Infinity } = M;
    if (top != null && bot != null) { c.beginPath(); c.rect(0, top, xRight + 44, bot - top); c.clip(); }
    // anchors(다중) 우선, 없으면 단일 anchor 폴백(하위호환)
    const list = (gn && gn.anchors && gn.anchors.length) ? gn.anchors
      : (gn && gn.anchor && gn.angles ? [{ idx: gn.anchor.idx, price: gn.anchor.price, angles: gn.angles, significance: 1, reason: "" }] : []);
    if (!list.length) { c.restore(); return; }
    const rightFi = (nowFi != null ? nowFi : 0) + (futN || 0);
    // significance 낮은 것부터 그려 강조가 위에 오게
    const ordered = list.slice().sort((a, b) => (a.significance || 0) - (b.significance || 0));
    const _topAn = ordered[ordered.length - 1];
    for (const an of ordered) {
      const sig = an.significance != null ? an.significance : 0.5;
      const emph = sig >= 0.6 || an === _topAn;   // 최상위 앵커는 항상 강조(굵은 참조선+라벨 보장)
      if (reveal !== Infinity && reveal < (emph ? 1 : 2)) continue;   // 시뮬레이션 재생 reveal 게이팅(강조 앵커 먼저, 형제 지표와 타이밍 정합)
      const alpha = emph ? 1 : Math.max(0.12, 0.15 + sig * 0.4);
      // 밀도: 강조=전체 7각, 흐림=1×1·2×1·1×2만
      const angs = emph ? an.angles : an.angles.filter(a => ["1x1", "2x1", "1x2"].includes(a.name));
      const startFi = Math.max(fiMin, an.idx);                   // 앵커 창밖이면 좌단 진입점
      for (const a of angs) {
        const is11 = a.name === "1x1";
        const y1 = an.price + a.slope * (startFi - an.idx), y2 = an.price + a.slope * (rightFi - an.idx);
        const x1 = fiToX(startFi); if (!isFinite(x1)) continue;
        c.beginPath(); c.moveTo(x1, toY(y1)); c.lineTo(xRight, toY(y2));
        c.strokeStyle = (is11 && emph) ? FC_GOLD : "rgba(201,162,107," + (is11 ? alpha : alpha * 0.5).toFixed(3) + ")";
        c.lineWidth = (is11 && emph) ? CW.bold : CW.base;
        c.setLineDash(is11 ? [] : CDASH.std); c.stroke(); c.setLineDash([]);
      }
      // 앵커 도트(창 안일 때) + 강조 앵커 라벨(reason)
      if (an.idx >= fiMin) { const ax = fiToX(an.idx), ay = toY(an.price); if (isFinite(ax) && isFinite(ay)) { c.beginPath(); c.arc(ax, ay, emph ? 3 : 2, 0, Math.PI * 2); c.fillStyle = emph ? FC_GOLD : "rgba(201,162,107," + alpha.toFixed(3) + ")"; c.fill(); } }
      if (emph) { const yR = an.price + (an.angles.find(a => a.name === "1x1") || { slope: 0 }).slope * (rightFi - an.idx); c.fillStyle = FC_GOLD; c.font = "10px sans-serif"; c.fillText(an.reason || "1×1", xRight + 3, toY(yR)); }
    }
    c.restore();
  }
  // Parabolic SAR hero 작도 — 봉마다 SAR 점(가격 위/아래로 추세방향 표시) + 배지
  function _drawPsarLayers(c, a, M) {
    if (!a || !a.series || !a.series.length) return;
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity, xRight, price } = M;
    c.save();
    if (reveal >= 1) {
      for (let fi = Math.max(fiMin, 0); fi <= nowFi; fi++) {
        const v = a.series[fi]; if (v == null || !isFinite(v)) continue;
        const x = fiToX(fi), y = pToY(v); if (!isFinite(x) || !isFinite(y)) continue;
        const p = (price && isFinite(price[fi])) ? price[fi] : null;
        const up = p != null ? (v < p) : (a.dir === 1);
        c.fillStyle = up ? "#46c28e" : "#e06a6a";
        c.beginPath(); c.arc(x, y, 2.2, 0, Math.PI * 2); c.fill();
      }
    }
    if (reveal >= 2) {
      const _by = (M.badgeY != null) ? M.badgeY : 28, up = a.dir === 1;
      const t = "SAR " + (up ? "상승 ▲" : "하락 ▼") + (a.flip ? " · 전환" : "");
      _evLabel(c, t, (xRight != null ? xRight : fiToX(nowFi)) - 6, _by, up ? "#46c28e" : "#e06a6a", "right");
    }
    // 포커스 시 미래 투영: SAR 계열을 최근 봉당 기울기로 감쇠 연장한 점렬(방향색) + 도달 라벨. AF/EP 미보유라 계열 기울기 근사("투영" 명시).
    if (M.focused && M.xNow != null && M.futBars && reveal >= 2) {
      const fb = M.futBars, xr = (xRight != null ? xRight : fiToX(nowFi));
      const w = Math.min(24, Math.max(6, Math.round(fb / 2)));
      const base = a.series[nowFi], prev = a.series[Math.max(0, nowFi - w)];
      if (isFinite(base) && isFinite(prev)) {
        const slPer = (base - prev) / w, up = a.dir === 1, dcol = up ? "#46c28e" : "#e06a6a";
        let endV = base;
        c.save(); c.fillStyle = dcol; c.globalAlpha = 0.7;
        for (let k = 1; k <= fb; k++) {
          endV = base + slPer * k * Math.exp(-k / (fb * 1.5));
          const px = M.xNow + (xr - M.xNow) * k / fb, py = pToY(endV);
          if (isFinite(px) && isFinite(py)) { c.beginPath(); c.arc(px, py, 2, 0, Math.PI * 2); c.fill(); }
        }
        c.restore();
        _evLabel(c, "SAR 투영 ≈ " + _hzFmt(endV), xr, pToY(endV), dcol, "right");
      }
    }
    c.restore();
  }
  // Keltner 채널 hero 작도 — 중심(EMA)·상/하단(±ATR×배수) 3선을 봉별 추종선으로(볼린저 미러). 볼린저와 구분: 채움 없음·긴 대시·teal·라벨 접두 "KC"
  function _drawKeltnerLayers(c, kt, M) {
    if (!kt || !kt.midArr || !kt.midArr.length) return;
    c.save();
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity, xRight } = M;
    const COL = "#7fc0d0";
    const collect = series => { const pts = []; for (let fi = Math.max(fiMin, 0); fi <= nowFi; fi++) { const v = series[fi]; if (v == null || !isFinite(v)) continue; const x = fiToX(fi), y = pToY(v); if (isFinite(x) && isFinite(y)) pts.push([x, y]); } return pts; };
    const stroke = (series, dash, wid, alpha) => { const pts = collect(series); if (pts.length < 2) return; c.setLineDash(dash || []); c.lineWidth = wid; c.globalAlpha = alpha; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); _skStroke(c, _polyLen(pts)); c.globalAlpha = 1; c.setLineDash([]); };
    if (reveal >= 1) {
      c.strokeStyle = COL;
      stroke(kt.upperArr, CDASH.long, CW.base, 0.5);
      stroke(kt.lowerArr, CDASH.long, CW.base, 0.5);
      stroke(kt.midArr, [], CW.bold, 0.85);
    }
    if (reveal >= 2 && _skReady()) {
      const x = (xRight != null ? xRight : fiToX(nowFi)), y = pToY(kt.mid);
      const posTxt = kt.pctB > 1 ? "상단 돌파" : kt.pctB < 0 ? "하단 이탈" : kt.pctB > 0.8 ? "상단권" : kt.pctB < 0.2 ? "하단권" : "채널 중앙";
      const col = kt.bias > 0.15 ? "#46c28e" : kt.bias < -0.15 ? "#e06a6a" : COL;
      if (isFinite(x) && isFinite(y)) _evLabel(c, "KC " + posTxt + (kt.squeeze ? " · 스퀴즈" : "") + " · %B" + kt.pctB.toFixed(2), x - 6, y, col, "right");
    }
    // 포커스 시 미래 투영: 중심(감쇠 기울기)+도달 라벨, 상/하단은 흐린 밴드로 연장
    if (M.focused && M.xNow != null && M.futBars && reveal >= 2) {
      const xr = xRight != null ? xRight : fiToX(nowFi);
      _projFaintLine(c, kt.upperArr, nowFi, M.xNow, xr, M.futBars, pToY, COL, 0.4);
      _projFaintLine(c, kt.lowerArr, nowFi, M.xNow, xr, M.futBars, pToY, COL, 0.4);
      _projFwd(c, kt.midArr, nowFi, M.xNow, xr, M.futBars, pToY, COL, "켈트너 중심 투영");
    }
    c.restore();
  }
  // Donchian 채널 hero 작도 — 상/하단(N봉 롤링 최고·최저)·중앙선을 봉별 '계단선'(움직이는 채널)으로. 정적 수평선 금지(피벗 S/R와 구분).
  // Keltner와 구분: 실선 중앙 + 점선(짧은 대시) 상하단 · gold-ish 색 · 계단(step) 형태 · 라벨 접두 "DC"
  function _drawDonchianLayers(c, dc, M) {
    if (!dc || !dc.midArr || !dc.midArr.length) return;
    c.save();
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity, xRight } = M;
    const COL = "#d0c080";
    // 계단선: fi→fi+1 구간에서 값이 유지되다 다음 봉에서 갱신되는 형태(수평 유지 후 수직 점프)로 점 수집
    const collectStep = series => {
      const pts = [];
      for (let fi = Math.max(fiMin, 0); fi <= nowFi; fi++) {
        const v = series[fi]; if (v == null || !isFinite(v)) continue;
        const x0 = fiToX(fi), x1 = fiToX(fi + 1), y = pToY(v);
        if (!isFinite(x0) || !isFinite(y)) continue;
        pts.push([x0, y]);
        if (isFinite(x1)) pts.push([x1, y]);
      }
      return pts;
    };
    const stroke = (series, dash, wid, alpha) => { const pts = collectStep(series); if (pts.length < 2) return; c.setLineDash(dash || []); c.lineWidth = wid; c.globalAlpha = alpha; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); _skStroke(c, _polyLen(pts)); c.globalAlpha = 1; c.setLineDash([]); };
    if (reveal >= 1) {
      c.strokeStyle = COL;
      stroke(dc.upperArr, CDASH.std, CW.base, 0.55);
      stroke(dc.lowerArr, CDASH.std, CW.base, 0.55);
      stroke(dc.midArr, [], CW.bold, 0.85);
    }
    if (reveal >= 2 && _skReady()) {
      const x = (xRight != null ? xRight : fiToX(nowFi)), y = pToY(dc.mid);
      const posTxt = dc.pos > 0.98 ? "상단 돌파" : dc.pos < 0.02 ? "하단 이탈" : dc.pos > 0.8 ? "상단권" : dc.pos < 0.2 ? "하단권" : "채널 중앙";
      const col = dc.bias > 0.15 ? "#46c28e" : dc.bias < -0.15 ? "#e06a6a" : COL;
      if (isFinite(x) && isFinite(y)) _evLabel(c, "DC " + posTxt + " · pos" + dc.pos.toFixed(2), x - 6, y, col, "right");
    }
    // 포커스 시 미래 투영: 중심(감쇠)만 투영·상/하단은 현재값 수평 유지(롤링 max/min은 후행 → 돌파 전 평평이 정직)
    if (M.focused && M.xNow != null && M.futBars && reveal >= 2) {
      const xr = xRight != null ? xRight : fiToX(nowFi);
      _projHeldLine(c, dc.upperArr[nowFi], M.xNow, xr, pToY, COL, 0.38);
      _projHeldLine(c, dc.lowerArr[nowFi], M.xNow, xr, pToY, COL, 0.38);
      _projFwd(c, dc.midArr, nowFi, M.xNow, xr, M.futBars, pToY, COL, "돈치안 중심 투영");
    }
    c.restore();
  }
  // 2차 예측: 범례 표시중(_evVisible / 포커스) 지표만의 조합으로 엔진 재실행(캐시). 메인=전체 추가지표.
  let _pred2Cache = { key: null, pred: null, n: 0 };
  function _get2ndPred() {
    const data = _fcLastData || (typeof currentData === "function" ? currentData() : null);
    if (!data || typeof ForgeCore === "undefined" || !ForgeCore.run || typeof boardToGraph !== "function") return null;
    const act = _focusInd ? new Set([_focusInd]) : _evVisible;
    const tfk = (typeof activeTF === "function") ? activeTF() : "1day";
    // 데이터(종목·기간) 지문을 키에 포함 — 없으면 활성지표·TF가 같은 다른 종목에서 이전 2차가 stale로 남아 엉뚱한 스케일 라인이 그려짐
    const _dsig = (data.price && data.price.length) ? (data.price.length + ":" + data.price[0] + ":" + data.price[data.price.length - 1]) : "0";
    const key = [...act].sort().join(",") + "|" + tfk + "|" + _dsig;
    if (_pred2Cache.key === key && _pred2Cache.pred) return _pred2Cache;
    try {
      const full = boardToGraph();
      const nodes = full.nodes.filter(nd => nd.kind !== "block" || nd.blockType === "ticker" || nd.blockType === "price" || act.has(nd.blockType));
      const ids = new Set(nodes.map(nd => nd.id));
      const edges = (full.edges || []).filter(e => ids.has(e.from) && ids.has(e.to));
      const nInd = nodes.filter(nd => nd.kind === "block" && act.has(nd.blockType)).length;
      const dw = (typeof _driftW !== "undefined") ? _driftW : {};
      const r = ForgeCore.run({ nodes, edges }, data, { futW: horizonForTF(tfk), timeframe: tfk, driftWeights: dw });
      _pred2Cache = { key, pred: r.prediction, n: nInd };
      return _pred2Cache;
    } catch (e) { return null; }
  }
  function drawEvidence() { try { _drawEvidence(); } catch (e) { console.warn("evidence", e); } }
  function _drawEvidence() {
    const cv = document.getElementById("fcEvidence"); if (!cv) return;
    const hero = cv.parentElement; const W = hero.clientWidth, H = hero.clientHeight;
    _evW = W; _evH = H;
    if (!W || !H) return;
    // 캔버스를 hero 전체 크기로 명시(style.width 포함) — 콘과 같은 좌표계. (inset:0이 안 먹어 300px에 갇히던 버그)
    const dpr = Math.min(devicePixelRatio || 1, 3), ww = Math.round(W * dpr), hh = Math.round(H * dpr);
    if (cv.width !== ww || cv.height !== hh) { cv.width = ww; cv.height = hh; }
    cv.style.width = W + "px"; cv.style.height = H + "px";
    if (!_scanning && cv.style.clipPath) cv.style.clipPath = "";   // 재생 아니면 스캔 클립 잔여 해제(안전)
    const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    // 결정적 지표 전용 캔버스(선명+글로우) — 중요도 높은 노드만 여기로 라우팅. _heroZoom은 차트모드서 항등이라 DPR 변환만.
    const cvHi = document.getElementById("fcEvidenceHi"); let cHi = null;
    if (cvHi) { if (cvHi.width !== ww || cvHi.height !== hh) { cvHi.width = ww; cvHi.height = hh; } cvHi.style.width = W + "px"; cvHi.style.height = H + "px"; cHi = cvHi.getContext("2d"); cHi.setTransform(dpr, 0, 0, dpr, 0, 0); cHi.clearRect(0, 0, W, H); cHi.lineJoin = "round"; cHi.lineCap = "round"; }
    _evLabelBoxes = _axisLabelBoxes.slice();   // 축 눈금·현재가 pill을 먼저 예약 → 근거 라벨이 이를 피함
    _skFrac = (_scanning && _scanU < 1) ? _scanU : null;   // 시연 중이면 진행형 작도(손그림)
    if (!_evidenceShow || !_evidenceSet.size || !lastResult) return;
    if (typeof window !== "undefined" && window._fcPreview) return;   // 웹분석 전엔 분석근거 오버레이 미표시(버튼도 비활성 — CSS)
    // 예측을 계산한 바로 그 시계열을 사용(차트/콘과 동일) — 작도·예측 정합 보장
    const price = ((_fcLastData && _fcLastData.price) || currentData().price) || []; const P = price.length; if (P < 2) return;
    const mode = heroMode();
    const nodes = evIndicatorNodes().filter(n => _evidenceSet.has(n.id));
    if (!nodes.length) return;
    c.save(); c.translate(_heroZoom.tx, _heroZoom.ty); c.scale(_heroZoom.s, _heroZoom.s);
    const legend = [];
    c.lineWidth = 1.5; c.lineJoin = "round"; c.lineCap = "round";   // 라운드 캡/조인 = 점선·곡선 고급감
    if (mode === "chart") {
      const main = document.getElementById("fcMainChart"), g = main && main._mainGeo; if (!g) { c.restore(); return; }
      const _elo = tvLog(g.loV, g.log), _ehi = tvLog(g.hiV, g.log);
      const toY = v => g.padTop + (1 - (tvLog(v, g.log) - _elo) / ((_ehi - _elo) || 1)) * (g.ch - g.padTop - g.padBot);
      const wS = g.start, wC = g.count, plotR = g.padX + g.plotW;
      const toXh = i => g.padX + (i / (wC - 1)) * g.histW;       // i = 윈도 상대 인덱스(0..wC-1)
      const fiToX = fi => (fi >= wS && fi <= wS + wC - 1) ? toXh(fi - wS) : NaN;   // 절대 fi → 윈도 x, 밖=NaN
      let _slot = 0; const _slotY = () => g.padTop + 2 + (_slot++) * 18;   // 우상단 배지 세로 슬롯(18px 간격)
      const _focus = _evHover || _focusInd;   // hover 프리뷰 > 클릭 잠금
      // 범례는 분석된 모든 지표를 나열(숨김 것도 켤 수 있게). 표시 여부는 _evVisible/_focus로 결정.
      const legendAll = []; const _seenT = new Set();
      for (const n of nodes) { if (n.blockType && !_seenT.has(n.blockType)) { _seenT.add(n.blockType); legendAll.push({ col: EV_COLORS[n.blockType] || "#8a92b2", t: EV_LABEL[n.blockType] || n.blockType, _key: n.blockType }); } }
      for (const n of nodes) {
        const col = EV_COLORS[n.blockType] || "#8a92b2";
        const _drawThis = _focus ? (n.blockType === _focus) : _evVisible.has(n.blockType);
        const _dec = ((n.weight != null ? n.weight : 50) >= 58) || Math.abs(n.conviction || 0) >= 30;   // 중요도↑ 또는 확신(방향)↑ = 예측에 결정적
        if (_scanning && _scanU < 1) {   // 시연 작도 속도차: 중요한 지표일수록 먼저·빠르게 완성(도구 무관, 동시 시작)
          const _imp = Math.min(1, ((n.weight != null ? n.weight : 50) + Math.abs(n.conviction || 0)) / 140);
          _skFrac = Math.max(0, Math.min(1, (_scanU - (1 - _imp) * 0.42) / 0.5));
        }
        const cc = (cHi && _dec) ? cHi : c;   // 결정적 → 선명 캔버스(글로우), 나머지 → 희미
        if (n.blockType === "ma") {
          const ma = _an("MA", price, { len: (n.params && n.params.len) || 20, ema: !!(n.params && n.params.ema) });
          if (_drawThis) _drawMALayers(cc, ma, { fiToX, pToY: v => toY(v), nowFi: P - 1, fiMin: wS, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xNow: g.seamX, xRight: g.padX + g.plotW, futBars: (g.path && g.path.length) || 24, focused: (_focus === "ma") });
          legend.push({ col, t: EV_LABEL.ma + "(다중)", _key: n.blockType });
        } else if (n.blockType === "trend") {
          const _prof = ForgeCore.trendProfileForTF(activeTF());
          const ta = _an("Trend", price, { shortLen: Math.max(8, Math.round(((n.params && n.params.len) || 40) * (_prof.shortScale || 1))), pivotSwing: (n.params && n.params.pivotSwing != null ? n.params.pivotSwing / 100 : 0.08), channelK: (n.params && n.params.channelK) || 2, weights: _prof.weights });
          const futBars = (g.path && g.path.length) || 24;
          if (_drawThis) _drawTrendLayers(cc, ta, {
            fiToX,
            pToY: v => toY(v),
            nowFi: P - 1, xNow: g.seamX, xRight: g.padX + g.plotW, futBars, fiMin: wS, focused: (_focus === "trend")
          });
          legend.push({ col, t: EV_LABEL.trend + (_prof.label ? " \xb7 " + _prof.label : ""), _key: n.blockType });
        } else if (n.blockType === "fib") {
          const fib = _an("Fib", price, { len: (n.params && n.params.len) || 120, swing: ((n.params && n.params.swing) != null ? n.params.swing : 5) / 100 });
          if (_drawThis) _drawFibLayers(cc, fib, { fiToX, pToY: v => toY(v), nowFi: P - 1, fiMin: wS, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.padX + g.plotW, top: g.padTop, bot: g.ch - g.padBot });
          legend.push({ col, t: EV_LABEL.fib + "(전문)", _key: n.blockType });
        } else if (n.blockType === "elliott") {
          const ea = _an("Elliott", price, { swing: ((n.params && n.params.swing) != null ? n.params.swing : 3) / 100 });
          if (_drawThis) _drawElliottLayers(cc, ea, { fiToX, pToY: v => toY(v), nowFi: P - 1, fiMin: wS, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.padX + g.plotW, badgeY: _slotY(), top: g.padTop, bot: g.ch - g.padBot });
          legend.push({ col, t: EV_LABEL.elliott + "(전문·다중degree)", _key: n.blockType });
        } else if (n.blockType === "rsi") {
          const rsi = _an("RSI", price, { period: (n.params && n.params.period) || 14 });
          if (_drawThis) _drawRsiLayers(cc, rsi, { fiToX, pToY: v => toY(v), nowFi: P - 1, fiMin: wS, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.padX + g.plotW, badgeY: _slotY() });
          legend.push({ col, t: EV_LABEL.rsi + "(전문)", _key: n.blockType });
        } else if (n.blockType === "bollinger") {
          const bb = _an("Bollinger", price, { len: (n.params && n.params.len) || 20, k: (n.params && n.params.k) || 2 });
          if (_drawThis) _drawBollingerLayers(cc, bb, { fiToX, pToY: v => toY(v), nowFi: P - 1, fiMin: wS, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.padX + g.plotW, xNow: g.seamX, futBars: (g.path && g.path.length) || 24, focused: (_focus === "bollinger") });
          legend.push({ col, t: EV_LABEL.bollinger, _key: n.blockType });
        } else if (n.blockType === "macd") {
          const mac = _an("MACD", price, { fast: (n.params && n.params.fast) || 12, slow: (n.params && n.params.slow) || 26, signal: (n.params && n.params.signal) || 9 });
          if (_drawThis) _drawMacdLayers(cc, mac, { fiToX, nowFi: P - 1, xRight: g.padX + g.plotW, badgeY: _slotY() });
          legend.push({ col, t: EV_LABEL.macd, _key: n.blockType });
        } else if (n.blockType === "adx") {
          const ax = _an("ADX", price, { period: (n.params && n.params.period) || 14 });
          if (_drawThis) _drawAdxLayers(cc, ax, { fiToX, nowFi: P - 1, xRight: g.padX + g.plotW, badgeY: _slotY() });
          legend.push({ col, t: EV_LABEL.adx, _key: n.blockType });
        } else if (n.blockType === "volumeprofile") {
          const _vn2 = boardState.nodes.find(x => x.blockType === "volume");
          const vp = _anVP(price, { len: (n.params && n.params.len) || 120, bins: (n.params && n.params.bins) || 24 });
          if (_drawThis) _drawVolumeProfileLayers(cc, vp, { pToY: v => toY(v), xRight: g.padX + g.plotW, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity });
          legend.push({ col, t: EV_LABEL.volumeprofile, _key: n.blockType });
        } else if (n.blockType === "ichimoku") {
          const ic = _an("Ichimoku", price, { tenkan: (n.params && n.params.tenkan) || 9, kijun: (n.params && n.params.kijun) || 26, senkouB: (n.params && n.params.senkouB) || 52, shift: (n.params && n.params.shift) || 26 });
          if (_drawThis) _drawIchimokuLayers(cc, ic, { fiToX, pToY: v => toY(v), nowFi: P - 1, fiMin: wS, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xNow: g.seamX, xRight: g.padX + g.plotW, futBars: (g.path && g.path.length) || 24, focused: (_focus === "ichimoku") });
          legend.push({ col, t: EV_LABEL.ichimoku, _key: n.blockType });
        } else if (n.blockType === "structure") {
          const st = _anStruct(price, { swing: ((n.params && n.params.swing) != null ? n.params.swing : 3) / 100 });
          if (_drawThis) _drawStructureLayers(cc, st, { fiToX, pToY: v => toY(v), nowFi: P - 1, fiMin: wS, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.padX + g.plotW });
          legend.push({ col, t: EV_LABEL.structure, _key: n.blockType });
        } else if (n.blockType === "atr") {
          const at = ForgeCore.analyzeATR(price, { period: (n.params && n.params.period) || 14, mult: (n.params && n.params.mult) || 2 });
          if (_drawThis) _drawAtrLayers(cc, at, { pToY: v => toY(v), xRight: g.padX + g.plotW, padX: g.padX, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity });
          legend.push({ col, t: EV_LABEL.atr, _key: n.blockType });
        } else if (n.blockType === "smc") {
          const _cand = (_fcLastData && _fcLastData.candle) || (currentData().candle) || [];
          const smc = _anSMC(price);
          if (_drawThis) _drawSmcLayers(cc, smc, { fiToX, pToY: v => toY(v), nowFi: P - 1, fiMin: wS, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.padX + g.plotW });
          legend.push({ col, t: EV_LABEL.smc, _key: n.blockType });
        } else if (n.blockType === "pattern") {
          const pt = _anPattern(price, { swing: ((n.params && n.params.swing) != null ? n.params.swing : 3) / 100 });
          if (_drawThis) _drawPatternLayers(cc, pt, { fiToX, pToY: v => toY(v), nowFi: P - 1, fiMin: wS, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.padX + g.plotW });
          legend.push({ col, t: EV_LABEL.pattern, _key: n.blockType });
        } else if (n.blockType === "cycle") {
          const cy = _an("Cycle", price, { pmin: (n.params && n.params.pmin) || 10, pmax: (n.params && n.params.pmax) || 0 });
          if (_drawThis) _drawCycleLayers(cc, cy, { fiToX, pToY: v => toY(v), nowFi: P - 1, fiMin: wS, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xNow: g.seamX, xRight: g.padX + g.plotW, futBars: (g.path && g.path.length) || 24, col });
          legend.push({ col, t: EV_LABEL.cycle, _key: n.blockType });
        } else if (n.blockType === "vwap") {
          const vw = _anGet(price, "VWAPev|" + ((n.params && n.params.len) || 20), () => ForgeCore.analyzeVWAP(price, _anVolSeries(price), { len: (n.params && n.params.len) || 20 }));
          if (_drawThis) _drawVwapLayers(cc, vw, { fiToX, pToY: v => toY(v), nowFi: P - 1, fiMin: wS, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.padX + g.plotW, badgeY: _slotY(), col, xNow: g.seamX, futBars: (g.path && g.path.length) || 24, focused: (_focus === "vwap") });
          legend.push({ col, t: EV_LABEL.vwap, _key: n.blockType });
        } else if (n.blockType === "supertrend") {
          const stt = _an("Supertrend", price, { period: (n.params && n.params.period) || 10, mult: (n.params && n.params.mult) || 3 });
          if (_drawThis) _drawSupertrendLayers(cc, stt, { fiToX, pToY: v => toY(v), nowFi: P - 1, fiMin: wS, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.padX + g.plotW, badgeY: _slotY(), xNow: g.seamX, futBars: (g.path && g.path.length) || 24, focused: (_focus === "supertrend") });
          legend.push({ col, t: EV_LABEL.supertrend, _key: n.blockType });
        } else if (n.blockType === "stochastic") {
          const stc = _an("Stochastic", price, { kLen: (n.params && n.params.kLen) || 14, kSmooth: (n.params && n.params.kSmooth) || 3, dLen: (n.params && n.params.dLen) || 3 });
          if (_drawThis) _drawStochLayers(cc, stc, { xRight: g.padX + g.plotW, badgeY: _slotY(), reveal: _playing ? (_evReveal[n.id] || 0) : Infinity });
          legend.push({ col, t: EV_LABEL.stochastic, _key: n.blockType });
        } else if (n.blockType === "pivot") {
          const piv = _anPivotDraw(price);
          if (_drawThis) _drawPivotLayers(cc, piv, { pToY: v => toY(v), xRight: g.padX + g.plotW, padX: g.padX, top: g.padTop, bot: g.ch - g.padBot, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, focused: (_focus === "pivot") });
          legend.push({ col, t: EV_LABEL.pivot, _key: n.blockType });
        } else if (n.blockType === "gann") {
          const gn = _anGann(price, n.params);
          if (_drawThis) _drawGannLayers(cc, gn, { toY: v => toY(v), fiToX, nowFi: P - 1, futN: g.pathLen, xRight: g.padX + g.plotW, fiMin: wS, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, top: g.padTop, bot: g.ch - g.padBot });
          legend.push({ col, t: EV_LABEL.gann, _key: n.blockType });
        } else if (n.blockType === "psar") {
          const ps = _anPsar(price, { step: (n.params && n.params.step) || 0.02, max: (n.params && n.params.max) || 0.2 });
          if (_drawThis) _drawPsarLayers(cc, ps, { fiToX, pToY: v => toY(v), nowFi: P - 1, fiMin: wS, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.padX + g.plotW, badgeY: _slotY(), price, xNow: g.seamX, futBars: (g.path && g.path.length) || 24, focused: (_focus === "psar") });
          legend.push({ col, t: EV_LABEL.psar, _key: n.blockType });
        } else if (n.blockType === "keltner") {
          const kt = _anKeltner(price, { len: (n.params && n.params.len) || 20, atrLen: (n.params && n.params.atrLen) || 10, mult: (n.params && n.params.mult) || 2 });
          if (_drawThis) _drawKeltnerLayers(cc, kt, { fiToX, pToY: v => toY(v), nowFi: P - 1, fiMin: wS, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.padX + g.plotW, xNow: g.seamX, futBars: (g.path && g.path.length) || 24, focused: (_focus === "keltner") });
          legend.push({ col, t: EV_LABEL.keltner, _key: n.blockType });
        } else if (n.blockType === "donchian") {
          const dc = _anDonchian(price, { len: (n.params && n.params.len) || 20 });
          if (_drawThis) _drawDonchianLayers(cc, dc, { fiToX, pToY: v => toY(v), nowFi: P - 1, fiMin: wS, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.padX + g.plotW, xNow: g.seamX, futBars: (g.path && g.path.length) || 24, focused: (_focus === "donchian") });
          legend.push({ col, t: EV_LABEL.donchian, _key: n.blockType });
        } else if (n.blockType === "cci") {
          const cci = _an("CCI", price, { period: (n.params && n.params.period) || 20 });
          if (_drawThis) _drawCciLayers(cc, cci, { xRight: g.padX + g.plotW, badgeY: _slotY(), reveal: _playing ? (_evReveal[n.id] || 0) : Infinity });
          legend.push({ col, t: EV_LABEL.cci, _key: n.blockType });
        } else if (n.blockType === "williams") {
          const wl = _anWilliams(price, { period: (n.params && n.params.period) || 14 });
          if (_drawThis) _drawWilliamsLayers(cc, wl, { xRight: g.padX + g.plotW, badgeY: _slotY(), reveal: _playing ? (_evReveal[n.id] || 0) : Infinity });
          legend.push({ col, t: EV_LABEL.williams, _key: n.blockType });
        } else if (n.blockType === "roc") {
          const roc = _an("ROC", price, { period: (n.params && n.params.period) || 12 });
          if (_drawThis) _drawRocLayers(cc, roc, { xRight: g.padX + g.plotW, badgeY: _slotY(), reveal: _playing ? (_evReveal[n.id] || 0) : Infinity });
          legend.push({ col, t: EV_LABEL.roc, _key: n.blockType });
        } else if (n.blockType === "ao") {
          const ao = _anAo(price, { fast: (n.params && n.params.fast) || 5, slow: (n.params && n.params.slow) || 34 });
          if (_drawThis) _drawAoLayers(cc, ao, { xRight: g.padX + g.plotW, badgeY: _slotY(), reveal: _playing ? (_evReveal[n.id] || 0) : Infinity });
          legend.push({ col, t: EV_LABEL.ao, _key: n.blockType });
        } else if (n.blockType === "aroon") {
          const arA = _anAroon(price, { period: (n.params && n.params.period) || 25 });
          if (_drawThis) _drawAroonLayers(cc, arA, { xRight: g.padX + g.plotW, badgeY: _slotY(), reveal: _playing ? (_evReveal[n.id] || 0) : Infinity });
          legend.push({ col, t: EV_LABEL.aroon, _key: n.blockType });
        } else if (n.blockType === "mfi") {
          const mf = _anMfi(price, { period: (n.params && n.params.period) || 14 });
          if (_drawThis) _drawMfiLayers(cc, mf, { xRight: g.padX + g.plotW, badgeY: _slotY(), reveal: _playing ? (_evReveal[n.id] || 0) : Infinity });
          legend.push({ col, t: EV_LABEL.mfi, _key: n.blockType });
        } else if (n.blockType === "cmf") {
          const cm = _anCmf(price, { period: (n.params && n.params.period) || 20 });
          if (_drawThis) _drawCmfLayers(cc, cm, { xRight: g.padX + g.plotW, badgeY: _slotY(), reveal: _playing ? (_evReveal[n.id] || 0) : Infinity });
          legend.push({ col, t: EV_LABEL.cmf, _key: n.blockType });
        } else if (n.blockType === "volume") {
          const va = _anVolume(price);
          if (_drawThis) _drawVolumeLayers(cc, va, { fiToX, pToY: v => toY(v), nowFi: P - 1, fiMin: wS, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.padX + g.plotW, lastPrice: price[P - 1], badgeY: _slotY() });
          legend.push({ col, t: EV_LABEL.volume + "(전문)", _key: n.blockType });
        } else if (n.blockType === "phasefold") {
          const m = lastResult && lastResult.meta && lastResult.meta[n.id]; if (m && m.best) legend.push({ col, t: "주기 " + Math.round(m.best) });
        }
      }
      // 2차 예측선(표시중 지표 조합) — 메인(전체 지표)과 비교용. 보라 점선.
      try {
        const _c2 = _get2ndPred(), p2 = _c2 && _c2.pred;
        const _2diff = (p2 && p2.path && p2.path.length && g.path && g.path.length) ? Math.abs(Math.log((p2.path[p2.path.length - 1] || 1) / (g.path[g.path.length - 1] || 1))) : 0;
        if (p2 && p2.path && p2.path.length && _2diff > 0.008) {   // 2차가 1차(종합)와 사실상 같으면 생략(중복 제거)
          const _sx = g.seamX, _cR = plotR, _pl = p2.path.length, _t2x = k => _sx + ((k + 1) / _pl) * (_cR - _sx);
          c.save(); c.strokeStyle = "#4dd0ff"; c.lineWidth = 3.8; c.setLineDash([9, 4]); c.lineJoin = "round"; c.shadowColor = "rgba(77,208,255,1)"; c.shadowBlur = 16;
          const _cy2 = y => Math.max(g.padTop + 1, Math.min(g.ch - g.padBot - 1, y));   // 플롯 밖으로 튀지 않게 클램프(축이 밴드를 넘는 극단 대비 안전망)
          c.beginPath(); c.moveTo(_sx, _cy2(toY(g.anchor)));
          for (let k = 0; k < _pl; k++) { const x = _t2x(k), y = _cy2(toY(p2.path[k])); if (isFinite(x) && isFinite(y)) c.lineTo(x, y); }
          c.stroke(); c.setLineDash([]); c.shadowBlur = 0; c.restore();
          let _p2s = 0, _p2w = 0; for (let k = 0; k < p2.path.length; k++) { const wt = 1 / Math.sqrt(k + 1); const _hk = (g.hi && g.hi[k]) || p2.path[k]; _p2s += _upProb(p2.path[k], _hk, g.anchor) * wt; _p2w += wt; }
          const _p2up = _p2w ? _p2s / _p2w : 50, _p2dir = p2.path[p2.path.length - 1] >= g.anchor, _p2disp = Math.round(_p2dir ? _p2up : (100 - _p2up));
          _predEndDeco(c, p2.path, _sx, _cR, toY, { padX: g.padX, plotW: g.plotW, padTop: g.padTop, padBot: g.padBot, ch: g.ch }, "#4dd0ff", "2차\u00b7" + _p2disp + "%", 12, true);
          _comets.p2 = { pts: p2.path.map((v, k) => [_t2x(k), _cy2(toY(v))]), col: "#4dd0ff", prob: _p2disp };
          if (typeof _startComets === "function") _startComets();
        }
      } catch (e) {}
      _evLegend(cHi || c, g.padX, g.padTop, legendAll);   // 범례는 선명 캔버스에(모든 지표 나열, 표시/숨김 토글)
    } else {
      const cone = document.getElementById("fcCone"), g = cone && cone._coneGeo; if (!g) { c.restore(); return; }
      const tf = v => g.log ? Math.log(Math.max(1e-9, v)) : v;
      const yOf = p => g.p1y + (tf(p) - tf(g.p1p)) * (g.p2y - g.p1y) / ((tf(g.p2p) - tf(g.p1p)) || 1);
      const L = 0, R = W, top = g.oy, bot = g.oy + g.dh;   // 수평선(피보)은 hero 전체 폭(예측 영역 포함)
      const xOf = i => g.ox + (P > 1 ? i / (P - 1) : 0) * (g.nowX - g.ox);   // 과거 시계열을 이미지 좌측~지금선에 매핑
      const clipY = y => Math.max(top, Math.min(bot, y));
      const within = y => y >= top - 2 && y <= bot + 2;
      const _focusI = _evHover || _focusInd;
      for (const n of nodes) {
        const col = EV_COLORS[n.blockType] || "#8a92b2";
        const _drawThis = _focusI ? (n.blockType === _focusI) : _evVisible.has(n.blockType);
        if (n.blockType === "fib") {
          const fib = _an("Fib", price, { len: (n.params && n.params.len) || 120, swing: ((n.params && n.params.swing) != null ? n.params.swing : 5) / 100 });
          if (_drawThis) _drawFibLayers(c, fib, { fiToX: fi => xOf(fi), pToY: v => clipY(yOf(v)), nowFi: P - 1, fiMin: 0, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.rightX || (g.ox + g.dw) });
          legend.push({ col, t: EV_LABEL.fib + "(전문)", _key: n.blockType });
        } else if (n.blockType === "ma") {
          const ma = _an("MA", price, { len: (n.params && n.params.len) || 20, ema: !!(n.params && n.params.ema) });
          if (_drawThis) _drawMALayers(c, ma, { fiToX: fi => xOf(fi), pToY: v => clipY(yOf(v)), nowFi: P - 1, fiMin: 0, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity });
          legend.push({ col, t: EV_LABEL.ma + "(다중)", _key: n.blockType });
        } else if (n.blockType === "trend") {
          const _prof = ForgeCore.trendProfileForTF(activeTF());
          const ta = _an("Trend", price, { shortLen: Math.max(8, Math.round(((n.params && n.params.len) || 40) * (_prof.shortScale || 1))), pivotSwing: (n.params && n.params.pivotSwing != null ? n.params.pivotSwing / 100 : 0.08), channelK: (n.params && n.params.channelK) || 2, weights: _prof.weights });
          const futBars = (g.path && g.path.length) || 24, xR = g.rightX || (g.ox + g.dw);
          if (_drawThis) _drawTrendLayers(c, ta, {
            fiToX: fi => xOf(fi),
            pToY: v => clipY(yOf(v)),
            nowFi: P - 1, xNow: g.nowX, xRight: xR, futBars
          });
          legend.push({ col, t: EV_LABEL.trend + (_prof.label ? " \xb7 " + _prof.label : ""), _key: n.blockType });
        } else if (n.blockType === "elliott") {
          const ea = _an("Elliott", price, { swing: ((n.params && n.params.swing) != null ? n.params.swing : 3) / 100 });
          if (_drawThis) _drawElliottLayers(c, ea, { fiToX: fi => xOf(fi), pToY: v => clipY(yOf(v)), nowFi: P - 1, fiMin: 0, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.rightX || (g.ox + g.dw) });
          legend.push({ col, t: EV_LABEL.elliott + "(전문·다중degree)", _key: n.blockType });
        } else if (n.blockType === "rsi") {
          const rsi = _an("RSI", price, { period: (n.params && n.params.period) || 14 });
          if (_drawThis) _drawRsiLayers(c, rsi, { fiToX: fi => xOf(fi), pToY: v => clipY(yOf(v)), nowFi: P - 1, fiMin: 0, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.rightX || (g.ox + g.dw) });
          legend.push({ col, t: EV_LABEL.rsi + "(전문)", _key: n.blockType });
        } else if (n.blockType === "volume") {
          const va = _anVolume(price);
          if (_drawThis) _drawVolumeLayers(c, va, { fiToX: fi => xOf(fi), pToY: v => clipY(yOf(v)), nowFi: P - 1, fiMin: 0, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.rightX || (g.ox + g.dw), lastPrice: price[P - 1] });
          legend.push({ col, t: EV_LABEL.volume + "(전문)", _key: n.blockType });
        } else if (n.blockType === "phasefold") {
          const m = lastResult && lastResult.meta && lastResult.meta[n.id]; if (m && m.best) legend.push({ col, t: "주기 " + Math.round(m.best) });
        }
      }
      _evLegend(c, g.ox + 4, g.oy, legend);
    }
    c.restore();
  }

  function fcHeroMode(mode) {
    const img = document.getElementById("fcHeroImg"), fut = document.getElementById("fcFuture"), main = document.getElementById("fcMainChart");
    const t = document.querySelector(".fc-panel-hero .fc-t");
    if (mode === "chart") {
      if (img) img.style.display = "none"; if (fut) fut.style.display = "none"; if (main) main.style.display = "block";
      if (t) t.innerHTML = "<b>분석 차트</b> · 과거+예측";
    } else {
      // 이미지/오버레이 모드: 예측은 이미지 위(#fcCone)에 그림 → 분리 콘(#fcFuture) 숨김(여백 제거·이미지 전폭)
      if (img) img.style.display = ""; if (fut) fut.style.display = "none"; if (main) main.style.display = "none";
      if (t) t.innerHTML = "<b>가격 차트</b> · " + (activeTF() ? esc(activeTF()) + " · " : "") + "이미지 + 예측";
    }
  }

  /* 결과 영역 표시 모드: overlay(원본 이미지+예측 오버레이) / chart(연속 선차트) / image(분석 대기) */
  let _heroView = "auto";   // auto | chart | image (사용자 강제 뷰)
  function _docHasRealTicker() { return boardState.nodes.some(n => n.blockType === "ticker" && n.params && (n.params.fetched || isFinite(n.params.price))); }
  function heroMode() {
    if (_docHasRealTicker()) return "chart";        // 실 티커 포지 = 항상 차트(이미지 분석 비표시 · 로드 시 stale 이미지 플래시 방지)
    if (_heroView === "chart") return "chart";      // 강제 차트뷰: 시계열 없어도 이미지로 폴백 안 함
    if (_heroView === "image" && heroImgId()) return _visionCoords ? "overlay" : "image";
    if (hasRealSeries()) return "chart";           // 기본: 시계열 있으면 최초 진입부터 차트뷰(오버레이/이미지보다 우선)
    if (heroImgId()) return "image";
    return "chart";
  }
  function cycleHeroView() {
    const canImg = !!heroImgId(), canChart = !!hasRealSeries();
    if (!canImg || !canChart) { bToast(canChart ? "이미지가 없어요" : "실 시계열이 없어요"); return; }
    _heroView = (_heroView === "chart") ? "image" : "chart";
    updateViewToggle();
    renderTheme();
    runForge();   // 뷰별 데이터(차트=붙여넣은 시계열 / 이미지=비전 시계열)로 재계산
    bToast(_heroView === "chart" ? "차트뷰 · 붙여넣은 시계열 기준" : "이미지뷰 · 비전 시계열로 원본에 정합");
  }
  function updateViewToggle() {
    const b = document.getElementById("viewToggle"); if (!b) return;
    b.style.display = "none";   // 이미지 분석 보류 → 이미지뷰 토글 숨김
    const m = heroMode();
    b.innerHTML = (m === "chart") ? "🖼<span class=\"hlbl\"> 이미지뷰</span>" : "📈<span class=\"hlbl\"> 차트뷰</span>";
    b.title = (m === "chart") ? "원본 이미지 위 예측으로 전환" : "연속 차트로 전환 — 작도가 선에 정확히 정합";
    updateSrcBadge();
  }
  /* 데이터 소스 배지 — 어떤 시계열로 작도·예측 중인지 자동 감지 안내 */
  function updateSrcBadge() {
    const el = document.getElementById("fcSrcBadge"); if (!el) return;
    const p = boardState.nodes.find(n => n.blockType === "price");
    const ps = (Array.isArray(p && p.series) && p.series.length >= 20) ? p.series : null;
    const vs = (visionLive() && Array.isArray(_visionData.price) && _visionData.price.length >= 2) ? _visionData.price : null;
    const active = priceSeries();
    if (!active) { el.style.display = "none"; return; }
    el.style.display = "";
    const usingVision = !!(vs && active === vs);
    const n = active.length;
    let cls = "info", txt, tip;
    if (usingVision) {
      cls = "vision"; txt = "🖼 이미지 정합 · 비전 " + n + "봉"; tip = "이미지에서 추출한 비전 시계열로 작도·예측 — 원본 캔들에 정합";
      if (ps) {  // 입력 시계열도 있는데 이미지와 다르면 안내
        const a = ps[ps.length - 1], b = vs[vs.length - 1], mism = (isFinite(a) && isFinite(b) && Math.abs(a - b) / Math.max(1e-9, Math.abs(b)) > 0.05);
        if (mism) { cls = "warn"; txt = "🖼 이미지 정합 · 비전 " + n + "봉 · 입력본 ≠ 이미지"; tip = "붙여넣은 시계열(" + fmtNum(a) + ")이 이미지(" + fmtNum(b) + ")와 달라 이미지뷰는 비전 시계열 사용 · 입력본은 📈 차트뷰에서"; }
      }
    } else {
      txt = "📈 입력 시계열 " + n + "봉"; tip = "붙여넣은 시계열로 작도·예측 (연속 차트)";
    }
    el.textContent = txt; el.className = "fc-src fc-src-" + cls; el.title = tip;
    if (cls !== "warn") el.style.display = "none";   // 정보성 '입력 시계열/비전 N봉' 배지는 숨김 — 이미지≠입력 불일치 경고만 노출
  }
  function fcRenderForecast(pred) {
    const mode = heroMode();
    if (mode === "chart") { const _cd = currentData(); if (_cd && _cd.price) fcDrawMainChart(_cd.price, pred); return; }   // null 가드(데이터 미도착 레이스)
    const cone = document.getElementById("fcCone");
    const heroImg = document.getElementById("fcHeroImg");
    const img = heroImg && heroImg.querySelector("img");
    if (!cone || !img) return;
    const draw = (mode === "overlay" && _visionCoords)
      ? () => drawVisionOverlay(cone, img, pred, _visionCoords, currentData().price)
      : () => drawConeHint(cone, img);
    if (!draw()) coneRetry(draw, img);   // 평상시 즉시 그리기(재생 morph마다 직접), 첫 미로드만 재시도
  }
  function _tfUnit(tf) { return /월/.test(tf) ? "개월" : /주/.test(tf) ? "주" : /일/.test(tf) ? "일" : "봉"; }
  /* 예측 콘 + 시간축을 주어진 사각형(ox,oy,dw,dh)에 그림. fs=해상도 스케일(확대 모달용). 공용. */
  function _drawCone(c, ox, oy, dw, dh, Hclip, pred, coords, series, fs) {
    fs = fs || 1;
    const p1 = coords.p1, p2 = coords.p2;
    if (!p1 || !p2 || !isFinite(p1.price) || !isFinite(p2.price) || p1.price === p2.price) return false;
    const lg = coords.log !== false;
    const tf = p => lg ? Math.log(Math.max(1e-9, p)) : p;
    const y1 = oy + (p1.yf != null ? p1.yf : 0.15) * dh, y2 = oy + (p2.yf != null ? p2.yf : 0.85) * dh;
    const t1 = tf(p1.price), t2 = tf(p2.price);
    const yOf = p => y1 + (tf(p) - t1) * (y2 - y1) / ((t2 - t1) || 1);
    const nowX = ox + (coords.nowXf != null ? coords.nowXf : 0.6) * dw;
    const rightX = ox + (coords.rightXf != null ? coords.rightXf : 0.98) * dw;
    const path = (pred && pred.path) || [], lo = (pred && pred.lo) || [], hi = (pred && pred.hi) || [];
    const anchorP = (pred && pred.anchor != null) ? pred.anchor : (series && series.length ? series[series.length - 1] : null);
    if (anchorP == null) return false;
    const xOf = k => nowX + (path.length > 1 ? k / (path.length - 1) : 0) * (rightX - nowX);
    const anchorY = yOf(anchorP);
    /* 예측 밴드 세로 범위(줌 세로중심용) */
    let bandTop = anchorY, bandBot = anchorY;
    for (let k = 0; k < path.length; k++) { bandTop = Math.min(bandTop, yOf(hi[k])); bandBot = Math.max(bandBot, yOf(lo[k])); }
    /* 호버 툴팁 + 근거작도용 기하 stash(CSS px 공간 · 가격→y 매핑 포함) */
    if (c.canvas) c.canvas._coneGeo = { ox, oy, dw, dh, nowX, rightX, path, lo, hi, anchorP, bandTop, bandBot, p1p: p1.price, p1y: y1, p2p: p2.price, p2y: y2, log: lg, unit: tfUnit() };
    c.textAlign = "left"; c.lineWidth = fs; c.font = Math.round(10 * fs) + "px ui-monospace,monospace";
    c.strokeStyle = _warmA(.5); c.setLineDash([4 * fs, 3 * fs]);
    c.beginPath(); c.moveTo(nowX, oy); c.lineTo(nowX, oy + dh); c.stroke(); c.setLineDash([]);
    c.fillStyle = _warmA(.92); c.fillText("지금", nowX + 3 * fs, oy + 11 * fs);
    if (path.length) {
      c.beginPath(); c.moveTo(nowX, anchorY);
      for (let k = 0; k < path.length; k++) c.lineTo(xOf(k), yOf(hi[k]));
      for (let k = path.length - 1; k >= 0; k--) c.lineTo(xOf(k), yOf(lo[k]));
      c.closePath(); c.fillStyle = _warmA(.11); c.fill();
      c.strokeStyle = FC_GOLD; c.lineWidth = 2 * fs; c.setLineDash([5 * fs, 4 * fs]);
      c.beginPath(); c.moveTo(nowX, anchorY);
      for (let k = 0; k < path.length; k++) c.lineTo(xOf(k), yOf(path[k]));
      c.stroke(); c.setLineDash([]);
      const endP = path[path.length - 1], hiP = hi[hi.length - 1], loP = lo[lo.length - 1];
      const clampY = y => Math.max(9 * fs, Math.min(Hclip - 3 * fs, y));
      c.textAlign = "right";
      // 최대(상단)
      c.fillStyle = "rgba(70,194,142,.95)"; c.fillText("최대 " + fmtNum(hiP), rightX - 2 * fs, clampY(yOf(hiP) - 4 * fs));
      // 중앙(예측)
      c.fillStyle = FC_GOLD; c.font = "700 " + Math.round(10.5 * fs) + "px ui-monospace,monospace"; c.fillText(fmtNum(endP), rightX - 2 * fs, clampY(yOf(endP) - 5 * fs)); c.font = Math.round(10 * fs) + "px ui-monospace,monospace";
      // 최소(하단)
      c.fillStyle = "rgba(224,106,106,.95)"; c.fillText("최소 " + fmtNum(loP), rightX - 2 * fs, clampY(yOf(loP) + 11 * fs));
      c.textAlign = "left";
    }
    c.fillStyle = FC_GOLD; c.beginPath(); c.arc(nowX, anchorY, 3.5 * fs, 0, 7); c.fill();
    c.fillStyle = _warmA(.95); c.fillText("현재가 " + fmtNum(anchorP), nowX + 7 * fs, anchorY - 6 * fs);
    /* 시점 마커(3·6·12·24… — 예측 시점별 표와 동일 시점) */
    if (path.length) {
      const u = tfUnit();
      const hs = _hzList(u, path.length);
      const clamp = x => Math.max(ox + 16 * fs, Math.min(ox + dw - 16 * fs, x));
      for (const h of hs) {
        const k = h - 1, mx = xOf(k), my = yOf(path[k]), isEnd = (h === path.length);
        c.strokeStyle = _warmA(.22); c.lineWidth = fs; c.setLineDash([3 * fs, 3 * fs]);
        c.beginPath(); c.moveTo(mx, my); c.lineTo(mx, oy + dh - 13 * fs); c.stroke(); c.setLineDash([]);
        c.fillStyle = FC_GOLD; c.beginPath(); c.arc(mx, my, 3 * fs, 0, 7); c.fill();
        c.strokeStyle = "#0b0f14"; c.lineWidth = 1.2 * fs; c.stroke();
        c.fillStyle = "rgba(184,192,214,.96)"; c.textAlign = "center";
        c.font = Math.round(10.5 * fs) + "px Pretendard,'Malgun Gothic',system-ui,sans-serif";
        c.fillText("+" + h + u, clamp(mx), oy + dh - 3 * fs);
        if (!isEnd) {
          c.fillStyle = FC_ETH; c.font = Math.round(9 * fs) + "px ui-monospace,monospace";
          c.fillText(fmtNum(path[k]), clamp(mx), Math.max(9 * fs, my - 7 * fs));
        }
      }
      c.textAlign = "left";
    }
    return true;
  }
  /* 인라인 오버레이(letterbox geo) */
  function drawVisionOverlay(cv, img, pred, coords, series) {
    const sz = sizeOverlay(cv); if (!sz.c) return false;
    const g = coneGeo(cv, img); if (!g) return false;
    const ok = _drawCone(sz.c, g.ox, g.oy, g.dw, g.dh, sz.H, pred, coords, series, 1);
    drawEvidence();
    return ok;
  }

  /* ── renderChart: top-level, consumes ForgeCore output ── */
