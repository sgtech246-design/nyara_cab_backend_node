import sharp from 'sharp';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { twilioService } from '../services/twilioService.js';
import {
  findVerifiedPartnerByPhone,
  createOrUpdateOtpVerification,
  verifyAndSavePartner,
  saveVerifiedPartner,
  cleanPhone,
} from '../services/partnerService.js';
import { getDb } from '../config/db.js';

export async function registerRequest(req, res, next) {
  try {
    const data = req.body;
    const phone = cleanPhone(data.phone_number);

    // Check if phone number is already registered
    const existing = await findVerifiedPartnerByPhone(phone);
    if (existing) {
      return res.status(422).json({
        success: false,
        message: 'This phone number is already registered. Please log in.',
      });
    }

    // Generate 6-digit random OTP
    const otpCode = String(Math.floor(100000 + Math.random() * 900000));

    // Save to database
    await createOrUpdateOtpVerification(phone, otpCode, data);

    // Send SMS via Twilio Verify API
    await twilioService.sendOtp(phone, otpCode);
    console.log(`[AUTH] Generated OTP for ${phone}: ${otpCode}`);

    res.json({
      success: true,
      message: `OTP sent successfully! (OTP Code: ${otpCode})`,
      data: {
        phone_number: phone,
        otp: otpCode,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyOtp(req, res, next) {
  try {
    const { phone_number, otp_code } = req.body;
    const phone = cleanPhone(phone_number);

    // Check Twilio Verify approval first
    const twilioApproved = await twilioService.checkOtp(phone, otp_code);

    const { otpRecord } = await verifyAndSavePartner(phone, otp_code);
    const dbMatch = otpRecord && otpRecord.otp_code === otp_code;

    if (!twilioApproved && !dbMatch) {
      return res.status(422).json({
        success: false,
        message: 'Invalid or expired OTP verification code.',
      });
    }

    // Parse stored payload or fallback
    let payload = {};
    if (otpRecord && otpRecord.payload) {
      try {
        payload = JSON.parse(otpRecord.payload);
      } catch (_) {}
    }

    const db = await getDb();
    if (otpRecord) {
      await db.run('UPDATE otp_verifications SET is_used = 1 WHERE id = ?', [otpRecord.id]);
    }

    // Persist partner record to database upon successful verification
    const partner = await saveVerifiedPartner(phone, payload);

    // Sign JWT Token
    const jwtSecret = process.env.JWT_SECRET || 'nyara_cab_secret';
    const token = jwt.sign({ id: partner.id, phone: partner.phone_number }, jwtSecret, {
      expiresIn: '30d',
    });

    res.json({
      success: true,
      message: 'Phone number verified successfully! Registration completed.',
      data: {
        token,
        partner,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function resendOtp(req, res, next) {
  try {
    const { phone_number } = req.body;
    const phone = cleanPhone(phone_number);

    const db = await getDb();
    const existing = await db.get(
      'SELECT * FROM otp_verifications WHERE phone_number = ? AND is_used = 0 ORDER BY id DESC LIMIT 1',
      [phone]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'No pending registration found for this number. Please register again.',
      });
    }

    const newOtp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await db.run('UPDATE otp_verifications SET otp_code = ?, expires_at = ? WHERE id = ?', [
      newOtp,
      expiresAt,
      existing.id,
    ]);

    await twilioService.sendOtp(phone, newOtp);
    console.log(`[AUTH] Resent OTP for ${phone}: ${newOtp}`);

    res.json({
      success: true,
      message: `New OTP sent successfully! (OTP Code: ${newOtp})`,
      data: {
        phone_number: phone,
        otp: newOtp,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function loginRequest(req, res, next) {
  try {
    const { phone_number } = req.body;
    const phone = cleanPhone(phone_number);

    // Check if partner exists in DB
    const existing = await findVerifiedPartnerByPhone(phone);
    if (!existing) {
      return res.status(404).json({
        success: false,
        exists: false,
        message: 'Phone number not registered. Please register first.',
      });
    }

    // Partner exists -> Generate 6-digit OTP
    const otpCode = String(Math.floor(100000 + Math.random() * 900000));

    // Save to database
    await createOrUpdateOtpVerification(phone, otpCode, existing);

    // Send SMS via Twilio
    await twilioService.sendOtp(phone, otpCode);
    console.log(`[AUTH] Login OTP for ${phone}: ${otpCode}`);

    res.json({
      success: true,
      exists: true,
      message: `OTP sent successfully to registered mobile! (OTP Code: ${otpCode})`,
      data: {
        phone_number: phone,
        otp: otpCode,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getProfile(req, res, next) {
  try {
    const { phone_number, user_id } = req.query;
    let partner = null;
    const db = await getDb();

    if (user_id) {
      partner = await db.get('SELECT * FROM partners WHERE id = ?', [user_id]);
    } else if (phone_number) {
      partner = await findVerifiedPartnerByPhone(phone_number);
    } else {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
          const jwtSecret = process.env.JWT_SECRET || 'nyara_cab_secret';
          const decoded = jwt.verify(token, jwtSecret);
          if (decoded && decoded.id) {
            partner = await db.get('SELECT * FROM partners WHERE id = ?', [decoded.id]);
          } else if (decoded && decoded.phone) {
            partner = await findVerifiedPartnerByPhone(decoded.phone);
          }
        } catch (_) {}
      }
    }

    if (!partner && (phone_number || req.query.search)) {
      return res.status(404).json({
        success: false,
        message: 'Member not found with this phone number.',
      });
    }

    if (!partner) {
      // Fallback default partner if not found and not a search query
      partner = await db.get('SELECT * FROM partners ORDER BY id ASC LIMIT 1');
    }

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner profile not found.',
      });
    }

    let vehiclesCountRow = { count: 0 };
    let yourPostsCountRow = { count: 0 };
    let savedPostsCountRow = { count: 0 };

    try {
      vehiclesCountRow = await db.get(
        'SELECT COUNT(*) as count FROM available_cars WHERE user_id = ? OR owner_name LIKE ? OR agency LIKE ?',
        [partner.id, `%${partner.full_name}%`, `%${partner.business_name}%`]
      );
    } catch (_) {}

    try {
      yourPostsCountRow = await db.get(
        'SELECT COUNT(*) as count FROM marketplace_posts WHERE user_id = ? OR (phone_number IS NOT NULL AND phone_number = ? AND phone_number != "")',
        [partner.id, partner.phone_number || '']
      );
    } catch (_) {}

    try {
      savedPostsCountRow = await db.get(
        'SELECT COUNT(*) as count FROM marketplace_post_saves ps JOIN marketplace_posts p ON ps.post_id = p.id WHERE ps.user_id = ?',
        [partner.id]
      );
    } catch (_) {}

    let memberSinceText = 'Recently';
    if (partner.created_at) {
      try {
        const createdDate = new Date(partner.created_at);
        const diffMs = Date.now() - createdDate.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays < 30) {
          memberSinceText = `${diffDays || 1} days ago`;
        } else {
          const months = Math.floor(diffDays / 30);
          memberSinceText = `${months} ${months === 1 ? 'month' : 'months'} ago`;
        }
      } catch (_) {}
    }

    res.json({
      success: true,
      data: {
        id: partner.id,
        full_name: partner.full_name || 'Nyara Partner',
        business_name: partner.business_name || partner.full_name || 'Nyara Agency',
        phone_number: partner.phone_number || '',
        email: partner.email || '',
        city: partner.city || '',
        state: partner.state || '',
        pincode: partner.pincode || '',
        address: (partner.city || partner.state)
          ? `${partner.city || ''} ${partner.state || ''}`.trim()
          : (partner.pincode ? `Pincode ${partner.pincode}` : ''),
        profile_image: (partner.profile_image && partner.profile_image.startsWith('/uploads'))
          ? `${req.protocol}://${req.get('host')}${partner.profile_image}`
          : (partner.profile_image || null),
        vehicles_count: vehiclesCountRow ? vehiclesCountRow.count : 0,
        saved_posts_count: savedPostsCountRow ? savedPostsCountRow.count : 0,
        your_posts_count: yourPostsCountRow ? yourPostsCountRow.count : 0,
        created_at: partner.created_at,
        member_since: memberSinceText,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateProfileImage(req, res, next) {
  try {
    const { user_id, phone_number, profile_image } = req.body;
    const db = await getDb();

    let partner = null;
    if (user_id) {
      partner = await db.get('SELECT * FROM partners WHERE id = ?', [user_id]);
    }
    if (!partner && phone_number) {
      partner = await findVerifiedPartnerByPhone(phone_number);
    }
    if (!partner) {
      partner = await db.get('SELECT * FROM partners ORDER BY id DESC LIMIT 1');
    }

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found.',
      });
    }

    let savedPathOrBase64 = profile_image;

    // Save image file to uploads/ folder if base64 string or image string provided
    if (profile_image && (profile_image.startsWith('data:image') || profile_image.length > 50)) {
      try {
        let base64Data = profile_image;
        let ext = 'jpg';

        if (profile_image.includes(';base64,')) {
          const parts = profile_image.split(';base64,');
          ext = parts[0].replace(/^data:image\//, '') || 'jpg';
          base64Data = parts[1];
        } else if (profile_image.includes(',')) {
          base64Data = profile_image.split(',')[1];
        }

        const cleanBase64 = base64Data.trim().replace(/\s/g, '');
        const buffer = Buffer.from(cleanBase64, 'base64');

        // Delete previous profile photo file if it exists in uploads/ folder
        if (partner.profile_image && partner.profile_image.includes('/uploads/')) {
          try {
            const relativePart = partner.profile_image.split('/uploads/')[1];
            const oldFilePath = path.join(process.cwd(), 'uploads', relativePart);
            if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
              console.log(`🗑️ Deleted previous profile photo file: ${oldFilePath}`);
            }
          } catch (delErr) {
            console.warn(`⚠️ Could not delete previous profile photo file: ${delErr.message}`);
          }
        }

        const fileName = `profile_user_${partner.id}_${Date.now()}.${ext}`;
        const profilesFolder = path.join(process.cwd(), 'uploads', 'profiles');
        if (!fs.existsSync(profilesFolder)) {
          fs.mkdirSync(profilesFolder, { recursive: true });
        }
        const filePath = path.join(profilesFolder, fileName);
        fs.writeFileSync(filePath, buffer);

        const host = `${req.protocol}://${req.get('host')}`;
        savedPathOrBase64 = `${host}/uploads/profiles/${fileName}`;
        console.log(`📸 Saved profile photo for Partner #${partner.id} to ${savedPathOrBase64}`);
      } catch (err) {
        console.warn(`⚠️ Error writing profile image file: ${err.message}`);
      }
    }

    const now = new Date().toISOString();
    await db.run('UPDATE partners SET profile_image = ?, updated_at = ? WHERE id = ?', [
      savedPathOrBase64,
      now,
      partner.id,
    ]);

    res.json({
      success: true,
      message: 'Profile photo updated successfully!',
      data: {
        id: partner.id,
        profile_image: savedPathOrBase64,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function searchMember(req, res, next) {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }
    const cleaned = cleanPhone(phone);
    const partner = await findVerifiedPartnerByPhone(cleaned);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Koi member nahi mila! Yeh number registered nahi hai.',
      });
    }

    const db = await getDb();
    let vehiclesCountRow = { count: 0 };
    let yourPostsCountRow = { count: 0 };

    try {
      vehiclesCountRow = await db.get(
        'SELECT COUNT(*) as count FROM available_cars WHERE user_id = ? OR owner_name LIKE ? OR agency LIKE ?',
        [partner.id, `%${partner.full_name}%`, `%${partner.business_name}%`]
      );
    } catch (_) {}

    try {
      yourPostsCountRow = await db.get(
        'SELECT COUNT(*) as count FROM marketplace_posts WHERE user_id = ? OR (phone_number IS NOT NULL AND phone_number = ? AND phone_number != "")',
        [partner.id, partner.phone_number || '']
      );
    } catch (_) {}

    return res.status(200).json({
      success: true,
      data: {
        id: partner.id,
        full_name: partner.full_name || 'Nyara Partner',
        business_name: partner.business_name || partner.full_name || 'Nyara Agency',
        phone_number: partner.phone_number || '',
        email: partner.email || '',
        city: partner.city || '',
        state: partner.state || '',
        pincode: partner.pincode || '',
        address: (partner.city || partner.state)
          ? `${partner.city || ''} ${partner.state || ''}`.trim()
          : (partner.pincode ? `Pincode ${partner.pincode}` : 'Gujarat, India'),
        profile_image: (partner.profile_image && partner.profile_image.startsWith('/uploads'))
          ? `${req.protocol}://${req.get('host')}${partner.profile_image}`
          : (partner.profile_image || ''),
        business_description: partner.business_description || 'Taxi Service Partner in Nyara Cab',
        vehicles_count: vehiclesCountRow.count || 0,
        your_posts_count: yourPostsCountRow.count || 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

// Helper to resolve partner from query, body, or token
async function resolvePartner(db, req) {
  const { user_id, phone, phone_number } = { ...req.query, ...req.body };
  let partner = null;
  if (user_id) {
    partner = await db.get('SELECT * FROM partners WHERE id = ?', [user_id]);
  }
  if (!partner && (phone || phone_number)) {
    partner = await findVerifiedPartnerByPhone(phone || phone_number);
  }
  if (!partner && req.headers.authorization?.startsWith('Bearer ')) {
    const token = req.headers.authorization.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'nyara_cab_secret');
      if (decoded?.id) {
        partner = await db.get('SELECT * FROM partners WHERE id = ?', [decoded.id]);
      } else if (decoded?.phone) {
        partner = await findVerifiedPartnerByPhone(decoded.phone);
      }
    } catch (_) {}
  }
  if (!partner) {
    partner = await db.get('SELECT * FROM partners ORDER BY id ASC LIMIT 1');
  }
  return partner;
}

export async function getBusinessCities(req, res, next) {
  try {
    const db = await getDb();
    const partner = await resolvePartner(db, req);
    if (!partner) {
      return res.json({ success: true, data: [] });
    }

    let rows = await db.all(
      'SELECT city FROM partner_business_cities WHERE partner_id = ? ORDER BY id ASC',
      [partner.id]
    );

    let cities = rows.map((r) => r.city).filter(Boolean);

    // Fallback if none in table yet
    if (cities.length === 0) {
      if (partner.business_cities) {
        try {
          cities = JSON.parse(partner.business_cities);
        } catch (_) {
          cities = partner.business_cities.split(',').map((c) => c.trim()).filter(Boolean);
        }
      } else if (partner.city) {
        cities = [partner.city];
      }

      // Seed table
      for (const c of cities) {
        try {
          await db.run(
            'INSERT INTO partner_business_cities (partner_id, city) VALUES (?, ?)',
            [partner.id, c]
          );
        } catch (_) {}
      }
      await db.run(
        'UPDATE partners SET business_cities = ? WHERE id = ?',
        [JSON.stringify(cities), partner.id]
      );
    }

    res.json({
      success: true,
      data: cities,
    });
  } catch (err) {
    next(err);
  }
}

export async function addBusinessCity(req, res, next) {
  try {
    const db = await getDb();
    const partner = await resolvePartner(db, req);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner not found.' });
    }

    const city = (req.body.city || '').trim();
    if (!city) {
      return res.status(400).json({ success: false, message: 'City name is required.' });
    }

    try {
      await db.run(
        'INSERT INTO partner_business_cities (partner_id, city) VALUES (?, ?)',
        [partner.id, city]
      );
    } catch (_) {}

    const rows = await db.all(
      'SELECT city FROM partner_business_cities WHERE partner_id = ? ORDER BY id ASC',
      [partner.id]
    );
    const cities = rows.map((r) => r.city).filter(Boolean);

    await db.run(
      'UPDATE partners SET business_cities = ? WHERE id = ?',
      [JSON.stringify(cities), partner.id]
    );

    res.json({
      success: true,
      message: 'City added successfully',
      data: cities,
    });
  } catch (err) {
    next(err);
  }
}

export async function removeBusinessCity(req, res, next) {
  try {
    const db = await getDb();
    const partner = await resolvePartner(db, req);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner not found.' });
    }

    const city = (req.body.city || req.query.city || '').trim();
    if (!city) {
      return res.status(400).json({ success: false, message: 'City name is required.' });
    }

    await db.run(
      'DELETE FROM partner_business_cities WHERE partner_id = ? AND city = ?',
      [partner.id, city]
    );

    const rows = await db.all(
      'SELECT city FROM partner_business_cities WHERE partner_id = ? ORDER BY id ASC',
      [partner.id]
    );
    const cities = rows.map((r) => r.city).filter(Boolean);

    await db.run(
      'UPDATE partners SET business_cities = ? WHERE id = ?',
      [JSON.stringify(cities), partner.id]
    );

    res.json({
      success: true,
      message: 'City removed successfully',
      data: cities,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateBusinessCities(req, res, next) {
  try {
    const db = await getDb();
    const partner = await resolvePartner(db, req);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner not found.' });
    }

    let { cities } = req.body;
    if (!Array.isArray(cities)) {
      return res.status(400).json({ success: false, message: 'Cities must be an array.' });
    }

    cities = [...new Set(cities.map((c) => String(c).trim()).filter(Boolean))];

    await db.run('DELETE FROM partner_business_cities WHERE partner_id = ?', [partner.id]);

    for (const c of cities) {
      try {
        await db.run(
          'INSERT INTO partner_business_cities (partner_id, city) VALUES (?, ?)',
          [partner.id, c]
        );
      } catch (_) {}
    }

    await db.run(
      'UPDATE partners SET business_cities = ? WHERE id = ?',
      [JSON.stringify(cities), partner.id]
    );

    res.json({
      success: true,
      message: 'Business cities updated successfully',
      data: cities,
    });
  } catch (err) {
    next(err);
  }
}
