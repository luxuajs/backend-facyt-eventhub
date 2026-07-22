import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando Seeding de la Base de Datos...');

  // Limpieza de datos existentes
  await prisma.auditoria.deleteMany({});
  await prisma.evento.deleteMany({});
  await prisma.resetCode.deleteMany({});
  await prisma.usuario.deleteMany({});
  await prisma.espacio.deleteMany({});
  await prisma.escuela.deleteMany({});

  // 1. Crear Escuelas
  const escuelasData = [
    { nombre: 'Computación' },
    { nombre: 'Química' },
    { nombre: 'Física' },
    { nombre: 'Biología' },
    { nombre: 'Matemática' }
  ];

  const escuelas = {};
  for (const esc of escuelasData) {
    const created = await prisma.escuela.create({
      data: esc
    });
    escuelas[esc.nombre] = created;
  }
  console.log('Escuelas creadas:', Object.keys(escuelas).length);

  // 2. Crear Usuario ROOT inicial
  const rootEmail = 'juansanabriaalfa08@gmail.com';
  const hashedPassword = await bcrypt.hash('root1234', 10);
  await prisma.usuario.create({
    data: {
      nombre: 'Juan Sanabria Root',
      email: rootEmail,
      password: hashedPassword,
      rol: 'ROOT',
      activo: true
    }
  });
  console.log(`Usuario ROOT creado con éxito: ${rootEmail} (Password: root1234)`);

  // 3. Crear Espacios Físicos (según PRD.md)
  // 3a. Auditorio Ninoska Maneiro (Martes y Jueves, 08:00 - 17:00)
  await prisma.espacio.create({
    data: {
      nombre: 'Auditorio Ninoska Maneiro',
      tipo: 'AUDITORIO',
      capacidad: 150,
      diasPermitidos: 'MARTES,JUEVES',
      horaApertura: '08:00',
      horaCierre: '17:00',
      estado: 'ACTIVO'
    }
  });

  // 3b. Laboratorios SunRay 1 a 4 (Lunes a Viernes, 08:00 - 16:00, Computación)
  const compId = escuelas['Computación'].id;
  for (let i = 1; i <= 4; i++) {
    await prisma.espacio.create({
      data: {
        nombre: `Lab. Thin Client SunRay ${i}`,
        tipo: 'LABORATORIO_DOCENCIA',
        capacidad: 30,
        diasPermitidos: 'LUNES,MARTES,MIERCOLES,JUEVES,VIERNES',
        horaApertura: '08:00',
        horaCierre: '16:00',
        estado: 'ACTIVO',
        escuelaId: compId
      }
    });
  }

  // 3c. Laboratorios VIT 1 y 2 (Lunes a Viernes, 08:00 - 16:00, Abiertos/Sin escuela)
  await prisma.espacio.create({
    data: {
      nombre: 'Lab. Escritorio VIT 1 (OPSU)',
      tipo: 'LABORATORIO_DOCENCIA',
      capacidad: 30,
      diasPermitidos: 'LUNES,MARTES,MIERCOLES,JUEVES,VIERNES',
      horaApertura: '08:00',
      horaCierre: '16:00',
      estado: 'ACTIVO'
    }
  });
  await prisma.espacio.create({
    data: {
      nombre: 'Lab. Escritorio VIT 2 (OPSU)',
      tipo: 'LABORATORIO_DOCENCIA',
      capacidad: 15,
      diasPermitidos: 'LUNES,MARTES,MIERCOLES,JUEVES,VIERNES',
      horaApertura: '08:00',
      horaCierre: '16:00',
      estado: 'ACTIVO'
    }
  });

  // 3d. Aulas/Salones (3 por escuela)
  const escuelasNombres = ['Computación', 'Química', 'Física', 'Biología', 'Matemática'];
  for (const escName of escuelasNombres) {
    const escId = escuelas[escName].id;
    for (let i = 1; i <= 3; i++) {
      await prisma.espacio.create({
        data: {
          nombre: `Aula Pequeña ${i} (${escName})`,
          tipo: 'SALON',
          capacidad: 20,
          diasPermitidos: 'LUNES,MARTES,MIERCOLES,JUEVES,VIERNES',
          horaApertura: '07:00',
          horaCierre: '18:00',
          estado: 'ACTIVO',
          escuelaId: escId
        }
      });
      await prisma.espacio.create({
        data: {
          nombre: `Aula Mediana ${i} (${escName})`,
          tipo: 'SALON',
          capacidad: 40,
          diasPermitidos: 'LUNES,MARTES,MIERCOLES,JUEVES,VIERNES',
          horaApertura: '07:00',
          horaCierre: '18:00',
          estado: 'ACTIVO',
          escuelaId: escId
        }
      });
      await prisma.espacio.create({
        data: {
          nombre: `Aula Magna ${i} (${escName})`,
          tipo: 'SALON',
          capacidad: 80,
          diasPermitidos: 'LUNES,MARTES,MIERCOLES,JUEVES,VIERNES',
          horaApertura: '07:00',
          horaCierre: '18:00',
          estado: 'ACTIVO',
          escuelaId: escId
        }
      });
    }
  }

  // 3e. Laboratorios de Investigación (Uso exclusivo por escuela)
  // Física de la Atmósfera y Espacio Ultraterrestre (Física)
  await prisma.espacio.create({
    data: {
      nombre: 'Física de la Atmósfera y Espacio Ultraterrestre',
      tipo: 'LABORATORIO_INVESTIGACION',
      capacidad: 10,
      diasPermitidos: 'LUNES,MARTES,MIERCOLES,JUEVES,VIERNES',
      horaApertura: '08:00',
      horaCierre: '18:00',
      estado: 'ACTIVO',
      escuelaId: escuelas['Física'].id
    }
  });

  // Neurociencias y Comportamiento (Biología)
  await prisma.espacio.create({
    data: {
      nombre: 'Neurociencias y Comportamiento',
      tipo: 'LABORATORIO_INVESTIGACION',
      capacidad: 10,
      diasPermitidos: 'LUNES,MARTES,MIERCOLES,JUEVES,VIERNES',
      horaApertura: '08:00',
      horaCierre: '18:00',
      estado: 'ACTIVO',
      escuelaId: escuelas['Biología'].id
    }
  });

  // Petróleo, Hidrocarburos y Derivados (Química)
  await prisma.espacio.create({
    data: {
      nombre: 'Petróleo, Hidrocarburos y Derivados',
      tipo: 'LABORATORIO_INVESTIGACION',
      capacidad: 10,
      diasPermitidos: 'LUNES,MARTES,MIERCOLES,JUEVES,VIERNES',
      horaApertura: '08:00',
      horaCierre: '18:00',
      estado: 'ACTIVO',
      escuelaId: escuelas['Química'].id
    }
  });

  console.log('Espacios físicos creados con éxito.');
  console.log('Database Seeding completado con éxito.');
}

main()
  .catch((e) => {
    console.error('Error durante el seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
