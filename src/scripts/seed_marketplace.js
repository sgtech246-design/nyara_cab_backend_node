import { getDb } from '../config/db.js';

async function seed() {
  try {
    const db = await getDb();
    const existing = await db.get('SELECT COUNT(*) AS cnt FROM marketplace_posts');
    
    if (existing && existing.cnt === 0) {
      const bannerUrl = 'http://10.150.193.73:5000/uploads/shree_cabs_banner.jpg';
      const imagesJson = JSON.stringify([bannerUrl]);

      await db.run(
        `INSERT INTO marketplace_posts (user_id, description, images, phone_number, likes_count) VALUES (?, ?, ?, ?, ?)`,
        [2, 'Shree Cabs All India Taxi Service! Sedan, SUV, Ertiga, Innova Crysta available 24x7 for Round Trip, One Way, and Corporate Trips.', imagesJson, '9876543210', 5]
      );

      await db.run(
        `INSERT INTO marketplace_posts (user_id, description, images, phone_number, likes_count) VALUES (?, ?, ?, ?, ?)`,
        [2, 'Need Ertiga / Crysta for Ahmedabad to Mumbai One-Way drop tomorrow morning. Clean cars with commercial permit.', '[]', '9825012345', 2]
      );

      console.log('✅ Marketplace DB successfully seeded!');
    } else {
      console.log('ℹ️ Marketplace DB already has posts.');
    }
    process.exit(0);
  } catch (e) {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  }
}

seed();
