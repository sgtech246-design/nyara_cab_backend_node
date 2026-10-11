import mysql from 'mysql2/promise';
import sqlite3 from 'sqlite3';
import { open as openSqlite } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sqlitePath = process.env.VERCEL
  ? path.join('/tmp', 'database.sqlite')
  : path.join(__dirname, '../../database.sqlite');

let dbDriver = null; // 'mysql' or 'sqlite'
let pool = null;
let sqliteDb = null;

export async function getDb() {
  if (dbDriver) {
    return createDbWrapper();
  }

  const isVercel = Boolean(process.env.VERCEL);
  const dbConn = process.env.DB_CONNECTION || (isVercel && !process.env.DB_HOST ? 'sqlite' : 'mysql');
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT) || 3306;
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_DATABASE || 'nyara_cab';

  if ((dbConn === 'mysql' || dbConn === 'mariadb') && (!isVercel || process.env.DB_HOST)) {
    try {
      // 1. Create database if not exists
      const tempConn = await mysql.createConnection({
        host,
        port,
        user,
        password,
        connectTimeout: 3000,
      });
      await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\`;`);
      await tempConn.end();

      // 2. Create connection pool
      pool = mysql.createPool({
        host,
        port,
        user,
        password,
        database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });

      // 3. Initialize schema
      const conn = await pool.getConnection();
      await conn.query(`
        CREATE TABLE IF NOT EXISTS partners (
          id INT AUTO_INCREMENT PRIMARY KEY,
          full_name VARCHAR(255) NOT NULL,
          business_name VARCHAR(255) NOT NULL,
          phone_number VARCHAR(50) UNIQUE NOT NULL,
          email VARCHAR(255) NULL,
          city VARCHAR(100) NOT NULL,
          state VARCHAR(100) NOT NULL,
          pincode VARCHAR(20) NOT NULL,
          business_description TEXT NULL,
          profile_image LONGTEXT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      try {
        await conn.query('ALTER TABLE partners ADD COLUMN profile_image LONGTEXT NULL AFTER business_description;');
      } catch (_) {}

      try {
        await conn.query('ALTER TABLE partners ADD COLUMN business_cities TEXT NULL AFTER business_description;');
      } catch (_) {}

      await conn.query(`
        CREATE TABLE IF NOT EXISTS partner_business_cities (
          id INT AUTO_INCREMENT PRIMARY KEY,
          partner_id INT NOT NULL,
          city VARCHAR(100) NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_partner_city (partner_id, city),
          FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS otp_verifications (
          id INT AUTO_INCREMENT PRIMARY KEY,
          phone_number VARCHAR(50) NOT NULL,
          otp_code VARCHAR(20) NOT NULL,
          payload TEXT NOT NULL,
          expires_at DATETIME NOT NULL,
          is_used TINYINT(1) DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          id INT AUTO_INCREMENT PRIMARY KEY,
          setting_key VARCHAR(100) UNIQUE NOT NULL,
          setting_value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS requirements (
          id INT AUTO_INCREMENT PRIMARY KEY,
          req_code VARCHAR(50) NOT NULL,
          from_location VARCHAR(255) NOT NULL,
          to_location VARCHAR(255) NOT NULL,
          trip_type VARCHAR(100) NOT NULL,
          car_type VARCHAR(100) NOT NULL,
          date_time VARCHAR(100) NOT NULL,
          budget VARCHAR(50) NOT NULL,
          posted_by VARCHAR(255) NOT NULL,
          agency VARCHAR(255) NOT NULL,
          location VARCHAR(255) NOT NULL,
          time_ago VARCHAR(100) DEFAULT 'Just Now',
          is_urgent TINYINT(1) DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS available_cars (
          id INT AUTO_INCREMENT PRIMARY KEY,
          car_code VARCHAR(50) NOT NULL,
          car_model VARCHAR(255) NOT NULL,
          number_plate VARCHAR(50) NOT NULL,
          fuel_type VARCHAR(100) NOT NULL,
          year VARCHAR(50) NOT NULL,
          owner_name VARCHAR(255) NOT NULL,
          agency VARCHAR(255) NOT NULL,
          city VARCHAR(100) NOT NULL,
          rate_per_km VARCHAR(50) NOT NULL,
          rating VARCHAR(20) DEFAULT '5.0 ★',
          is_available_now TINYINT(1) DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS promoted_banners (
          id INT AUTO_INCREMENT PRIMARY KEY,
          initials VARCHAR(10) NOT NULL,
          name VARCHAR(255) NOT NULL,
          sub_title VARCHAR(255) NOT NULL,
          tag VARCHAR(100) NOT NULL,
          highlight_text TEXT NOT NULL,
          phone VARCHAR(50) NOT NULL,
          badge_color_hex VARCHAR(20) DEFAULT '#1976D2',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS marketplace_posts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          description TEXT NOT NULL,
          images LONGTEXT NULL,
          phone_number VARCHAR(50) NULL,
          likes_count INT DEFAULT 0,
          saves_count INT DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_user_id (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS marketplace_post_likes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          post_id INT NOT NULL,
          user_id INT NOT NULL,
          reaction VARCHAR(20) DEFAULT '👍',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_user_post_like (post_id, user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS marketplace_post_saves (
          id INT AUTO_INCREMENT PRIMARY KEY,
          post_id INT NOT NULL,
          user_id INT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_user_post_save (post_id, user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS marketplace_reported_posts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          post_id INT NOT NULL,
          user_id INT NOT NULL,
          reason VARCHAR(255) NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS fraud_reports (
          id INT AUTO_INCREMENT PRIMARY KEY,
          reporter_id INT NULL,
          reported_user_id INT NOT NULL,
          reason VARCHAR(255) NOT NULL,
          description TEXT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          actor_id INT NOT NULL,
          post_id INT NULL,
          type VARCHAR(50) NOT NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          is_read TINYINT(1) DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_notifications_user (user_id),
          INDEX idx_notifications_is_read (user_id, is_read)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // Seed default settings if not existing
      await conn.query(`
        INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES
        ('helpline_number', '6359080380'),
        ('training_video_url', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
        ('terms_conditions', 'Welcome to Nyara Cab Partner Platform.\\n\\n1. Acceptance of Terms: By registering as a driver or vendor partner on Nyara Cab, you agree to follow all safety guidelines, local transport regulations, and vehicle maintenance standards.\\n\\n2. Service Quality: Partners are expected to maintain clean vehicles, follow GPS navigation, and provide courteous service to all passengers.\\n\\n3. Pricing & Payments: Trip rates and commissions are transparently calculated as displayed in the app. Payments will be disbursed directly to your registered bank account or UPI.\\n\\n4. Account Integrity: Account sharing is strictly prohibited. Only registered drivers with valid commercial driving licenses are authorized to accept rides.\\n\\n5. Support & Safety: For any emergency or queries, reach out to our 24/7 Helpline via the app.');
      `);

      // Seed requirements if empty
      const [reqRows] = await conn.query(`SELECT COUNT(*) as count FROM requirements`);
      if (reqRows[0].count === 0) {
        await conn.query(`
          INSERT INTO requirements (req_code, from_location, to_location, trip_type, car_type, date_time, budget, posted_by, agency, location, time_ago, is_urgent) VALUES
          ('REQ-1092', 'Ahmedabad', 'Mumbai', 'One Way', 'Swift Dzire / Sedan', 'Today, 05:00 PM', '₹6,500', 'Jayeshbhai Patel', 'Patel Travels', 'Ahmedabad, Gujarat', '10 mins ago', 1),
          ('REQ-1088', 'Surat', 'Jaipur', 'Roundtrip (3 Days)', 'Maruti Ertiga (7 Seater)', 'Tomorrow, 06:00 AM', '₹18,000', 'Vikram Rathore', 'Rathore Cabs', 'Surat, Gujarat', '35 mins ago', 0),
          ('REQ-1075', 'Rajkot', 'Hirasar Airport', 'Airport Drop', 'Any Sedan / AC Cab', '10 Oct, 09:30 AM', '₹1,400', 'Manishbhai Shah', 'Rajkot Taxi Hub', 'Rajkot, Gujarat', '1 hour ago', 1),
          ('REQ-1064', 'Vadodara', 'Statue of Unity', 'Sightseeing / Full Day', 'Innova Crysta', '12 Oct, 07:00 AM', '₹5,500', 'Sanjay Sharma', 'Shree Ram Cabs', 'Vadodara, Gujarat', '2 hours ago', 0);
        `);
      }

      // Seed available_cars if empty
      const [carRows] = await conn.query(`SELECT COUNT(*) as count FROM available_cars`);
      if (carRows[0].count === 0) {
        await conn.query(`
          INSERT INTO available_cars (car_code, car_model, number_plate, fuel_type, year, owner_name, agency, city, rate_per_km, rating, is_available_now) VALUES
          ('CAR-802', 'Maruti Swift Dzire (Sedan)', 'GJ 03 CA 9821', 'CNG + Petrol', '2023 Model', 'Rameshbhai Parmar', 'Parmar Travels', 'Rajkot', '₹11 / km', '4.9 ★', 1),
          ('CAR-754', 'Maruti Ertiga (7 Seater)', 'GJ 01 AB 4410', 'Petrol / CNG', '2024 Model', 'Ajaysinh Jadeja', 'Uma Cab Service', 'Morbi / Rajkot', '₹15 / km', '5.0 ★', 1),
          ('CAR-689', 'Toyota Innova Crysta (Luxury)', 'GJ 05 CD 1102', 'Diesel AC', '2022 Model', 'Kevalsinh Zala', 'Zala Tour & Travels', 'Surat', '₹18 / km', '4.8 ★', 0),
          ('CAR-612', 'Hyundai Aura (Sedan)', 'GJ 27 EF 3091', 'CNG AC', '2023 Model', 'Hardik Shah', 'Ahmedabad Cab Fleet', 'Ahmedabad', '₹12 / km', '4.7 ★', 1);
        `);
      }

      // Seed promoted_banners if empty
      const [bannerRows] = await conn.query(`SELECT COUNT(*) as count FROM promoted_banners`);
      if (bannerRows[0].count === 0) {
        await conn.query(`
          INSERT INTO promoted_banners (initials, name, sub_title, tag, highlight_text, phone, badge_color_hex) VALUES
          ('UC', 'Uma Cab Service', 'All Gujarat 24x7 Cab Fleet', 'PREMIUM PARTNER', 'UMA CAB SERVICE 24 X 7 SUPPORT CALL 6359080380', '6359080380', '#1976D2'),
          ('JP', 'Jayeshbhai Patel', 'Patel Tour & Travels · Ahmedabad', 'VERIFIED PARTNER', 'AIRPORT PICKUP & OUTSTATION CAB SERVICE', '9825012345', '#2E7D32'),
          ('NC', 'Nyara Premium Fleet', 'All Gujarat Taxi Network', 'TOP RATED FLEET', '100% DIRECT CAB LEADS & ZERO COMMISSION', '1800 123 9999', '#0D47A1');
        `);
      }

      conn.release();
      dbDriver = 'mysql';
      console.log(`🐬 MariaDB/MySQL Database connected via TCP/IP (${host}:${port}/${database})`);
      return createDbWrapper();
    } catch (err) {
      console.warn(`⚠️ MariaDB/MySQL connection failed (${err.message}). Falling back to SQLite...`);
    }
  }

  // SQLite Fallback
  sqliteDb = await openSqlite({
    filename: sqlitePath,
    driver: sqlite3.Database,
  });

  await sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      business_name TEXT NOT NULL,
      phone_number TEXT UNIQUE NOT NULL,
      email TEXT,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      pincode TEXT NOT NULL,
      business_description TEXT,
      profile_image TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try {
    await sqliteDb.exec('ALTER TABLE partners ADD COLUMN profile_image TEXT;');
  } catch (_) {}

  try {
    await sqliteDb.exec('ALTER TABLE partners ADD COLUMN business_cities TEXT;');
  } catch (_) {}

  await sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS partner_business_cities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      partner_id INTEGER NOT NULL,
      city TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(partner_id, city)
    );
  `);

  await sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS otp_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_number TEXT NOT NULL,
      otp_code TEXT NOT NULL,
      payload TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      is_used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT UNIQUE NOT NULL,
      setting_value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS fraud_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id INTEGER,
      reported_user_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS requirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      req_code TEXT NOT NULL,
      from_location TEXT NOT NULL,
      to_location TEXT NOT NULL,
      trip_type TEXT NOT NULL,
      car_type TEXT NOT NULL,
      date_time TEXT NOT NULL,
      budget TEXT NOT NULL,
      posted_by TEXT NOT NULL,
      agency TEXT NOT NULL,
      location TEXT NOT NULL,
      time_ago TEXT DEFAULT 'Just Now',
      is_urgent INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS available_cars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      car_code TEXT NOT NULL,
      car_model TEXT NOT NULL,
      number_plate TEXT NOT NULL,
      fuel_type TEXT NOT NULL,
      year TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      agency TEXT NOT NULL,
      city TEXT NOT NULL,
      rate_per_km TEXT NOT NULL,
      rating TEXT DEFAULT '5.0 ★',
      is_available_now INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS promoted_banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      initials TEXT NOT NULL,
      name TEXT NOT NULL,
      sub_title TEXT NOT NULL,
      tag TEXT NOT NULL,
      highlight_text TEXT NOT NULL,
      phone TEXT NOT NULL,
      badge_color_hex TEXT DEFAULT '#1976D2',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES
    ('helpline_number', '6359080380'),
    ('training_video_url', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ('terms_conditions', 'Welcome to Nyara Cab Partner Platform.\n\n1. Acceptance of Terms: By registering as a driver or vendor partner on Nyara Cab, you agree to follow all safety guidelines, local transport regulations, and vehicle maintenance standards.\n\n2. Service Quality: Partners are expected to maintain clean vehicles, follow GPS navigation, and provide courteous service to all passengers.\n\n3. Pricing & Payments: Trip rates and commissions are transparently calculated as displayed in the app. Payments will be disbursed directly to your registered bank account or UPI.\n\n4. Account Integrity: Account sharing is strictly prohibited. Only registered drivers with valid commercial driving licenses are authorized to accept rides.\n\n5. Support & Safety: For any emergency or queries, reach out to our 24/7 Helpline via the app.');
  `);

  const reqCount = await sqliteDb.get(`SELECT COUNT(*) as count FROM requirements`);
  if (reqCount.count === 0) {
    await sqliteDb.exec(`
      INSERT INTO requirements (req_code, from_location, to_location, trip_type, car_type, date_time, budget, posted_by, agency, location, time_ago, is_urgent) VALUES
      ('REQ-1092', 'Ahmedabad', 'Mumbai', 'One Way', 'Swift Dzire / Sedan', 'Today, 05:00 PM', '₹6,500', 'Jayeshbhai Patel', 'Patel Travels', 'Ahmedabad, Gujarat', '10 mins ago', 1),
      ('REQ-1088', 'Surat', 'Jaipur', 'Roundtrip (3 Days)', 'Maruti Ertiga (7 Seater)', 'Tomorrow, 06:00 AM', '₹18,000', 'Vikram Rathore', 'Rathore Cabs', 'Surat, Gujarat', '35 mins ago', 0),
      ('REQ-1075', 'Rajkot', 'Hirasar Airport', 'Airport Drop', 'Any Sedan / AC Cab', '10 Oct, 09:30 AM', '₹1,400', 'Manishbhai Shah', 'Rajkot Taxi Hub', 'Rajkot, Gujarat', '1 hour ago', 1),
      ('REQ-1064', 'Vadodara', 'Statue of Unity', 'Sightseeing / Full Day', 'Innova Crysta', '12 Oct, 07:00 AM', '₹5,500', 'Sanjay Sharma', 'Shree Ram Cabs', 'Vadodara, Gujarat', '2 hours ago', 0);
    `);
  }

  const carCount = await sqliteDb.get(`SELECT COUNT(*) as count FROM available_cars`);
  if (carCount.count === 0) {
    await sqliteDb.exec(`
      INSERT INTO available_cars (car_code, car_model, number_plate, fuel_type, year, owner_name, agency, city, rate_per_km, rating, is_available_now) VALUES
      ('CAR-802', 'Maruti Swift Dzire (Sedan)', 'GJ 03 CA 9821', 'CNG + Petrol', '2023 Model', 'Rameshbhai Parmar', 'Parmar Travels', 'Rajkot', '₹11 / km', '4.9 ★', 1),
      ('CAR-754', 'Maruti Ertiga (7 Seater)', 'GJ 01 AB 4410', 'Petrol / CNG', '2024 Model', 'Ajaysinh Jadeja', 'Uma Cab Service', 'Morbi / Rajkot', '₹15 / km', '5.0 ★', 1),
      ('CAR-689', 'Toyota Innova Crysta (Luxury)', 'GJ 05 CD 1102', 'Diesel AC', '2022 Model', 'Kevalsinh Zala', 'Zala Tour & Travels', 'Surat', '₹18 / km', '4.8 ★', 0),
      ('CAR-612', 'Hyundai Aura (Sedan)', 'GJ 27 EF 3091', 'CNG AC', '2023 Model', 'Hardik Shah', 'Ahmedabad Cab Fleet', 'Ahmedabad', '₹12 / km', '4.7 ★', 1);
    `);
  }

  const bannerCount = await sqliteDb.get(`SELECT COUNT(*) as count FROM promoted_banners`);
  if (bannerCount.count === 0) {
    await sqliteDb.exec(`
      INSERT INTO promoted_banners (initials, name, sub_title, tag, highlight_text, phone, badge_color_hex) VALUES
      ('UC', 'Uma Cab Service', 'All Gujarat 24x7 Cab Fleet', 'PREMIUM PARTNER', 'UMA CAB SERVICE 24 X 7 SUPPORT CALL 6359080380', '6359080380', '#1976D2'),
      ('JP', 'Jayeshbhai Patel', 'Patel Tour & Travels · Ahmedabad', 'VERIFIED PARTNER', 'AIRPORT PICKUP & OUTSTATION CAB SERVICE', '9825012345', '#2E7D32'),
      ('NC', 'Nyara Premium Fleet', 'All Gujarat Taxi Network', 'TOP RATED FLEET', '100% DIRECT CAB LEADS & ZERO COMMISSION', '1800 123 9999', '#0D47A1');
    `);
  }

  dbDriver = 'sqlite';
  console.log(`⚡ SQLite Database connected at: ${sqlitePath}`);
  return createDbWrapper();
}

function createDbWrapper() {
  if (dbDriver === 'mysql') {
    return {
      async get(sql, params = []) {
        // Convert SQLite ? syntax to MySQL parameters
        const [rows] = await pool.execute(sql, params);
        return rows[0] || null;
      },
      async all(sql, params = []) {
        const [rows] = await pool.execute(sql, params);
        return rows;
      },
      async run(sql, params = []) {
        const [result] = await pool.execute(sql, params);
        return { lastID: result.insertId, changes: result.affectedRows };
      },
      async exec(sql) {
        return pool.query(sql);
      },
    };
  } else {
    return {
      async get(sql, params = []) {
        return sqliteDb.get(sql, params);
      },
      async all(sql, params = []) {
        return sqliteDb.all(sql, params);
      },
      async run(sql, params = []) {
        return sqliteDb.run(sql, params);
      },
      async exec(sql) {
        return sqliteDb.exec(sql);
      },
    };
  }
}
