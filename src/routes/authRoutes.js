import { Router } from 'express';
import {
  registerRequest,
  verifyOtp,
  resendOtp,
  loginRequest,
  getProfile,
  updateProfileImage,
  searchMember,
  getBusinessCities,
  addBusinessCity,
  removeBusinessCity,
  updateBusinessCities,
} from '../controllers/authController.js';
import { validate } from '../middlewares/validateMiddleware.js';
import { registerSchema, verifyOtpSchema, resendOtpSchema, loginSchema } from '../validators/authValidators.js';

const router = Router();

router.post('/login-request', validate(loginSchema), loginRequest);
router.post('/register-request', validate(registerSchema), registerRequest);
router.post('/verify-otp', validate(verifyOtpSchema), verifyOtp);
router.post('/resend-otp', validate(resendOtpSchema), resendOtp);
router.get('/profile', getProfile);
router.get('/search-member', searchMember);
router.post('/profile-image', updateProfileImage);

// Business Cities Management
router.get('/business-cities', getBusinessCities);
router.post('/business-cities', addBusinessCity);
router.delete('/business-cities', removeBusinessCity);
router.put('/business-cities', updateBusinessCities);

export default router;


