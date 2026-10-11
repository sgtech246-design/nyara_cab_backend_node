import { Router } from 'express';
import {
  getMarketplacePosts,
  createMarketplacePost,
  toggleLikePost,
  toggleSavePost,
  reportPost,
  deletePost,
  getPartnerProfile,
  updateMarketplacePost,
  reportFraud,
  getUserNotifications,
  markNotificationsRead,
  getSingleMarketplacePost,
} from '../controllers/marketplaceController.js';

const router = Router();

router.get('/posts', getMarketplacePosts);
router.get('/posts/single/:id', getSingleMarketplacePost);
router.post('/posts', createMarketplacePost);
router.put('/posts/:id', updateMarketplacePost);
router.post('/posts/:id/like', toggleLikePost);
router.post('/posts/:id/save', toggleSavePost);
router.post('/posts/:id/report', reportPost);
router.post('/posts/:id/delete', deletePost);
router.get('/partner-profile/:userId', getPartnerProfile);
router.post('/report-fraud', reportFraud);
router.get('/notifications', getUserNotifications);
router.post('/notifications/mark-read', markNotificationsRead);

export default router;
