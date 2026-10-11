import { z } from 'zod';

export const registerSchema = z.object({
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),
  business_name: z.string().min(2, 'Business name must be at least 2 characters'),
  phone_number: z.string().min(10, 'Valid 10-digit phone number is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  pincode: z.string().min(6, 'Pincode must be 6 digits'),
  business_description: z.string().optional().nullable(),
});

export const verifyOtpSchema = z.object({
  phone_number: z.string().min(10, 'Phone number is required'),
  otp_code: z.string().length(6, 'OTP must be exactly 6 digits'),
});

export const resendOtpSchema = z.object({
  phone_number: z.string().min(10, 'Phone number is required'),
});

export const loginSchema = z.object({
  phone_number: z.string().min(10, 'Valid 10-digit phone number is required'),
});

