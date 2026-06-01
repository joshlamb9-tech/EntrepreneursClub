const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const SYSTEM_PROMPT = `You are the simulation engine for a children's business idea tool. Your job is to evaluate a business idea by reasoning about how different types of UK customers would respond to it.
You will be given: a description of a business idea submitted by a child aged 9–13; a panel of 9 customer segments representing 100 representative UK consumers (scaled to 1,000).
For each segment, estimate:
1. buy_probability: the realistic fraction of this segment who would actually buy (0.0 to 1.0). Be honest — most ideas will only appeal to a minority of any segment. Typical values range from 0.02 to 0.35.
2. willingness_to_pay: the maximum amount in £ this segment would typically pay for this type of product/service.
3. purchase_frequency_multiplier: a multiplier on the stated purchase frequency. Use 1.0 if the stated frequency seems realistic, lower (e.g. 0.5) if it seems optimistic, higher if this segment would actually buy more often.
4. quote: a single, realistic first-person quote (maximum 15 words) from a fictional member of this segment. It can be positive, lukewarm, or a polite objection — match the probability.
5. reasoning: one sentence explaining this segment's reaction.
Also provide: idea_summary (neutral one-sentence restatement); overall_confidence (high/medium/low); standout_segment (segment ID most likely to buy); weakest_segment (least likely); top_strength (one sentence); main_challenge (one sentence); encouragement (one warm, specific, honest sentence for the child — acknowledge something real and good about their thinking).
Be realistic but not harsh. These are children. A low buy_probability is fine and honest — do not inflate numbers to be kind. The encouragement field is where warmth lives; the numbers should be credible.
Return only valid JSON matching the exact schema. No markdown. No explanation outside the JSON.

The JSON schema to return:
{
  "simulation": {
    "idea_summary": "string",
    "overall_confidence": "high | medium | low",
    "segments": [
      { "segment_id": "S1", "segment_label": "...", "buy_probability": 0.0,
        "willingness_to_pay": 0, "purchase_frequency_multiplier": 1.0,
        "quote": "max 15 words first person", "reasoning": "one sentence" }
    ],
    "standout_segment": "S2", "weakest_segment": "S7",
    "top_strength": "string", "main_challenge": "string", "encouragement": "string"
  }
}`;

function buildUserPrompt(data: {
  business_name: string;
  what_it_does: string;
  who_its_for: string;
  problem_it_solves: string;
  price: number;
  cost_per_unit: number;
  purchase_frequency_label: string;
  why_different: string;
}): string {
  return `Here is the business idea to evaluate:
Business name: ${data.business_name}
What it does: ${data.what_it_does}
Who it's for: ${data.who_its_for}
Problem it solves: ${data.problem_it_solves}
Price per unit/session: £${data.price}
Cost to deliver each sale: £${data.cost_per_unit}
How often the same customer buys: ${data.purchase_frequency_label}
Why it's different: ${data.why_different}

Here is the customer panel (100 representative UK consumers, scaled to 1,000):
S1 — Young urban professional (age 22–35, £35k–£60k, city, convenience-driven): 15 people
S2 — Suburban family parent (age 30–45, £40k–£80k, suburbs, practical, value-conscious): 20 people
S3 — Older suburban homeowner (age 50–65, £30k–£55k, suburban/town, reliability-focused): 12 people
S4 — Rural adult (age 30–60, £25k–£45k, rural, community-minded): 8 people
S5 — Affluent parent/professional (age 35–55, £80k+, city/commuter, quality over price): 10 people
S6 — Teenager/young adult (age 13–22, low income, trend-driven, price-sensitive): 10 people
S7 — Retired adult (age 65+, £18k–£30k, town/suburb, values personal service): 10 people
S8 — Small business owner (age 28–50, variable income, ROI-focused): 7 people
S9 — Single adult renting (age 25–40, £20k–£35k, city/town, budget-conscious): 8 people
Total panel: 100 people representing 1,000 UK consumers.

Evaluate this idea against each segment and return your JSON response.`;
}

const FREQ_LABELS: Record<string, string> = {
  once: 'Once (one-off purchase)',
  monthly: 'About once a month',
  weekly: 'About once a week',
  quarterly: 'A few times a year',
  daily: 'Every day',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors });
  }

  let body: {
    business_name?: unknown;
    what_it_does?: unknown;
    who_its_for?: unknown;
    problem_it_solves?: unknown;
    price?: unknown;
    cost_per_unit?: unknown;
    purchase_frequency?: unknown;
    why_different?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: cors });
  }

  const {
    business_name, what_it_does, who_its_for, problem_it_solves,
    price, cost_per_unit, purchase_frequency, why_different,
  } = body;

  // Basic validation
  if (typeof business_name !== 'string' || !business_name.trim()) {
    return new Response(JSON.stringify({ error: 'business_name required' }), { status: 400, headers: cors });
  }
  if (typeof what_it_does !== 'string' || !what_it_does.trim()) {
    return new Response(JSON.stringify({ error: 'what_it_does required' }), { status: 400, headers: cors });
  }
  if (typeof price !== 'number' || price <= 0) {
    return new Response(JSON.stringify({ error: 'price must be a positive number' }), { status: 400, headers: cors });
  }
  if (typeof cost_per_unit !== 'number' || cost_per_unit < 0) {
    return new Response(JSON.stringify({ error: 'cost_per_unit must be >= 0' }), { status: 400, headers: cors });
  }
  if (typeof purchase_frequency !== 'string' || !FREQ_LABELS[purchase_frequency]) {
    return new Response(JSON.stringify({ error: 'invalid purchase_frequency' }), { status: 400, headers: cors });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500, headers: cors });
  }

  const userPrompt = buildUserPrompt({
    business_name: String(business_name).trim(),
    what_it_does: String(what_it_does).trim(),
    who_its_for: String(who_its_for || '').trim(),
    problem_it_solves: String(problem_it_solves || '').trim(),
    price: price as number,
    cost_per_unit: cost_per_unit as number,
    purchase_frequency_label: FREQ_LABELS[purchase_frequency as string],
    why_different: String(why_different || '').trim(),
  });

  let anthropicRes: Response;
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1800,
        temperature: 0.4,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
  } catch (err) {
    console.error('Anthropic fetch error:', err);
    return new Response(
      JSON.stringify({ error: 'Something went wrong with the simulation — try submitting again.' }),
      { status: 500, headers: cors }
    );
  }

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text().catch(() => '');
    console.error('Anthropic API error:', anthropicRes.status, errText);
    return new Response(
      JSON.stringify({ error: 'Something went wrong with the simulation — try submitting again.' }),
      { status: 500, headers: cors }
    );
  }

  const anthropicData = await anthropicRes.json();
  const rawContent: string = anthropicData?.content?.[0]?.text ?? '';

  let simulation: unknown;
  try {
    // Strip any accidental markdown fences
    const cleaned = rawContent.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    simulation = JSON.parse(cleaned);
  } catch (err) {
    console.error('JSON parse failure. Raw content:', rawContent);
    return new Response(
      JSON.stringify({ error: 'Something went wrong with the simulation — try submitting again.' }),
      { status: 500, headers: cors }
    );
  }

  return new Response(JSON.stringify(simulation), { headers: cors });
});
