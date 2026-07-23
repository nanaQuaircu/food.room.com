import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function env(name, fallback = '') {
  return process.env[name] ?? fallback;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      out[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return out;
}

async function runTenantMigrations(conn, dbName) {
  const tenantDir = path.join(__dirname, '..', 'database', 'tenant');
  const files = fs.readdirSync(tenantDir).filter((f) => f.endsWith('.sql')).sort();
  await conn.query(`USE \`${dbName}\``);
  for (const file of files) {
    const sql = fs.readFileSync(path.join(tenantDir, file), 'utf8');
    await conn.query({ sql, multipleStatements: true });
  }
}

async function main() {
  const args = parseArgs();
  const slug = args.slug || 'grand-plaza';
  const centralDb = env('CENTRAL_DB_NAME', 'hotel_central');

  const config = {
    host: env('CENTRAL_DB_HOST', '127.0.0.1'),
    port: Number(env('CENTRAL_DB_PORT', '3306')),
    user: env('CENTRAL_DB_USER', 'root'),
    password: env('CENTRAL_DB_PASSWORD', ''),
  };

  const conn = await mysql.createConnection({ ...config, database: centralDb, multipleStatements: true });
  const [companies] = await conn.query(
    `SELECT id, name, db_name FROM companies WHERE slug = ? LIMIT 1`,
    [slug]
  );
  const company = companies[0];
  if (!company) {
    console.error(`No company found for slug: ${slug}`);
    process.exit(1);
  }

  const dbName = company.db_name;
  console.log('Seeding tenant:', company.name, '→', dbName);

  await runTenantMigrations(conn, dbName);

  const [props] = await conn.query(`SELECT id FROM properties LIMIT 1`);
  let propertyId = props[0]?.id;
  if (!propertyId) {
    const [r] = await conn.execute(
      `INSERT INTO properties (name, code, email, currency) VALUES (?, 'MAIN', ?, 'GHS')`,
      [company.name, 'info@hotel.local']
    );
    propertyId = r.insertId;
  }

  const [rtCount] = await conn.query(`SELECT COUNT(*) AS c FROM room_types WHERE property_id = ?`, [propertyId]);
  if (Number(rtCount[0].c) === 0) {
    const types = [
      ['Deluxe King', 'DLX', 450, 2],
      ['Standard Twin', 'STD', 280, 2],
      ['Executive Suite', 'EXE', 890, 3],
      ['Family Room', 'FAM', 520, 4],
    ];
    const typeIds = [];
    for (const [name, code, rate, occ] of types) {
      const [r] = await conn.execute(
        `INSERT INTO room_types (property_id, name, code, base_rate, max_occupancy) VALUES (?, ?, ?, ?, ?)`,
        [propertyId, name, code, rate, occ]
      );
      typeIds.push({ id: r.insertId, code });
    }

    let num = 101;
    for (const t of typeIds) {
      for (let i = 0; i < 5; i++) {
        const status = i === 0 ? 'occupied' : i === 1 ? 'dirty' : 'vacant';
        await conn.execute(
          `INSERT INTO rooms (property_id, room_type_id, room_number, floor, status) VALUES (?, ?, ?, ?, ?)`,
          [propertyId, t.id, String(num), String(Math.floor(num / 100)), status]
        );
        num += 1;
      }
    }
    console.log('  Room types and rooms created');
  }

  const [guestCount] = await conn.query(`SELECT COUNT(*) AS c FROM guests`);
  if (Number(guestCount[0].c) === 0) {
    const guests = [
      ['Kwame', 'Asante', 'kwame@email.com', '+233201234567', 1],
      ['Ama', 'Boateng', 'ama@email.com', '+233244567890', 0],
      ['John', 'Smith', 'john@email.com', '+233209876543', 0],
      ['Sarah', 'Mensah', 'sarah@email.com', '+233265432109', 1],
    ];
    const guestIds = [];
    for (const [fn, ln, email, phone, vip] of guests) {
      const [r] = await conn.execute(
        `INSERT INTO guests (first_name, last_name, email, phone, is_vip) VALUES (?, ?, ?, ?, ?)`,
        [fn, ln, email, phone, vip]
      );
      guestIds.push(r.insertId);
    }

    const today = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const in3 = new Date(today);
    in3.setDate(in3.getDate() + 3);

    const [rooms] = await conn.query(`SELECT id, room_type_id FROM rooms WHERE status = 'vacant' LIMIT 3`);
    const [types] = await conn.query(`SELECT id, base_rate FROM room_types WHERE property_id = ?`, [propertyId]);

    const reservations = [
      [guestIds[0], fmt(today), fmt(tomorrow), 'checked_in', rooms[0]?.id, rooms[0]?.room_type_id || types[0].id, 450],
      [guestIds[1], fmt(tomorrow), fmt(in3), 'confirmed', null, types[1].id, 280],
      [guestIds[2], fmt(today), fmt(in3), 'confirmed', null, types[0].id, 450],
    ];

    for (const [gid, ci, co, status, rid, rtid, rate] of reservations) {
      const code = `HTL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const nights = Math.max(1, Math.ceil((new Date(co) - new Date(ci)) / 86400000));
      const total = rate * nights;
      const [r] = await conn.execute(
        `INSERT INTO reservations (property_id, guest_id, confirmation_code, status, check_in_date, check_out_date, room_type_id, room_id, rate_per_night, total_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [propertyId, gid, code, status, ci, co, rtid, rid, rate, total]
      );
      const resId = r.insertId;
      const [f] = await conn.execute(`INSERT INTO folios (reservation_id, status, balance) VALUES (?, 'open', ?)`, [resId, total]);
      await conn.execute(
        `INSERT INTO folio_charges (folio_id, description, category, amount, quantity) VALUES (?, 'Room charges', 'room', ?, ?)`,
        [f.insertId, rate, nights]
      );
      if (status === 'checked_in' && rid) {
        await conn.execute(`UPDATE rooms SET status = 'occupied' WHERE id = ?`, [rid]);
      }
    }
    console.log('  Guests and reservations created');
  }

  const [supCount] = await conn.query(`SELECT COUNT(*) AS c FROM suppliers WHERE property_id = ?`, [propertyId]);
  if (Number(supCount[0].c) === 0) {
    const [s] = await conn.execute(
      `INSERT INTO suppliers (property_id, name, contact_name, email, phone) VALUES (?, 'Fresh Linens Co', 'Esi Owusu', 'esi@linens.gh', '+233302111222')`,
      [propertyId]
    );
    const items = [
      ['Bath Towels', 'LIN-001', 'housekeeping', 120, 30, 15],
      ['Toiletries Kit', 'HK-050', 'housekeeping', 80, 20, 8],
      ['Coffee Beans 1kg', 'FB-100', 'restaurant', 25, 10, 45],
    ];
    for (const [name, sku, dept, qty, reorder, cost] of items) {
      await conn.execute(
        `INSERT INTO stock_items (property_id, supplier_id, name, sku, department, quantity_on_hand, reorder_level, unit_cost)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [propertyId, s.insertId, name, sku, dept, qty, reorder, cost]
      );
    }
    console.log('  Inventory seeded');
  }

  const [taskCount] = await conn.query(`SELECT COUNT(*) AS c FROM housekeeping_tasks WHERE property_id = ?`, [propertyId]);
  if (Number(taskCount[0].c) === 0) {
    const [dirtyRooms] = await conn.query(`SELECT id FROM rooms WHERE property_id = ? AND status = 'dirty' LIMIT 2`, [propertyId]);
    for (const room of dirtyRooms) {
      await conn.execute(
        `INSERT INTO housekeeping_tasks (property_id, room_id, task_type, status, notes) VALUES (?, ?, 'clean', 'pending', 'Scheduled cleaning')`,
        [propertyId, room.id]
      );
    }
    console.log('  Housekeeping tasks created');
  }

  await conn.end();
  console.log('Seed complete for', company.name);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
