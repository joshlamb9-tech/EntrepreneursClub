-- Analytics events table for Entrepreneurs Club Business Idea Simulator
-- Privacy-first: no personal data, no IPs, no business content. Just counts + timestamps.

CREATE TABLE IF NOT EXISTS analytics_events (
  id          BIGSERIAL PRIMARY KEY,
  event_type  TEXT NOT NULL,           -- 'page_visit' | 'simulation_complete'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for time-series queries (getting counts by day/hour)
CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx ON analytics_events (created_at);
-- Index for filtering by event type
CREATE INDEX IF NOT EXISTS analytics_events_event_type_idx ON analytics_events (event_type);

-- Allow anon inserts (client-side beacon) — no SELECT for anon (read via service role only)
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can insert events"
  ON analytics_events
  FOR INSERT
  TO anon
  WITH CHECK (event_type IN ('page_visit', 'simulation_complete'));

-- No SELECT policy for anon — stats are read-only via dashboard or service role query
