import prisma from '../config/db.js';

export function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export function formatMinutesToTime(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

// Retorna la prioridad numérica de 1 a 5 según el tipo de evento (PRD.md)
export function getPriority(tipoEvento) {
  const t = tipoEvento.trim();
  if (t === 'Clase de Laboratorio') return 1;
  if (t === 'Clase Teórica') return 2;
  if (t === 'Defensa de Tesis / Jornada de Pasantías') return 3;
  if (t === 'Reunión Institucional / Actividad Estudiantil') return 4;
  if (t === 'Taller / Charla / Conversatorio') return 5;
  return 5; // Default por seguridad
}

// Valida capacidad, exclusividad de escuela y rango de funcionamiento del espacio
export async function validateRequest(usuario, espacioId, tipo, asistentesEstimados, fecha, horaInicio, horaFin) {
  const espacio = await prisma.espacio.findUnique({
    where: { id: espacioId },
    include: { escuela: true }
  });

  if (!espacio) {
    throw new Error('El espacio solicitado no existe.');
  }

  if (espacio.estado !== 'ACTIVO') {
    throw new Error(`El espacio solicitado no está activo (Estado actual: ${espacio.estado}).`);
  }

  // 1. Validación de capacidad para Clase Teórica
  if (tipo === 'Clase Teórica' && asistentesEstimados > espacio.capacidad) {
    throw new Error(`La capacidad del salón (${espacio.capacidad}) es insuficiente para los asistentes estimados (${asistentesEstimados}).`);
  }

  // 2. Validación de exclusividad por Escuela para laboratorios de docencia y laboratorios de investigación
  if (tipo === 'Clase de Laboratorio') {
    if (espacio.escuelaId && usuario.escuelaId !== espacio.escuelaId) {
      throw new Error(`El laboratorio "${espacio.nombre}" es de uso exclusivo para la escuela de ${espacio.escuela?.nombre || 'la misma escuela'}.`);
    }
  }

  if (espacio.tipo === 'LABORATORIO_INVESTIGACION') {
    if (espacio.escuelaId && usuario.escuelaId !== espacio.escuelaId) {
      throw new Error(`El laboratorio de investigación "${espacio.nombre}" es de uso exclusivo para la escuela de ${espacio.escuela?.nombre || 'la misma escuela'}.`);
    }
  }

  // 3. Validación de días permitidos
  const targetDate = new Date(fecha);
  const dayIndex = targetDate.getUTCDay();
  const dayName = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][dayIndex];
  const allowedDays = espacio.diasPermitidos.split(',');
  if (!allowedDays.includes(dayName)) {
    throw new Error(`El espacio "${espacio.nombre}" no labora en el día solicitado (${dayName}).`);
  }

  // 4. Validación de rango de horas de apertura y cierre
  const startMin = parseTimeToMinutes(horaInicio);
  const endMin = parseTimeToMinutes(horaFin);
  const openMin = parseTimeToMinutes(espacio.horaApertura);
  const closeMin = parseTimeToMinutes(espacio.horaCierre);

  if (startMin >= endMin) {
    throw new Error('La hora de inicio debe ser anterior a la hora de fin.');
  }

  if (startMin < openMin || endMin > closeMin) {
    throw new Error(`El horario solicitado (${horaInicio} - ${horaFin}) está fuera del horario de funcionamiento del espacio (${espacio.horaApertura} - ${espacio.horaCierre}).`);
  }

  return espacio;
}

// Verifica si existe algún evento APROBADO que colisione con el nuevo horario
export async function checkOverlap(espacioId, fecha, horaInicio, horaFin) {
  const targetDate = new Date(fecha);
  targetDate.setUTCHours(0, 0, 0, 0);

  const overlappingEvent = await prisma.evento.findFirst({
    where: {
      espacioId,
      estado: 'APROBADO',
      fecha: targetDate,
      AND: [
        { horaInicio: { lt: horaFin } },
        { horaFin: { gt: horaInicio } }
      ]
    }
  });

  return overlappingEvent;
}

// Busca los siguientes 3 bloques de tiempo libres para el espacio
export async function findNextAvailableSlots(espacio, startDate, durationMins) {
  const slots = [];
  const start = new Date(startDate);
  start.setUTCHours(0, 0, 0, 0);

  const openMin = parseTimeToMinutes(espacio.horaApertura);
  const closeMin = parseTimeToMinutes(espacio.horaCierre);
  const allowedDays = espacio.diasPermitidos.split(',');

  // Buscaremos en los próximos 30 días
  for (let offset = 0; offset < 30; offset++) {
    const current = new Date(start);
    current.setUTCDate(current.getUTCDate() + offset);

    const dayIndex = current.getUTCDay();
    const dayName = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][dayIndex];
    if (!allowedDays.includes(dayName)) continue;

    // Obtener los eventos aprobados de ese día para el espacio
    const approvedEvents = await prisma.evento.findMany({
      where: {
        espacioId: espacio.id,
        estado: 'APROBADO',
        fecha: current
      },
      orderBy: { horaInicio: 'asc' }
    });

    let currentMin = openMin;
    // Buscamos bloques libres secuenciales
    while (currentMin + durationMins <= closeMin) {
      const slotStart = currentMin;
      const slotEnd = currentMin + durationMins;

      // Verificar si solapa con algún evento aprobado
      const hasOverlap = approvedEvents.some(event => {
        const evStart = parseTimeToMinutes(event.horaInicio);
        const evEnd = parseTimeToMinutes(event.horaFin);
        return slotStart < evEnd && slotEnd > evStart;
      });

      if (!hasOverlap) {
        slots.push({
          fecha: current.toISOString().split('T')[0],
          horaInicio: formatMinutesToTime(slotStart),
          horaFin: formatMinutesToTime(slotEnd)
        });

        if (slots.length >= 3) {
          return slots;
        }
      }

      // Avanzamos de hora en hora para obtener diferentes alternativas
      currentMin += 60;
    }
  }

  return slots;
}
