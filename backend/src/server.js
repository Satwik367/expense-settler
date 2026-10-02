require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const connectDB = require('./config/db');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimiter');
const { handleWebhook } = require('./controllers/paymentController');

const authRoutes = require('./routes/authRoutes');
const groupRoutes = require('./routes/groupRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const settlementRoutes = require('./routes/settlementRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();

app.set('trust proxy', 1); // needed for correct client IPs behind a reverse proxy / load balancer

// --- Security headers ---
app.use(helmet());

// --- CORS: only the configured frontend origin, with credentials for cookies ---
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// --- Razorpay webhook: MUST be registered with a raw body parser BEFORE
// the global express.json() below. Signature verification needs the
// exact bytes Razorpay signed - once express.json() re-serializes the
// body into a JS object, that byte-for-byte fidelity is gone. ---
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), handleWebhook);

// --- Standard parsers for every other route ---
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use('/api', generalLimiter);

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/groups/:groupId/expenses', expenseRoutes);
app.use('/api/groups/:groupId/settlements', settlementRoutes);
app.use('/api/payments', paymentRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`[server] listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    });
  } catch (err) {
    console.error('[server] failed to start:', err);
    process.exit(1);
  }
}

start();

module.exports = app;