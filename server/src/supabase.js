const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://bfjpvexbcjtyidhqokuo.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmanB2ZXhiY2p0eWlkaHFva3VvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODQ2NDgzOSwiZXhwIjoyMDk0MDQwODM5fQ.zWXBz6-vVj7ODAvGTkk8bFPczB03iVT-05ArjgEiFio';

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
