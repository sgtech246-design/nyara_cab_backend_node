import { Router } from 'express';
import authRoutes from './authRoutes.js';
import adminRoutes from './adminRoutes.js';
import { getSettings } from '../controllers/settingsController.js';
import {
  getRequirements,
  createRequirement,
  getCars,
  createCar,
  getBanners,
} from '../controllers/dataController.js';

import marketplaceRoutes from './marketplaceRoutes.js';

const router = Router();

router.use('/v1/auth', authRoutes);
router.use('/v1/admin', adminRoutes);
router.use('/v1/marketplace', marketplaceRoutes);
router.get('/v1/settings', getSettings);

// Dynamic Data Routes for App & Admin
router.get('/v1/requirements', getRequirements);
router.post('/v1/requirements', createRequirement);

router.get('/v1/available-cars', getCars);
router.post('/v1/available-cars', createCar);

router.get('/v1/promoted-banners', getBanners);

export default router;

