/* get-stats edge function
   Returns aggregated analytics only — no raw rows, no personal data.
   Protected by a simple password (STATS_PASSWORD env var) so it's not public.
*/

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors });
  }

  /* Password gate */
  let body: { password?: unknown };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: cors });
  }

  const statsPassword = Deno.env.get('STATS_PASSWORD');
  if (!statsPassword || body.password !== statsPassword) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: cors });
  }

  /* Query via Supabase REST using service role key */
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  /* Totals */
  const totalsRes = await fetch(
    `${supabaseUrl}/rest/v1/analytics_events?select=event_type`,
    { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
  );
  const allRows: { event_type: string }[] = await totalsRes.json();

  const visits     = allRows.filter(r => r.event_type === 'page_visit').length;
  const completions = allRows.filter(r => r.event_type === 'simulation_complete').length;
  const conversionPct = visits > 0 ? Math.round((completions / visits) * 100) : 0;

  /* Last 7 days by day — page visits */
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recentRes = await fetch(
    `${supabaseUrl}/rest/v1/analytics_events?select=event_type,created_at&created_at=gte.${sevenDaysAgo}&order=created_at.asc`,
    { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
  );
  const recentRows: { event_type: string; created_at: string }[] = await recentRes.json();

  /* Group by day */
  const byDay: Record<string, { visits: number; completions: number }> = {};
  for (const row of recentRows) {
    const day = row.created_at.slice(0, 10); // YYYY-MM-DD
    if (!byDay[day]) byDay[day] = { visits: 0, completions: 0 };
    if (row.event_type === 'page_visit') byDay[day].visits++;
    if (row.event_type === 'simulation_complete') byDay[day].completions++;
  }

  return new Response(JSON.stringify({
    totals: { visits, completions, conversion_pct: conversionPct },
    last_7_days: byDay,
  }), { headers: cors });
});
