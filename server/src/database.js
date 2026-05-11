const supabase = require('./supabase');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

function init() {
  console.log('[DB] Conectado ao Supabase PostgreSQL');
}

function seed() {
  supabase.from('users').select('id').eq('phone', 'admin').single()
    .then(({ data: admin }) => {
      if (admin) return seedProducts();
      return seedAll();
    });
}

async function seedAll() {
  const adminId = uuid();
  const storeId = uuid();
  const motoboyId = uuid();
  const customerId = uuid();
  const hash = bcrypt.hashSync('123456', 10);

  await supabase.from('users').insert([
    { id: adminId, name: 'Loja Central', phone: 'admin', password_hash: hash, role: 'store' },
    { id: motoboyId, name: 'João Motoboy', phone: 'motoboy', password_hash: hash, role: 'motoboy' },
    { id: customerId, name: 'Maria Cliente', phone: 'cliente', password_hash: hash, role: 'customer' }
  ]);

  await supabase.from('stores').insert({
    id: storeId, name: 'Açaí Central', owner_id: adminId,
    address: 'Rua do Açaí, 100 - Centro, São Paulo',
    lat: -23.5505, lng: -46.6333
  });

  await supabase.from('motoboy_locations').insert({
    motoboy_id: motoboyId, lat: -23.5510, lng: -46.6340, online: 1
  });

  console.log('[DB] Usuários de exemplo inseridos.');
  console.log('[DB] admin/123456  motoboy/123456  cliente/123456');

  await seedProducts(storeId);
}

async function seedProducts(storeId) {
  if (!storeId) {
    const { data: store } = await supabase.from('stores').select('id').eq('name', 'Açaí Central').single();
    if (!store) return;
    storeId = store.id;
  }

  const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('store_id', storeId);
  if (count > 0) return;

  const products = [
    ['Açaí 500ml (Meio Litro)', 'Açaí puro batido com xarope de guaraná', 25.00, 500],
    ['Açaí 1 Litro', 'Açaí puro batido com xarope de guaraná — pode vir em 2 sacos de 500ml', 45.00, 1000],
    ['Açaí 300ml Tradicional', 'Açaí puro batido com xarope de guaraná', 15.00, 300],
    ['Açaí 700ml Premium', 'Açaí com banana, granola e leite condensado', 35.00, 700],
    ['Farinha de Tapioca', 'Acompanhamento tradicional — farinha de tapioca', 5.00, 100],
    ["Farinha D'água", "Farinha d'água típica do Pará", 6.00, 100],
    ['Copo 500ml Energia', 'Açaí com guaraná em pó, paçoca e mel', 30.00, 500],
    ['Copo 500ml Proteína', 'Açaí com whey protein, banana e pasta de amendoim', 35.00, 500],
  ];

  await supabase.from('products').insert(
    products.map(([name, description, price, size_ml]) => ({
      id: uuid(), store_id: storeId, name, description, price, size_ml
    }))
  );
  console.log('[DB] Produtos padrão inseridos.');
}

init();
seed();

module.exports = { supabase, uuid, bcrypt };
