import 'dotenv/config';
import app from './app.js';
import { getDb } from './config/db.js';

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Initialize DB
    await getDb();

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`===================================================`);
      console.log(`🚀 Nyara Cab Node.js Backend Server running on port ${PORT}`);
      console.log(`📡 Base API URL: https://nyara-cab-backend-node.vercel.app/api/v1`);
      console.log(`===================================================`);
    });

    process.on('SIGTERM', () => {
      console.log('SIGTERM signal received: closing HTTP server');
      server.close(() => process.exit(0));
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  startServer();
}

export default app;
