import { getDb } from '../config/db.js';

/// Get all trip requirements
export async function getRequirements(req, res) {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM requirements ORDER BY id DESC');
    
    // Map column names to flutter requirement model format
    const formattedData = rows.map(r => ({
      id: r.req_code || `REQ-${r.id}`,
      dbId: r.id,
      from: r.from_location,
      to: r.to_location,
      tripType: r.trip_type,
      carType: r.car_type,
      date: r.date_time,
      budget: r.budget,
      postedBy: r.posted_by,
      agency: r.agency,
      location: r.location,
      timeAgo: r.time_ago || 'Just now',
      urgent: Boolean(r.is_urgent),
    }));

    return res.status(200).json({
      success: true,
      count: formattedData.length,
      data: formattedData,
    });
  } catch (error) {
    console.error('Error fetching requirements:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch requirements' });
  }
}

/// Create a new trip requirement
export async function createRequirement(req, res) {
  try {
    const {
      from,
      to,
      tripType,
      carType,
      date,
      budget,
      postedBy,
      agency,
      location,
      urgent,
    } = req.body;

    if (!from || !to || !tripType || !carType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: from, to, tripType, carType',
      });
    }

    const db = await getDb();
    const randomCode = `REQ-${Math.floor(1000 + Math.random() * 9000)}`;
    const timeAgo = 'Just now';
    const isUrgentVal = urgent ? 1 : 0;

    const result = await db.run(
      `INSERT INTO requirements 
       (req_code, from_location, to_location, trip_type, car_type, date_time, budget, posted_by, agency, location, time_ago, is_urgent) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomCode,
        from,
        to,
        tripType,
        carType,
        date || 'Today',
        budget || '₹0',
        postedBy || 'Partner',
        agency || 'Fleet Agency',
        location || `${from}, Gujarat`,
        timeAgo,
        isUrgentVal,
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Requirement posted successfully',
      data: {
        id: randomCode,
        dbId: result.lastID,
        from,
        to,
        tripType,
        carType,
        date: date || 'Today',
        budget: budget || '₹0',
        postedBy: postedBy || 'Partner',
        agency: agency || 'Fleet Agency',
        location: location || `${from}, Gujarat`,
        timeAgo: 'Just now',
        urgent: Boolean(urgent),
      },
    });
  } catch (error) {
    console.error('Error creating requirement:', error);
    return res.status(500).json({ success: false, message: 'Failed to post requirement' });
  }
}

/// Get all available cars
export async function getCars(req, res) {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM available_cars ORDER BY id DESC');

    const formattedData = rows.map(r => ({
      id: r.car_code || `CAR-${r.id}`,
      dbId: r.id,
      carModel: r.car_model,
      numberPlate: r.number_plate,
      fuelType: r.fuel_type,
      year: r.year,
      ownerName: r.owner_name,
      agency: r.agency,
      city: r.city,
      ratePerKm: r.rate_per_km,
      rating: r.rating || '5.0 ★',
      isAvailableNow: Boolean(r.is_available_now),
    }));

    return res.status(200).json({
      success: true,
      count: formattedData.length,
      data: formattedData,
    });
  } catch (error) {
    console.error('Error fetching available cars:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch available cars' });
  }
}

/// Create a new available car entry
export async function createCar(req, res) {
  try {
    const {
      carModel,
      numberPlate,
      fuelType,
      year,
      ownerName,
      agency,
      city,
      ratePerKm,
    } = req.body;

    if (!carModel || !numberPlate || !city) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: carModel, numberPlate, city',
      });
    }

    const db = await getDb();
    const randomCode = `CAR-${Math.floor(100 + Math.random() * 900)}`;

    const result = await db.run(
      `INSERT INTO available_cars 
       (car_code, car_model, number_plate, fuel_type, year, owner_name, agency, city, rate_per_km, rating, is_available_now) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '5.0 ★', 1)`,
      [
        randomCode,
        carModel,
        numberPlate,
        fuelType || 'CNG + Petrol',
        year || '2024 Model',
        ownerName || 'Car Owner',
        agency || 'Partner Fleet',
        city,
        ratePerKm || '₹12 / km',
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Car posted to available fleet successfully',
      data: {
        id: randomCode,
        dbId: result.lastID,
        carModel,
        numberPlate,
        fuelType: fuelType || 'CNG + Petrol',
        year: year || '2024 Model',
        ownerName: ownerName || 'Car Owner',
        agency: agency || 'Partner Fleet',
        city,
        ratePerKm: ratePerKm || '₹12 / km',
        rating: '5.0 ★',
        isAvailableNow: true,
      },
    });
  } catch (error) {
    console.error('Error creating car entry:', error);
    return res.status(500).json({ success: false, message: 'Failed to post available car' });
  }
}

/// Get all promoted banners for Home Carousel
export async function getBanners(req, res) {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM promoted_banners ORDER BY id ASC');

    const formattedData = rows.map(r => ({
      id: r.id,
      initials: r.initials,
      name: r.name,
      subTitle: r.sub_title,
      tag: r.tag,
      highlightText: r.highlight_text,
      phone: r.phone,
      badgeColorHex: r.badge_color_hex || '#1976D2',
    }));

    return res.status(200).json({
      success: true,
      count: formattedData.length,
      data: formattedData,
    });
  } catch (error) {
    console.error('Error fetching promoted banners:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch promoted banners' });
  }
}
