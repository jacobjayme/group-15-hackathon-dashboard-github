// Runs the real matching algorithm (matching.js) over the real startup and
// company data and writes out data/matches.json and data/intro_packets.json.
//
// Usage: node scripts/generate-data.js
// Also used as a library by server.js, which re-runs this automatically
// whenever the source data files change (see server.js's matching agent).

const fs = require("fs");
const path = require("path");
const { scoreStartup, buildMatchReasons, buildRisks, recommendedContactFor, introPacketFor } = require("./matching");

const DATA_DIR = path.join(__dirname, "..", "data");

function readJSON(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
}

function writeJSONLines(name, items) {
  const lines = items.map((item) => JSON.stringify(item));
  fs.writeFileSync(path.join(DATA_DIR, name), "[\n" + lines.join(",\n") + "\n]\n");
}

function runGeneration() {
  const companies = readJSON("companies.json");
  const startups = readJSON("startups.json");
  const contacts = readJSON("contacts.json");
  const contactsByCompany = new Map(contacts.map((c) => [c.company_id, c]));

  const matches = [];
  const introPackets = [];

  for (const company of companies) {
    const eligible = startups.filter((s) => s.company_name.toLowerCase() !== company.name.toLowerCase());

    for (const startup of eligible) {
      const score = scoreStartup(startup, company);
      const matchId = `${company.id}__${startup.id}`;

      matches.push({
        id: matchId,
        company_id: company.id,
        startup_id: startup.id,
        match_score: score.total,
        recommendation: score.recommendation,
        match_reasons: buildMatchReasons(company, score.breakdown),
        score_breakdown: score.breakdown,
      });

      const packet = introPacketFor(startup, company, score);
      introPackets.push({
        match_id: matchId,
        value_prop: packet.value_prop,
        recommended_contact: recommendedContactFor(company, score.breakdown, contactsByCompany.get(company.id)),
        intro_angle: packet.intro_angle,
        draft_email: packet.draft_email,
        cta: packet.cta,
        risks: buildRisks(startup, company, score.breakdown),
      });
    }
  }

  writeJSONLines("matches.json", matches);
  writeJSONLines("intro_packets.json", introPackets);

  return {
    matches: matches.length,
    packets: introPackets.length,
    companies: companies.length,
    startups: startups.length,
  };
}

if (require.main === module) {
  const result = runGeneration();
  console.log(
    `Generated ${result.matches} matches and ${result.packets} intro packets across ${result.companies} companies x ${result.startups} startups.`
  );
}

module.exports = { runGeneration };
