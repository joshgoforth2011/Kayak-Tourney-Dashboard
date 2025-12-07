// ===== CONFIG: set your Apps Script Web App URL here =====
const API_BASE = "https://script.google.com/macros/s/AKfycbwf7HrqElLy4-VzTfrk0ucShXWFT1mITlz1yYBTEzSHD36SYfbso8eQWyqnfvA79Xv4tA/exec";

// ===== Global state =====
const state = {
  events: [],
  currentEventId: null,
  currentTab: "total",
  leaderboard: null,     // {event_id, total, day1, day2}
  seasonSummary: null    // optional cache
};

// ===== Entry point =====
document.addEventListener("DOMContentLoaded", () => {
  wireTabs();
  initDashboard().catch(err => setStatus(`Error: ${err.message}`));
});

async function initDashboard() {
  setStatus("Loading events…");
  const eventsJson = await fetchJSON("?action=events");
  if (!eventsJson.success) throw new Error(eventsJson.error || "Events API error");

  state.events = eventsJson.data.events || [];
  populateEventDropdown();

  // auto-select first event
  if (state.events.length) {
    state.currentEventId = state.events[0].event_id;
    document.getElementById("eventSelect").value = state.currentEventId;
    await loadLeaderboardForCurrentEvent();
  }

  document.getElementById("eventSelect").addEventListener("change", async e => {
    state.currentEventId = e.target.value || null;
    if (state.currentEventId) {
      await loadLeaderboardForCurrentEvent();
    }
  });

  setStatus("Ready.");
}

// ===== Helpers =====
function fullUrl(path) {
  return API_BASE + path;
}

async function fetchJSON(path) {
  const res = await fetch(fullUrl(path));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function setStatus(msg) {
  const el = document.getElementById("statusText");
  if (el) el.textContent = msg;
}

function formatNumber(n, decimals = 2) {
  if (n == null || isNaN(n)) return "–";
  return Number(n).toFixed(decimals);
}

function formatInteger(n) {
  if (n == null || isNaN(n)) return "–";
  return Number(n).toString();
}

function formatDate(t) {
  if (!t) return "–";
  const d = new Date(t);
  if (isNaN(d.getTime())) return String(t);
  return d.toLocaleDateString();
}

// ===== Tabs =====
function wireTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", async () => {
      const name = tab.dataset.tab;
      state.currentTab = name;

      tabs.forEach(t => t.classList.toggle("active", t === tab));

      if (name === "season") {
        await loadSeasonSummary();
      } else {
        // re-render leaderboard table for the current tab
        renderLeaderboardTable();
      }
    });
  });
}

// ===== Event dropdown =====
function populateEventDropdown() {
  const select = document.getElementById("eventSelect");
  select.innerHTML = "";

  state.events.forEach(evt => {
    const opt = document.createElement("option");
    const datePart = evt.event_date ? formatDate(evt.event_date) : "";
    opt.value = evt.event_id;
    opt.textContent = `${datePart} – ${evt.event_name || evt.event_id}`;
    select.appendChild(opt);
  });
}

// ===== Leaderboard loading & rendering =====
async function loadLeaderboardForCurrentEvent() {
  if (!state.currentEventId) return;
  setStatus("Loading leaderboard…");

  const json = await fetchJSON(
    `?action=leaderboard&event_id=${encodeURIComponent(state.currentEventId)}`
  );
  if (!json.success) throw new Error(json.error || "Leaderboard API error");

  state.leaderboard = json.data;

  updateKPIsFromLeaderboard();
  renderLeaderboardTable();

  setStatus("Ready.");
}

function getRowsForCurrentTab() {
  if (!state.leaderboard) return [];

  if (state.currentTab === "day1") return state.leaderboard.day1 || [];
  if (state.currentTab === "day2") return state.leaderboard.day2 || [];
  return state.leaderboard.total || [];
}

function renderLeaderboardTable() {
  const table = document.getElementById("mainTable");
  table.innerHTML = "";

  const rows = getRowsForCurrentTab();
  if (!rows.length) {
    table.innerHTML = "<tbody><tr><td>No data for this tab.</td></tr></tbody>";
    return;
  }

  // Column configuration
  const columns = [
    { key: "rank", label: "#" },
    { key: "angler", label: "Angler" },
    { key: "total_length_in", label: 'Total (")', fmt: v => formatNumber(v, 2) },
    { key: "big_bass_in", label: 'Big Bass (")', fmt: v => formatNumber(v, 2) },
    { key: "limit_percent", label: "Limit %", fmt: v => v == null ? "–" : formatNumber(v, 0) },
    { key: "aoy_points", label: "AOY Pts", fmt: v => formatInteger(v) }
  ];

  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  columns.forEach(col => {
    const th = document.createElement("th");
    th.textContent = col.label;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.dataset.rowIndex = index.toString();

    columns.forEach(col => {
      const td = document.createElement("td");
      const val = row[col.key];
      td.textContent = col.fmt ? col.fmt(val) : (val ?? "");
      tr.appendChild(td);
    });

    tr.addEventListener("click", () => {
      // remove active from others
      tbody.querySelectorAll("tr").forEach(r => r.classList.remove("active-row"));
      tr.classList.add("active-row");
      renderAnglerDetail(row);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);

  // Optional: auto-select first row
  const firstRow = tbody.querySelector("tr");
  if (firstRow) {
    firstRow.classList.add("active-row");
    renderAnglerDetail(rows[0]);
  }
}

// ===== KPIs from leaderboard =====
function updateKPIsFromLeaderboard() {
  const lb = state.leaderboard;
  if (!lb) return;

  const totalRows = lb.total || [];
  const anglers = new Set(totalRows.map(r => r.angler));
  const fishCount = totalRows.reduce((sum, r) => {
    let c = 0;
    for (let i = 1; i <= 10; i++) {
      const v = r[`fish_${i}_in`];
      if (v != null && !isNaN(v)) c++;
    }
    return sum + c;
  }, 0);

  const totalLength = totalRows.reduce((sum, r) => sum + (r.total_length_in || 0), 0);
  const avgLength = fishCount ? totalLength / fishCount : null;

  const bigBass = totalRows.reduce((max, r) => {
    const bb = r.big_bass_in || 0;
    return bb > max ? bb : max;
  }, 0);

  const evtMeta = (state.events || []).find(e => e.event_id === state.currentEventId) || {};

  document.getElementById("kpiAnglers").textContent = formatInteger(anglers.size);
  document.getElementById("kpiFishCount").textContent = formatInteger(fishCount);
  document.getElementById("kpiAvgLength").textContent = avgLength ? formatNumber(avgLength, 2) : "–";
  document.getElementById("kpiBigBass").textContent = bigBass ? formatNumber(bigBass, 2) : "–";
  document.getElementById("kpiEventDate").textContent = evtMeta.event_date ? formatDate(evtMeta.event_date) : "–";
  document.getElementById("kpiTrail").textContent = evtMeta.trail || "–";
}

// ===== Angler detail panel =====
function renderAnglerDetail(row) {
  const panel = document.getElementById("anglerDetail");
  if (!row) {
    panel.innerHTML = '<p class="detail-placeholder">Select an angler row.</p>';
    return;
  }

  const fishList = [];
  for (let i = 1; i <= 10; i++) {
    const v = row[`fish_${i}_in`];
    if (v != null && !isNaN(v)) fishList.push(Number(v));
  }

  panel.innerHTML = `
    <div class="detail-row">
      <span class="detail-label">Angler:</span>
      <span>${row.angler || ""}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">State:</span>
      <span>${row.angler_state || "–"}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Total Length:</span>
      <span>${formatNumber(row.total_length_in, 2)}"</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Big Bass:</span>
      <span>${formatNumber(row.big_bass_in, 2)}"</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Day:</span>
      <span>${row.day || "–"}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Trail:</span>
      <span>${row.trail || "–"}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Profile:</span>
      ${
        row.angler_url
          ? `<a href="${row.angler_url}" target="_blank" rel="noopener noreferrer">${row.angler_url}</a>`
          : "<span>–</span>"
      }
    </div>
    <div class="detail-row">
      <span class="detail-label">Fish:</span>
      ${
        fishList.length
          ? fishList.map(v => `<span class="badge">${formatNumber(v, 2)}"</span>`).join(" ")
          : "<span>None recorded</span>"
      }
    </div>
  `;
}

// ===== Season summary tab (optional) =====
async function loadSeasonSummary() {
  if (!state.seasonSummary) {
    setStatus("Loading season summary…");
    const json = await fetchJSON("?action=seasonSummary");
    if (!json.success) throw new Error(json.error || "Season summary API error");
    state.seasonSummary = json.data.seasonSummary || [];
    setStatus("Ready.");
  }

  const table = document.getElementById("mainTable");
  table.innerHTML = "";

  const rows = state.seasonSummary;
  if (!rows.length) {
    table.innerHTML = "<tbody><tr><td>No season summary data.</td></tr></tbody>";
    return;
  }

  const columns = [
    { key: "season", label: "Season" },
    { key: "trail", label: "Trail" },
    { key: "angler", label: "Angler" },
    { key: "events_fished", label: "Events", fmt: v => formatInteger(v) },
    { key: "wins", label: "Wins", fmt: v => formatInteger(v) },
    { key: "top5_finishes", label: "Top 5", fmt: v => formatInteger(v) },
    { key: "top10_finishes", label: "Top 10", fmt: v => formatInteger(v) },
    { key: "season_total_length_in", label: 'Total (")', fmt: v => formatNumber(v, 2) },
    { key: "avg_finish", label: "Avg Finish", fmt: v => formatNumber(v, 2) }
  ];

  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  columns.forEach(c => {
    const th = document.createElement("th");
    th.textContent = c.label;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach(r => {
    const tr = document.createElement("tr");
    columns.forEach(c => {
      const td = document.createElement("td");
      const val = r[c.key];
      td.textContent = c.fmt ? c.fmt(val) : (val ?? "");
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  // For season tab we don't change the right-hand detail panel
}


