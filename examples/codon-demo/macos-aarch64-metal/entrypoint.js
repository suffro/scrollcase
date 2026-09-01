// A reference table and the tool that queries it, shipped together in one signed box.
//
// This is the shape a `node` box is actually for: the recipient needs neither Node nor npm nor a
// database — the box carries its own interpreter, its own data, and the code that joins them. The
// data is loaded into SQLite through `node:sqlite`, which is part of Node itself, so the whole tool
// has no dependency that conda-forge did not install.
//
// The table is the standard genetic code (NCBI translation table 1), generated from its canonical
// published form rather than typed out, and pinned by hash in the scroll: reference data that
// changed silently would make every answer below wrong without anything failing.

const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { DatabaseSync } = require('node:sqlite');

/** Loads the shipped CSV into an in-memory table. Sixty-four rows: reading it all is the fast path. */
function openTable() {
  const csv = readFileSync(join(__dirname, 'codons.csv'), 'utf8').trim().split('\n');
  const [, ...rows] = csv;
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE codon (codon TEXT PRIMARY KEY, symbol TEXT, abbrev TEXT, name TEXT, role TEXT)');
  const insert = db.prepare('INSERT INTO codon VALUES (?, ?, ?, ?, ?)');
  for (const row of rows) insert.run(...row.split(','));
  return db;
}

/** What the box says about itself when asked nothing: the shape of the data it carries. */
function summarise(db) {
  const { codons, aminoAcids } = db.prepare(
    'SELECT COUNT(*) AS codons, COUNT(DISTINCT symbol) AS aminoAcids FROM codon',
  ).get();
  console.log(`${codons} codons, ${aminoAcids} distinct outcomes (20 amino acids and stop).`);
  const starts = db.prepare("SELECT codon FROM codon WHERE role = 'start' ORDER BY codon").all();
  console.log(`Start codons: ${starts.map(({ codon }) => codon).join(', ')}`);
  console.log('');
  console.log('Codons per amino acid, most redundant first:');
  const grouped = db.prepare(`
    SELECT abbrev, name, COUNT(*) AS n, GROUP_CONCAT(codon, ' ') AS codons
    FROM codon GROUP BY symbol ORDER BY n DESC, abbrev
  `).all();
  for (const { abbrev, name, n, codons: list } of grouped) {
    console.log(`  ${abbrev.padEnd(4)} ${String(n).padStart(2)}  ${name.padEnd(14)} ${list}`);
  }
}

/** A three-letter DNA codon: the forward question, one row out. */
function lookupCodon(db, codon) {
  const row = db.prepare('SELECT * FROM codon WHERE codon = ?').get(codon);
  if (!row) return false;
  const role = row.role ? `  (${row.role} codon)` : '';
  console.log(`${row.codon} → ${row.abbrev} (${row.symbol})  ${row.name}${role}`);
  return true;
}

/** A symbol, abbreviation or name: the reverse question, every codon that encodes it. */
function lookupAminoAcid(db, term) {
  const rows = db.prepare(`
    SELECT codon, abbrev, name FROM codon
    WHERE symbol = ?1 COLLATE NOCASE OR abbrev = ?1 COLLATE NOCASE OR name = ?1 COLLATE NOCASE
    ORDER BY codon
  `).all(term);
  if (rows.length === 0) return false;
  const [{ abbrev, name }] = rows;
  const plural = rows.length === 1 ? 'codon' : 'codons';
  console.log(`${name} (${abbrev}) is encoded by ${rows.length} ${plural}: ${rows.map((r) => r.codon).join(', ')}`);
  return true;
}

function main(argv) {
  const db = openTable();
  if (argv.length === 0) {
    summarise(db);
    return 0;
  }
  const term = argv[0].trim();
  // A codon and an amino acid are told apart by shape, not by a flag: three DNA bases can only be
  // the first, and anything else can only be the second.
  const asCodon = /^[ACGTUacgtu]{3}$/.test(term);
  const found = asCodon
    ? lookupCodon(db, term.toUpperCase().replaceAll('U', 'T'))
    : lookupAminoAcid(db, term);
  if (found) return 0;
  console.error(`Not in the standard genetic code: ${term}`);
  console.error('Give a codon (TTG), or an amino acid by symbol, abbreviation or name (L, Leu, Leucine).');
  return 1;
}

process.exitCode = main(process.argv.slice(2));
