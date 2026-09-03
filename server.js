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
  timer: { active: false, paused: false, duration: 120, startedAt: null, endsAt: null, endedAt: null, remainingMs: 120000 },
  updatedAt: Date.now()
};

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req,res) => res.redirect('/student'));
app.get('/student', (req,res) => res.sendFile(path.join(__dirname,'public','student.html')));
app.get('/teacher', (req,res) => res.sendFile(path.join(__dirname,'public','teacher.html')));

app.post('/api/timer/start', (req,res) => {
  startTimer();
  res.set('Cache-Control','no-store');
  res.json(liveState.timer);
});
app.post('/api/timer/pause', (req,res) => {
  pauseTimer();
  res.set('Cache-Control','no-store');
  res.json(liveState.timer);
});
app.post('/api/timer/reset', (req,res) => {
  resetTimer();
  res.set('Cache-Control','no-store');
  res.json(liveState.timer);
});

let timerTimeout = null;

function clearTimerTimeout() {
  if (timerTimeout) {
    clearTimeout(timerTimeout);
    timerTimeout = null;
  }
}

function startTimer() {
  clearTimerTimeout();
  const now = Date.now();
  const current = liveState.timer || {};
  const duration = 120;
  const remainingMs = current.paused && Number.isFinite(current.remainingMs)
    ? Math.max(0, current.remainingMs)
    : duration * 1000;

  liveState.timer = {
    active: true,
    paused: false,
    duration,
    startedAt: now,
    endsAt: now + remainingMs,
    endedAt: null,
    remainingMs
  };
  broadcast();

  timerTimeout = setTimeout(() => {
    liveState.timer = { ...liveState.timer, active: false, paused: false, remainingMs: 0, endedAt: Date.now() };
    timerTimeout = null;
    broadcast();
  }, remainingMs + 50);
}

function pauseTimer() {
  if (!liveState.timer?.active) return;
  const remainingMs = Math.max(0, liveState.timer.endsAt - Date.now());
  clearTimerTimeout();
  liveState.timer = { ...liveState.timer, active: false, paused: true, endsAt: null, remainingMs };
  broadcast();
}

function resetTimer() {
  clearTimerTimeout();
  liveState.timer = { active: false, paused: false, duration: 120, startedAt: null, endsAt: null, endedAt: null, remainingMs: 120000 };
  broadcast();
}

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

    if (command.type === 'timer:start') {
      startTimer();
      return;
    }
    if (command.type === 'timer:pause') {
      pauseTimer();
      return;
    }
    if (command.type === 'timer:reset') {
      resetTimer();
      return;
    }

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
      status: 'waiting', drag: null, score: null, submitted: false, result: null, timer: { active: false, paused: false, duration: 120, startedAt: null, endsAt: null, endedAt: null, remainingMs: 120000 }, updatedAt: Date.now()
    };
    broadcast();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Qur'an Live running on http://localhost:${PORT}`);
  console.log(`Student: http://localhost:${PORT}/student`);
  console.log(`Teacher: http://localhost:${PORT}/teacher`);
});
