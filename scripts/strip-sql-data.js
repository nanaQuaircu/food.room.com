const fs = require('fs');
const path = process.argv[2] || 'hotel_grand_plaza_hotel.sql';
const fullPath = require('path').resolve(path);

const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
const out = [];
let skippingData = false;

for (const line of lines) {
  if (/^-- Dumping data for table/.test(line)) {
    skippingData = true;
    continue;
  }

  if (skippingData) {
    if (line.trim().endsWith(';')) {
      skippingData = false;
    }
    continue;
  }

  if (/^INSERT INTO/i.test(line)) {
    skippingData = !line.trim().endsWith(';');
    continue;
  }

  if (
    line.includes('CHARACTER_SET_CLIENT=@OLD') ||
    line.includes('CHARACTER_SET_RESULTS=@OLD') ||
    line.includes('COLLATION_CONNECTION=@OLD')
  ) {
    continue;
  }

  out.push(line);
}

let sql = out.join('\n');
sql = sql.replace(/AUTO_INCREMENT=\d+/g, 'AUTO_INCREMENT=1');
sql = sql.replace(/\n{3,}/g, '\n\n');

fs.writeFileSync(fullPath, sql);

const inserts = (sql.match(/^INSERT INTO/gim) || []).length;
const dumping = (sql.match(/Dumping data for table/g) || []).length;
const creates = (sql.match(/^CREATE TABLE/gim) || []).length;

console.log(`File: ${fullPath}`);
console.log(`CREATE TABLE: ${creates}`);
console.log(`INSERT remaining: ${inserts}`);
console.log(`Dumping sections remaining: ${dumping}`);
console.log(`Lines: ${sql.split('\n').length}`);
