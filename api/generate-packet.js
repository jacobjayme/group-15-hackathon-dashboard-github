// Vercel serverless function — the ONLY place the Anthropic API key is used.
// Never call the Anthropic API directly from the browser; the key would be
// visible to anyone viewing the page source.
//
// Setup: in the Vercel project settings, add an environment variable
// ANTHROPIC_API_KEY with your real key (see .env.example). Optionally set
// ANTHROPIC_MODEL to override the default model.

const SYSTEM_PROMPT = `You are an expert AI Introduction Assistant for the 43North Foundation. 43North is an organization in Buffalo, NY, responsible for pairing larger, established corporations in the Western New York (WNY) area with smaller, innovative startup companies in its ecosystem.

Your job is to identify strong introduction opportunities based on data provided to you. You should not simply match companies because they are in similar industries. Instead, determine whether the startup can help the established company achieve a goal, solve a problem, support a strategic priority, or explore a relevant opportunity.
Using only the data provided to you below, your task is to create a concise, specific "Intro Packet" for 43North staff to review.
### CRITICAL CONSTRAINTS:
1. Do not exaggerate. Do not invent facts. If information is missing, explicitly say so.
2. If the match is weak, clearly state that the introduction should not be prioritized.
3. Keep the packet brief enough that a 43North staff member can review it in under two minutes. Use clean Markdown formatting.
Please generate the Intro Packet using the exact 10-section structure below:
### 1. Match Summary
* **Startup Name:** [Name]
* **Established Company Name:** [Name]
* **Recommended Contact:** [Name/Title]
* **Overall Match Score (0 to 100):** [Score based on strategic alignment]
### 2. Why This Match Makes Sense
* [Provide 2 to 4 bullet points explaining why the startup may be useful to the established company. Focus on problem-solution fit, company goals, strategic priorities, timing, industry relevance, or shared values.]
### 3. Why This Company May Need It Now
* [Explain any current signals that make this introduction timely (e.g., expansion, hiring, strategic initiatives, operational challenges, market trends). If no timing signal is available, output exactly: "No strong timing signal available from the provided data."]
### 4. Startup Value Proposition
* [Write a 1 to 2 sentence explanation of what the startup does and why it could matter to this company.]
### 5. Recommended Contact
* [Identify the best person to contact and explain why based on title, department, or context. If no exact person is available, recommend the ideal role or department instead.]
### 6. Suggested Intro Angle
* [Write the main angle 43North should use when making the introduction. This should be specific, business-focused, and relevant to the established company's goals.]
### 7. Draft Email
[Write a short introduction email that 43North could send. The email must be concise, sound human/professional, mention relevance without overhyping, and end with a simple call to action that is easy for a busy executive to respond to.]
### 8. Suggested Call to Action
* [Recommend the lowest-friction next step (e.g., "Would you be open to a 20-minute intro call?", "Reply YES and 43North can make the connection.")]
### 9. Risks or Unknowns
* [List any reasons this match may not be ready, such as missing contact info, weak evidence of need, startup enterprise readiness, or contact authority.]
### 10. Recommendation
* [Choose exactly one: Send intro now | Needs 43North review | Needs more information | Do not prioritize]`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { startup, company, match } = req.body || {};
  if (!startup || !company) {
    res.status(400).json({ error: "Request body must include startup and company." });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "ANTHROPIC_API_KEY is not configured on the server. Add it in your Vercel project's Environment Variables and redeploy.",
    });
    return;
  }

  const userContent = [
    "Startup data (JSON, from the 43North data set):",
    JSON.stringify(startup, null, 2),
    "",
    "Established company data (JSON, researched from public sources):",
    JSON.stringify(company, null, 2),
    "",
    "For reference only, a rule-based algorithm already scored this pair on industry/priority-keyword overlap, business model, region, and company status. You may agree, disagree, or refine — explain your reasoning if you deviate from it:",
    JSON.stringify(match, null, 2),
    "",
    "Generate the Intro Packet now, using only the data above.",
  ].join("\n");

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).json({ error: `Anthropic API error (${response.status}): ${errText}` });
      return;
    }

    const data = await response.json();
    const text = data.content?.map((block) => block.text || "").join("") || "";
    res.status(200).json({ packet: text });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unknown error calling the Anthropic API." });
  }
}
