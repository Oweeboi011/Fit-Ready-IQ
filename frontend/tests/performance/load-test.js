const autocannon = require("autocannon");

const targetUrl = process.env.LOAD_TEST_URL || "http://127.0.0.1:4790";

function run() {
  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: targetUrl,
        connections: Number(process.env.LOAD_TEST_CONNECTIONS || 25),
        duration: Number(process.env.LOAD_TEST_DURATION || 20),
        pipelining: 1,
      },
      (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      }
    );

    autocannon.track(instance, { renderProgressBar: true });
  });
}

run()
  .then((result) => {
    const p95 =
      result.latency.p95 ??
      result.latency["95"] ??
      result.latency.p97_5 ??
      result.latency["97.5"];
    console.log("Load test complete");
    console.log(`Target: ${targetUrl}`);
    console.log(`Requests/sec avg: ${result.requests.average}`);
    console.log(`Latency p95-ish (ms): ${p95}`);

    if (p95 > 2000) {
      console.error("Performance threshold failed: p95 latency exceeded 2000ms");
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error("Load test failed:", error);
    process.exitCode = 1;
  });
