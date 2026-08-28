// The application a `node` box runs. Deliberately the same shape as hello-box's entrypoint.py:
// enough to prove the box starts, reads its own files, and exits cleanly, and nothing more.

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

function main() {
  const manifest = JSON.parse(readFileSync(join(__dirname, 'box.json'), 'utf8'));
  console.log(`Hello from ${manifest.boxId} ${manifest.version} on ${process.platform}.`);
  console.log(`Running Node ${process.versions.node} from inside the box.`);
  return 0;
}

process.exitCode = main();
