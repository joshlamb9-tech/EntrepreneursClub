# Entrepreneurs Club — Business Idea Simulator (MVP Spec)

A standalone web tool: children (Y5–Y8, ages 9–13) submit a business idea via a form, an AI
simulates a panel of ~1,000 UK customers, and they get a slick "investor report" with a valuation,
projected revenue/profit, and a Dragon's-Den-style star verdict. Encouraging by design — even a weak
idea gets warm, constructive feedback, never a crushing verdict.

## Stack / reuse
- Static HTML/CSS/JS, no build step. Dosis font + navy/gold (Mowden house style).
- Supabase project: `https://jkbfvfoepmhwyzhleifh.supabase.co` (same project as the maths site).
- Clone the maths-site edge-function CORS pattern (`Access-Control-Allow-Origin: *`, allow headers
  `authorization, x-client-info, apikey, content-type`, handle OPTIONS preflight) and the front-end
  fetch pattern (`apikey` + `Authorization: Bearer <anon key>` + `Content-Type` headers).
- Secrets via `Deno.env.get()`; `verify_jwt = false` in config.toml.
- Anthropic secret name (already being added by Josh): `ANTHROPIC_API_KEY`.
- Model: Claude Haiku `claude-haiku-4-5`, `max_tokens: 1800`, `temperature: 0.4`.

## THE FORM — 8 fields, one screen, <3 min for a 10-year-old. Submit button: "Run the numbers".
1. **Business Name** — text, required, max 60. Label "What's your business called?" placeholder "e.g. Paws & Claws Pet Spa". Helper: "Make it memorable — this is what customers will remember."
2. **What It Does** — textarea 3 rows, required, max 300. "What does your business do?" placeholder "e.g. We visit people's homes and wash their dogs so owners don't have to go to a pet salon." Helper: "Describe it clearly enough that someone who's never heard of it gets it straight away."
3. **Who It's For** — text, required, max 150. "Who are your customers?" placeholder "e.g. Dog owners who are busy or don't have a car". Helper: "Think about who actually needs what you're selling."
4. **Problem It Solves** — text, required, max 200. "What problem does it solve?" placeholder "e.g. Taking a dog to a salon is time-consuming and stressful". Helper: "Every great business fixes something. What's the pain you're removing?"
5. **Price** — number min 0.01 step 0.01, required. "How much will you charge? (£)" placeholder "e.g. 25". Helper: "Per item sold or per visit/session — whatever makes sense for your business."
6. **Cost to Deliver** — number min 0 step 0.01, required. "What does it cost you to deliver each sale? (£)" placeholder "e.g. 8". Helper: "Include materials, travel, supplies — anything you spend to complete one order or job."
7. **Purchase Frequency** — select, required. Options: `once`→"Once (it's a one-off purchase)", `monthly`→"About once a month", `weekly`→"About once a week", `quarterly`→"A few times a year", `daily`→"Every day". Helper: "Think about whether customers come back or just buy once."
8. **Why It's Different** — text, required, max 200. "Why is yours better or different?" placeholder "e.g. We come to your house, we're friendly with nervous dogs, and we're cheaper than salons". Helper: "What makes someone choose you over doing nothing — or over a competitor?"

Mobile-first, two-column desktop / single column mobile. No login. Results ephemeral.

## CUSTOMER PANEL (constant embedded in the prompt; 100-member panel scaled x10 → 1,000)
| ID | Label | Age | Income | Location | Lifestyle | Weight |
|----|-------|-----|--------|----------|-----------|--------|
| S1 | Young urban professional | 22–35 | £35k–£60k | City | convenience-driven | 15 |
| S2 | Suburban family parent | 30–45 | £40k–£80k | Suburbs | practical/value-conscious | 20 |
| S3 | Older suburban homeowner | 50–65 | £30k–£55k | Suburban/town | reliability | 12 |
| S4 | Rural adult | 30–60 | £25k–£45k | Rural | community-minded | 8 |
| S5 | Affluent parent/professional | 35–55 | £80k+ | City/commuter | quality over price | 10 |
| S6 | Teenager/young adult | 13–22 | low | Mixed | trend-driven/price-sensitive | 10 |
| S7 | Retired adult | 65+ | £18k–£30k | Town/suburb | personal service | 10 |
| S8 | Small business owner | 28–50 | variable | Mixed | ROI-focused | 7 |
| S9 | Single adult renting | 25–40 | £20k–£35k | City/town | budget-conscious | 8 |

Total = 100.

## JSON OUTPUT SCHEMA (LLM must return ONLY this, no markdown; `JSON.parse`; graceful 500 on failure)
```json
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
}
```
(One segment object per S1–S9.)

## LLM SYSTEM PROMPT
```
You are the simulation engine for a children's business idea tool. Your job is to evaluate a business idea by reasoning about how different types of UK customers would respond to it.
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
```
(Append the JSON schema above to the system prompt.)

## LLM USER PROMPT (interpolate form values)
```
Here is the business idea to evaluate:
Business name: {business_name}
What it does: {what_it_does}
Who it's for: {who_its_for}
Problem it solves: {problem_it_solves}
Price per unit/session: £{price}
Cost to deliver each sale: £{cost_per_unit}
How often the same customer buys: {purchase_frequency_label}
Why it's different: {why_different}

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

Evaluate this idea against each segment and return your JSON response.
```

## VALUATION MATHS (deterministic, frontend JS after response)
- `effective_buy_rate[s] = buy_probability[s]`
- `price_adjusted_buy_rate[s] = (willingness_to_pay[s] >= price) ? effective_buy_rate[s] : effective_buy_rate[s] * (willingness_to_pay[s]/price)`
- `panel_buy_rate = Σ price_adjusted_buy_rate[s] * weight[s]/100`
- `addressable_buyers = ROUND(panel_buy_rate * 1000)`
- `frequency_map = {once:1, quarterly:4, monthly:12, weekly:52, daily:365}`; `base_frequency = map[stated]`
- `weighted_freq_multiplier = Σ purchase_frequency_multiplier[s] * weight[s]/100`
- `annual_purchases_per_buyer = base_frequency * weighted_freq_multiplier`
- `annual_revenue = addressable_buyers * price * annual_purchases_per_buyer`
- `unit_margin = price - cost_per_unit`; `margin_pct = unit_margin/price`
- `annual_profit = annual_revenue * margin_pct`
- `valuation = MIN(annual_revenue * 3, 10000000)` (3× revenue multiple)
- Display: valuation rounded to nearest £1,000 if <£1m else nearest £10,000; comma-formatted, £ sign.
- Disclaimer: "This doesn't include fixed costs like equipment or a website — your real profit might be lower."

## VERDICT BANDS (based on annual_profit)
- **Tier 5 "Investors are calling"** ≥£50k, gold, ★★★★★ — *"This could be a real business."* "The numbers suggest strong demand and healthy margins. Now the question is: can you deliver at scale?" → "Think about how you'd hire help as you grow." → "Could you protect your idea — is there a unique element competitors can't copy?"
- **Tier 4 "Strong business"** £15k–<£50k, green, ★★★★☆ — *"Solid idea with real commercial potential."* "Enough customers would pay enough to make this profitable. The main job now is getting in front of them." → "How would your first 10 customers find out about you?" → "Is there a version of this that costs less to deliver?"
- **Tier 3 "Worth building"** £5k–<£15k, green, ★★★☆☆ — *"This works — the margins just need attention."* "The idea has appeal, but profit is tight. Small changes to price or costs could move this into stronger territory." → "Could you charge slightly more — and if so, what would justify it?" → "What's your single biggest cost, and is there a way to reduce it?"
- **Tier 2 "Early stage"** £1k–<£5k, amber, ★★☆☆☆ — *"There's something here — it needs sharpening."* "The customer interest is real, but at this price and cost level, the profit is thin. That's fixable." → "Try doubling your price and re-running the numbers." → "Who is your most likely customer — and are you targeting them clearly?"
- **Tier 1 "Back to the drawing board"** <£1k, warm red, ★☆☆☆☆ — *"The numbers aren't there yet — but the thinking is."* "At the moment, the profit is too small to build a real business. That doesn't mean the idea is bad — it means something needs to change." → "Is the price too low? Most first-time entrepreneurs undercharge." → "Is the market too small — or are you describing your customer too broadly?"

## REPORT LAYOUT (single scrolling page; sections fade-in from bottom, 300ms stagger)
- **Header**: big `[Business Name]`; subhead "Investor Report — [today's date]"; tagline = `idea_summary` (italic).
- **Section 1 — Verdict Card** (revealed first, full-width): star rating SVGs that FILL IN one by one left→right, 150ms apart (~0.75s, slot-machine feel); verdict tier name in a coloured band; headline; one-line explanation; two next steps as bullets prefixed with →.
- **Section 2 — "What the numbers say"** (after ~400ms): 2×2 grid (4-col desktop) of stat boxes: (1) Potential customers = `addressable_buyers` "out of 1,000 people we surveyed"; (2) Projected annual revenue "what you could take in per year"; (3) Projected annual profit "what you'd keep after costs"; (4) Business valuation "what an investor might pay for it". Below: "Based on a profit margin of [margin_pct]%. This doesn't include fixed costs like equipment."
- **Section 3 — "How 1,000 customers reacted"**: CSS-only horizontal bar chart of `buy_probability*100` per segment, labelled by segment name, bars fill L→R 600ms. Below: standout_segment + weakest_segment in two short sentences.
- **Section 4 — "Voices from the panel"**: three quote cards from the 3 highest `buy_probability` segments — quote in speech-mark styling, segment label below.
- **Section 5 — "What the panel thinks"**: three short paras — "Your biggest strength:" + `top_strength`; "The main challenge:" + `main_challenge`; `encouragement` (no prefix, larger/warmer font).
- **Footer**: "Try again with a different idea →" (reloads to form); "Built for Mowden Hall Entrepreneurs Club".

## LOADING STATE (4–10s during edge function call)
CSS spinner + cycling text every 2s: "Assembling your customer panel..." / "Running the simulation..." / "Crunching the numbers..." / "Writing your investor report...".

## EDGE FUNCTION
Name `simulate-business`. Haiku `claude-haiku-4-5`, max_tokens 1800, temp 0.4. Parse JSON; on
`JSON.parse` failure return 500 "Something went wrong with the simulation — try submitting again."
No auth on the function for MVP. CORS `*` (consistent with existing functions).

## NOT IN MVP (skip)
Persistence, sharing/URL encoding, what-if re-sim, leaderboard, teacher mode toggle,
industry-specific panels, login.

## House rules
No clichés in any user-facing copy. Encouraging, child-friendly tone throughout.
