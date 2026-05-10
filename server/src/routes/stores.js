const { Router } = require('express');
const { v4: uuid } = require('uuid');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../database');
const { authMiddleware, roleMiddleware } = require('../auth');

const isVercel = !!process.env.VERCEL;

const uploadsDir = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'uploads')
  : (isVercel ? path.join('/tmp', 'uploads') : path.join(__dirname, '..', '..', 'uploads'));
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `logo-${req.params.id}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Apenas imagens são aceitas'));
}});

const router = Router();

router.post('/', authMiddleware, roleMiddleware('store'), (req, res) => {
  const { name, address, lat, lng } = req.body;
  if (!name || !address) {
    return res.status(400).json({ error: 'Nome e endereço são obrigatórios' });
  }

  const existing = db.prepare('SELECT * FROM stores WHERE owner_id = ?').get(req.user.id);
  if (existing) return res.status(409).json({ error: 'Você já possui uma loja' });

  const id = uuid();
  db.prepare(
    'INSERT INTO stores (id, name, owner_id, address, lat, lng) VALUES (?,?,?,?,?,?)'
  ).run(id, name, req.user.id, address, lat || -23.5505, lng || -46.6333);

  res.json({ id, name, owner_id: req.user.id, address, lat, lng });
});

router.get('/', (req, res) => {
  const stores = db.prepare('SELECT * FROM stores').all();
  res.json(stores);
});

router.get('/:id', (req, res) => {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  res.json(store);
});

router.put('/:id/settings', authMiddleware, roleMiddleware('store'), (req, res) => {
  const store = db.prepare('SELECT * FROM stores WHERE id = ? AND owner_id = ?')
    .get(req.params.id, req.user.id);
  if (!store) return res.status(403).json({ error: 'Não autorizado' });

  const { name, logo, lat, lng, address, color_primary, color_secondary } = req.body;
  const toVal = (v) => (v === '' || v === null || v === undefined || Number.isNaN(v)) ? null : v;
  db.prepare(`
    UPDATE stores SET
      name = COALESCE(?, name),
      logo = COALESCE(?, logo),
      lat = COALESCE(?, lat),
      lng = COALESCE(?, lng),
      address = COALESCE(?, address),
      color_primary = COALESCE(?, color_primary),
      color_secondary = COALESCE(?, color_secondary)
    WHERE id = ?
  `).run(toVal(name), toVal(logo), toVal(lat), toVal(lng), toVal(address), toVal(color_primary), toVal(color_secondary), store.id);

  const updated = db.prepare('SELECT * FROM stores WHERE id = ?').get(store.id);
  res.json(updated);
});

router.post('/:id/logo', authMiddleware, roleMiddleware('store'), upload.single('logo'), (req, res) => {
  const store = db.prepare('SELECT * FROM stores WHERE id = ? AND owner_id = ?')
    .get(req.params.id, req.user.id);
  if (!store) return res.status(403).json({ error: 'Não autorizado' });

  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });

  const logoUrl = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE stores SET logo = ? WHERE id = ?').run(logoUrl, store.id);

  res.json({ logo: logoUrl });
});

router.patch('/:id/toggle-open', authMiddleware, roleMiddleware('store'), (req, res) => {
  const store = db.prepare('SELECT * FROM stores WHERE id = ? AND owner_id = ?')
    .get(req.params.id, req.user.id);
  if (!store) return res.status(403).json({ error: 'Não autorizado' });

  const newStatus = store.open ? 0 : 1;
  db.prepare('UPDATE stores SET open = ? WHERE id = ?').run(newStatus, req.params.id);

  res.json({ open: !!newStatus, message: newStatus ? 'Loja ABERTA para pedidos' : 'Loja FECHADA - entregas encerradas' });
});

module.exports = router;
