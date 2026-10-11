import { getDb } from '../config/db.js';

async function setupMarketplace() {
  try {
    const db = await getDb();
    console.log('Connecting to database...');

    await db.run(`
      CREATE TABLE IF NOT EXISTS marketplace_posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        description TEXT NOT NULL,
        images LONGTEXT NULL,
        phone_number VARCHAR(20) NULL,
        likes_count INT DEFAULT 0,
        saves_count INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await db.run(`
      CREATE TABLE IF NOT EXISTS marketplace_post_likes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        user_id INT NOT NULL,
        reaction VARCHAR(20) DEFAULT '👍',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_post_like (post_id, user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    try {
      await db.run(`ALTER TABLE marketplace_post_likes ADD COLUMN reaction VARCHAR(20) DEFAULT '👍'`);
    } catch (_) {}

    await db.run(`
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

    await db.run(`
      CREATE TABLE IF NOT EXISTS marketplace_post_saves (
        id INT AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        user_id INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_post_save (post_id, user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await db.run(`
      CREATE TABLE IF NOT EXISTS marketplace_reported_posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        user_id INT NOT NULL,
        reason VARCHAR(255) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    console.log('🎉 Marketplace tables created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

setupMarketplace();
