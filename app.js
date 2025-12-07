// ===== CONFIG =====
const API_BASE =
  "https://script.google.com/macros/s/AKfycbwf7HrqElLy4-VzTfrk0ucShXWFT1mITlz1yYBTEzSHD36SYfbso8eQWyqnfvA79Xv4tA/exec";

// ===== STATE =====
const state = {
  events: [],
  currentEventId: null,
  currentEventMeta: null,
  currentAnglers: []
};

// ===== UTILITIES =====
const $ = (id) => document.getElementById(id);

function setStatus(msg, type = "info") {
  const el = $("statusMessage");
  if (!el) return;
  el.textContent = msg || "";
  el.className = `status${type === "error" ? " status-error" : ""}`;
}

function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return String(d);
  return dt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function fmtNumber(v, decimals = 2) {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (isNaN(n)) return v;
  return n.toFixed(decimals);
}

async function fetchJSON(params) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE}?${qs}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.success === false) {
    throw new Error(json.message || "API error");
  }
  return json.data || json;
}

// ===== VIEW SWITCHING =====
function showView(name) {
  const eventsView = $("eventsView");
  const detailView = $("eventDetailView");
  if (!eventsView || !detailView) return;

  eventsView.classList.toggle("active", name === "events");
  detailView.classList.toggle("active", name === "detail");
}

// ===== EVENTS LIST =====
async function loadEvents() {
  setStatus("Loading events…");
  try {
    const data = await fetchJSON({ endpoint: "events" });
    const events = data.events || [];

    // sort newest first
    events.sort((a, b) => new Date(b.event_date) - new Date(a.event_date));

    state.events = events;
    renderEventsTable();
    setStatus(`Loaded ${events.length} events.`);
  } catch (err) {
    console.error(err);
    setStatus(`Error loading events: ${err.message}`, "error");
  }
}

function renderEventsTable() {
  const container = $("eventsTableContainer");
  if (!container) return;

  const rows = state.events;
  if (!rows.length) {
    container.innerHTML = "<p>No events found.</p>";
    return;
  }

  let html = `
    <table class="table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Event</th>
          <th>Trail</th>
          <th>Winner</th>
          <th>Big Bass (in)</th>
          <th>Total Length (in)</th>
          <th>Anglers</th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach((ev, idx) => {
    const date = formatDate(ev.event_date);
    const name = ev.event_name || ev.event_id;
    const trail = ev.trail || "";
    const winner = ev.event_winner || ""; // if you have this field
    const bigBass = fmtNumber(ev.big_bass_in ?? ev["Big_Bass_in"] ?? ev.big_bass);
    const totalLen = fmtNumber(ev.total_length_in ?? ev["Total_Length_in"]);
    const anglers = ev.Anglers ?? ev.anglers ?? "";

    html += `
      <tr data-index="${idx}">
        <td>${date}</td>
        <td>${name}</td>
        <td>${trail}</td>
        <td>${winner || ""}</td>
        <td>${bigBass || ""}</td>
        <td>${totalLen || ""}</td>
        <td>${anglers || ""}</td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;

  const tbody = container.querySelector("tbody");
  tbody.addEventListener("click", (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const idx = Number(tr.dataset.index);
    const ev = rows[idx];
    if (!ev) return;
    onSelectEvent(ev);
  });
}

function onSelectEvent(ev) {
  state.currentEventId = ev.event_id;
  state.currentEventMeta = ev;
  loadEventDetail();
}

// ===== EVENT DETAIL =====
async function loadEventDetail() {
  if (!state.currentEventId) return;
  showView("detail");
  setStatus("Loading event detail…");

  try {
    const data = await fetchJSON({
      endpoint: "anglerWide", // <- adjust this if your endpoint name differs
      event_id: state.currentEventId
    });

    const rows = data.rows || data.anglers || [];
    state.currentAnglers = rows;

    renderEventMeta();
    renderAnglerTable();
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(`Error loading event detail: ${err.message}`, "error");
    $("anglerTableContainer").innerHTML =
      "<p>Failed to load event detail.</p>";
  }
}

function renderEventMeta() {
  const ev = state.currentEventMeta || {};
  $("detailEventTitle").textContent =
    ev.event_name || ev.event_id || "Event Detail";
  $("detailEventSubtitle").textContent = ev.event_id || "";

  $("metaDate").textContent = formatDate(ev.event_date);
  $("metaTrail").textContent = ev.trail || "–";
  $("metaSeason").textContent = ev.season || "–";
  $("metaAnglers").textContent = ev.Anglers ?? ev.anglers ?? "–";
  $("metaFish").textContent =
    ev.Total_Fish_Caught ?? ev.total_fish_caught ?? "–";
  $("metaBigBass").textContent = fmtNumber(
    ev.big_bass_in ?? ev.Event_Big_Bass ?? ev.big_bass
  );
}

function renderAnglerTable() {
  const container = $("anglerTableContainer");
  if (!container) return;

  const rows = state.currentAnglers;
  if (!rows.length) {
    container.innerHTML = "<p>No angler rows found for this event.</p>";
    return;
  }

  let html = `
    <table class="table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Angler</th>
          <th>State</th>
          <th>Fish 1</th>
          <th>Fish 2</th>
          <th>Fish 3</th>
          <th>Fish 4</th>
          <th>Fish 5</th>
          <th>Total (in)</th>
          <th>Big Bass (in)</th>
          <th>Limit %</th>
          <th>AOY Points</th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach((r) => {
    const rank = r.rank ?? r.Rank ?? "";
    const angler = r.angler ?? r.Angler ?? "";
    const state = r.angler_state ?? r.state ?? "";
    const f1 = fmtNumber(r.fish_1_in ?? r.Fish_1_in);
    const f2 = fmtNumber(r.fish_2_in ?? r.Fish_2_in);
    const f3 = fmtNumber(r.fish_3_in ?? r.Fish_3_in);
    const f4 = fmtNumber(r.fish_4_in ?? r.Fish_4_in);
    const f5 = fmtNumber(r.fish_5_in ?? r.Fish_5_in);
    const total = fmtNumber(r.total_length_in ?? r.Total_Length_in);
    const big = fmtNumber(r.big_bass_in ?? r.Big_Bass_in);
    const limitPct = r["Limit%"] ?? r.limit_percent ?? "";
    const aoy = r["AOY Points"] ?? r.aoy_points ?? "";

    html += `
      <tr>
        <td>${rank}</td>
        <td>${angler}</td>
        <td>${state}</td>
        <td>${f1}</td>
        <td>${f2}</td>
        <td>${f3}</td>
        <td>${f4}</td>
        <td>${f5}</td>
        <td>${total}</td>
        <td>${big}</td>
        <td>${limitPct}</td>
        <td>${aoy}</td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  // back button
  const backBtn = $("backToEvents");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      showView("events");
      setStatus("");
    });
  }

  showView("events");
  loadEvents();
});
