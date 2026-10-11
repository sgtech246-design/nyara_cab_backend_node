import { getDb } from '../config/db.js';

export function cleanPhone(phone) {
  let digits = phone.replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) {
    digits = digits.substring(2);
  }
  return digits;
}

export async function findVerifiedPartnerByPhone(phoneNumber) {
  const db = await getDb();
  const phone = cleanPhone(phoneNumber);
  return db.get(
    `SELECT * FROM partners 
     WHERE phone_number = ? 
        OR phone_number = ? 
        OR REPLACE(REPLACE(phone_number, '+91', ''), ' ', '') = ?
        OR SUBSTR(phone_number, -10) = ?`,
    [phone, `+91${phone}`, phone, phone]
  );
}

export async function createOrUpdateOtpVerification(phoneNumber, otpCode, payload) {
  const db = await getDb();
  const phone = cleanPhone(phoneNumber);

  // Expire any existing unverified OTPs
  await db.run(
    'UPDATE otp_verifications SET is_used = 1 WHERE (phone_number = ? OR phone_number = ?) AND is_used = 0',
    [phone, `+91${phone}`]
  );

  // 5 minutes expiration
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  await db.run(
    `INSERT INTO otp_verifications (phone_number, otp_code, payload, expires_at, is_used)
     VALUES (?, ?, ?, ?, 0)`,
    [phone, otpCode, JSON.stringify(payload), expiresAt]
  );
}

export async function verifyAndSavePartner(phoneNumber, otpCode) {
  const db = await getDb();
  const phone = cleanPhone(phoneNumber);

  // Find latest valid OTP record for this phone
  const otpRecord = await db.get(
    `SELECT * FROM otp_verifications 
     WHERE (phone_number = ? OR phone_number = ?) AND is_used = 0 
     ORDER BY id DESC LIMIT 1`,
    [phone, `+91${phone}`]
  );

  return { otpRecord, phone };
}

export async function saveVerifiedPartner(phone, payload) {
  const db = await getDb();
  const now = new Date().toISOString();

  // Check if partner already exists
  const existing = await findVerifiedPartnerByPhone(phone);
  const profileImg = payload.profile_image || (existing ? existing.profile_image : null);

  if (existing) {
    await db.run(
      `UPDATE partners SET
        full_name = ?,
        business_name = ?,
        email = ?,
        city = ?,
        state = ?,
        pincode = ?,
        business_description = ?,
        profile_image = ?,
        updated_at = ?
       WHERE id = ?`,
      [
        payload.full_name || existing.full_name || 'Partner',
        payload.business_name || existing.business_name || 'Nyara Partner',
        payload.email || existing.email || null,
        payload.city || existing.city || '',
        payload.state || existing.state || '',
        payload.pincode || existing.pincode || '',
        payload.business_description || existing.business_description || null,
        profileImg,
        now,
        existing.id,
      ]
    );
  } else {
    await db.run(
      `INSERT INTO partners 
       (full_name, business_name, phone_number, email, city, state, pincode, business_description, profile_image, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.full_name || 'Partner',
        payload.business_name || 'Nyara Partner',
        phone,
        payload.email || null,
        payload.city || '',
        payload.state || '',
        payload.pincode || '',
        payload.business_description || null,
        profileImg,
        now,
        now,
      ]
    );
  }

  return findVerifiedPartnerByPhone(phone);
}

export async function getAllPartnersAdmin({ page = 1, limit = 15, search = '' }) {
  try {
    const db = await getDb();
    const offset = (Number(page) - 1) * Number(limit);

    let whereClauses = [];
    let params = [];

    if (search) {
      whereClauses.push('(full_name LIKE ? OR phone_number LIKE ? OR city LIKE ? OR business_name LIKE ?)');
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = await db.get(`SELECT COUNT(*) as total FROM partners ${whereSql}`, params);
    const total = countRow ? countRow.total : 0;

    const items = await db.all(
      `SELECT * FROM partners ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    for (const item of (items || [])) {
      if (item.business_cities) {
        try {
          item.business_cities = JSON.parse(item.business_cities);
        } catch (_) {
          item.business_cities = item.business_cities.split(',').map((c) => c.trim()).filter(Boolean);
        }
      } else if (item.city) {
        item.business_cities = [item.city];
      } else {
        item.business_cities = [];
      }
    }

    return {
      items: items || [],
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)) || 1,
      },
    };
  } catch (err) {
    console.error('getAllPartnersAdmin error fallback:', err);
    return {
      items: [],
      meta: {
        page: Number(page),
        limit: Number(limit),
        total: 0,
        totalPages: 1,
      },
    };
  }
}

export async function getAdminStats() {
  try {
    const db = await getDb();
    let totalPartners = 0;
    let pendingOtp = 0;
    let totalPosts = 0;
    let totalFraudReports = 0;
    let totalReportedPosts = 0;
    let citiesCovered = 0;

    try {
      const row = await db.get('SELECT COUNT(*) as count FROM partners');
      totalPartners = row?.count || 0;
    } catch (_) {}

    try {
      const row = await db.get('SELECT COUNT(*) as count FROM otp_verifications WHERE is_used = 0');
      pendingOtp = row?.count || 0;
    } catch (_) {}

    try {
      const row = await db.get('SELECT COUNT(*) as count FROM marketplace_posts');
      totalPosts = row?.count || 0;
    } catch (_) {}

    try {
      const row = await db.get('SELECT COUNT(*) as count FROM fraud_reports');
      totalFraudReports = row?.count || 0;
    } catch (_) {}

    try {
      const row = await db.get('SELECT COUNT(*) as count FROM marketplace_reported_posts');
      totalReportedPosts = row?.count || 0;
    } catch (_) {}

    try {
      const row = await db.get('SELECT COUNT(DISTINCT city) as count FROM partners WHERE city != ""');
      citiesCovered = row?.count || 0;
    } catch (_) {}

    return {
      totalPartners,
      pendingOtp,
      totalPosts,
      totalFraudReports,
      totalReportedPosts,
      citiesCovered,
    };
  } catch (err) {
    console.error('getAdminStats error fallback:', err);
    return {
      totalPartners: 0,
      pendingOtp: 0,
      totalPosts: 0,
      totalFraudReports: 0,
      totalReportedPosts: 0,
      citiesCovered: 0,
    };
  }
}
