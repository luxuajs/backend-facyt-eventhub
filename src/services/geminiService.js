import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

let genAI = null;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'tu_api_key_de_gemini') {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

export async function generateAlternativeSuggestion(espacioNombre, conflictDetails, structuredAlternatives) {
  const { mismoDiaBloques = [], mismoHorarioLugares = [], otrosDiasBloques = [] } = structuredAlternatives || {};

  const bestOption = mismoDiaBloques[0] || mismoHorarioLugares[0] || otrosDiasBloques[0] || {};

  let fallbackText = `El espacio "${espacioNombre}" presenta un conflicto en el horario solicitado (${conflictDetails.horaInicio} - ${conflictDetails.horaFin}). `;

  if (mismoDiaBloques.length > 0) {
    fallbackText += `Te sugerimos cambiar la hora el mismo día (${conflictDetails.fecha}) a las ${mismoDiaBloques[0].horaInicio} - ${mismoDiaBloques[0].horaFin} en ${mismoDiaBloques[0].espacioNombre}.`;
  } else if (mismoHorarioLugares.length > 0) {
    fallbackText += `Te sugerimos realizar la clase a la misma hora en el espacio alternativo "${mismoHorarioLugares[0].espacioNombre}" (${mismoHorarioLugares[0].espacioTipo === 'SALON' ? 'Aula' : 'Laboratorio'}, Capacidad: ${mismoHorarioLugares[0].capacidad}).`;
  } else if (otrosDiasBloques.length > 0) {
    fallbackText += `Te sugerimos reagendar para el día ${otrosDiasBloques[0].fecha} (${otrosDiasBloques[0].diaNombre}) a las ${otrosDiasBloques[0].horaInicio} en ${otrosDiasBloques[0].espacioNombre}.`;
  } else {
    fallbackText += `No se encontraron bloques u otros espacios libres cercanos. Te sugerimos seleccionar otra fecha u horario.`;
  }

  const defaultResult = {
    sugerencia: fallbackText,
    fechaPropuesta: bestOption.fecha || conflictDetails.fecha,
    horaInicioPropuesta: bestOption.horaInicio || conflictDetails.horaInicio,
    horaFinPropuesta: bestOption.horaFin || conflictDetails.horaFin,
    espacioPropuestoId: bestOption.espacioId || null,
    espacioPropuestoNombre: bestOption.espacioNombre || null,
    fallback: true
  };

  if (!genAI) {
    console.warn('[Gemini] API Key no configurada o por defecto. Usando fallback de alternativas estructuradas.');
    return defaultResult;
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

  const prompt = `
    Actúa como el asistente del sistema de FaCyT EventHub.
    Ocurrió un conflicto al solicitar reserva para el espacio físico: "${espacioNombre}".
    
    Detalles de la solicitud:
    - Fecha solicitada: ${conflictDetails.fecha}
    - Horario: ${conflictDetails.horaInicio} - ${conflictDetails.horaFin}
    - Causa del conflicto: ${conflictDetails.reason}

    Regla clave de negocio: Toda clase puede realizarse en un Aula (Salón) o en un Laboratorio de Docencia donde quepan los estudiantes.

    Alternativas disponibles en el sistema ordenadas por prioridad:
    1. Mismo día con diferente horario (en el mismo espacio u otro compatible):
    ${JSON.stringify(mismoDiaBloques, null, 2)}

    2. Mismo horario solicitado con diferente lugar (Aula o Laboratorio compatible con aforo):
    ${JSON.stringify(mismoHorarioLugares, null, 2)}

    3. Otros días de la semana:
    ${JSON.stringify(otrosDiasBloques, null, 2)}

    Tu tarea:
    1. Redacta una explicación amigable, empática, clara e intuitiva para el solicitante.
    2. Presenta de forma clara las opciones: primero cambiar de hora el mismo día o cambiar de lugar (aula/laboratorio) a la hora solicitada; de no ser factibles, recomienda opciones en otros días de la semana. No uses nunca las palabras "IA", "Gemini", "Inteligencia Artificial", "algoritmo" o similares.
    3. Selecciona la opción más conveniente como propuesta principal.
    4. Responde únicamente con un objeto JSON válido con este formato exacto:
    {
      "sugerencia": "Texto explicativo e intuitivo con las alternativas recomendadas",
      "fechaPropuesta": "YYYY-MM-DD de la opción principal",
      "horaInicioPropuesta": "HH:MM de la opción principal",
      "horaFinPropuesta": "HH:MM de la opción principal",
      "espacioPropuestoId": "ID del espacio propuesto (o null si es el mismo)",
      "espacioPropuestoNombre": "Nombre del espacio propuesto (o null si es el mismo)"
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
    console.error('[Gemini] Excepción o Timeout en recomendación de alternativas estructuradas:', error.message);
    return defaultResult;
  }
}

// Analizar una solicitud para el Coordinador y sugerir un espacio alternativo optimizado
export async function generateCoordinatorAdvice(evento, espaciosCompatibles) {
  const bestAlternative = espaciosCompatibles.find(e => e.id !== evento.espacioId) || espaciosCompatibles[0];

  if (!genAI) {
    return {
      recomendacion: bestAlternative && bestAlternative.id !== evento.espacioId
        ? `El evento "${evento.titulo}" (${evento.tipo}, ${evento.asistentesEstimados} asistentes) solicitó "${evento.espacio.nombre}". Se recomienda reasignar a "${bestAlternative.nombre}" (Capacidad: ${bestAlternative.capacidad}) para optimizar el uso de áreas.`
        : `El espacio solicitado "${evento.espacio.nombre}" cumple con los requisitos del evento. Puedes aprobar directamente.`,
      espacioSugeridoId: bestAlternative ? bestAlternative.id : null,
      espacioSugeridoNombre: bestAlternative ? bestAlternative.nombre : null,
      fallback: true
    };
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

  const prompt = `
    Actúa como el asistente de coordinación de FaCyT EventHub.
    Estás analizando una solicitud de reserva pendiente en la cola de aprobación.

    Datos del Evento Solicitado:
    - Título: ${evento.titulo}
    - Tipo: ${evento.tipo}
    - Asistentes Estimados: ${evento.asistentesEstimados}
    - Espacio Solicitado Actualmente: ${evento.espacio.nombre} (Tipo: ${evento.espacio.tipo}, Capacidad: ${evento.espacio.capacidad})
    - Fecha y Horario: ${evento.fecha.toISOString().split('T')[0]} (${evento.horaInicio} - ${evento.horaFin})

    Espacios alternativos compatibles y disponibles en el sistema:
    ${JSON.stringify(espaciosCompatibles.map(e => ({ id: e.id, nombre: e.nombre, tipo: e.tipo, capacidad: e.capacidad })), null, 2)}

    Tu objetivo:
    1. Si es "Defensa de tesis", debe realizarse ÚNICAMENTE en el Auditorio. Jamás recomiendes cambiar una tesis a un aula o laboratorio.
    2. Si es "Clase de Laboratorio", debe asignarse únicamente a un laboratorio de la carrera. Si los asistentes exceden la capacidad del lab, indica que se debe dividir la sección o reducir el grupo.
    3. Si es "Clase Teórica", recomienda trasladar a un Aula/Salón (SALON) de la propia carrera con aforo óptimo para liberar el Auditorio o Laboratorios para sus usos especializados.
    4. Si es "Taller / Charla / Conversatorio" o "Reunión institucional", prioriza el Auditorio y como segunda opción un Aula con aforo adecuado.
    5. No uses nunca las palabras "IA", "Gemini", "Inteligencia Artificial", "algoritmo" o similares en tu recomendación.
    6. Responde únicamente con un JSON válido en este formato exacto:
    {
      "recomendacion": "Explicación ejecutiva y clara para el coordinador en español recomendando si conviene proponer cambio de espacio y por qué",
      "espacioSugeridoId": "El ID del espacio recomendado (o null si el espacio actual es óptimo)",
      "espacioSugeridoNombre": "El nombre del espacio recomendado (o null si el actual es óptimo)"
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
    console.error('[Gemini] Error o Timeout en recomendación de coordinador:', error.message);
    return {
      recomendacion: bestAlternative && bestAlternative.id !== evento.espacioId
        ? `Considera reasignar "${evento.titulo}" a "${bestAlternative.nombre}" (Capacidad: ${bestAlternative.capacidad}) para liberar el espacio solicitado.`
        : `El espacio "${evento.espacio.nombre}" es adecuado para esta actividad.`,
      espacioSugeridoId: bestAlternative ? bestAlternative.id : null,
      espacioSugeridoNombre: bestAlternative ? bestAlternative.nombre : null,
      fallback: true
    };
  }
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
    Actúa como el asistente del sistema de FaCyT EventHub.
    Ha ocurrido un conflicto de capacidad al intentar solicitar una reserva:
    - Espacio solicitado: "${espacioNombre}" (Capacidad máxima: ${capacidadActual} personas)
    - Asistentes estimados: ${asistentesEstimados} personas

    Espacios con capacidad suficiente disponibles y libres en ese mismo horario:
    ${JSON.stringify(espaciosDisponibles, null, 2)}

    Tu tarea:
    1. Si hay espacios disponibles con aforo suficiente, selecciona el mejor (generalmente el de capacidad óptima más cercana a los asistentes) y redacta un mensaje muy amable, empático y profesional en español sugiriéndole al usuario cambiar su reserva a ese espacio. No uses nunca las palabras "IA", "Gemini", "Inteligencia Artificial", "algoritmo" o similares.
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

export async function generateSocialMediaPromos(evento) {
  const fechaStr = evento.fecha ? new Date(evento.fecha).toLocaleDateString('es-VE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) : '';
  const espacioNombre = evento.espacio?.nombre || 'Espacio FaCyT';
  const organizador = evento.usuario?.nombre || 'FaCyT EventHub';

  const defaultInstagramCopy = `🚀 ¡GRAN EVENTO EN FACYT! 🎓\n\nTe invitamos a participar en: "${evento.titulo}".\n\n📌 Tipo: ${evento.tipo}\n📅 Fecha: ${fechaStr}\n⏰ Horario: ${evento.horaInicio} - ${evento.horaFin}\n📍 Lugar: ${espacioNombre}\n\n${evento.descripcion || '¡No te pierdas esta oportunidad de formación e integración en la Facultad Experimental de Ciencias y Tecnología!'}\n\n👥 Organiza: ${organizador}\n\n#FaCyT #UniversidadDeCarabobo #EventosUC #Carabobo #${evento.tipo.replace(/\s+/g, '')}`;

  const defaultFacebookCopy = `📢 ¡Atención Comunidad FaCyT y UC!\n\nTenemos el agrado de invitarte al evento "${evento.titulo}".\n\nDetalles del Evento:\n🔹 Tipo: ${evento.tipo}\n📅 Fecha: ${fechaStr}\n⏰ Horario: ${evento.horaInicio} - ${evento.horaFin}\n📍 Ubicación: ${espacioNombre}\n\n${evento.descripcion || 'Un espacio para la difusión del conocimiento, ciencia y tecnología en nuestra facultad.'}\n\n👥 Organiza: ${organizador}\n\n¡Entrada libre para la comunidad académica!\n\n#FaCyT #UniversidadDeCarabobo #EventoAcademico #Carabobo #UC`;

  if (!genAI) {
    return {
      instagramCopy: defaultInstagramCopy,
      facebookCopy: defaultFacebookCopy,
      tema: null,
      fallback: true
    };
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

  const prompt = `
    Actúa como un Community Manager experto para la Facultad Experimental de Ciencias y Tecnología (FaCyT) de la Universidad de Carabobo.
    Tu objetivo es redactar publicaciones atractivas y altamente profesionales para promocionar un evento aprobado en la universidad.

    Detalles del Evento:
    - Título: "${evento.titulo}"
    - Tipo: "${evento.tipo}"
    - Descripción: "${evento.descripcion || 'Sin descripción adicional'}"
    - Fecha: "${fechaStr}"
    - Horario: "${evento.horaInicio} a ${evento.horaFin}"
    - Lugar/Espacio: "${espacioNombre}"
    - Organizador / Solicitante: "${organizador}"

    Genera dos versiones del post y clasifica la temática visual del evento:
    1. **Instagram**: Dinámico, visual, usando emojis estratégicos, llamado a la acción entusiasta, estructurado en párrafos legibles y hashtags populares universitarios de Venezuela.
    2. **Facebook**: Informativo, formal pero cercano, claro en los datos organizativos (fecha, hora, lugar), invitando a la comunidad y a compartir el evento.
    3. **Tema**: Clasifica la temática del evento para el diseño de su banner de difusión. Debe ser exactamente uno de los siguientes valores: COMPUTACION, QUIMICA, FISICA, BIOLOGIA, MATEMATICA, ACADEMICO, DEPORTES, CULTURA, GENERAL. Basa tu elección en el contenido del título y la descripción del evento (ej: defensas de tesis o inducciones académicas van a ACADEMICO, torneos o bienestar a DEPORTES, cine o teatro a CULTURA, etc.).

    Responde únicamente con un objeto JSON válido con este formato exacto:
    {
      "instagramCopy": "Texto del post optimizado para Instagram",
      "facebookCopy": "Texto del post optimizado para Facebook",
      "tema": "COMPUTACION | QUIMICA | FISICA | BIOLOGIA | MATEMATICA | ACADEMICO | DEPORTES | CULTURA | GENERAL"
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
    setTimeout(() => reject(new Error('Gemini API Timeout')), 5000)
  );

  try {
    return await Promise.race([apiCall, timeout]);
  } catch (error) {
    console.error('[Gemini] Excepción o Timeout en generación de copys para redes sociales:', error.message);
    return {
      instagramCopy: defaultInstagramCopy,
      facebookCopy: defaultFacebookCopy,
      tema: null,
      fallback: true
    };
  }
}

export async function generarReasignacionInhabilitacion({ evento, espacioOriginal, candidatos, motivoInhabilitacion }) {
  const bestAlternative = candidatos[0] || null;

  let fallbackText = `El espacio "${espacioOriginal.nombre}" ha sido inhabilitado. Motivo: ${motivoInhabilitacion}. `;

  if (bestAlternative) {
    fallbackText += `Te sugerimos reasignar el evento "${evento.titulo}" a "${bestAlternative.nombre}" (Capacidad: ${bestAlternative.capacidad}) el ${bestAlternative.fechaSugerida || evento.fecha.toISOString().split('T')[0]} de ${bestAlternative.horaInicioSugerida || evento.horaInicio} a ${bestAlternative.horaFinSugerida || evento.horaFin}.`;
  } else {
    fallbackText += `No se encontraron espacios alternativos disponibles. Te sugerimos cancelar o reprogramar tu evento.`;
  }

  const defaultResult = {
    sugerencia: fallbackText,
    espacioPropuestoId: bestAlternative ? bestAlternative.id : null,
    espacioPropuestoNombre: bestAlternative ? bestAlternative.nombre : null,
    fechaPropuesta: bestAlternative ? (bestAlternative.fechaSugerida || evento.fecha) : null,
    horaInicioPropuesta: bestAlternative ? (bestAlternative.horaInicioSugerida || evento.horaInicio) : null,
    horaFinPropuesta: bestAlternative ? (bestAlternative.horaFinSugerida || evento.horaFin) : null,
    fallback: true
  };

  if (!genAI) {
    return defaultResult;
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

  const prompt = `
    Actúa como el asistente del sistema de FaCyT EventHub.
    El espacio físico "${espacioOriginal.nombre}" ha sido inhabilitado de emergencia.
    - Motivo de inhabilitación: ${motivoInhabilitacion}
    - Evento afectado: "${evento.titulo}" (Tipo: ${evento.tipo}, Asistentes: ${evento.asistentesEstimados})
    - Fecha original: ${evento.fecha.toISOString().split('T')[0]}
    - Horario original: ${evento.horaInicio} - ${evento.horaFin}

    Espacios alternativos disponibles para reasignar (ordenados por prioridad):
    ${JSON.stringify(candidatos.map(e => ({ id: e.id, nombre: e.nombre, tipo: e.tipo, capacidad: e.capacidad, fechaSugerida: e.fechaSugerida, horaInicioSugerida: e.horaInicioSugerida, horaFinSugerida: e.horaFinSugerida })), null, 2)}

    Tu tarea:
    1. Redacta un mensaje empático para el solicitante explicando la inhabilitación del espacio y ofreciendo la mejor alternativa de reasignación encontrada. No uses nunca las palabras "IA", "Gemini", "Inteligencia Artificial", "algoritmo" o similares.
    2. Si hay alternativas, recomienda la mejor opción.
    3. Responde únicamente con un objeto JSON válido con este formato:
    {
      "sugerencia": "Texto explicativo e intuitivo con la recomendación",
      "espacioPropuestoId": "ID del espacio propuesto (o null si no hay opciones)",
      "espacioPropuestoNombre": "Nombre del espacio propuesto (o null)",
      "fechaPropuesta": "YYYY-MM-DD",
      "horaInicioPropuesta": "HH:MM",
      "horaFinPropuesta": "HH:MM"
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
    const aiResult = await Promise.race([apiCall, timeout]);
    if (aiResult.fechaPropuesta) {
      aiResult.fechaPropuesta = new Date(aiResult.fechaPropuesta);
    }
    return { ...defaultResult, ...aiResult };
  } catch (error) {
    console.error('[Gemini] Error en recomendación de inhabilitación:', error.message);
    return defaultResult;
  }
}


