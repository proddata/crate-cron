const http = require('http');
const url = require('url');
const client = require('prom-client');
const Counter = client.Counter;
const Registry = client.Registry;
const register = new Registry();

const syncTotalCounter = new Counter({
    name: 'cron_sync_total',
    help: 'Total number of job syncs with the database.'
});

const syncFailedCounter = new Counter({
    name: 'cron_sync_failed',
    help: 'Total number of failed job syncs.'
});

const jobTotalCounter = new Counter({
    name: 'cron_jobs_total',
    help: 'Total number of started job innvokations.'
});

const jobFailedCounter = new Counter({
    name: 'cron_jobs_failed',
    help: 'Total number of failed job innvokations.'
});

const activeJobsGauge = new client.Gauge({
    name: 'cron_jobs_active',
    help: 'Scheduled jobs synced.'
})

register.registerMetric(syncTotalCounter);
register.registerMetric(syncFailedCounter);
register.registerMetric(jobTotalCounter);
register.registerMetric(jobFailedCounter);
register.registerMetric(activeJobsGauge);
//client.collectDefaultMetrics({ register });

const server = http.createServer()
server.on("request",handleRequest);

async function handleRequest(request,response){
    const route = url.parse(request.url).pathname
    if (route === '/metrics') {
        let metrics = await register.metrics();
        response.setHeader('Content-Type', 'text/plain');
        response.write(metrics);
        return response.end();
    }
    response.writeHeader(404, {"Content-Type": "text/plain"});
    response.end();
}

server.listen(8080);

module.exports = {
    counters : {
        syncTotal: syncTotalCounter,
        syncFailed: syncFailedCounter,
        jobTotal: jobTotalCounter,
        jobFailed: jobFailedCounter
    },
    gauges : {
        activeJobs: activeJobsGauge
    }
}