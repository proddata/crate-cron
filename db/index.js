const { Pool } = require("pg");

const crateConfig = {
  user: process.env["CRATE_USER"] || "crate",
  host: process.env["CRATE_HOST"] || "localhost",
  database: process.env["CRATE_DB"] || "doc",
  password: process.env["CRATE_PASSWORD"] || "",
  port: process.env["CRATE_PORT"] || 5432,
  ssl:
    process.env["CRATE_SSL"] === undefined
      ? false
      : process.env["CRATE_SSL"].toLowerCase() == true,
  idleTimeoutMillis: 15000,
  connectionTimeoutMillis: 10000,
  query_timeout: 1000 * 60 * 60 * 6,
  max: 20
};

const pool = new Pool(crateConfig);

module.exports = {
  async query(text, params) {
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    //console.log("executed query", { text, duration, rows: res.rowCount });
    return res;
  },
  async getClient() {
    const client = await pool.connect();
    const query = client.query;
    const release = client.release;
    // set a timeout of 5 seconds, after which we will log this client's last query
    const timeout = setTimeout(() => {
      console.error("A client has been checked out for more than 5 seconds!");
      console.error(
        `The last executed query on this client was: ${client.lastQuery}`
      );
    }, 5000);
    // monkey patch the query method to keep track of the last query executed
    client.query = (...args) => {
      client.lastQuery = args;
      return query.apply(client, args);
    };
    client.release = () => {
      // clear our timeout
      clearTimeout(timeout);
      // set the methods back to their old un-monkey-patched version
      client.query = query;
      client.release = release;
      return release.apply(client);
    };
    return client;
  }
};
