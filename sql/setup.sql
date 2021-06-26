DROP TABLE IF EXISTS cron.jobs;
DROP TABLE IF EXISTS cron.jobs_log;

CREATE TABLE IF NOT EXISTS cron.jobs (
    id TEXT DEFAULT gen_random_text_uuid(),
    cron TEXT NOT NULL,
    cmd TEXT NOT NULL INDEX OFF STORAGE WITH (columnstore = false),
    active BOOLEAN DEFAULT TRUE,
    error TEXT DEFAULT NULL INDEX OFF,
    PRIMARY KEY ("id") 
 ) CLUSTERED INTO 1 SHARDS
 WITH (number_of_replicas = '0-all',
       refresh_interval = 1000);

CREATE TABLE IF NOT EXISTS cron.jobs_log (
    id TEXT NOT NULL,
    started TIMESTAMP,
    ended TIMESTAMP,
    error TEXT,
    part TIMESTAMP GENERATED ALWAYS AS date_trunc('week',ended)
 ) CLUSTERED INTO 1 SHARDS PARTITIONED BY (part)
  WITH (number_of_replicas = '0-all');

INSERT INTO cron.jobs (id,cron,cmd) VALUES
    ('1stcron','*/30 * * * * *','SELECT 100')
ON CONFLICT DO NOTHING;

