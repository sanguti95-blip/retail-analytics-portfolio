/**
 * Gestión de Usuarios - Country House Dashboard
 * 
 * Uso:
 *   Crear usuario:           node scripts/manage-users.js crear <usuario> <contraseña> <rol>
 *   Cambiar contraseña:      node scripts/manage-users.js cambiar-clave <usuario> <nueva-contraseña>
 *   Listar usuarios:         node scripts/manage-users.js listar
 *   Eliminar usuario:        node scripts/manage-users.js eliminar <usuario>
 * 
 * Roles disponibles: admin, viewer
 * 
 * Ejemplos:
 *   node scripts/manage-users.js crear bodega Clave123 viewer
 *   node scripts/manage-users.js cambiar-clave admin MiClaveSegura2026
 *   node scripts/manage-users.js listar
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const bcrypt = require('bcryptjs');
const { pool, testConnection } = require('../config/db');

const [,, action, arg1, arg2, arg3] = process.argv;

const ROLES_VALIDOS = ['admin', 'viewer'];

async function listarUsuarios() {
  const result = await pool.query(
    'SELECT id, username, role, created_at FROM users ORDER BY id'
  );
  if (result.rows.length === 0) {
    console.log('⚠️  No hay usuarios registrados.');
    return;
  }
  console.log('\n👥 Usuarios en el sistema:\n');
  console.log('ID | Usuario       | Rol      | Creado');
  console.log('---|---------------|----------|----------------------------');
  result.rows.forEach(u => {
    console.log(`${String(u.id).padEnd(3)}| ${String(u.username).padEnd(14)}| ${String(u.role).padEnd(9)}| ${u.created_at.toISOString().slice(0, 10)}`);
  });
  console.log();
}

async function crearUsuario(username, password, role) {
  if (!username || !password || !role) {
    console.error('❌ Debes indicar usuario, contraseña y rol.');
    console.error('   Ejemplo: node scripts/manage-users.js crear bodega Clave123 viewer');
    process.exit(1);
  }
  if (!ROLES_VALIDOS.includes(role)) {
    console.error(`❌ Rol inválido: "${role}". Usa "admin" o "viewer".`);
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)',
    [username, hash, role]
  );
  console.log(`\n✅ Usuario "${username}" creado exitosamente con rol "${role}".\n`);
}

async function cambiarClave(username, newPassword) {
  if (!username || !newPassword) {
    console.error('❌ Debes indicar el usuario y la nueva contraseña.');
    console.error('   Ejemplo: node scripts/manage-users.js cambiar-clave admin MiClaveSegura2026');
    process.exit(1);
  }
  const hash = await bcrypt.hash(newPassword, 10);
  const result = await pool.query(
    'UPDATE users SET password_hash = $1 WHERE username = $2',
    [hash, username]
  );
  if (result.rowCount === 0) {
    console.error(`❌ Usuario "${username}" no encontrado.`);
    process.exit(1);
  }
  console.log(`\n✅ Contraseña del usuario "${username}" actualizada exitosamente.\n`);
}

async function eliminarUsuario(username) {
  if (!username) {
    console.error('❌ Debes indicar el nombre de usuario a eliminar.');
    process.exit(1);
  }
  if (username === 'admin') {
    console.error('❌ No puedes eliminar el usuario "admin" por seguridad.');
    process.exit(1);
  }
  const result = await pool.query('DELETE FROM users WHERE username = $1', [username]);
  if (result.rowCount === 0) {
    console.error(`❌ Usuario "${username}" no encontrado.`);
    process.exit(1);
  }
  console.log(`\n✅ Usuario "${username}" eliminado exitosamente.\n`);
}

async function main() {
  const connected = await testConnection();
  if (!connected) {
    console.error('❌ No se pudo conectar a la base de datos. Verifica tu archivo .env');
    process.exit(1);
  }

  switch (action) {
    case 'listar':
      await listarUsuarios();
      break;
    case 'crear':
      await crearUsuario(arg1, arg2, arg3);
      break;
    case 'cambiar-clave':
      await cambiarClave(arg1, arg2);
      break;
    case 'eliminar':
      await eliminarUsuario(arg1);
      break;
    default:
      console.log('\n📖 Uso correcto:');
      console.log('  node scripts/manage-users.js listar');
      console.log('  node scripts/manage-users.js crear <usuario> <contraseña> <rol>');
      console.log('  node scripts/manage-users.js cambiar-clave <usuario> <nueva-contraseña>');
      console.log('  node scripts/manage-users.js eliminar <usuario>');
      console.log('\nRoles: admin | viewer\n');
  }

  await pool.end();
}

main().catch(err => {
  console.error('❌ Error inesperado:', err.message);
  process.exit(1);
});
