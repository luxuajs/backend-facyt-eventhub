import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function resetDb() {
  console.log('Iniciando Reseteo de Base de Datos...');

  try {
    // 1. Eliminar asistencias, eventos, auditorías y códigos de reset
    await prisma.asistencia.deleteMany({});
    console.log('✔ Asistencias eliminadas');

    await prisma.auditoria.deleteMany({});
    console.log('✔ Registros de auditoría eliminados');

    await prisma.evento.deleteMany({});
    console.log('✔ Eventos eliminados');

    await prisma.resetCode.deleteMany({});
    console.log('✔ Códigos de verificación/recuperación eliminados');

    // 2. Eliminar usuarios excepto ROOT
    const rootEmail = 'juansanabriaalfa08@gmail.com';
    const deletedUsers = await prisma.usuario.deleteMany({
      where: {
        email: { not: rootEmail }
      }
    });
    console.log(`✔ Usuarios eliminados (${deletedUsers.count} usuarios borrados)`);

    // 3. Verificar o Re-crear ROOT si no existe
    let rootUser = await prisma.usuario.findUnique({
      where: { email: rootEmail }
    });

    if (!rootUser) {
      const hashedPassword = await bcrypt.hash('root1234', 10);
      rootUser = await prisma.usuario.create({
        data: {
          nombre: 'Juan Sanabria Root',
          email: rootEmail,
          password: hashedPassword,
          rol: 'ROOT',
          tipoUsuario: 'COORDINADOR',
          activo: true
        }
      });
      console.log('✔ Usuario ROOT recreado');
    } else {
      console.log('✔ Usuario ROOT preservado:', rootUser.email);
    }

    console.log('Reseteo completado con éxito. La base de datos está limpia y lista desde cero.');
  } catch (error) {
    console.error('Error durante el reseteo:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetDb();
