const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('../database');
const { signToken, authMiddleware } = require('../auth');

const router = Router();

router.post('/register', (req, res) => {
  const { name, phone, password, role } = req.body;
  if (!name || !phone || !password || !role) {
    return res.status(400).json({ error: 'Nome, telefone, senha e perfil são obrigatórios' });
  }
  if (!['customer', 'store', 'motoboy'].includes(role)) {
    return res.status(400).json({ error: 'Perfil inválido' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (existing) return res.status(409).json({ error: 'Telefone já cadastrado' });

  const id = uuid();
  const hash = bcrypt.hashSync(password, 10);

  db.prepare('INSERT INTO users (id, name, phone, password_hash, role) VALUES (?,?,?,?,?)')
    .run(id, name, phone, hash, role);

  const user = { id, name, role, phone };
  const token = signToken(user);

  if (role === 'motoboy') {
    db.prepare('INSERT OR IGNORE INTO motoboy_locations (motoboy_id, lat, lng, online) VALUES (?,?,?,?)')
      .run(id, -23.5505, -46.6333, 1);
  }

  res.json({ user, token });
});

router.post('/login', (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ error: 'Telefone e senha são obrigatórios' });
  }

  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user) return res.status(401).json({ error: 'Telefone ou senha inválidos' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Telefone ou senha inválidos' });

  const payload = { id: user.id, name: user.name, role: user.role, phone: user.phone, address: user.address || '', lat: user.lat, lng: user.lng };
  const token = signToken(payload);

  let store = null;
  if (user.role === 'store') {
    store = db.prepare('SELECT * FROM stores WHERE owner_id = ?').get(user.id);
  }

  res.json({ user: payload, token, store });
});

router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, name, phone, role, address, lat, lng, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  let store = null;
  if (user.role === 'store') {
    store = db.prepare('SELECT * FROM stores WHERE owner_id = ?').get(user.id);
  }

  res.json({ user, store });
});

module.exports = router;
