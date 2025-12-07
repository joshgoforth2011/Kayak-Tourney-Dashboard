// CONFIG — replace with your Script Web App URL
const API_BASE = "YOUR_SCRIPT_URL_HERE";

// Load events on page load
document.addEventListener("DOMContentLoaded", init);

async function init() {
  const events = await fetchJSON(`?action=events`);
  populateEventDropdown(events.data.events);

  document.getElementById("eventSelect").addEventListener("change", loadLeaderboard);

  setupTabs();
  loadLeaderboard();
}

function fetchJSON(path) {
  return fetch(API_BASE + path).then(r => r.json());
}

function populateEventDropdown(events) {
  const select = document.getElementById("eventSelect");
  events.forEach(evt => {
    const opt = document.createElement("option");
    opt.value = evt.event_id;
    opt.textContent = `${evt.event_date?.slice(0,10)} – ${evt.event_name}`;
    select.appendChild(opt);
  });
}

async function loadLeaderboard() {
  const eventId = document.getElementById("eventSelect").value;
  if (!eventId) return;

  const data = await fetchJSON(`?action=leaderboard&event_id=${encodeURIComponent(eventId)}`);
  const { total, day1, day2 } = data.data;

  renderTable("totalTable", total);
  renderTable("day1Table", day1);
  renderTable("day2Table", day2);
}

function renderTable(tableId, rows) {
  const table = document.getElementById(tableId);
  table.innerHTML = "";

  if (!rows.length) {
    table.innerHTML = "<tr><td>No data</td></tr>";
    return;
  }

  // Build header
  const headers = ["rank", "angler", "total_length_in", "big_bass_in"];
  const thead = `<tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr>`;
  table.insertAdjacentHTML("beforeend", thead);

  // Rows
  rows.forEach(r => {
    const rowHTML = `
      <tr onclick="showAnglerDetail(${JSON.stringify(r).replace(/"/g, '&quot;')})">
        <td>${r.rank ?? ""}</td>
        <td>${r.angler}</td>
        <td>${r.total_length_in ?? ""}</td>
        <td>${r.big_bass_in ?? ""}</td>
      </tr>
    `;
    table.insertAdjacentHTML("beforeend", rowHTML);
  });
}

window.showAnglerDetail = function (angler) {
  const panel = document.getElementById("anglerDetail");

  panel.innerHTML = `
    <h3>${angler.angler}</h3>
    <p><strong>Total:</strong> ${angler.total_length_in}</p>
    <p><strong>Big Bass:</strong> ${angler.big_bass_in}</p>
    <p><strong>State:</strong> ${angler.angler_state}</p>
    <p><strong>URL:</strong> <a href="${angler.angler_url}" target="_blank">${angler.angler_url}</a></p>
    <p><strong>Day:</strong> ${angler.day}</p>
  `;
};

function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      // update tab active state
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      // update content visibility
      contents.forEach(c => c.classList.remove("active"));
      document.getElementById(tab.dataset.tab).classList.add("active");
    });
  });
}
