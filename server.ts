import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import { Room } from './src/types';
import { findOptimalRooms, calculateTravelTimeBetween } from './src/algorithm';

const db = new Database('hotel.db');

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY,
    floor INTEGER,
    roomNumber INTEGER,
    isOccupied BOOLEAN,
    isBooked BOOLEAN,
    features TEXT
  )
`);

const initRooms = () => {
  const count = db.prepare('SELECT COUNT(*) as count FROM rooms').get() as { count: number };
  if (count.count === 0) {
    const featuresList = ['Sea View', 'Balcony', 'Accessibility', 'King Bed', 'Mini Bar', 'City View'];
    const insert = db.prepare('INSERT INTO rooms (floor, roomNumber, isOccupied, isBooked, features) VALUES (?, ?, ?, ?, ?)');
    for (let floor = 1; floor <= 10; floor++) {
      const roomsOnFloor = floor === 10 ? 7 : 10;
      for (let r = 1; r <= roomsOnFloor; r++) {
        const roomNumber = floor * 100 + r;
        // Assign 1-3 random features
        const randomFeatures = Array.from({ length: Math.floor(Math.random() * 3) + 1 }, () => 
          featuresList[Math.floor(Math.random() * featuresList.length)]
        );
        const uniqueFeatures = Array.from(new Set(randomFeatures)).join(', ');
        insert.run(floor, roomNumber, 0, 0, uniqueFeatures);
      }
    }
  }
};

initRooms();

async function startServer() {
  const app = express();
  app.use(express.json());
  
  // Add CORS headers
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  const PORT = 3000;

  app.get('/api/rooms', (req, res) => {
    console.log('GET /api/rooms - fetching rooms');
    try {
      const rooms = db.prepare('SELECT * FROM rooms').all() as Room[];
      console.log(`Found ${rooms.length} rooms`);
      res.json(rooms);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/book', (req, res) => {
    const { count } = req.body;
    if (!count || count < 1 || count > 5) {
      return res.status(400).json({ error: 'Invalid room count' });
    }

    const allRooms = db.prepare('SELECT * FROM rooms').all() as Room[];
    const optimalRooms = findOptimalRooms(count, allRooms);

    if (!optimalRooms) {
      return res.status(400).json({ error: 'Not enough rooms available' });
    }

    const update = db.prepare('UPDATE rooms SET isBooked = 1 WHERE id = ?');
    optimalRooms.forEach(r => update.run(r.id));

    const totalTravelTime = calculateTravelTimeBetween(optimalRooms);
    
    res.json({
      rooms: db.prepare('SELECT * FROM rooms').all(),
      selectedRoomIds: optimalRooms.map(r => r.id),
      totalTravelTime
    });
  });

  app.post('/api/random', (req, res) => {
    const allRooms = db.prepare('SELECT * FROM rooms').all() as Room[];
    const update = db.prepare('UPDATE rooms SET isOccupied = ?, isBooked = 0 WHERE id = ?');
    
    allRooms.forEach(r => {
      const isOccupied = Math.random() < 0.3 ? 1 : 0;
      update.run(isOccupied, r.id);
    });

    res.json(db.prepare('SELECT * FROM rooms').all());
  });

  app.post('/api/reset', (req, res) => {
    db.prepare('UPDATE rooms SET isOccupied = 0, isBooked = 0').run();
    res.json(db.prepare('SELECT * FROM rooms').all());
  });

  if (process.env.NODE_ENV !== 'production') {
    try {
      const vite = await createViteServer({
        configFile: false,
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (error) {
      console.log('Vite config failed, using static files');
      app.use(express.static('.'));
      app.get('*', (req, res) => {
        res.sendFile('index.html', { root: '.' });
      });
    }
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
