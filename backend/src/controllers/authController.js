const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');

const SALT_ROUNDS = 12;

function issueToken(res, userId) {
  const token = jwt.sign({ sub: userId.toString() }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

  const cookieName = process.env.COOKIE_NAME || 'es_token';
  const isProd = process.env.NODE_ENV === 'production';

  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: isProd, // required for sameSite: 'none' to work - cookie only sent over HTTPS
    // 'none' is required for cross-origin cookies (frontend and backend on
    // different domains once deployed) - browsers won't send a 'lax' or
    // 'strict' cookie on a cross-site fetch call, only on top-level navigation.
    // Locally, frontend and backend are both on localhost so 'lax' still
    // works fine there - this only changes behavior in production.
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      // Deliberately vague - don't confirm/deny whether an email is
      // registered to avoid turning this into an account enumeration endpoint.
      throw new AppError(409, 'Could not create account with these details');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({ name, email, passwordHash });

    issueToken(res, user._id);
    res.status(201).json({ user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+passwordHash');
    // Same generic error whether the email doesn't exist or the
    // password is wrong - don't leak which one it was.
    const genericError = () => new AppError(401, 'Invalid email or password');

    if (!user) throw genericError();

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw genericError();

    issueToken(res, user._id);
    res.json({ user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  const cookieName = process.env.COOKIE_NAME || 'es_token';
  res.clearCookie(cookieName, { path: '/' });
  res.json({ message: 'Logged out' });
}

async function me(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) throw new AppError(404, 'User not found');
    res.json({ user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, logout, me };