const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'acai-rapidola-secret-key-2024';

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, role: user.role, phone: user.phone },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  try {
    const user = verifyToken(header.split(' ')[1]);
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

function roleMiddleware(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso não permitido' });
    }
    next();
  };
}

module.exports = { signToken, verifyToken, authMiddleware, roleMiddleware };
