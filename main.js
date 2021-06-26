require("dotenv").config();
const db = require("./db");
const fs = require("fs");
const CronJob = require("cron").CronJob;

const CRON_TABLES = fs.readFileSync(`${__dirname}/sql/setup.sql`).toString();

const JOB_SYNC_CRON = "*/10 * * * * *";
const JOB_LIST = new Map();
let JOB_SYNC_JOB;

setup();

async function setup() {
  try {
    await db.query(CRON_TABLES);
    JOB_SYNC_JOB = new CronJob(JOB_SYNC_CRON, jobSync, null, true);
  } catch (error) {
    console.error(error);
    setTimeout(setup, 10000);
  }
}

async function jobSync() {
  console.info("Sync Jobs");
  try {
    let jobs_query =
      "SELECT id, cron, cmd, active, error, _seq_no, _primary_term " +
      "FROM cron.jobs;";
    let db_jobs = (await db.query(jobs_query)).rows;
    let db_jobs_ids = db_jobs.map(job => job.id);

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
    console.error(error);
  }
}

function addJob(job) {
  console.log("Add Job: ", job.id);
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
    job.running = true;
    let started = Date.now();
    let jobs_error = null;
    console.log("Run Job: ", job.id);
    try {
      await db.query(job.cmd);
    } catch (error) {
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
    db.query(query, [job.id, started, ended, jobs_error]);
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
