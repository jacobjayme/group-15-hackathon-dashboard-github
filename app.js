const REC_BADGE = {
  "Strong match": "badge-send",
  "Promising match": "badge-review",
  "Worth investigating": "badge-info",
  "Low priority": "badge-no",
};

const REC_COLOR_VAR = {
  "Strong match": "--send-fg",
  "Promising match": "--review-fg",
  "Worth investigating": "--info-fg",
  "Low priority": "--no-fg",
};

let companies = [];
let startups = [];
let matches = [];
let introPackets = [];

let startupsById = new Map();
let matchesByCompany = new Map(); // company_id -> Map(startup_id -> match)
let introPacketByMatchId = new Map();

let activeCompany = null;
let browseQuery = "";

async function init() {
  [companies, startups, matches, introPackets] = await Promise.all([
    fetchJSON("data/companies.json"),
    fetchJSON("data/startups.json"),
    fetchJSON("data/matches.json"),
    fetchJSON("data/intro_packets.json"),
  ]);

  startupsById = new Map(startups.map((s) => [s.id, s]));
  introPacketByMatchId = new Map(introPackets.map((p) => [p.match_id, p]));

  matchesByCompany = new Map();
  matches.forEach((m) => {
    if (!matchesByCompany.has(m.company_id)) matchesByCompany.set(m.company_id, new Map());
    matchesByCompany.get(m.company_id).set(m.startup_id, m);
  });

  renderCompanyList();
  renderBrowseList(startups);
  document.getElementById("browse-count").textContent = `(${startups.length})`;

  document.getElementById("toggle-browse").addEventListener("click", toggleBrowse);
  document.getElementById("browse-search").addEventListener("input", onBrowseSearch);
}

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

function renderCompanyList() {
  const el = document.getElementById("company-list");
  el.innerHTML = "";
  companies.forEach((c) => {
    const btn = document.createElement("button");
    btn.className = "card-btn";
    btn.id = `company-${c.id}`;
    btn.innerHTML = `
      <span class="card-title">${escapeHTML(c.name)}</span>
      <span class="card-sub">${escapeHTML(c.sector)}</span>
    `;
    btn.addEventListener("click", () => selectCompany(c.id));
    el.appendChild(btn);
  });
}

function selectCompany(companyId) {
  activeCompany = companies.find((c) => c.id === companyId);

  document.querySelectorAll("#company-list .card-btn").forEach((b) => {
    b.classList.toggle("active", b.id === `company-${companyId}`);
  });

  const companyMatches = [...matchesByCompany.get(companyId).values()].sort((a, b) => b.match_score - a.match_score);
  const top5 = companyMatches.slice(0, 5);

  const section = document.getElementById("matches-section");
  section.hidden = false;
  const list = document.getElementById("match-list");
  list.innerHTML = "";

  top5.forEach((m) => {
    const startup = startupsById.get(m.startup_id);
    const btn = document.createElement("button");
    btn.className = "card-btn";
    btn.dataset.startup = m.startup_id;
    const badgeClass = REC_BADGE[m.recommendation] || "badge-info";
    btn.innerHTML = `
      <span class="card-title">${escapeHTML(startup.company_name)}</span>
      <span class="match-row">
        <span class="badge ${badgeClass}">${escapeHTML(m.recommendation)}</span>
        <span class="score">${m.match_score}/100</span>
      </span>
    `;
    btn.addEventListener("click", () => selectMatch(m.startup_id));
    list.appendChild(btn);
  });

  renderCompanyOverview(activeCompany, startups.length);
  renderBrowseList(currentFilteredStartups());
}

function renderCompanyOverview(company, startupCount) {
  const detail = document.getElementById("detail");
  detail.innerHTML = `
    <div class="packet-grid">
      <div class="widget widget-header" style="border-top-color: var(--accent-2)">
        <p class="eyebrow">Established Company</p>
        <h2>${escapeHTML(company.name)}</h2>
        <p class="na-note" style="margin-top: 0.35rem;">${escapeHTML(company.hq)} &middot; ${escapeHTML(company.sector)}</p>
      </div>
      <div class="widgets-columns">
        <div class="widgets-col">
          <div class="widget">
            <h3>Current Priorities</h3>
            <p>${escapeHTML(company.priority_summary)}</p>
            <p class="na-note" style="margin-top: 0.6rem;">${escapeHTML(company.source_note)}</p>
          </div>
        </div>
        <div class="widgets-col">
          <div class="widget">
            <h3>Candidate Matches</h3>
            <p>Scored against all <span class="mono-num">${startupCount - 1}</span> other startups on industry, business model, description, region, and status.</p>
            <p class="na-note" style="margin-top: 0.6rem;">Top 5 shown at left &mdash; search the full ranked list below.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function selectMatch(startupId) {
  document.querySelectorAll("#match-list .card-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.startup === startupId);
  });

  const startup = startupsById.get(startupId);
  const match = matchesByCompany.get(activeCompany.id).get(startupId);
  const packet = introPacketByMatchId.get(match.id);
  renderPacket(startup, activeCompany, match, packet);
}

function renderPacket(startup, company, match, packet) {
  const detail = document.getElementById("detail");
  const badgeClass = REC_BADGE[match.recommendation] || "badge-info";
  const recColorVar = REC_COLOR_VAR[match.recommendation] || "--info-fg";
  const isSkip = match.recommendation === "Low priority";
  const b = match.score_breakdown;

  const tiles = [
    { label: "Industry", value: b.industryScore, max: 40, note: b.industryHits.length ? b.industryHits.join(", ") : "No matched keywords" },
    { label: "Priority", value: b.priorityScore, max: 35, note: b.priorityHits.length ? b.priorityHits.join(", ") : "No matched keywords" },
    { label: "Business Model", value: b.bizModelScore, max: 10, note: b.bizModelLabel },
    { label: "Region", value: b.regionScore, max: 15, note: b.regionLabel },
  ];

  const tileHTML = tiles
    .map((t) => {
      const pct = t.max ? Math.round((t.value / t.max) * 100) : 0;
      return `
        <div class="score-tile">
          <div class="tile-label">${escapeHTML(t.label)}</div>
          <div class="tile-value mono-num">${t.value}/${t.max}</div>
          <div class="tile-bar"><div class="tile-bar-fill" style="width:${pct}%"></div></div>
          <div class="tile-note">${escapeHTML(t.note)}</div>
        </div>
      `;
    })
    .join("");

  const statusOk = b.statusFactor >= 1;
  const statusTileHTML = `
    <div class="score-tile status-tile ${statusOk ? "status-ok" : "status-bad"}">
      <div class="tile-label">Status</div>
      <div class="tile-value mono-num">&times;${b.statusFactor}</div>
      <div class="tile-bar"><div class="tile-bar-fill" style="width:${Math.round(b.statusFactor * 100)}%"></div></div>
      <div class="tile-note">${escapeHTML(b.statusLabel)}</div>
    </div>
  `;

  const emailHTML = isSkip
    ? `<p class="na-note">Not applicable &mdash; this introduction is not recommended.</p>`
    : `
      <div class="email-box">
        <div class="email-subject">${escapeHTML(packet.draft_email.subject)}</div>
        <div>${escapeHTML(packet.draft_email.body)}</div>
      </div>
    `;

  const ctaWidget = isSkip
    ? ""
    : `
      <div class="widget">
        <h3>Suggested Call to Action</h3>
        <div class="cta-box">${escapeHTML(packet.cta)}</div>
      </div>
    `;

  detail.innerHTML = `
    <div class="packet-grid">
      <div class="widget widget-header" style="border-top-color: var(${recColorVar})">
        <div class="header-top">
          <div>
            <p class="eyebrow">Match</p>
            <h2>${escapeHTML(startup.company_name)} &rarr; ${escapeHTML(company.name)}</h2>
          </div>
          <span class="badge badge-lg ${badgeClass}">${escapeHTML(match.recommendation)}</span>
        </div>
        <div class="hero-score">
          <span class="hero-score-num mono-num">${match.match_score}</span>
          <span class="hero-score-max mono-num">/100</span>
        </div>
        <div class="hero-bar"><div class="hero-bar-fill" style="width:${match.match_score}%; background: var(${recColorVar})"></div></div>
      </div>

      <div class="widget">
        <h3>Score Breakdown</h3>
        <div class="score-tiles">
          ${tileHTML}
          ${statusTileHTML}
        </div>
      </div>

      <div class="widgets-columns">
        <div class="widgets-col">
          <div class="widget">
            <h3>Why This Match Makes Sense</h3>
            <ul>${match.match_reasons.map((x) => `<li>${escapeHTML(x)}</li>`).join("")}</ul>
          </div>
          <div class="widget">
            <h3>Startup Value Proposition</h3>
            <p>${escapeHTML(packet.value_prop)}</p>
          </div>
        </div>
        <div class="widgets-col">
          <div class="widget">
            <h3>Recommended Contact</h3>
            <p>${escapeHTML(packet.recommended_contact)}</p>
          </div>
          <div class="widget">
            <h3>Suggested Intro Angle</h3>
            <p>${escapeHTML(packet.intro_angle)}</p>
          </div>
          ${ctaWidget}
        </div>
      </div>
    </div>
  `;
}

function currentFilteredStartups() {
  if (!browseQuery) return startups;
  return startups.filter((s) => {
    const blob = `${s.company_name} ${s.icp_industry || ""} ${s.company_industries || ""}`.toLowerCase();
    return blob.includes(browseQuery);
  });
}

function renderBrowseList(list) {
  const el = document.getElementById("browse-list");
  el.innerHTML = "";

  const companyMatchMap = activeCompany ? matchesByCompany.get(activeCompany.id) : null;

  const rows = companyMatchMap
    ? [...list].sort((a, b) => {
        const sa = companyMatchMap.get(a.id)?.match_score ?? -1;
        const sb = companyMatchMap.get(b.id)?.match_score ?? -1;
        return sb - sa;
      })
    : list;

  if (!rows.length) {
    el.innerHTML = `<p class="na-note">No startups match that search.</p>`;
    return;
  }

  rows.forEach((s) => {
    const row = document.createElement("div");
    const isSelf = activeCompany && s.company_name.toLowerCase() === activeCompany.name.toLowerCase();
    const match = companyMatchMap && !isSelf ? companyMatchMap.get(s.id) : null;
    row.className = "browse-row" + (match ? " has-packet" : "");
    row.innerHTML = `
      <span>
        <span class="browse-name">${escapeHTML(s.company_name)}</span>
        <span class="browse-industry"> &mdash; ${escapeHTML(s.icp_industry || s.company_industries || "")}</span>
      </span>
      ${
        isSelf
          ? '<span class="pill-none">This is the selected established company</span>'
          : match
            ? `<span class="badge ${REC_BADGE[match.recommendation] || "badge-info"}">${match.match_score}/100</span>`
            : '<span class="pill-none">Select a company to score</span>'
      }
    `;
    if (match) {
      row.addEventListener("click", () => {
        document.getElementById("browse-panel").hidden = true;
        document.getElementById("toggle-browse").setAttribute("aria-expanded", "false");
        selectMatch(s.id);
        document.getElementById("detail").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    el.appendChild(row);
  });
}

function onBrowseSearch(e) {
  browseQuery = e.target.value.trim().toLowerCase();
  renderBrowseList(currentFilteredStartups());
}

function toggleBrowse() {
  const panel = document.getElementById("browse-panel");
  const btn = document.getElementById("toggle-browse");
  panel.hidden = !panel.hidden;
  btn.setAttribute("aria-expanded", String(!panel.hidden));
}

function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

init();
