const REC_BADGE = {
  "Send intro now": "badge-send",
  "Needs 43North review": "badge-review",
  "Needs more information": "badge-info",
  "Do not prioritize": "badge-no",
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
    <div class="packet">
      <h2>${escapeHTML(company.name)}</h2>
      <p class="packet-sub">${escapeHTML(company.hq)} &middot; ${escapeHTML(company.sector)}</p>
      <section>
        <h3>Current Priorities</h3>
        <p>${escapeHTML(company.priority_summary)}</p>
        <p class="na-note">${escapeHTML(company.source_note)}</p>
      </section>
      <section>
        <h3>Candidate Matches</h3>
        <p>Scored against all ${startupCount - 1} other startups in the 43North data set using each startup's industry, business model, description, region, and status. Top 5 shown at left &mdash; search the full ranked list below.</p>
      </section>
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
  const isSkip = match.recommendation === "Do not prioritize";
  const b = match.score_breakdown;

  const emailHTML = isSkip
    ? `<p class="na-note">Not applicable &mdash; this introduction is not recommended.</p>`
    : `
      <div class="email-box">
        <div class="email-subject">${escapeHTML(packet.draft_email.subject)}</div>
        <div>${escapeHTML(packet.draft_email.body)}</div>
      </div>
    `;

  const ctaHTML = isSkip
    ? ""
    : `<section><h3>Suggested Call to Action</h3><div class="cta-box">${escapeHTML(packet.cta)}</div></section>`;

  detail.innerHTML = `
    <div class="packet">
      <h2>${escapeHTML(startup.company_name)} &rarr; ${escapeHTML(company.name)}</h2>
      <p class="packet-sub">Overall Match Score: <strong>${match.match_score}/100</strong></p>

      <section>
        <h3>Score Breakdown</h3>
        <ul>
          <li>Industry/product alignment: ${b.industryScore}/40 ${b.industryHits.length ? `(matched: ${b.industryHits.map(escapeHTML).join(", ")})` : "(no matched keywords)"}</li>
          <li>Stated-priority alignment: ${b.priorityScore}/35 ${b.priorityHits.length ? `(matched: ${b.priorityHits.map(escapeHTML).join(", ")})` : "(no matched keywords)"}</li>
          <li>Business model fit: ${b.bizModelScore}/10 (${escapeHTML(b.bizModelLabel)})</li>
          <li>Region: ${b.regionScore}/15 (${escapeHTML(b.regionLabel)})</li>
          <li>Status adjustment: &times;${b.statusFactor} (${escapeHTML(b.statusLabel)})</li>
        </ul>
      </section>

      <section>
        <h3>Why This Match Makes Sense</h3>
        <ul>${match.match_reasons.map((x) => `<li>${escapeHTML(x)}</li>`).join("")}</ul>
      </section>

      <section>
        <h3>Startup Value Proposition</h3>
        <p>${escapeHTML(packet.value_prop)}</p>
      </section>

      <section>
        <h3>Recommended Contact</h3>
        <p>${escapeHTML(packet.recommended_contact)}</p>
      </section>

      <section>
        <h3>Suggested Intro Angle</h3>
        <p>${escapeHTML(packet.intro_angle)}</p>
      </section>

      <section>
        <h3>Draft Email</h3>
        ${emailHTML}
      </section>

      ${ctaHTML}

      <section>
        <h3>Risks or Unknowns</h3>
        <ul>${packet.risks.map((x) => `<li>${escapeHTML(x)}</li>`).join("")}</ul>
      </section>

      <section>
        <h3>Recommendation</h3>
        <div class="recommendation-line">
          <span class="badge ${badgeClass}">${escapeHTML(match.recommendation)}</span>
        </div>
      </section>
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
