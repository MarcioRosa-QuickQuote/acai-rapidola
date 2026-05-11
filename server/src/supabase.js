const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://bfjpvexbcjtyidhqokuo.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
