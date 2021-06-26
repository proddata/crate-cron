/**
 * 
 * @summary crate-cron - A simple CrateDB Job Scheduler
 * @author Georg Traar <georg@crate.io>
 * 
 */

require("dotenv").config();
const fs = require("fs");
const CronJob = require("cron").CronJob;

const database = require("./database");
const monitoring = require("./monitoring");

const CRON_TABLES = fs.readFileSync(`${__dirname}/sql/setup.sql`).toString();

const JOB_SYNC_CRON = "*/5 * * * * *";
const JOB_LIST = new Map();

setup();


async function setup() {
  try {
    await database.query(CRON_TABLES);
    JOB_SYNC_JOB = new CronJob(JOB_SYNC_CRON, jobSync, null, true);
  } catch (error) {
    console.error(error);
    setTimeout(setup, 10000);
  }
}

async function jobSync() {
  monitoring.counters.syncTotal.inc()
  try {
    let jobs_query =
      "SELECT id, cron, cmd, active, error, _seq_no, _primary_term " +
      "FROM cron.jobs;";
    let db_jobs = (await database.query(jobs_query)).rows;
    let db_jobs_ids = db_jobs.map(job => job.id);

    monitoring.gauges.activeJobs.set(db_jobs.length);

    // check if jobs should be removed
    JOB_LIST.forEach(job => {
      if (!db_jobs_ids.includes(job.id)) {
        removeJob(job);
      }
    });

    // update or add jobs from DB
    db_jobs.forEach(job => {
      if (JOB_LIST.has(job.id)) {
        updateJob(job);
      } else {
        addJob(job);
      }
    });
  } catch (error) {
    monitoring.counters.syncFailed.inc()
    console.error(error);
  }
}

function addJob(job) {
  //todoconsole.log("Add Job: ", job.id);
  job.running = false;
  job.cronJob = getCronJob(job);
  JOB_LIST.set(job.id, job);
}

function updateJob(job) {
  let oldJob = JOB_LIST.get(job.id);
  if (
    oldJob._seq_no != job._seq_no ||
    oldJob._primary_term != job._primary_term
  ) {
    oldJob.cronJob.stop();
    addJob(job);
  }
}

function removeJob(job) {
  console.log("Remove Job: ", job.id);
  JOB_LIST.get(job.id).cronJob.stop();
  JOB_LIST.delete(job.id);
}

async function runJob(job) {
  if (job.running) {
    console.log("Job already running: ", job.id);
  } else {
    monitoring.counters.jobTotal.inc();
    job.running = true;
    let started = Date.now();
    let jobs_error = null;
    console.log("Run Job: ", job.id);
    try {
      await database.query(job.cmd);
    } catch (error) {
      monitoring.counters.jobFailed.inc();
      jobs_error = error;
      console.error(error);
    } finally {
      let ended = Date.now();
      job.running = false;
      logJob(job, started, ended, jobs_error);
    }
  }
}

async function logJob(job, started, ended, jobs_error) {
  let query =
    "INSERT INTO cron.jobs_log (id,started,ended,error) " +
    "VALUES ($1,$2,$3,$4)";
  try {
    database.query(query, [job.id, started, ended, jobs_error]);
  } catch (error) {
    console.log(error);
  }
}

function getCronJob(job) {
  return new CronJob(
    job.cron,
    () => {
      runJob(job);
    },
    null,
    job.active
  );
}
