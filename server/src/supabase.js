const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const supabaseUrl = process.env.SUPABASE_URL || 'https://kggetnukngyqmjespiaj.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnZ2V0bnVrbmd5cW1qZXNwaWFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTY0OTA1OCwiZXhwIjoyMDk3MjI1MDU4fQ.MzGez4qQX1uFrXZ0BcFIhGwWCpd7tc0U9R_ptlIbWdk';

const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: { transport: WebSocket }
});

module.exports = supabase;
