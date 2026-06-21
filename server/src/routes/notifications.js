const { Router } = require('express');
const { supabase } = require('../database');
const { authMiddleware } = require('../auth');

const router = Router();

router.get('/', authMiddleware, async (req, res) => {
  const { data } = await supabase
    .from('notifications')
    .select('id, title, body, type, created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(30);
  res.json({ data: data || [] });
});

module.exports = router;
