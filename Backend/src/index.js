const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ===== In-memory storage =====
let users = [];
let groups = [];
let expenses = [];
let balances = {};

let userId = 1;
let groupId = 1;
let expenseId = 1;

// ===== Balance simplification =====
function updateBalance(groupId, owerId, lenderId, amount) {
  if (amount <= 0) return;

  const key = `${groupId}:${owerId}:${lenderId}`;
  const reverseKey = `${groupId}:${lenderId}:${owerId}`;

  if (balances[reverseKey]) {
    const reverseAmount = balances[reverseKey];
    if (reverseAmount >= amount) {
      balances[reverseKey] -= amount;
      if (balances[reverseKey] < 0.01) delete balances[reverseKey];
      return;
    } else {
      delete balances[reverseKey];
      amount -= reverseAmount;
    }
  }

  balances[key] = (balances[key] || 0) + amount;
}
app.use(express.json());


// ✅ ROOT ROUTE (THIS WAS THE MISSING PIECE EARLIER)
app.get('/', (req, res) => {
  res.json({ message: 'Expense Tracker API running' });
});

// Create user
app.post('/users', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  const user = { id: userId++, name };
  users.push(user);
  res.json({ success: true, user });
});

// Create group
app.post('/groups', (req, res) => {
  const { name, userIds } = req.body;
  if (!name || !Array.isArray(userIds)) {
    return res.status(400).json({ error: 'Name and userIds required' });
  }

  const group = {
    id: groupId++,
    name,
    members: [...new Set(userIds.map(Number))]
  };

  groups.push(group);
  res.json({ success: true, group });
});

// Add expense
app.post('/expenses', (req, res) => {
  try {
    const { description, amount, paidBy, groupId, splitType, splitDetails = {} } = req.body;

    if (!description || !amount || !paidBy || !groupId || !splitType) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const group = groups.find(g => g.id === Number(groupId));
    if (!group) throw new Error('Group not found');

    const participants = splitDetails.participants || group.members;
    let shares = {};

    if (splitType === 'EQUAL') {
      const share = amount / participants.length;
      participants.forEach(id => shares[id] = share);
    } else if (splitType === 'EXACT') {
      const total = Object.values(splitDetails.amounts).reduce((a, b) => a + b, 0);
      if (Math.abs(total - amount) > 0.01) throw new Error('Exact split mismatch');
      shares = splitDetails.amounts;
    } else if (splitType === 'PERCENTAGE') {
      const total = Object.values(splitDetails.percentages).reduce((a, b) => a + b, 0);
      if (Math.abs(total - 100) > 0.01) throw new Error('Percentages must total 100');
      Object.keys(splitDetails.percentages).forEach(id => {
        shares[id] = amount * (splitDetails.percentages[id] / 100);
      });
    } else {
      throw new Error('Invalid split type');
    }

    Object.keys(shares).forEach(id => {
      if (Number(id) !== Number(paidBy)) {
        updateBalance(groupId, Number(id), Number(paidBy), shares[id]);
      }
    });

    const expense = {
      id: expenseId++,
      description,
      amount,
      paidBy,
      groupId,
      splitType,
      shares
    };

    expenses.push(expense);
    res.json({ success: true, expense });

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get balances
app.get('/balances', (req, res) => {
  const gid = Number(req.query.groupId);
  if (!gid) return res.status(400).json({ error: 'groupId required' });

  const result = [];
  Object.keys(balances).forEach(key => {
    const [g, o, l] = key.split(':').map(Number);
    if (g === gid) {
      const ower = users.find(u => u.id === o);
      const lender = users.find(u => u.id === l);
      if (ower && lender) {
        result.push({
          ower: ower.name,
          lender: lender.name,
          amount: Number(balances[key].toFixed(2))
        });
      }
    }
  });

  res.json({ success: true, balances: result });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
