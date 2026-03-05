'use strict';

const app    = require('./app');
const config = require('./config');

const { port, env } = config.server;

app.listen(port, () => {
  console.log(`FitReady IQ API running on port ${port} [${env}]`);
});
