const laneNames = ['North', 'East', 'South', 'West'];
const defaultLanes = laneNames.map((name, index) => ({
  name,
  vehicles: 5 + index * 3,
  waiting: 5 + index * 4,
  priority: 3,
  urgency: 0,
  greenTime: 0,
}));

const laneContainer = document.querySelector('.lane-inputs');
const laneTemplate = document.getElementById('laneTemplate');
const calculateBtn = document.getElementById('calculateBtn');
const greedyBtn = document.getElementById('greedyBtn');
const dpBtn = document.getElementById('dpBtn');
const fullSimBtn = document.getElementById('fullSimBtn');
const resetBtn = document.getElementById('resetBtn');
const randomizeBtn = document.getElementById('randomizeBtn');
const selectedLaneEl = document.getElementById('selectedLane');
const greenTimerEl = document.getElementById('greenTimer');
const nextLaneEl = document.getElementById('nextLane');
const cycleCountEl = document.getElementById('cycleCount');
const bestLaneEl = document.getElementById('bestLane');
const activeMethodEl = document.getElementById('activeMethod');
const totalWaitingEl = document.getElementById('totalWaiting');
const historyList = document.getElementById('historyList');
const historyTableBody = document.getElementById('historyTableBody');
const queueVisual = document.getElementById('queueVisual');
const speedControl = document.getElementById('speedControl');
const speedLabel = document.getElementById('speedLabel');
const autoToggle = document.getElementById('autoToggle');
const emergencyToggle = document.getElementById('emergencyToggle');
const modeToggle = document.getElementById('modeToggle');
const manualStepBtn = document.getElementById('manualStepBtn');
const body = document.body;
const waitChart = document.getElementById('waitChart');
const throughputChart = document.getElementById('throughputChart');
const cycleChart = document.getElementById('cycleChart');
const statusMessageEl = document.getElementById('statusMessage');

let lanes = [];
let currentSchedule = [];
let selectedLane = null;
let currentTimer = 0;
let history = [];
let autoMode = false;
let speedFactor = 1;
let timerInterval = null;

class MaxHeap {
  constructor(items = []) {
    this.heap = [];
    items.forEach(item => this.insert(item));
  }

  insert(item) {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);
  }

  peek() {
    return this.heap[0];
  }

  extractMax() {
    if (!this.heap.length) return null;
    const max = this.heap[0];
    const end = this.heap.pop();
    if (this.heap.length) {
      this.heap[0] = end;
      this._bubbleDown(0);
    }
    return max;
  }

  _bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.heap[index].urgency <= this.heap[parent].urgency) break;
      [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
      index = parent;
    }
  }

  _bubbleDown(index) {
    const length = this.heap.length;
    while (true) {
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      let largest = index;
      if (left < length && this.heap[left].urgency > this.heap[largest].urgency) largest = left;
      if (right < length && this.heap[right].urgency > this.heap[largest].urgency) largest = right;
      if (largest === index) break;
      [this.heap[index], this.heap[largest]] = [this.heap[largest], this.heap[index]];
      index = largest;
    }
  }
}

function createLaneCards() {
  laneContainer.innerHTML = '';
  lanes = defaultLanes.map(lane => ({ ...lane }));
  lanes.forEach((lane, index) => {
    const clone = laneTemplate.content.cloneNode(true);
    const card = clone.querySelector('.lane-card');
    const nameEl = card.querySelector('.lane-name');
    const vehiclesInput = card.querySelector('.input-vehicles');
    const waitInput = card.querySelector('.input-wait');
    const priorityInput = card.querySelector('.input-priority');
    const urgencyEl = card.querySelector('.lane-urgency');
    const priorityValue = card.querySelector('.priority-value');

    nameEl.textContent = lane.name;
    vehiclesInput.value = lane.vehicles;
    waitInput.value = lane.waiting;
    priorityInput.value = lane.priority;
    priorityValue.textContent = lane.priority;

    vehiclesInput.addEventListener('input', () => {
      lane.vehicles = Math.max(0, Number(vehiclesInput.value));
      calculateUrgency();
    });
    waitInput.addEventListener('input', () => {
      lane.waiting = Math.max(0, Number(waitInput.value));
      calculateUrgency();
    });
    priorityInput.addEventListener('input', () => {
      lane.priority = Number(priorityInput.value);
      priorityValue.textContent = lane.priority;
      calculateUrgency();
    });

    laneContainer.appendChild(clone);
  });
}

function computeUrgency(lane) {
  const emergencyFactor = emergencyToggle.checked && lane.priority === 5 ? 1.4 : 1;
  return Math.round(lane.vehicles * lane.waiting * lane.priority * emergencyFactor);
}

function calculateUrgency() {
  lanes.forEach(lane => {
    lane.urgency = computeUrgency(lane);
    lane.greenTime = Math.min(25, Math.max(6, Math.ceil(lane.urgency / 12)));
  });
  renderLaneUrgency();
  renderQueue();
  updateGraphs();
  setStatusMessage('Urgency scores recalculated using current lane inputs.');
}

function renderLaneUrgency() {
  const cards = laneContainer.querySelectorAll('.lane-card');
  cards.forEach((card, index) => {
    card.querySelector('.lane-urgency').textContent = lanes[index].urgency;
  });
}

function buildPriorityQueue() {
  const heap = new MaxHeap();
  lanes.forEach(lane => heap.insert({ ...lane }));
  return heap;
}

function renderQueue() {
  const queue = [...lanes].sort((a, b) => b.urgency - a.urgency);
  queueVisual.innerHTML = '';
  queue.forEach((lane, index) => {
    const bar = document.createElement('div');
    bar.className = 'queue-bar';
    if (selectedLane && lane.name === selectedLane.name) {
      bar.classList.add('selected');
    }
    bar.innerHTML = `
      <strong>${index + 1}. ${lane.name}</strong>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, lane.urgency / 6)}%"></div></div>
      <span>${lane.urgency}</span>
    `;
    queueVisual.appendChild(bar);
  });
}

function highlightSelected(name) {
  document.querySelectorAll('.signal-lane').forEach(el => {
    el.classList.toggle('active', el.textContent.trim() === name[0]);
  });
}

function updateStatusPanel() {
  selectedLaneEl.textContent = selectedLane ? selectedLane.name : 'None';
  greenTimerEl.textContent = `${currentTimer}s`;
  nextLaneEl.textContent = currentSchedule.length ? currentSchedule[0].name : 'Pending';
  cycleCountEl.textContent = history.length;
}

function setStatusMessage(message) {
  if (!statusMessageEl) return;
  statusMessageEl.textContent = message;
  statusMessageEl.classList.add('pulse');
  setTimeout(() => statusMessageEl.classList.remove('pulse'), 300);
}

function flashButton(button) {
  if (!button) return;
  button.classList.add('active');
  setTimeout(() => button.classList.remove('active'), 250);
}

function addHistory(lane, algorithm, cycle = history.length + 1) {
  history.unshift({
    cycle,
    lane: lane.name,
    urgency: lane.urgency,
    greenTime: lane.greenTime,
    algorithm,
  });
  renderHistory();
}

function renderHistory() {
  historyList.innerHTML = '';
  let totalWaitTime = 0;
  lanes.forEach(lane => {
    totalWaitTime += lane.waiting;
  });
  history.slice(0, 12).forEach(record => {
    const row = document.createElement('tr');
    row.className = 'history-row';
    row.innerHTML = `
      <td class="cycle-num">${record.cycle}</td>
      <td><span class="method-tag">${record.algorithm}</span></td>
      <td><span class="lane-name">${record.lane}</span></td>
      <td>${record.urgency}</td>
      <td>${record.greenTime}s</td>
      <td>${currentSchedule.length ? currentSchedule[0].name : 'None'}</td>
      <td>${totalWaitTime}s</td>
    `;
    historyList.appendChild(row);
  });
}

function animateTimer() {
  clearInterval(timerInterval);
  if (!selectedLane) return;
  let timeLeft = currentTimer;
  updateStatusPanel();
  timerInterval = setInterval(() => {
    timeLeft -= speedFactor;
    currentTimer = Math.max(0, Math.ceil(timeLeft));
    updateStatusPanel();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      if (autoMode && currentSchedule.length) {
        selectedLane = currentSchedule.shift();
        currentTimer = selectedLane.greenTime;
        addHistory(selectedLane, 'Auto Step');
        highlightSelected(selectedLane.name);
        updateStatusPanel();
        animateTimer();
      }
    }
  }, 1000);
}

function runGreedy() {
  flashButton(greedyBtn);
  calculateUrgency();
  const heap = buildPriorityQueue();
  selectedLane = heap.extractMax();
  currentSchedule = [];
  let next = heap.peek();
  if (next) currentSchedule = heap.heap.slice().sort((a, b) => b.urgency - a.urgency);
  currentTimer = selectedLane.greenTime;
  addHistory(selectedLane, 'Greedy');
  setStatusMessage(`Greedy selected ${selectedLane.name} for green signal.`);
  highlightSelected(selectedLane.name);
  updateStatusPanel();
  animateTimer();
}

function solveDP(cycles = 4) {
  const memo = new Map();

  function key(round, waits) {
    return `${round}:${waits.join(',')}`;
  }

  function dfs(round, waits) {
    if (round === cycles) return { cost: 0, plan: [] };
    const memoKey = key(round, waits);
    if (memo.has(memoKey)) return memo.get(memoKey);
    let best = { cost: Infinity, plan: [] };
    lanes.forEach((lane, index) => {
      const urgency = lane.vehicles * waits[index] * lane.priority * (emergencyToggle.checked && lane.priority === 5 ? 1.4 : 1);
      const greenTime = Math.min(25, Math.max(6, Math.ceil(urgency / 12)));
      const nextWaits = waits.map((wait, idx) => idx === index ? Math.max(0, wait - greenTime) : wait + greenTime);
      const stepCost = waits.reduce((sum, wait) => sum + wait, 0);
      const future = dfs(round + 1, nextWaits);
      const totalCost = stepCost + future.cost;
      if (totalCost < best.cost) {
        best = { cost: totalCost, plan: [index, ...future.plan] };
      }
    });
    memo.set(memoKey, best);
    return best;
  }

  const initialWaits = lanes.map(lane => lane.waiting);
  return dfs(0, initialWaits).plan;
}

function runDPAlgorithm() {
  flashButton(dpBtn);
  calculateUrgency();
  const planIndices = solveDP(4);
  if (!planIndices.length) {
    setStatusMessage('DP could not determine an optimal lane, please adjust inputs.');
    return;
  }
  selectedLane = lanes[planIndices[0]];
  currentSchedule = planIndices.slice(1).map(index => lanes[index]);
  currentTimer = selectedLane.greenTime;
  addHistory(selectedLane, 'DP');
  setStatusMessage(`DP optimization selected ${selectedLane.name} for green cycle.`);
  highlightSelected(selectedLane.name);
  updateStatusPanel();
  animateTimer();
}

function runFullSimulation() {
  flashButton(fullSimBtn);
  calculateUrgency();
  history = [];
  let simulated = lanes.map(lane => ({ ...lane }));
  const rounds = 6;
  for (let cycle = 1; cycle <= rounds; cycle += 1) {
    simulated = simulated.map(lane => ({ ...lane, urgency: computeUrgency(lane), greenTime: Math.min(25, Math.max(6, Math.ceil(computeUrgency(lane) / 12))) }));
    simulated.sort((a, b) => b.urgency - a.urgency);
    const selected = simulated[0];
    addHistory(selected, 'Adaptive', cycle);
    simulated = simulated.map((lane, idx) => {
      if (lane.name === selected.name) {
        return { ...lane, waiting: Math.max(0, lane.waiting - selected.greenTime) };
      }
      return { ...lane, waiting: lane.waiting + selected.greenTime };
    });
  }
  lanes = simulated.map(lane => ({ ...lane, urgency: computeUrgency(lane), greenTime: Math.min(25, Math.max(6, Math.ceil(computeUrgency(lane) / 12))) }));
  calculateUrgency();
  selectedLane = lanes.sort((a, b) => b.urgency - a.urgency)[0];
  currentSchedule = lanes.filter(lane => lane.name !== selectedLane.name).sort((a, b) => b.urgency - a.urgency);
  currentTimer = selectedLane.greenTime;
  setStatusMessage('Full simulation completed with adaptive lane assignment.');
  highlightSelected(selectedLane.name);
  updateStatusPanel();
  animateTimer();
}

function simulateStrategy(strategy) {
  const working = lanes.map(lane => ({ ...lane }));
  const cycles = 6;
  let totalWait = 0;
  let throughput = 0;
  let fuel = 0;
  let order = [...working];

  for (let round = 0; round < cycles; round += 1) {
    working.forEach(lane => {
      lane.urgency = computeUrgency(lane);
      lane.greenTime = Math.min(25, Math.max(6, Math.ceil(lane.urgency / 12)));
    });
    if (strategy === 'static') {
      order = [...working];
    } else if (strategy === 'roundrobin') {
      order = [...working.slice(round % working.length), ...working.slice(0, round % working.length)];
    } else {
      order = [...working].sort((a, b) => b.urgency - a.urgency);
    }
    const selected = order[0];
    const greenTime = selected.greenTime;
    totalWait += working.reduce((sum, lane) => sum + lane.waiting, 0);
    throughput += selected.vehicles;
    fuel += greenTime * 0.7 + selected.waiting * 0.15;
    working.forEach(lane => {
      if (lane.name === selected.name) {
        lane.waiting = Math.max(0, lane.waiting - greenTime);
      } else {
        lane.waiting += greenTime;
      }
    });
  }

  return {
    averageWaiting: Math.round(totalWait / cycles),
    throughput: Math.round(throughput),
    fuel: Math.round(fuel),
    cyclesCompleted: cycles,
  };
}

function updateGraphs() {
  const strategies = ['static', 'roundrobin', 'adaptive'];
  const results = strategies.map(simulateStrategy);
  const labels = ['Static', 'Round Robin', 'Adaptive'];
  drawChart(waitChart, [results.map(r => r.averageWaiting)], labels, ['#8b6cff']);
  drawChart(throughputChart, [results.map(r => r.throughput), results.map(r => r.fuel)], labels, ['#41d7a0', '#ff6d78']);
  drawChart(cycleChart, [results.map(r => r.cyclesCompleted)], labels, ['#8b6cff']);
}

function drawChart(canvas, series, labels, colors) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const padding = 48;
  ctx.clearRect(0, 0, width, height);
  const allPoints = series.flat();
  const max = Math.max(...allPoints, 1) * 1.2;
  const step = (width - padding * 2) / labels.length;
  const barWidth = step / (series.length + 1);

  ctx.font = '600 14px Inter';
  ctx.fillStyle = getCssVar('--muted');
  ctx.textAlign = 'center';

  labels.forEach((label, index) => {
    const x = padding + step * index + step / 2;
    ctx.fillText(label, x, height - padding + 24);
  });

  series.forEach((dataSet, seriesIndex) => {
    dataSet.forEach((value, index) => {
      const x = padding + step * index + barWidth * seriesIndex + barWidth / 2;
      const barHeight = ((height - padding * 2) * value) / max;
      const y = height - padding - barHeight;
      ctx.fillStyle = colors[seriesIndex];
      ctx.fillRect(x, y, barWidth, barHeight);
      ctx.fillStyle = getCssVar('--text');
      ctx.fillText(value, x + barWidth / 2, y - 10);
    });
  });
}

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function resetAll() {
  clearInterval(timerInterval);
  history = [];
  selectedLane = null;
  currentTimer = 0;
  currentSchedule = [];
  createLaneCards();
  calculateUrgency();
  renderHistory();
  updateStatusPanel();
  highlightSelected('');
  setStatusMessage('Simulation reset. Enter new lane values and run the optimizer.');
}

function randomizeTraffic() {
  lanes.forEach(lane => {
    lane.vehicles = 1 + Math.floor(Math.random() * 18);
    lane.waiting = 1 + Math.floor(Math.random() * 18);
    lane.priority = 1 + Math.floor(Math.random() * 5);
  });
  const cards = laneContainer.querySelectorAll('.lane-card');
  cards.forEach((card, index) => {
    const lane = lanes[index];
    card.querySelector('.input-vehicles').value = lane.vehicles;
    card.querySelector('.input-wait').value = lane.waiting;
    const range = card.querySelector('.input-priority');
    range.value = lane.priority;
    card.querySelector('.priority-value').textContent = lane.priority;
  });
  calculateUrgency();
  setStatusMessage('Random traffic generated and urgency scores updated.');
}

function attachListeners() {
  calculateBtn.addEventListener('click', () => {
    flashButton(calculateBtn);
    calculateUrgency();
  });
  greedyBtn.addEventListener('click', runGreedy);
  dpBtn.addEventListener('click', runDPAlgorithm);
  fullSimBtn.addEventListener('click', runFullSimulation);
  resetBtn.addEventListener('click', () => {
    flashButton(resetBtn);
    resetAll();
  });
  randomizeBtn.addEventListener('click', () => {
    flashButton(randomizeBtn);
    randomizeTraffic();
  });
  speedControl.addEventListener('input', () => {
    speedFactor = Number(speedControl.value);
    speedLabel.textContent = `${speedFactor.toFixed(1)}x`;
  });
  autoToggle.addEventListener('change', () => {
    autoMode = autoToggle.checked;
  });
  emergencyToggle.addEventListener('change', calculateUrgency);
  modeToggle.addEventListener('click', () => {
    body.classList.toggle('light');
    modeToggle.textContent = body.classList.contains('light') ? 'Dark' : 'Light';
  });
}

function initialize() {
  createLaneCards();
  calculateUrgency();
  attachListeners();
  updateGraphs();
}

initialize();
