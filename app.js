// ===============================
// CONFIG
// ===============================

// Your deployed Apps Script web app URL ( /exec )
const API_BASE =
  "https://script.google.com/macros/s/AKfycbwf7HrqElLy4-VzTfrk0ucShXWFT1mITlz1yYBTEzSHD36SYfbso8eQWyqnfvA79Xv4tA/exec";

// ===============================
// GLOBAL STATE
// ===============================

const state = {
  events: [],                  // full events list
  currentEventId: null,        // selected event_id
  currentTab: "total",         // 'total' | 'day1' | 'day2'
  leaderboards: {
    total: [],
    day1: [],
    day2: []
  }
};

// Small helper to grab elements safely
function $(id) {
  return document.getElementById(id);
}

// Status message (bottom or wherever you place #statusMessage)
function setStatus(msg, type = "info") {
  const el = $("statusMessage");
  if (!el) return;
  el.textContent = msg || "";
  el.className = `status status-${type}`;
}

// Format a date string from API into something like "Mar 15, 2025"
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

// Format inches with 2 decimals
function fmtInches(v) {
  if (v == null || v === "") return "";
  const num = Number(v);
  if (isNaN(num)) return v;
  return num.toFixed(2);
}

// ===============================
// API CALLS
// ===============================

async function callApi(params) {
  const qs = new URLSearchParams(params);
  const url = `${API_BASE}?${qs.toString()}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} – ${res.statusText}`);
  }
  const json = await res.json();
  if (!json || json.success === false) {
    throw new Error(json && json.message ? json.message : "API error");
  }
  return json.data || json; // we expect { success:true, data:{...} }
}

// Events list
async function fetchEvents() {
  const data = await callApi({ endpoint: "events" });
  return data.events || [];
}

// Leaderboard for an event
async function fetchLeaderboard(tabKey, eventId) {
  // Map tab -> endpoint value in Apps Script
  let endpoint;
  if (tabKey === "total") endpoint = "leaderboard";
  else if (tabKey === "day1") endpoint = "day1";
  else if (tabKey === "day2") endpoint = "day2";
  else throw new Error(`Unknown tab key: ${tabKey}`);

  const data = await callApi({
    endpoint,
    event_id: eventId
  });

  // Allow for either data.rows or data.leaderboard
  return data.rows || data.leaderboard || data.items || [];
}

// ===============================
// RENDER: EVENTS DROPDOWN
// ===============================

function renderEventDropdown() {
  const select = $("eventSelect");
  if (!select) return;

  select.innerHTML = "";

  // Sort events by date desc (latest first)
  const events = [...state.events].sort(
    (a, b) => new Date(b.event_date) - new Date(a.event_date)
  );

  for (const ev of events) {
    const opt = document.createElement("option");
    opt.value = ev.event_id;
    const dateLabel = formatDate(ev.event_date);
    opt.textContent = `${dateLabel} – ${ev.event_name}`;
    select.appendChild(opt);
  }

  if (events.length && !state.currentEventId) {
    state.currentEventId = events[0].event_id;
  }
  if (state.currentEventId) {
    select.value = state.currentEventId;
  }
}

// ===============================
// RENDER: LEADERBOARD TABLE
// ===============================

function renderLeaderboard() {
  const container = $("leaderboardContainer");
  if (!container) return;

  const tabKey = state.currentTab;
  const rows = state.leaderboards[tabKey] || [];

  if (!rows.length) {
    container.innerHTML = `
      <div class="empty-state">
        No data available for this event/tab.
      </div>
    `;
    $("anglerDetail") && ( $("anglerDetail").innerHTML = "<h3>Angler Detail</h3><p>Select an angler row to see details.</p>" );
    return;
  }

  // Build table
  let html = `
    <table class="leader-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Angler</th>
          <th>Total (in)</th>
          <th>Big Bass (in)</th>
          <th>Fish Limit</th>
          <th>Limit %</th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach((r, idx) => {
    const rank = r.rank || r.Rank || r.rk || "";
    const angler = r.angler || r.Angler || "";
    const total = fmtInches(r.total_length_in ?? r.total ?? r.total_in);
    const big = fmtInches(r.big_bass_in ?? r.big_bass ?? r.bb_in);
    const limit = r.fish_limit ?? r.limit ?? "";
    const limitPct = r["Limit%"] ?? r.limit_pct ?? "";

    html += `
      <tr data-row-index="${idx}">
        <td>${rank}</td>
        <td>${angler}</td>
        <td>${total}</td>
        <td>${big}</td>
        <td>${limit}</td>
        <td>${limitPct}</td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;

  // Bind row click -> angler detail
  const tbody = container.querySelector("tbody");
  if (tbody) {
    tbody.addEventListener("click", (e) => {
      const tr = e.target.closest("tr");
      if (!tr) return;
      const idx = Number(tr.getAttribute("data-row-index"));
      const row = rows[idx];
      if (row) {
        renderAnglerDetail(row);
        // highlight selected
        tbody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
        tr.classList.add("selected");
      }
    });
  }

  // Show detail for top row by default
  renderAnglerDetail(rows[0]);
}

// ===============================
// RENDER: ANGLER DETAIL PANEL
// ===============================

function renderAnglerDetail(row) {
  const panel = $("anglerDetail");
  if (!panel) return;

  if (!row) {
    panel.innerHTML = `
      <h3>Angler Detail</h3>
      <p>Select an angler row to see details.</p>
    `;
    return;
  }

  const angler = row.angler || row.Angler || "";
  const stateAbbr = row.angler_state || row.anglerState || row.state || "";
  const url = row.angler_url || row.profile_url || "";
  const rank = row.rank || row.Rank || "";
  const total = fmtInches(row.total_length_in ?? row.total ?? row.total_in);
  const big = fmtInches(row.big_bass_in ?? row.big_bass ?? row.bb_in);
  const day = row.day || "";
  const fishLimit = row.fish_limit ?? row.limit ?? "";
  const limitPct = row["Limit%"] ?? row.limit_pct ?? "";

  // Collect fish_1_in..fish_10_in if present
  const fish = [];
  for (let i = 1; i <= 10; i++) {
    const key1 = `fish_${i}_in`;
    const key2 = `fish${i}_in`;
    const val = row[key1] ?? row[key2];
    if (val != null && val !== "") {
      fish.push(fmtInches(val));
    }
  }

  panel.innerHTML = `
    <h3>Angler Detail</h3>
    <div class="angler-header">
      <div class="angler-name">${angler}${stateAbbr ? ` <span class="angler-state">(${stateAbbr})</span>` : ""}</div>
      ${
        url
          ? `<a class="angler-link" href="${url}" target="_blank" rel="noopener noreferrer">View TourneyX Profile</a>`
          : ""
      }
    </div>
    <div class="angler-grid">
      <div class="stat-card">
        <div class="stat-label">Rank</div>
        <div class="stat-value">${rank || "–"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Length (in)</div>
        <div class="stat-value">${total || "–"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Big Bass (in)</div>
        <div class="stat-value">${big || "–"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Fish Limit</div>
        <div class="stat-value">${fishLimit || "–"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Limit %</div>
        <div class="stat-value">${limitPct || "–"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Day</div>
        <div class="stat-value">${day || "–"}</div>
      </div>
    </div>
    ${
      fish.length
        ? `
      <div class="fish-list">
        <h4>Fish Caught</h4>
        <ul>
          ${fish
            .map((len, i) => `<li>Fish ${i + 1}: <span>${len}</span></li>`)
            .join("")}
        </ul>
      </div>
    `
        : ""
    }
  `;
}

// ===============================
// TAB HANDLING
// ===============================

function setupTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabKey = btn.dataset.tab;
      if (!tabKey || tabKey === state.currentTab) return;

      state.currentTab = tabKey;

      // Update active class
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      // If we already have data, just render; otherwise fetch
      const rows = state.leaderboards[tabKey];
      if (rows && rows.length) {
        renderLeaderboard();
      } else if (state.currentEventId) {
        loadLeaderboardForTab(tabKey, state.currentEventId);
      }
    });
  });
}

// ===============================
// LOAD LOGIC
// ===============================

async function loadEventsAndInitial() {
  try {
    setStatus("Loading events…", "info");
    const events = await fetchEvents();
    if (!events.length) {
      setStatus("No events returned from API.", "error");
      return;
    }
    state.events = events;
    state.currentEventId = events[0].event_id;

    renderEventDropdown();
    setStatus("Loading leaderboard…", "info");

    await Promise.all([
      loadLeaderboardForTab("total", state.currentEventId),
      loadLeaderboardForTab("day1", state.currentEventId),
      loadLeaderboardForTab("day2", state.currentEventId)
    ]);

    setStatus("", "info");
  } catch (err) {
    console.error(err);
    setStatus(`Error loading data: ${err.message}`, "error");
  }
}

async function loadLeaderboardForTab(tabKey, eventId) {
  try {
    const rows = await fetchLeaderboard(tabKey, eventId);
    state.leaderboards[tabKey] = rows;

    if (tabKey === state.currentTab) {
      renderLeaderboard();
    }
  } catch (err) {
    console.error(err);
    if (tabKey === state.currentTab) {
      setStatus(`Error loading ${tabKey} leaderboard: ${err.message}`, "error");
      renderLeaderboard(); // will show empty-state
    }
  }
}

function setupEventDropdown() {
  const select = $("eventSelect");
  if (!select) return;

  select.addEventListener("change", () => {
    const eventId = select.value;
    if (!eventId) return;

    state.currentEventId = eventId;
    setStatus("Loading event data…", "info");

    // Clear existing data
    state.leaderboards = { total: [], day1: [], day2: [] };

    Promise.all([
      loadLeaderboardForTab("total", eventId),
      loadLeaderboardForTab("day1", eventId),
      loadLeaderboardForTab("day2", eventId)
    ]).then(() => {
      setStatus("", "info");
    });
  });
}

// ===============================
// INIT
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupEventDropdown();
  loadEventsAndInitial();
});
