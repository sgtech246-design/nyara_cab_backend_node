import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middlewares/validateMiddleware.js';

const app = express();

app.set('trust proxy', 1);

// Ensure uploads folder exists
const uploadsDir = process.env.VERCEL
  ? path.join('/tmp', 'uploads')
  : path.join(process.cwd(), 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (_) {}

// Security & Parsing
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev'));

// Static uploads folder
app.use('/uploads', express.static(uploadsDir));

// Static Admin Panel frontend (public folder on Vercel or local dist)
const publicDir = path.join(process.cwd(), 'public');
const adminDistDir = path.resolve(process.cwd(), '..', 'nyara_cab_admin', 'dist');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
} else if (fs.existsSync(adminDistDir)) {
  app.use(express.static(adminDistDir));
}

// Custom Detailed API Request Logger
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`📡 [BACKEND API REQUEST] ${req.method} ${req.originalUrl} | IP: ${req.ip}`);
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`✅ [BACKEND API RESPONSE] ${req.method} ${req.originalUrl} -> Status: ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api', limiter);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'Nyara Cab Node.js API' }));

// API Routes
app.use('/api', routes);

// Serve SPA Admin index.html for non-API web routes
app.get('*', (req, res, next) => {
  if (req.accepts('html') && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    const publicIndexPath = path.join(publicDir, 'index.html');
    const parentIndexPath = path.join(adminDistDir, 'index.html');
    if (fs.existsSync(publicIndexPath)) {
      return res.sendFile(publicIndexPath);
    }
    if (fs.existsSync(parentIndexPath)) {
      return res.sendFile(parentIndexPath);
    }
  }
  next();
});

// Error Handling
app.use(notFound);
app.use(errorHandler);

export default app;
