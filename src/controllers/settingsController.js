import { getDb } from '../config/db.js';

export async function getSettings(req, res) {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT setting_key, setting_value FROM app_settings');
    const settings = {};
    rows.forEach(r => {
      settings[r.setting_key] = r.setting_value;
    });

    const defaultTerms = `Welcome to Nyara Cab Partner Platform.\n\n1. Acceptance of Terms: By registering as a driver or vendor partner on Nyara Cab, you agree to follow all safety guidelines, local transport regulations, and vehicle maintenance standards.\n\n2. Service Quality: Partners are expected to maintain clean vehicles, follow GPS navigation, and provide courteous service to all passengers.\n\n3. Pricing & Payments: Trip rates and commissions are transparently calculated as displayed in the app. Payments will be disbursed directly to your registered bank account or UPI.\n\n4. Account Integrity: Account sharing is strictly prohibited. Only registered drivers with valid commercial driving licenses are authorized to accept rides.\n\n5. Support & Safety: For any emergency or queries, reach out to our 24/7 Helpline via the app.`;

    return res.status(200).json({
      success: true,
      data: {
        helpline_number: settings.helpline_number || '9737396277',
        training_video_url: settings.training_video_url || 'https://www.youtube.com/@nyaracab',
        instagram_url: settings.instagram_url || 'https://www.instagram.com',
        facebook_url: settings.facebook_url || 'https://www.facebook.com',
        terms_conditions: settings.terms_conditions || defaultTerms,
      },
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch settings' });
  }
}

export async function updateSettings(req, res) {
  try {
    const { helpline_number, training_video_url, instagram_url, facebook_url, terms_conditions } = req.body;
    const db = await getDb();

    if (helpline_number !== undefined) {
      await db.run(
        `INSERT INTO app_settings (setting_key, setting_value) VALUES ('helpline_number', ?) 
         ON DUPLICATE KEY UPDATE setting_value = ?`,
        [helpline_number, helpline_number]
      );
    }

    if (training_video_url !== undefined) {
      await db.run(
        `INSERT INTO app_settings (setting_key, setting_value) VALUES ('training_video_url', ?) 
         ON DUPLICATE KEY UPDATE setting_value = ?`,
        [training_video_url, training_video_url]
      );
    }

    if (instagram_url !== undefined) {
      await db.run(
        `INSERT INTO app_settings (setting_key, setting_value) VALUES ('instagram_url', ?) 
         ON DUPLICATE KEY UPDATE setting_value = ?`,
        [instagram_url, instagram_url]
      );
    }

    if (facebook_url !== undefined) {
      await db.run(
        `INSERT INTO app_settings (setting_key, setting_value) VALUES ('facebook_url', ?) 
         ON DUPLICATE KEY UPDATE setting_value = ?`,
        [facebook_url, facebook_url]
      );
    }

    if (terms_conditions !== undefined) {
      await db.run(
        `INSERT INTO app_settings (setting_key, setting_value) VALUES ('terms_conditions', ?) 
         ON DUPLICATE KEY UPDATE setting_value = ?`,
        [terms_conditions, terms_conditions]
      );
    }

    return res.status(200).json({
      success: true,
      message: 'App settings updated successfully',
      data: {
        helpline_number,
        training_video_url,
        instagram_url,
        facebook_url,
        terms_conditions,
      },
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    return res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
}
