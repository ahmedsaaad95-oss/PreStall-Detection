document.addEventListener("DOMContentLoaded", () => {
  // Mobile menu
  const navToggle = document.getElementById("navToggle");
  const navLinks  = document.getElementById("navLinks");
  navToggle?.addEventListener("click", () => navLinks.classList.toggle("open"));
  navLinks?.querySelectorAll("a").forEach(a => a.addEventListener("click", () => navLinks.classList.remove("open")));

  // Year
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Counters
  const counters = [...document.querySelectorAll("[data-counter]")];
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const runCounters = () => {
    counters.forEach(el => {
      const raw = (el.getAttribute("data-counter") || "").trim();
      const target = Number(raw);

      // If it's NOT a finite number, render it as text (no animation)
      if (!Number.isFinite(target)) {
        el.textContent = raw;
        return;
      }

      // Number animation
      const start = performance.now();
      const dur = 900;
      const tick = (now) => {
        const t = Math.min(1, (now - start) / dur);
        el.textContent = Math.round(target * easeOut(t));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  };
  let countersDone = false;
  const onScroll = () => {
    if (countersDone) return;
    const hero = document.querySelector(".hero");
    if (!hero) return;
    const rect = hero.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.7) {
      countersDone = true;
      runCounters();
      window.removeEventListener("scroll", onScroll);
    }
  };
  window.addEventListener("scroll", onScroll);
  onScroll();

  /* --- About photo slider --- */
  const slidesEl = document.getElementById("slides");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const dotsEl = document.getElementById("dots");

  let slideIndex = 0;
  let slideCount = slidesEl ? slidesEl.children.length : 0;
  let sliderTimer = null;

  function renderDots(){
    if(!dotsEl) return;
    dotsEl.innerHTML = "";
    for(let i=0;i<slideCount;i++){
      const d = document.createElement("button");
      d.className = "dotbtn" + (i===slideIndex ? " active" : "");
      d.setAttribute("aria-label", "Slide " + (i+1));
      d.addEventListener("click", ()=>goToSlide(i, true));
      dotsEl.appendChild(d);
    }
  }
  function goToSlide(i, user=false){
    if(!slidesEl) return;
    slideIndex = (i + slideCount) % slideCount;
    slidesEl.style.transform = `translateX(-${slideIndex*100}%)`;
    renderDots();
    if(user) restartAuto();
  }
  function restartAuto(){
    if(sliderTimer) clearInterval(sliderTimer);
    sliderTimer = setInterval(()=>goToSlide(slideIndex+1), 3500);
  }
  prevBtn?.addEventListener("click", ()=>goToSlide(slideIndex-1, true));
  nextBtn?.addEventListener("click", ()=>goToSlide(slideIndex+1, true));
  if(slidesEl && slideCount>0){
    renderDots();
    restartAuto();
  }

  /* --- Operator UI + live chart (Normal → Pre-Stall → Stall) --- */
  const canvas = document.getElementById("chart");
  const ctx = canvas?.getContext("2d");

  const lamp = document.getElementById("lamp");
  const stateTitle = document.getElementById("stateTitle");
  const stateSub = document.getElementById("stateSub");

  const pumpVal = document.getElementById("pumpVal");
  const dpVal = document.getElementById("dpVal");
  const vrmsVal = document.getElementById("vrmsVal");
  const riskVal = document.getElementById("riskVal");

  const alarmBadge = document.getElementById("alarmBadge");
  const alarmText = document.getElementById("alarmText");
  const chartNote = document.getElementById("chartNote");
  const millingSub = document.getElementById("millingSub");

  const phasePill = document.getElementById("phasePill");
  const phaseNote = document.getElementById("phaseNote");

  const logBox = document.getElementById("logBox");
  const eventList = document.getElementById("eventList");

  let mode = "normal"; // normal | sequence
  let phase = "normal"; // normal | prestall_ramp | prestall_hold | stall
  let frame = 0;
  let phaseFrame = 0;
  let rafHandle = 0;

  function nowStamp(){
    const d = new Date();
    const hh = String(d.getHours()).padStart(2,"0");
    const mm = String(d.getMinutes()).padStart(2,"0");
    const ss = String(d.getSeconds()).padStart(2,"0");
    return `${hh}:${mm}:${ss}`;
  }
  function addLog(line){
    if(!logBox) return;
    logBox.textContent += line + "\n";
    const lines = logBox.textContent.split("\n");
    if(lines.length > 140){
      logBox.textContent = lines.slice(lines.length-140).join("\n");
    }
    logBox.scrollTop = logBox.scrollHeight;
  }
  function addEvent(tag, text){
    if(!eventList) return;
    const li = document.createElement("li");
    const spanTag = document.createElement("span");
    spanTag.className = "etag " + (tag==="NORMAL"?"ok":(tag==="PRE-STALL"?"warn":"bad"));
    spanTag.textContent = tag;
    const spanTxt = document.createElement("span");
    spanTxt.className = "etxt";
    spanTxt.textContent = text;
    li.appendChild(spanTag);
    li.appendChild(spanTxt);
    eventList.prepend(li);
    while(eventList.children.length > 6){
      eventList.removeChild(eventList.lastChild);
    }
  }

  const colors = {
    pump: "rgba(59,130,246,0.95)",
    dp:   "rgba(34,211,238,0.95)",
    vrms: "rgba(124,58,237,0.95)",
    risk: "rgba(245,158,11,0.95)",
    grid: "rgba(255,255,255,0.10)",
    axis: "rgba(233,237,247,0.55)"
  };

  let series = {
    pump: Array.from({length: 160}, ()=> 3200 + (Math.random()-0.5)*20),
    dp:   Array.from({length: 160}, ()=> 260 + (Math.random()-0.5)*8),
    vrms: Array.from({length: 160}, ()=> 0.22 + (Math.random()-0.5)*0.02),
    risk: Array.from({length: 160}, ()=> 0.12 + (Math.random()-0.5)*0.02),
  };

  function setPhaseUI(name){
    if(!phasePill || !phaseNote) return;
    phasePill.classList.remove("warn","bad");
    if(name === "NORMAL"){
      phasePill.textContent = "PHASE: NORMAL";
      phaseNote.textContent = "Stable milling window (pump/circ + ΔP + vibration in expected range)";
    }else if(name === "PRE-STALL"){
      phasePill.textContent = "PHASE: PRE-STALL";
      phasePill.classList.add("warn");
      phaseNote.textContent = "Load increasing • trends drifting • confirm with dual-sensor + AI";
    }else{
      phasePill.textContent = "PHASE: STALL";
      phasePill.classList.add("bad");
      phaseNote.textContent = "Stall signature detected • immediate action to protect motor/stator";
    }
  }

  function setState(state, pump, dp, vrms, risk){
    if(!lamp) return;
    if(stateTitle) stateTitle.textContent = state;
    if(pumpVal) pumpVal.textContent = Math.round(pump);
    if(dpVal) dpVal.textContent = Math.round(dp);
    if(vrmsVal) vrmsVal.textContent = vrms.toFixed(2);
    if(riskVal) riskVal.textContent = risk.toFixed(2);

    if(state === "GREEN"){
      lamp.style.background = "var(--ok)";
      lamp.style.boxShadow = "0 0 24px rgba(34,197,94,0.55)";
      if(stateSub) stateSub.textContent = "Normal milling operation";
      alarmBadge?.classList.remove("on");
      if(alarmText) alarmText.textContent = "ALARM: OFF";
      if(chartNote) chartNote.textContent = "Mode: Normal Milling";
      if(millingSub) millingSub.textContent = "Stable torque • steady returns • within normal operating window";
      setPhaseUI("NORMAL");
    } else if(state === "YELLOW"){
      lamp.style.background = "var(--warn)";
      lamp.style.boxShadow = "0 0 24px rgba(245,158,11,0.55)";
      if(stateSub) stateSub.textContent = "Pre-stall risk rising — operator attention";
      alarmBadge?.classList.remove("on");
      if(alarmText) alarmText.textContent = "ALARM: WARNING";
      if(chartNote) chartNote.textContent = "Mode: Pre-Stall";
      if(millingSub) millingSub.textContent = "Load increasing • vibration rising • risk trending up";
      setPhaseUI("PRE-STALL");
    } else {
      lamp.style.background = "var(--bad)";
      lamp.style.boxShadow = "0 0 24px rgba(239,68,68,0.55)";
      if(stateSub) stateSub.textContent = "High stall risk — stop / bleed / adjust";
      alarmBadge?.classList.add("on");
      if(alarmText) alarmText.textContent = "ALARM: ON";
      if(chartNote) chartNote.textContent = "Mode: Stall Event";
      if(millingSub) millingSub.textContent = "Stall signature detected • protect motor/stator immediately";
      setPhaseUI("STALL");
    }
  }

  function resizeCanvas(){
    if(!canvas || !ctx) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth;
    if(cssW < 50) return;
    const cssH = Math.round(cssW * 0.42);
    canvas.style.height = cssH + "px";
    canvas.width  = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    drawChart();
  }

  if(canvas && "ResizeObserver" in window){
    const ro = new ResizeObserver(()=>resizeCanvas());
    if(canvas.parentElement) ro.observe(canvas.parentElement);
  }
  window.addEventListener("resize", resizeCanvas);

  function drawGrid(w,h){
    ctx.clearRect(0,0,w,h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.grid;
    for(let x=0; x<w; x+=60){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    for(let y=0; y<h; y+=40){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    ctx.strokeStyle = colors.axis;
    ctx.strokeRect(0.5,0.5,w-1,h-1);
  }
  function plotLine(vals, minV, maxV, color, w, h){
    const n = vals.length;
    const pad = 16;
    const xStep = (w - pad*2) / (n-1);
    const scale = v => {
      const tt = (v - minV) / (maxV - minV);
      return h - pad - tt*(h - pad*2);
    };
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for(let i=0;i<n;i++){
      const x = pad + i*xStep;
      const y = scale(vals[i]);
      if(i===0) ctx.moveTo(x,y);
      else ctx.lineTo(x,y);
    }
    ctx.stroke();
  }
  function drawChart(){
    if(!ctx || !canvas) return;
    const w = canvas.clientWidth;
    const h = parseFloat(canvas.style.height) || 360;
    if(w < 50) return;
    drawGrid(w,h);
    plotLine(series.pump, 3000, 3500, colors.pump, w,h);
    plotLine(series.dp,   180,  520,  colors.dp,   w,h);
    plotLine(series.vrms, 0.10, 0.90, colors.vrms, w,h);
    plotLine(series.risk, 0,    1,    colors.risk, w,h);
  }
  function push(arr, v){ arr.shift(); arr.push(v); }

  function normalTick(){
    const pump = 3200 + Math.sin(frame/20)*35 + (Math.random()-0.5)*18;
    const dp = 260 + Math.sin(frame/18)*12 + (Math.random()-0.5)*8;
    const vr = 0.22 + Math.sin(frame/24)*0.02 + (Math.random()-0.5)*0.012;
    const rk = Math.max(0.05, Math.min(0.30, 0.12 + Math.sin(frame/35)*0.02 + (Math.random()-0.5)*0.01));
    push(series.pump, pump);
    push(series.dp, dp);
    push(series.vrms, vr);
    push(series.risk, rk);
    setState("GREEN", pump, dp, vr, rk);
    if(frame % 20 === 0){
      addLog(`[${nowStamp()}] NORMAL        pump=${Math.round(pump)}psi  dP=${Math.round(dp)}psi  vib=${vr.toFixed(2)}g  risk=${rk.toFixed(2)}`);
    }
  }

  function sequenceTick(){
    phaseFrame += 1;
    const RAMP_FRAMES  = 6 * 60;
    const HOLD_FRAMES  = 3 * 60;
    const STALL_FRAMES = 5 * 60;

    let pump, dp, vr, rk;

    if(phase === "prestall_ramp"){
      const a = Math.min(1, phaseFrame / RAMP_FRAMES);
      pump = 3220 + a*140 + Math.sin(frame/14)*40 + (Math.random()-0.5)*24;
      dp   = 280  + a*120 + Math.sin(frame/12)*18 + (Math.random()-0.5)*14;
      vr   = 0.24 + a*0.10 + Math.abs(Math.sin(frame/18))*0.01 + (Math.random()-0.5)*0.018;
      rk   = 0.22 + a*0.42 + (Math.random()-0.5)*0.02;

      if(phaseFrame === 1){
        addEvent("PRE-STALL", "Pre-stall ramp started (drifting pump/circ + ΔP + vibration).");
        addLog(`[${nowStamp()}] EVENT         PRE-STALL_RAMP_START`);
      }
      if(phaseFrame >= RAMP_FRAMES){
        phase = "prestall_hold";
        phaseFrame = 0;
        addEvent("PRE-STALL", "Pre-stall plateau (watch stability + confirm with AI).");
        addLog(`[${nowStamp()}] EVENT         PRE-STALL_PLATEAU_START`);
      }
    } else if(phase === "prestall_hold"){
      pump = 3360 + Math.sin(frame/10)*28 + (Math.random()-0.5)*22;
      dp   = 410  + Math.sin(frame/11)*22 + (Math.random()-0.5)*18;
      vr   = 0.34 + Math.sin(frame/12)*0.03 + (Math.random()-0.5)*0.02;
      rk   = 0.60 + Math.sin(frame/20)*0.03 + (Math.random()-0.5)*0.02;
      if(phaseFrame >= HOLD_FRAMES){
        phase = "stall";
        phaseFrame = 0;
        addEvent("STALL", "STALL signature detected (rapid escalation + oscillations).");
        addLog(`[${nowStamp()}] EVENT         STALL_START`);
      }
    } else { // stall
      const a = Math.min(1, phaseFrame / STALL_FRAMES);
      pump = 3400 + a*70 + Math.sin(frame/5)*55 + (Math.random()-0.5)*28;
      dp   = 450  + a*40 + Math.sin(frame/4)*38 + (Math.random()-0.5)*20;
      vr   = 0.42 + a*0.26 + Math.abs(Math.sin(frame/4))*0.08 + (Math.random()-0.5)*0.03;
      rk   = Math.min(0.98, 0.74 + a*0.24 + (Math.random()-0.5)*0.03);
      if(phaseFrame > STALL_FRAMES) phaseFrame = STALL_FRAMES + 1;
    }

    pump = Math.max(2900, Math.min(3600, pump));
    dp   = Math.max(120,  Math.min(650, dp));
    vr   = Math.max(0.10, Math.min(0.95, vr));
    rk   = Math.max(0.0,  Math.min(0.99, rk));

    push(series.pump, pump);
    push(series.dp, dp);
    push(series.vrms, vr);
    push(series.risk, rk);

    const state = rk < 0.45 ? "GREEN" : (rk < 0.70 ? "YELLOW" : "RED");
    setState(state, pump, dp, vr, rk);

    const logEvery = phase === "stall" ? 10 : 16;
    if(frame % logEvery === 0){
      addLog(`[${nowStamp()}] ${phase.toUpperCase().padEnd(12)} pump=${Math.round(pump)}psi  dP=${Math.round(dp)}psi  vib=${vr.toFixed(2)}g  risk=${rk.toFixed(2)}`);
    }
  }

  function loop(){
    frame += 1;
    if(mode === "normal") normalTick();
    else sequenceTick();
    drawChart();
    rafHandle = requestAnimationFrame(loop);
  }

  function setMode(newMode){
    mode = newMode;
    if(mode === "normal"){
      series = {
        pump: Array.from({length: 160}, ()=> 3200 + (Math.random()-0.5)*20),
        dp:   Array.from({length: 160}, ()=> 260 + (Math.random()-0.5)*8),
        vrms: Array.from({length: 160}, ()=> 0.22 + (Math.random()-0.5)*0.02),
        risk: Array.from({length: 160}, ()=> 0.12 + (Math.random()-0.5)*0.02),
      };
      frame = 0;
      phase = "normal";
      phaseFrame = 0;
      addEvent("NORMAL", "Back to normal milling window.");
      addLog(`[${nowStamp()}] EVENT         RESET_TO_NORMAL`);
      setState("GREEN", 3200, 260, 0.22, 0.12);
    } else {
      // start sequence
      phase = "prestall_ramp";
      phaseFrame = 0;
    }
  }

  // Button bindings (fix for simulate stall not working)
  const simulateBtn = document.getElementById("simulateBtn");
  const resetBtn = document.getElementById("resetBtn");
  simulateBtn?.addEventListener("click", () => setMode("sequence"));
  resetBtn?.addEventListener("click", () => setMode("normal"));

  // Init
  resizeCanvas();
  setMode("normal");
  addLog(`[${nowStamp()}] SYSTEM        started (normal milling generator running)`);
  if (!rafHandle) rafHandle = requestAnimationFrame(loop);

  /* --- Send email instead of copy --- */
  const sendEmailBtn = document.getElementById("sendEmailBtn");
  sendEmailBtn?.addEventListener("click", () => {
    const inputs = document.querySelectorAll("#contact input, #contact textarea");
    const name = inputs[0]?.value?.trim() || "Name";
    const email = inputs[1]?.value?.trim() || "email@example.com";
    const msg = inputs[2]?.value?.trim() || "Message...";
    const subject = encodeURIComponent("Website contact — Pre-Stall Detection Project");
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${msg}\n\n— Sent from Ahmed Saad website`);
    window.location.href = `mailto:ahmedsaaad95@gmail.com?subject=${subject}&body=${body}`;
  });
});
