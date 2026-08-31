const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;

const initialOrders = [
  [6,1,8,3,0,9,4,7,2,5],
  [4,8,1,6,0,9,3,7,2,5],
  [7,2,9,4,1,8,5,0,3,6],
  [5,2,8,0,7,3,9,1,6,4]
];

let liveState = {
  activeTab: 0,
  orders: initialOrders.map(a => [...a]),
  placements: Array.from({length:4}, () => Array(10).fill(null)),
  status: 'waiting',
  drag: null,
  score: null,
  submitted: false,
  result: null,
  updatedAt: Date.now()
};

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req,res) => res.redirect('/student'));
app.get('/student', (req,res) => res.sendFile(path.join(__dirname,'public','student.html')));
app.get('/teacher', (req,res) => res.sendFile(path.join(__dirname,'public','teacher.html')));

function broadcast() {
  liveState.updatedAt = Date.now();
  io.to('quran-live').emit('state', liveState);
}

io.on('connection', socket => {
  socket.join('quran-live');
  socket.emit('state', liveState);

  socket.on('student:state', payload => {
    if (!payload || typeof payload !== 'object') return;
    if (Number.isInteger(payload.activeTab) && payload.activeTab >= 0 && payload.activeTab < 4) liveState.activeTab = payload.activeTab;
    if (Array.isArray(payload.orders) && payload.orders.length === 4) liveState.orders = payload.orders;
    if (Array.isArray(payload.placements) && payload.placements.length === 4) liveState.placements = payload.placements;
    liveState.status = payload.status || 'working';
    liveState.drag = payload.drag || null;
    liveState.score = payload.score ?? null;
    liveState.submitted = !!payload.submitted;
    liveState.result = payload.result || (liveState.submitted ? {score: liveState.score, activeTab: liveState.activeTab, placements: liveState.placements} : null);
    broadcast();
  });

  socket.on('teacher:command', command => {
    if (!command || typeof command !== 'object') return;
    if (!['submit','shuffle','reset'].includes(command.type)) return;
    // Forward teacher controls to the connected student. The student performs
    // the action with the same application logic and broadcasts the resulting
    // state, keeping both screens synchronized.
    io.to('quran-live').emit('teacher:command', { type: command.type });
  });

  socket.on('student:reset', () => {
    liveState = {
      activeTab: liveState.activeTab,
      orders: initialOrders.map(a => [...a]),
      placements: Array.from({length:4}, () => Array(10).fill(null)),
      status: 'waiting', drag: null, score: null, submitted: false, result: null, updatedAt: Date.now()
    };
    broadcast();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Qur'an Live running on http://localhost:${PORT}`);
  console.log(`Student: http://localhost:${PORT}/student`);
  console.log(`Teacher: http://localhost:${PORT}/teacher`);
});
