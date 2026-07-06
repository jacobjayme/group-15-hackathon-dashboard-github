const REC_BADGE = {
  "Send intro now": "badge-send",
  "Needs 43North review": "badge-review",
  "Needs more information": "badge-info",
  "Do not prioritize": "badge-no",
};

let companies = [];
let matches = [];
let startups = [];
let activeCompanyId = null;

async function init() {
  [companies, matches, startups] = await Promise.all([
    fetchJSON("data/companies.json"),
    fetchJSON("data/matches.json"),
    fetchJSON("data/startups.json"),
  ]);

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
  activeCompanyId = companyId;

  document.querySelectorAll("#company-list .card-btn").forEach((b) => {
    b.classList.toggle("active", b.id === `company-${companyId}`);
  });

  const company = companies.find((c) => c.id === companyId);
  const companyMatches = matches
    .filter((m) => m.company_id === companyId)
    .sort((a, b) => b.match_score - a.match_score);

  const section = document.getElementById("matches-section");
  section.hidden = false;
  const list = document.getElementById("match-list");
  list.innerHTML = "";

  companyMatches.forEach((m) => {
    const btn = document.createElement("button");
    btn.className = "card-btn";
    btn.id = `match-${m.id}`;
    const badgeClass = REC_BADGE[m.recommendation] || "badge-info";
    btn.innerHTML = `
      <span class="card-title">${escapeHTML(m.startup_name)}</span>
      <span class="match-row">
        <span class="badge ${badgeClass}">${escapeHTML(m.recommendation)}</span>
        <span class="score">${m.match_score}/100</span>
      </span>
    `;
    btn.addEventListener("click", () => selectMatch(m.id));
    list.appendChild(btn);
  });

  renderCompanyOverview(company, companyMatches.length);
}

function renderCompanyOverview(company, matchCount) {
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
        <p>${matchCount} startup${matchCount === 1 ? "" : "s"} evaluated. Select one from the list to view its full Intro Packet.</p>
      </section>
    </div>
  `;
}

function selectMatch(matchId) {
  document.querySelectorAll("#match-list .card-btn").forEach((b) => {
    b.classList.toggle("active", b.id === `match-${matchId}`);
  });

  const m = matches.find((x) => x.id === matchId);
  const company = companies.find((c) => c.id === m.company_id);
  renderPacket(m, company);
}

function renderPacket(m, company) {
  const detail = document.getElementById("detail");
  const badgeClass = REC_BADGE[m.recommendation] || "badge-info";
  const isSkip = m.recommendation === "Do not prioritize";

  const timingHTML = Array.isArray(m.timing)
    ? `<ul>${m.timing.map((t) => `<li>${escapeHTML(t)}</li>`).join("")}</ul>`
    : `<p class="na-note">${escapeHTML(m.timing)}</p>`;

  const emailHTML = isSkip
    ? `<p class="na-note">Not applicable &mdash; this introduction is not recommended.</p>`
    : `
      <div class="email-box">
        <div class="email-subject">${escapeHTML(m.draft_email.subject)}</div>
        <div>${escapeHTML(m.draft_email.body)}</div>
      </div>
    `;

  const ctaHTML = isSkip
    ? ""
    : `<section><h3>Suggested Call to Action</h3><div class="cta-box">${escapeHTML(m.cta)}</div></section>`;

  detail.innerHTML = `
    <div class="packet">
      <h2>${escapeHTML(m.startup_name)} &rarr; ${escapeHTML(company.name)}</h2>
      <p class="packet-sub">Overall Match Score: <strong>${m.match_score}/100</strong></p>

      <section>
        <h3>Why This Match Makes Sense</h3>
        <ul>${m.why_match.map((b) => `<li>${escapeHTML(b)}</li>`).join("")}</ul>
      </section>

      <section>
        <h3>Why ${escapeHTML(company.name)} May Need It Now</h3>
        ${timingHTML}
      </section>

      <section>
        <h3>Startup Value Proposition</h3>
        <p>${escapeHTML(m.value_prop)}</p>
      </section>

      <section>
        <h3>Recommended Contact</h3>
        <p>${escapeHTML(m.recommended_contact)}</p>
      </section>

      <section>
        <h3>Suggested Intro Angle</h3>
        <p>${isSkip ? '<span class="na-note">Not applicable.</span>' : escapeHTML(m.intro_angle)}</p>
      </section>

      <section>
        <h3>Draft Email</h3>
        ${emailHTML}
      </section>

      ${ctaHTML}

      <section>
        <h3>Risks or Unknowns</h3>
        <ul>${m.risks.map((b) => `<li>${escapeHTML(b)}</li>`).join("")}</ul>
      </section>

      <section>
        <h3>Recommendation</h3>
        <div class="recommendation-line">
          <span class="badge ${badgeClass}">${escapeHTML(m.recommendation)}</span>
        </div>
      </section>
    </div>
  `;
}

function renderBrowseList(list) {
  const el = document.getElementById("browse-list");
  el.innerHTML = "";
  const matchedNames = new Set(matches.map((m) => m.startup_name));

  list.forEach((s) => {
    const row = document.createElement("div");
    const hasPacket = matchedNames.has(s.company_name);
    row.className = "browse-row" + (hasPacket ? " has-packet" : "");
    row.innerHTML = `
      <span>
        <span class="browse-name">${escapeHTML(s.company_name)}</span>
        <span class="browse-industry"> &mdash; ${escapeHTML(s.icp_industry || s.company_industries || "")}</span>
      </span>
      ${hasPacket ? '<span class="pill-available">Packet available</span>' : '<span class="pill-none">Not yet evaluated</span>'}
    `;
    if (hasPacket) {
      row.addEventListener("click", () => {
        const m = matches.find((x) => x.startup_name === s.company_name);
        document.getElementById("browse-panel").hidden = true;
        document.getElementById("toggle-browse").setAttribute("aria-expanded", "false");
        selectCompany(m.company_id);
        selectMatch(m.id);
        document.getElementById("detail").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    el.appendChild(row);
  });
}

function onBrowseSearch(e) {
  const q = e.target.value.trim().toLowerCase();
  if (!q) {
    renderBrowseList(startups);
    return;
  }
  const filtered = startups.filter((s) => {
    const blob = `${s.company_name} ${s.icp_industry || ""} ${s.company_industries || ""}`.toLowerCase();
    return blob.includes(q);
  });
  renderBrowseList(filtered);
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
