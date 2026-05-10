const { Router } = require('express');
const { v4: uuid } = require('uuid');
const db = require('../database');
const { authMiddleware, roleMiddleware } = require('../auth');

const router = Router();

router.get('/', (req, res) => {
  let query = 'SELECT p.*, s.name as store_name FROM products p JOIN stores s ON p.store_id = s.id WHERE p.active = 1';
  if (req.query.store_id) {
    query += ' AND p.store_id = ?';
    const items = db.prepare(query).all(req.query.store_id);
    return res.json(items);
  }
  const items = db.prepare(query).all();
  res.json(items);
});

router.post('/', authMiddleware, roleMiddleware('store'), (req, res) => {
  const store = db.prepare('SELECT * FROM stores WHERE owner_id = ?').get(req.user.id);
  if (!store) return res.status(403).json({ error: 'Loja não encontrada' });

  const { name, description, price, size_ml } = req.body;
  if (!name || !price || !size_ml) {
    return res.status(400).json({ error: 'Nome, preço e tamanho são obrigatórios' });
  }

  const id = uuid();
  db.prepare(
    'INSERT INTO products (id, store_id, name, description, price, size_ml) VALUES (?,?,?,?,?,?)'
  ).run(id, store.id, name, description || '', price, size_ml);

  res.json({ id, store_id: store.id, name, description, price, size_ml });
});

router.put('/:id', authMiddleware, roleMiddleware('store'), (req, res) => {
  const store = db.prepare('SELECT * FROM stores WHERE owner_id = ?').get(req.user.id);
  if (!store) return res.status(403).json({ error: 'Loja não encontrada' });

  const product = db.prepare('SELECT * FROM products WHERE id = ? AND store_id = ?')
    .get(req.params.id, store.id);
  if (!product) return res.status(404).json({ error: 'Produto não encontrado' });

  const { name, description, price, size_ml, active } = req.body;
  db.prepare(
    'UPDATE products SET name=COALESCE(?,name), description=COALESCE(?,description), price=COALESCE(?,price), size_ml=COALESCE(?,size_ml), active=COALESCE(?,active) WHERE id=?'
  ).run(name, description, price, size_ml, active, req.params.id);

  res.json({ success: true });
});

router.delete('/:id', authMiddleware, roleMiddleware('store'), (req, res) => {
  const store = db.prepare('SELECT * FROM stores WHERE owner_id = ?').get(req.user.id);
  if (!store) return res.status(403).json({ error: 'Loja não encontrada' });

  db.prepare('UPDATE products SET active = 0 WHERE id = ? AND store_id = ?')
    .run(req.params.id, store.id);

  res.json({ success: true });
});

module.exports = router;
