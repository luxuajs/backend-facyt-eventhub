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

export async function findEscuelaByCarrera(carreraName) {
  if (!carreraName) return null;
  // Intento de coincidencia exacta
  let escuela = await prisma.escuela.findFirst({
    where: { nombre: { equals: carreraName, mode: 'insensitive' } }
  });
  if (escuela) return escuela;

  // Si no coincide exactamente, buscamos coincidencia singular/plural
  const searchNames = [carreraName];
  if (carreraName.toLowerCase().endsWith('s')) {
    searchNames.push(carreraName.slice(0, -1));
  } else {
    searchNames.push(carreraName + 's');
  }

  return prisma.escuela.findFirst({
    where: {
      nombre: {
        in: searchNames,
        mode: 'insensitive'
      }
    }
  });
}

// Retorna la prioridad numérica de 1 a 5 según el tipo de evento
export function getPriority(tipoEvento) {
  const t = tipoEvento.trim();
  if (t === 'Clase de Laboratorio') return 1;
  if (t === 'Clase Teórica') return 2;
  if (t === 'Defensa de tesis' || t === 'Jornada de Pasantias') return 3;
  if (t === 'Taller / Charla / Conversatorio' || t === 'Reunión institucional') return 4;
  if (t === 'Actividad Estudiantil') return 5;
  return 5; // Default por seguridad
}

// Sugerir espacios alternativos con capacidad suficiente cuando el espacio solicitado es muy pequeño
export async function generateCapacityAlternativeSuggestion(espacioNombre, capacidadActual, asistentesEstimados, espaciosDisponibles) {
  const bestAlternative = espaciosDisponibles[0];

  if (!genAI) {
    console.warn('[Gemini] API Key no configurada o por defecto. Usando fallback de capacidad.');
    return {
      sugerencia: bestAlternative
        ? `El espacio "${espacioNombre}" tiene capacidad para ${capacidadActual} personas, pero indicaste ${asistentesEstimados} asistentes. Te recomendamos cambiar la reserva a "${bestAlternative.nombre}" que cuenta con capacidad para ${bestAlternative.capacidad} personas y está disponible en ese horario.`
        : `El espacio "${espacioNombre}" (Capacidad: ${capacidadActual}) es insuficiente para ${asistentesEstimados} asistentes. No se encontraron otros espacios disponibles con aforo suficiente en este horario.`,
      espacioSugeridoId: bestAlternative ? bestAlternative.id : null,
      espacioSugeridoNombre: bestAlternative ? bestAlternative.nombre : null,
      fallback: true
    };
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

  const prompt = `
    Actúa como el asistente inteligente de FaCyT EventHub.
    Ha ocurrido un conflicto de capacidad al intentar solicitar una reserva:
    - Espacio solicitado: "${espacioNombre}" (Capacidad máxima: ${capacidadActual} personas)
    - Asistentes estimados: ${asistentesEstimados} personas

    Espacios con capacidad suficiente disponibles y libres en ese mismo horario:
    ${JSON.stringify(espaciosDisponibles, null, 2)}

    Tu tarea:
    1. Si hay espacios disponibles con aforo suficiente, selecciona el mejor (generalmente el de capacidad óptima más cercana a los asistentes) y redacta un mensaje muy amable, empático y profesional en español sugiriéndole al usuario cambiar su reserva a ese espacio.
    2. Si no hay espacios disponibles, explica con empatía la limitación de capacidad.
    3. Responde únicamente con un objeto JSON válido con este formato exacto:
    {
      "sugerencia": "Mensaje explicativo y empático recomendando la mejor opción de espacio",
      "espacioSugeridoId": "El ID del espacio recomendado (o null si no hay disponibles)",
      "espacioSugeridoNombre": "El nombre del espacio recomendado (o null si no hay disponibles)"
    }
  `;

  const apiCall = (async () => {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });
    return JSON.parse(result.response.text());
  })();

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Gemini API Timeout')), 4000)
  );

  try {
    return await Promise.race([apiCall, timeout]);
  } catch (error) {
    console.error('[Gemini] Excepción o Timeout en sugerencia de capacidad:', error.message);
    return {
      sugerencia: bestAlternative
        ? `El espacio "${espacioNombre}" (Capacidad: ${capacidadActual}) es insuficiente para ${asistentesEstimados} asistentes. Te sugerimos cambiar la reserva a "${bestAlternative.nombre}" (Capacidad: ${bestAlternative.capacidad}).`
        : `El espacio "${espacioNombre}" no cuenta con la capacidad requerida (${asistentesEstimados} personas).`,
      espacioSugeridoId: bestAlternative ? bestAlternative.id : null,
      espacioSugeridoNombre: bestAlternative ? bestAlternative.nombre : null,
      fallback: true
    };
  }
}

export async function buscarReasignacionEspacio(evento, espacioOriginal) {
  const candidatos = await prisma.espacio.findMany({
    where: {
      estado: 'ACTIVO',
      capacidad: { gte: evento.asistentesEstimados },
      id: { not: espacioOriginal.id }
    },
    include: { escuela: true },
    orderBy: { capacidad: 'asc' }
  });

  const targetDate = new Date(evento.fecha);
  targetDate.setUTCHours(0, 0, 0, 0);
  
  for (let offset = 0; offset <= 7; offset++) {
    const nextDate = new Date(targetDate);
    nextDate.setUTCDate(nextDate.getUTCDate() + offset);
    const dayIndex = nextDate.getUTCDay();
    const dayName = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][dayIndex];
    const dateStr = nextDate.toISOString().split('T')[0];

    const espaciosDisponibles = [];

    for (const esp of candidatos) {
      const allowedDays = esp.diasPermitidos.split(',');
      if (!allowedDays.includes(dayName)) continue;

      const openMin = parseTimeToMinutes(esp.horaApertura);
      const closeMin = parseTimeToMinutes(esp.horaCierre);
      const startMin = parseTimeToMinutes(evento.horaInicio);
      const endMin = parseTimeToMinutes(evento.horaFin);
      if (startMin < openMin || endMin > closeMin) continue;

      if ((evento.tipo === 'Clase de Laboratorio' || esp.tipo === 'LABORATORIO_INVESTIGACION') && esp.escuelaId && evento.usuario?.escuelaId !== esp.escuelaId) {
        continue;
      }

      const overlapping = await checkOverlap(esp.id, nextDate, evento.horaInicio, evento.horaFin, evento.id);
      if (!overlapping) {
         espaciosDisponibles.push({
           id: esp.id,
           nombre: esp.nombre,
           tipo: esp.tipo,
           capacidad: esp.capacidad,
           fechaSugerida: nextDate,
           horaInicioSugerida: evento.horaInicio,
           horaFinSugerida: evento.horaFin
         });
         if (espaciosDisponibles.length >= 3) return espaciosDisponibles;
      }
    }
    
    if (espaciosDisponibles.length > 0) {
       return espaciosDisponibles;
    }
  }

  return [];
}

export async function responderPropuestaReasignacion(eventoId, usuarioId, aceptar) {
  const evento = await prisma.evento.findUnique({
    where: { id: eventoId, usuarioId }
  });

  if (!evento || evento.estado !== 'PROPUESTA_CAMBIO') {
    throw new Error('Evento no encontrado o no tiene propuesta de cambio activa.');
  }

  if (aceptar) {
    return prisma.evento.update({
      where: { id: eventoId },
      data: {
        estado: 'APROBADO',
        espacioId: evento.espacioSugeridoId || evento.espacioId,
        fecha: evento.fechaSugerida || evento.fecha,
        horaInicio: evento.horaInicioSugerida || evento.horaInicio,
        horaFin: evento.horaFinSugerida || evento.horaFin,
        espacioSugeridoId: null,
        fechaSugerida: null,
        horaInicioSugerida: null,
        horaFinSugerida: null,
        sugerenciaIA: null,
        motivoPropuesta: null
      }
    });
  } else {
    return prisma.evento.update({
      where: { id: eventoId },
      data: {
        estado: 'CANCELADO',
        espacioSugeridoId: null,
        fechaSugerida: null,
        horaInicioSugerida: null,
        horaFinSugerida: null,
        sugerenciaIA: null,
        motivoPropuesta: null
      }
    });
  }
}

// Valida capacidad, exclusividad de escuela y rango de funcionamiento del espacio
export async function validateRequest(usuario, espacioId, tipo, asistentesEstimados, fecha, horaInicio, horaFin, carrera = null) {
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

  // Validación de restricciones de espacio según usuario.tipoUsuario
  if (usuario) {
    const tipoUsuario = usuario.tipoUsuario;
    const rol = usuario.rol;

    if (rol !== 'ROOT' && tipoUsuario !== 'PROFESOR' && tipoUsuario !== 'COORDINADOR') {
      if (tipoUsuario === 'ESTUDIANTE') {
        if (espacio.tipo !== 'SALON') {
          throw new Error('Los estudiantes solo tienen permitido reservar Aulas de Clases Teóricas.');
        }
      } else if (tipoUsuario === 'GRUPO_EXTERNO') {
        if (espacio.tipo !== 'SALON' && espacio.tipo !== 'AUDITORIO') {
          throw new Error('Los Grupos Externos solo tienen permitido reservar el Auditorio Ninoska Maneiro o Aulas de Clases Teóricas.');
        }
      }
    }
  }

  // 1. Validación de capacidad para cualquier tipo de evento
  if (asistentesEstimados > espacio.capacidad) {
    throw new Error(`La capacidad del salón (${espacio.capacidad}) es insuficiente para los asistentes estimados (${asistentesEstimados}).`);
  }

  // 2. Validación de exclusividad por Escuela para laboratorios de docencia y laboratorios de investigación
  if (tipo === 'Clase de Laboratorio' || espacio.tipo === 'LABORATORIO_INVESTIGACION') {
    if (espacio.escuelaId) {
      let matchesSchool = usuario.escuelaId === espacio.escuelaId;

      if (!matchesSchool && carrera) {
        const escuelaCarrera = await findEscuelaByCarrera(carrera);
        if (escuelaCarrera && escuelaCarrera.id === espacio.escuelaId) {
          matchesSchool = true;
        }
      }

      if (!matchesSchool) {
        throw new Error(`El laboratorio "${espacio.nombre}" es de uso exclusivo para la escuela de ${espacio.escuela?.nombre || 'la misma escuela'}.`);
      }
    }
  }

  // 2b. Validación de fecha (mismo día o fechas futuras)
  const [reqYear, reqMonth, reqDay] = fecha.split('-').map(Number);
  const requestedDate = new Date(reqYear, reqMonth - 1, reqDay);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (requestedDate < today) {
    throw new Error('No se pueden realizar reservas para fechas pasadas. Seleccioná la fecha de hoy o una fecha futura.');
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

// Verifica si existe algún evento APROBADO o PROPUESTA_CAMBIO (reasignación pre-reservada) que colisione con el nuevo horario
export async function checkOverlap(espacioId, fecha, horaInicio, horaFin, excludeEventoId = null) {
  const targetDate = new Date(fecha);
  targetDate.setUTCHours(0, 0, 0, 0);

  // 1. Buscar evento APROBADO en el espacio principal
  const whereApproved = {
    espacioId,
    estado: 'APROBADO',
    fecha: targetDate,
    AND: [
      { horaInicio: { lt: horaFin } },
      { horaFin: { gt: horaInicio } }
    ]
  };

  if (excludeEventoId) {
    whereApproved.id = { not: excludeEventoId };
  }

  const overlappingApproved = await prisma.evento.findFirst({
    where: whereApproved
  });

  if (overlappingApproved) {
    return {
      ...overlappingApproved,
      conflictType: 'APPROVED'
    };
  }

  // 2. Buscar eventos en PROPUESTA_CAMBIO que tengan sugerido este espacio
  const proposedEvents = await prisma.evento.findMany({
    where: {
      estado: 'PROPUESTA_CAMBIO',
      espacioSugeridoId: espacioId
    }
  });

  const overlappingProposed = proposedEvents.find(evt => {
    if (excludeEventoId && evt.id === excludeEventoId) return false;

    // Determinar la fecha propuesta de reasignación (sugerida o la original del evento)
    const proposedDate = evt.fechaSugerida ? new Date(evt.fechaSugerida) : new Date(evt.fecha);
    proposedDate.setUTCHours(0, 0, 0, 0);
    if (proposedDate.getTime() !== targetDate.getTime()) return false;

    // Determinar el horario propuesto de reasignación (sugerido o el original del evento)
    const proposedStart = evt.horaInicioSugerida || evt.horaInicio;
    const proposedEnd = evt.horaFinSugerida || evt.horaFin;

    // Comprobar solapamiento de tiempo
    return proposedStart < horaFin && proposedEnd > horaInicio;
  });

  if (overlappingProposed) {
    return {
      ...overlappingProposed,
      conflictType: 'PROPOSED_REASSIGNMENT'
    };
  }

  return null;
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

// Busca espacios alternativos de mayor capacidad que estén disponibles en el horario solicitado
export async function findAlternativeSpacesForCapacity(usuario, espacioSolicitado, tipo, asistentesEstimados, fecha, horaInicio, horaFin) {
  const candidatos = await prisma.espacio.findMany({
    where: {
      estado: 'ACTIVO',
      capacidad: { gte: asistentesEstimados },
      id: { not: espacioSolicitado.id }
    },
    include: { escuela: true },
    orderBy: { capacidad: 'asc' }
  });

  const targetDate = new Date(fecha);
  const dayIndex = targetDate.getUTCDay();
  const dayName = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][dayIndex];
  const startMin = parseTimeToMinutes(horaInicio);
  const endMin = parseTimeToMinutes(horaFin);

  const espaciosDisponibles = [];

  for (const esp of candidatos) {
    const allowedDays = esp.diasPermitidos.split(',');
    if (!allowedDays.includes(dayName)) continue;

    const openMin = parseTimeToMinutes(esp.horaApertura);
    const closeMin = parseTimeToMinutes(esp.horaCierre);
    if (startMin < openMin || endMin > closeMin) continue;

    if ((tipo === 'Clase de Laboratorio' || esp.tipo === 'LABORATORIO_INVESTIGACION') && esp.escuelaId && usuario.escuelaId !== esp.escuelaId) {
      continue;
    }

    const overlapping = await checkOverlap(esp.id, fecha, horaInicio, horaFin);
    if (!overlapping) {
      espaciosDisponibles.push({
        id: esp.id,
        nombre: esp.nombre,
        tipo: esp.tipo,
        capacidad: esp.capacidad,
        escuelaNombre: esp.escuela?.nombre || null
      });

      if (espaciosDisponibles.length >= 3) break;
    }
  }

  return espaciosDisponibles;
}

// Busca alternativas estructuradas para el solicitante ante un conflicto de reserva:
// 1. Mismo día, diferente horario (en el mismo espacio o espacios compatibles: Salón / Aula o Lab)
// 2. Mismo horario, diferente lugar (Salón o Lab con capacidad >= asistentes)
// 3. Otros días de la semana
export async function findApplicantConflictAlternatives(usuario, espacioSolicitado, tipo, asistentesEstimados, fecha, horaInicio, horaFin) {
  const targetDate = new Date(fecha);
  const durationMins = parseTimeToMinutes(horaFin) - parseTimeToMinutes(horaInicio);
  const dayIndex = targetDate.getUTCDay();
  const dayName = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][dayIndex];
  const startMin = parseTimeToMinutes(horaInicio);
  const endMin = parseTimeToMinutes(horaFin);

  // Obtener espacios activos compatibles (Salones, Labs de docencia y Auditorio si aplica)
  const candidatos = await prisma.espacio.findMany({
    where: {
      estado: 'ACTIVO',
      capacidad: { gte: asistentesEstimados },
      tipo: { in: ['SALON', 'LABORATORIO_DOCENCIA', 'AUDITORIO'] }
    },
    include: { escuela: true },
    orderBy: { capacidad: 'asc' }
  });

  // Filtrar según exclusividad por escuela si es laboratorio
  const espaciosCompatibles = candidatos.filter(esp => {
    const esLab = esp.tipo.startsWith('LABORATORIO');
    if ((tipo === 'Clase de Laboratorio' || esLab) && esp.escuelaId && usuario.escuelaId !== esp.escuelaId) {
      return false;
    }
    return true;
  });

  // --- OPCIÓN 1: Mismo día, diferente horario ---
  const mismoDiaBloques = [];
  for (const esp of espaciosCompatibles) {
    const allowedDays = esp.diasPermitidos.split(',');
    if (!allowedDays.includes(dayName)) continue;

    const openMin = parseTimeToMinutes(esp.horaApertura);
    const closeMin = parseTimeToMinutes(esp.horaCierre);

    const approvedEvents = await prisma.evento.findMany({
      where: {
        espacioId: esp.id,
        estado: 'APROBADO',
        fecha: targetDate
      },
      orderBy: { horaInicio: 'asc' }
    });

    let curr = openMin;
    while (curr + durationMins <= closeMin) {
      const sMin = curr;
      const eMin = curr + durationMins;

      // No sugerir el bloque exacto del conflicto
      if (!(sMin === startMin && eMin === endMin)) {
        const hasOverlap = approvedEvents.some(event => {
          const evStart = parseTimeToMinutes(event.horaInicio);
          const evEnd = parseTimeToMinutes(event.horaFin);
          return sMin < evEnd && eMin > evStart;
        });

        if (!hasOverlap) {
          mismoDiaBloques.push({
            espacioId: esp.id,
            espacioNombre: esp.nombre,
            espacioTipo: esp.tipo,
            capacidad: esp.capacidad,
            fecha: fecha,
            horaInicio: formatMinutesToTime(sMin),
            horaFin: formatMinutesToTime(eMin),
            esMismoEspacio: esp.id === espacioSolicitado.id
          });
          if (mismoDiaBloques.length >= 3) break;
        }
      }
      curr += 30; // Bloques de 30 minutos
    }
    if (mismoDiaBloques.length >= 3) break;
  }

  // --- OPCIÓN 2: Mismo horario solicitado, diferente lugar (Salón o Lab) ---
  const mismoHorarioLugares = [];
  for (const esp of espaciosCompatibles) {
    if (esp.id === espacioSolicitado.id) continue;

    const allowedDays = esp.diasPermitidos.split(',');
    if (!allowedDays.includes(dayName)) continue;

    const openMin = parseTimeToMinutes(esp.horaApertura);
    const closeMin = parseTimeToMinutes(esp.horaCierre);
    if (startMin < openMin || endMin > closeMin) continue;

    const overlapping = await checkOverlap(esp.id, fecha, horaInicio, horaFin);
    if (!overlapping) {
      mismoHorarioLugares.push({
        espacioId: esp.id,
        espacioNombre: esp.nombre,
        espacioTipo: esp.tipo,
        capacidad: esp.capacidad,
        escuelaNombre: esp.escuela?.nombre || null,
        fecha: fecha,
        horaInicio: horaInicio,
        horaFin: horaFin
      });
      if (mismoHorarioLugares.length >= 3) break;
    }
  }

  // --- OPCIÓN 3: Otros días de la semana ---
  const otrosDiasBloques = [];
  for (let offset = 1; offset <= 14; offset++) {
    const nextDate = new Date(targetDate);
    nextDate.setUTCDate(nextDate.getUTCDate() + offset);

    const nextDayIndex = nextDate.getUTCDay();
    const nextDayName = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][nextDayIndex];
    const nextDateStr = nextDate.toISOString().split('T')[0];

    for (const esp of espaciosCompatibles) {
      const allowedDays = esp.diasPermitidos.split(',');
      if (!allowedDays.includes(nextDayName)) continue;

      const openMin = parseTimeToMinutes(esp.horaApertura);
      const closeMin = parseTimeToMinutes(esp.horaCierre);
      if (startMin < openMin || endMin > closeMin) continue;

      const overlapping = await checkOverlap(esp.id, nextDateStr, horaInicio, horaFin);
      if (!overlapping) {
        otrosDiasBloques.push({
          espacioId: esp.id,
          espacioNombre: esp.nombre,
          espacioTipo: esp.tipo,
          capacidad: esp.capacidad,
          fecha: nextDateStr,
          diaNombre: nextDayName,
          horaInicio: horaInicio,
          horaFin: horaFin
        });
        if (otrosDiasBloques.length >= 3) break;
      }
    }
    if (otrosDiasBloques.length >= 3) break;
  }

  return {
    mismoDiaBloques,
    mismoHorarioLugares,
    otrosDiasBloques
  };
}

// Sugerencia automática inteligente basada en el tipo de evento, carrera, materia, aforo y disponibilidad
export async function getAutomatedSpaceSuggestions({
  tipo,
  carrera,
  materia,
  asistentesEstimados,
  fecha,
  horaInicio,
  horaFin
}) {
  const numAsistentes = parseInt(asistentesEstimados) || 0;
  const targetDate = new Date(fecha);
  const dayIndex = targetDate.getUTCDay();
  const dayName = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][dayIndex];
  const startMin = parseTimeToMinutes(horaInicio);
  const endMin = parseTimeToMinutes(horaFin);

  let escuelaTarget = null;
  if (carrera) {
    escuelaTarget = await findEscuelaByCarrera(carrera);
  }

  // Helper para ordenar un arreglo por aforo más cercano a numAsistentes
  const sortByClosestCapacity = (list) => {
    return [...list].sort((a, b) => Math.abs(a.capacidad - numAsistentes) - Math.abs(b.capacidad - numAsistentes));
  };

  // CASO ESPECIAL: Clase de Laboratorio - Validación estricta de aforo e imposibilidad de exceder capacidad
  if (tipo === 'Clase de Laboratorio') {
    const labsCarrera = await prisma.espacio.findMany({
      where: {
        estado: 'ACTIVO',
        tipo: { in: ['LABORATORIO_DOCENCIA', 'LABORATORIO_INVESTIGACION'] },
        ...(escuelaTarget ? { escuelaId: escuelaTarget.id } : {})
      },
      include: { escuela: true }
    });

    const maxCapacidadLab = labsCarrera.reduce((max, l) => Math.max(max, l.capacidad), 0);

    if (labsCarrera.length > 0 && numAsistentes > maxCapacidadLab) {
      return {
        mejorOpcion: null,
        opcionesSugeridas: [],
        advertenciaAforo: `La cantidad de asistentes solicitada (${numAsistentes}) supera el aforo máximo de los laboratorios de la carrera (${maxCapacidadLab} personas). Para clases de laboratorio, se debe reducir el grupo de estudiantes o dividir la sección.`
      };
    }
  }

  // Obtener todos los espacios activos que tengan capacidad suficiente
  const todosEspacios = await prisma.espacio.findMany({
    where: { estado: 'ACTIVO', capacidad: { gte: numAsistentes } },
    include: { escuela: true }
  });

  const espaciosValidos = [];
  for (const esp of todosEspacios) {
    const allowedDays = esp.diasPermitidos.split(',');
    if (!allowedDays.includes(dayName)) continue;

    const openMin = parseTimeToMinutes(esp.horaApertura);
    const closeMin = parseTimeToMinutes(esp.horaCierre);
    if (startMin < openMin || endMin > closeMin) continue;

    const overlap = await checkOverlap(esp.id, fecha, horaInicio, horaFin);
    if (!overlap) {
      espaciosValidos.push(esp);
    }
  }

  let candidatosOrdenados = [];

  if (tipo === 'Clase de Laboratorio') {
    // Laboratorios de la misma carrera
    const labsCarreraLibres = espaciosValidos.filter(e =>
      e.tipo.startsWith('LABORATORIO') &&
      escuelaTarget && e.escuelaId === escuelaTarget.id
    );

    // Si se especificó materia, buscar matcheo por materias asociadas o nombre
    if (materia && materia.trim()) {
      const matClean = materia.trim().toLowerCase();
      const labsMatcheados = labsCarreraLibres.filter(e =>
        (e.materias && e.materias.toLowerCase().includes(matClean)) ||
        (e.nombre && e.nombre.toLowerCase().includes(matClean))
      );
      const otrosLabs = labsCarreraLibres.filter(e => !labsMatcheados.includes(e));

      candidatosOrdenados = [
        ...sortByClosestCapacity(labsMatcheados),
        ...sortByClosestCapacity(otrosLabs)
      ];
    } else {
      candidatosOrdenados = sortByClosestCapacity(labsCarreraLibres);
    }
  } else if (tipo === 'Clase Teórica') {
    // 1. Aulas (SALON) de la misma carrera
    const salonesMismaCarrera = sortByClosestCapacity(espaciosValidos.filter(e =>
      e.tipo === 'SALON' && escuelaTarget && e.escuelaId === escuelaTarget.id
    ));
    // 2. Laboratorios (docencia / investigación) de la misma carrera
    const labsMismaCarrera = sortByClosestCapacity(espaciosValidos.filter(e =>
      e.tipo.startsWith('LABORATORIO') && escuelaTarget && e.escuelaId === escuelaTarget.id
    ));
    // 3. Aulas (SALON) de otras carreras
    const salonesOtrasCarreras = sortByClosestCapacity(espaciosValidos.filter(e =>
      e.tipo === 'SALON' && (!escuelaTarget || e.escuelaId !== escuelaTarget.id)
    ));

    candidatosOrdenados = [...salonesMismaCarrera, ...labsMismaCarrera, ...salonesOtrasCarreras];
  } else if (tipo === 'Defensa de tesis') {
    // Exclusivamente Auditorio
    const auditoriosLibres = sortByClosestCapacity(espaciosValidos.filter(e => e.tipo === 'AUDITORIO'));
    candidatosOrdenados = auditoriosLibres;

    // Si no hay auditorio libre en ese horario, buscar alternativas de horario/día en el Auditorio
    if (auditoriosLibres.length === 0) {
      const auditorioObj = await prisma.espacio.findFirst({
        where: { tipo: 'AUDITORIO', estado: 'ACTIVO' }
      });

      let alternativasAuditorio = [];
      if (auditorioObj) {
        alternativasAuditorio = await findSameSpaceConflictAlternatives(auditorioObj, fecha, horaInicio, horaFin);
      }

      const sugerencias = [];
      return {
        mejorOpcion: null,
        opcionesSugeridas: [],
        alternativasAuditorio,
        advertenciaDefensa: 'Las defensas de tesis deben realizarse únicamente en el Auditorio. No hay disponibilidad en la fecha y hora seleccionadas, pero se sugieren horarios y días alternativos.'
      };
    }
  } else if (tipo === 'Taller / Charla / Conversatorio' || tipo === 'Reunión institucional' || tipo === 'Jornada de Pasantias') {
    // 1. Auditorios
    const auditorios = sortByClosestCapacity(espaciosValidos.filter(e => e.tipo === 'AUDITORIO'));
    // 2. Aulas (SALON)
    const salones = sortByClosestCapacity(espaciosValidos.filter(e => e.tipo === 'SALON'));

    candidatosOrdenados = [...auditorios, ...salones];
  } else if (tipo === 'Actividad Estudiantil') {
    // Exclusivamente Aulas (SALON)
    candidatosOrdenados = sortByClosestCapacity(espaciosValidos.filter(e => e.tipo === 'SALON'));
  } else {
    candidatosOrdenados = sortByClosestCapacity(espaciosValidos);
  }

  const sugerencias = candidatosOrdenados.slice(0, 3).map(e => ({
    id: e.id,
    nombre: e.nombre,
    tipo: e.tipo,
    capacidad: e.capacidad,
    materias: e.materias || null,
    escuelaNombre: e.escuela?.nombre || null
  }));

  return {
    mejorOpcion: sugerencias[0] || null,
    opcionesSugeridas: sugerencias
  };
}

// CASO 1 ELECCIÓN PERSONAL: Espacio ocupado -> Sugerir horario posterior o día diferente en ESE MISMO ESPACIO
export async function findSameSpaceConflictAlternatives(espacio, fecha, horaInicio, horaFin) {
  const targetDate = new Date(fecha);
  const durationMins = parseTimeToMinutes(horaFin) - parseTimeToMinutes(horaInicio);
  const openMin = parseTimeToMinutes(espacio.horaApertura);
  const closeMin = parseTimeToMinutes(espacio.horaCierre);

  const alternativasMismoEspacio = [];

  // 1. Horario posterior en el mismo día
  const approvedEventsToday = await prisma.evento.findMany({
    where: {
      espacioId: espacio.id,
      estado: 'APROBADO',
      fecha: targetDate
    },
    orderBy: { horaInicio: 'asc' }
  });

  const reqStartMin = parseTimeToMinutes(horaInicio);
  let currMin = reqStartMin + 30; // Buscar desde 30 mins después de la hora solicitada

  while (currMin + durationMins <= closeMin && alternativasMismoEspacio.length < 2) {
    const sMin = currMin;
    const eMin = currMin + durationMins;

    const hasOverlap = approvedEventsToday.some(ev => {
      const evStart = parseTimeToMinutes(ev.horaInicio);
      const evEnd = parseTimeToMinutes(ev.horaFin);
      return sMin < evEnd && eMin > evStart;
    });

    if (!hasOverlap) {
      alternativasMismoEspacio.push({
        tipoAlternativa: 'HORARIO_POSTERIOR',
        espacioId: espacio.id,
        espacioNombre: espacio.nombre,
        fecha: fecha,
        horaInicio: formatMinutesToTime(sMin),
        horaFin: formatMinutesToTime(eMin),
        descripcion: `Mismo espacio (${espacio.nombre}), horario posterior (${formatMinutesToTime(sMin)} - ${formatMinutesToTime(eMin)})`
      });
    }
    currMin += 30;
  }

  // 2. Día diferente en el mismo horario y espacio
  const allowedDays = espacio.diasPermitidos.split(',');
  for (let offset = 1; offset <= 14; offset++) {
    if (alternativasMismoEspacio.length >= 3) break;

    const nextDate = new Date(targetDate);
    nextDate.setUTCDate(nextDate.getUTCDate() + offset);

    const dayIndex = nextDate.getUTCDay();
    const dayName = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][dayIndex];
    if (!allowedDays.includes(dayName)) continue;

    const nextDateStr = nextDate.toISOString().split('T')[0];
    const overlapping = await checkOverlap(espacio.id, nextDateStr, horaInicio, horaFin);

    if (!overlapping) {
      alternativasMismoEspacio.push({
        tipoAlternativa: 'DIA_DIFERENTE',
        espacioId: espacio.id,
        espacioNombre: espacio.nombre,
        fecha: nextDateStr,
        diaNombre: dayName,
        horaInicio: horaInicio,
        horaFin: horaFin,
        descripcion: `Mismo espacio (${espacio.nombre}) el día ${nextDateStr} (${dayName}) de ${horaInicio} a ${horaFin}`
      });
    }
  }

  return alternativasMismoEspacio;
}

// CASO 2 ELECCIÓN PERSONAL: Espacio fuera de servicio -> Informar e indicar las 3 mejores alternativas
export async function findDisabledSpaceAlternatives(tipo, carrera, asistentesEstimados, fecha, horaInicio, horaFin) {
  const suggestions = await getAutomatedSpaceSuggestions({
    tipo,
    carrera,
    asistentesEstimados,
    fecha,
    horaInicio,
    horaFin
  });
  return suggestions.opcionesSugeridas;
}



