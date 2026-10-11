import { Router } from 'express';
import {
  getPartners,
  getStats,
  togglePartnerStatus,
  deletePartner,
  getMarketplacePostsAdmin,
  deleteMarketplacePostAdmin,
  getFraudReportsAdmin,
  deleteFraudReportAdmin,
  getReportedPostsAdmin,
  deleteReportedPostAdmin,
} from '../controllers/adminController.js';
import { getSettings, updateSettings } from '../controllers/settingsController.js';

const router = Router();

router.get('/partners', getPartners);
router.get('/stats', getStats);
router.patch('/partners/:id/status', togglePartnerStatus);
router.delete('/partners/:id', deletePartner);

router.get('/marketplace-posts', getMarketplacePostsAdmin);
router.delete('/marketplace-posts/:id', deleteMarketplacePostAdmin);

router.get('/fraud-reports', getFraudReportsAdmin);
router.delete('/fraud-reports/:id', deleteFraudReportAdmin);

router.get('/reported-posts', getReportedPostsAdmin);
router.delete('/reported-posts/:id', deleteReportedPostAdmin);

router.get('/settings', getSettings);
router.patch('/settings', updateSettings);
router.put('/settings', updateSettings);
router.post('/settings', updateSettings);

export default router;
