import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import cors from 'cors';

dotenv.config();

const app = express();

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/coinbase';
mongoose
  .connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// User schema and model
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
});
const User = mongoose.model('User', userSchema);

// Coinbase data schema
const coinbaseSchema = new mongoose.Schema(
  {
    product_id: String,
    type: String,
    price: String,
    size: String,
    side: String,
    bids: Array,
    asks: Array,
    time: Date,
  },
  { timestamps: true }
);
const CoinbaseData = mongoose.model('CoinbaseData', coinbaseSchema);

// Middleware
app.use(express.json());

// JWT secret key
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Signup endpoint
app.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const user = new User({ username, password: hashedPassword });
    console.log('if checking') ;
    await user.save();
    res.status(201).json({ message: 'User created successfully' });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: 'Error creating user' });
  }
});

// Login endpoint
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: 'Invalid username or password' });
  }

  const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, {
    expiresIn: '1h',
  });
  res.json({ token });
});

// Middleware to verify JWT
const authenticateJWT = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token is required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;
    next();
  });
};

// WebSocket configuration
const COINBASE_WS_URL = 'wss://ws-feed-public.sandbox.exchange.coinbase.com';
const websocketClients = {};
const userSubscriptions = {};

// Authenticate WebSocket connections
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return next(new Error('Invalid token'));
    socket.user = user; // Attach user info to the socket
    next();
  });
});

// WebSocket subscription logic
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}, Username: ${socket.user.username}`);

  // Subscribe to a product
  socket.on('subscribe', ({ product_id }) => {
    if (!websocketClients[product_id]) {
      const ws = new WebSocket(COINBASE_WS_URL);
      websocketClients[product_id] = ws;

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'subscribe', product_ids: [product_id], channels: ['level2', 'matches'] }));
      });

      ws.on('message', (data) => {
        const parsedData = JSON.parse(data.toString());
        if (!parsedData.product_id) return;

        io.to(product_id).emit('data', parsedData);

        if (['l2update', 'match'].includes(parsedData.type)) {
          new CoinbaseData({ ...parsedData }).save().catch(console.error);
        }
      });

      ws.on('close', () => delete websocketClients[product_id]);
    }

    socket.join(product_id);
    userSubscriptions[socket.id] = userSubscriptions[socket.id] || [];
    userSubscriptions[socket.id].push(product_id);
    socket.emit('subscribed', product_id);
  });

  // Unsubscribe from a product
  socket.on('unsubscribe', ({ product_id }) => {
    socket.leave(product_id);
    if (userSubscriptions[socket.id]) {
      userSubscriptions[socket.id] = userSubscriptions[socket.id].filter((id) => id !== product_id);
    }
  });

  socket.on('disconnect', () => {
    if (userSubscriptions[socket.id]) {
      userSubscriptions[socket.id].forEach((product_id) => socket.leave(product_id));
      delete userSubscriptions[socket.id];
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
