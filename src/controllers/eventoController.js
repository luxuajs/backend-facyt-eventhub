import prisma from '../config/db.js';
import {
  validateRequest,
  checkOverlap,
  findNextAvailableSlots,
  findAlternativeSpacesForCapacity,
  findApplicantConflictAlternatives,
  getPriority,
  parseTimeToMinutes,
  getAutomatedSpaceSuggestions,
  findSameSpaceConflictAlternatives,
  findDisabledSpaceAlternatives,
  responderPropuestaReasignacion
} from '../services/eventoService.js';
import {
  generateAlternativeSuggestion,
  generateCapacityAlternativeSuggestion,
  generateSocialMediaPromos
} from '../services/geminiService.js';
import { generateEventBannerSVG } from '../services/bannerService.js';
import { sendReassignmentProposalNotification } from '../services/emailService.js';

// Endpoint para calcular sugerencias automáticas de espacios sin crear reserva aún
export async function obtenerSugerenciasEspacio(req, res) {
  const { tipo, carrera, materia, asistentesEstimados, fecha, horaInicio, horaFin } = req.body;
  if (!tipo || !fecha || !horaInicio || !horaFin || !asistentesEstimados) {
    return res.status(400).json({ error: 'Faltan parámetros para calcular la sugerencia de espacio.' });
  }

  try {
    const result = await getAutomatedSpaceSuggestions({
      tipo,
      carrera,
      materia,
      asistentesEstimados: parseInt(asistentesEstimados),
      fecha,
      horaInicio,
      horaFin
    });
    return res.json(result);
  } catch (error) {
    console.error('Error al obtener sugerencias de espacio:', error);
    return res.status(500).json({ error: 'Error al calcular sugerencias de espacio.' });
  }
}

// Registrar un nuevo evento (Solicitante, Coordinador, Root)
export async function crearEvento(req, res) {
  const {
    titulo,
    descripcion,
    tipo,
    carrera,
    materia,
    fecha,
    horaInicio,
    horaFin,
    asistentesEstimados,
    espacioId,
    reservaDirecta
  } = req.body;

  if (!titulo || !tipo || !fecha || !horaInicio || !horaFin || !asistentesEstimados || !espacioId) {
    return res.status(400).json({ error: 'Todos los campos excepto la descripción son obligatorios.' });
  }

  try {
    const user = req.user;
    const numAsistentes = parseInt(asistentesEstimados);

    // Obtener espacio para pre-validación
    const espacioObj = await prisma.espacio.findUnique({
      where: { id: espacioId },
      include: { escuela: true }
    });

    if (!espacioObj) {
      return res.status(400).json({ error: 'El espacio solicitado no existe.' });
    }

    // CASO 2 ELECCIÓN PERSONAL: Espacio inhabilitado / mantenimiento
    if (espacioObj.estado !== 'ACTIVO') {
      const opcionesSugeridas = await findDisabledSpaceAlternatives(
        tipo,
        carrera,
        numAsistentes,
        fecha,
        horaInicio,
        horaFin
      );

      return res.status(409).json({
        error: `El espacio "${espacioObj.nombre}" no está habilitado (Estado actual: ${espacioObj.estado}).`,
        tipoConflicto: 'ESPACIO_INHABILITADO',
        opcionesSugeridas
      });
    }

    // 1a. Validación de capacidad
    if (numAsistentes > espacioObj.capacidad) {
      const espaciosCompatibles = await findAlternativeSpacesForCapacity(
        user,
        espacioObj,
        tipo,
        numAsistentes,
        fecha,
        horaInicio,
        horaFin
      );

      const aiSuggestion = await generateCapacityAlternativeSuggestion(
        espacioObj.nombre,
        espacioObj.capacidad,
        numAsistentes,
        espaciosCompatibles
      );

      return res.status(409).json({
        error: `Capacidad insuficiente: El espacio "${espacioObj.nombre}" tiene capacidad para ${espacioObj.capacidad} personas y se estiman ${numAsistentes} asistentes.`,
        tipoConflicto: 'CAPACIDAD',
        sugerenciaIA: aiSuggestion.sugerencia,
        espacioSugeridoId: aiSuggestion.espacioSugeridoId,
        espacioSugeridoNombre: aiSuggestion.espacioSugeridoNombre,
        espaciosSugeridos: espaciosCompatibles
      });
    }

    // 1b. Validaciones de negocio adicionales (Exclusividad de escuela, Horarios, Días)
    let espacio;
    try {
      espacio = await validateRequest(
        user,
        espacioId,
        tipo,
        numAsistentes,
        fecha,
        horaInicio,
        horaFin,
        carrera
      );
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    // CASO 1 ELECCIÓN PERSONAL & CHOQUE DE HORARIOS: Espacio ocupado en ese horario
    const overlapping = await checkOverlap(espacioId, fecha, horaInicio, horaFin);

    if (overlapping) {
      if (overlapping.conflictType === 'PROPOSED_REASSIGNMENT') {
        return res.status(409).json({
          error: `Este espacio no se puede solicitar en este horario porque se encuentra pre-reservado a la espera de la aceptación o cancelación de una propuesta de reasignación previa para el evento: "${overlapping.titulo}".`,
          tipoConflicto: 'ESPERA_REASIGNACION_PREVIA',
          eventoConflicto: {
            id: overlapping.id,
            titulo: overlapping.titulo,
            tipo: overlapping.tipo
          }
        });
      }

      const alternativasMismoEspacio = await findSameSpaceConflictAlternatives(
        espacio,
        fecha,
        horaInicio,
        horaFin
      );

      const structuredAlternatives = await findApplicantConflictAlternatives(
        user,
        espacio,
        tipo,
        numAsistentes,
        fecha,
        horaInicio,
        horaFin
      );

      const details = {
        fecha,
        horaInicio,
        horaFin,
        reason: 'El bloque horario ya cuenta con una reserva aprobada.'
      };
      const aiSuggestion = await generateAlternativeSuggestion(espacio.nombre, details, structuredAlternatives);

      return res.status(409).json({
        error: `El espacio "${espacio.nombre}" ya está ocupado en el horario solicitado (${horaInicio} - ${horaFin}).`,
        tipoConflicto: 'HORARIO_MISMO_ESPACIO',
        sugerenciaIA: aiSuggestion.sugerencia,
        sugerenciasMismoEspacio: alternativasMismoEspacio,
        alternativasEstructuradas: structuredAlternatives
      });
    }


    // 3. Determinar estado final (Si es coordinador/root y solicita reserva directa -> APROBADO)
    const esCoordinador = ['COORDINADOR', 'ROOT'].includes(user.rol);
    const estadoFinal = (esCoordinador && reservaDirecta) ? 'APROBADO' : 'PENDIENTE';
    const prioridad = getPriority(tipo);
    const targetDate = new Date(fecha);
    targetDate.setUTCHours(0, 0, 0, 0);

    const result = await prisma.$transaction(async (tx) => {
      const nuevoEvento = await tx.evento.create({
        data: {
          titulo,
          descripcion,
          tipo,
          materia: materia || null,
          prioridad,
          fecha: targetDate,
          horaInicio,
          horaFin,
          asistentesEstimados: parseInt(asistentesEstimados),
          estado: estadoFinal,
          espacioId,
          usuarioId: user.id
        },
        include: {
          espacio: true
        }
      });

      if (estadoFinal === 'APROBADO') {
        await tx.auditoria.create({
          data: {
            usuarioId: user.id,
            accion: 'RESERVA_DIRECTA_COORDINADOR',
            detalles: `Coordinador ${user.nombre} realizó una reserva directa autorizada para "${titulo}" en ${nuevoEvento.espacio.nombre}.`
          }
        });
      }

      return nuevoEvento;
    });

    return res.status(201).json({
      message: estadoFinal === 'APROBADO'
        ? 'Reserva institucional directa registrada y aprobada con éxito.'
        : 'Solicitud de evento registrada con éxito y en cola de aprobación.',
      evento: result
    });
  } catch (error) {
    console.error('[EventoCtrl] Error al crear evento:', error);
    return res.status(500).json({ error: 'Error interno del servidor al crear solicitud.' });
  }
}

// Aprobar o Rechazar Evento (Coordinador y ROOT)
export async function actualizarEstadoEvento(req, res) {
  const { id } = req.params;
  const { estado, justificacion } = req.body; // 'APROBADO' o 'RECHAZADO'

  if (!['APROBADO', 'RECHAZADO'].includes(estado)) {
    return res.status(400).json({ error: 'El estado debe ser APROBADO o RECHAZADO.' });
  }

  if (estado === 'RECHAZADO' && !justificacion) {
    return res.status(400).json({ error: 'Debe ingresar una justificación en caso de rechazo.' });
  }

  try {
    const coordinatorId = req.user.id;

    // Buscar el evento a actualizar
    const evento = await prisma.evento.findUnique({
      where: { id },
      include: { espacio: true }
    });

    if (!evento) {
      return res.status(404).json({ error: 'El evento no existe.' });
    }

    if (evento.estado !== 'PENDIENTE') {
      return res.status(400).json({ error: 'Solo se pueden actualizar solicitudes en estado PENDIENTE.' });
    }

    // Si se va a aprobar, validar nuevamente que no haya colisiones
    if (estado === 'APROBADO') {
      const overlapping = await checkOverlap(evento.espacioId, evento.fecha, evento.horaInicio, evento.horaFin);
      if (overlapping) {
        return res.status(409).json({
          error: 'No se puede aprobar. Existe un conflicto de horario con otra solicitud aprobada posteriormente.'
        });
      }
    }

    // Ejecutar actualización del evento y creación de auditoría en una transacción ACID
    const updatedEvento = await prisma.$transaction(async (tx) => {
      const evt = await tx.evento.update({
        where: { id },
        data: {
          estado,
          sugerenciaIA: estado === 'RECHAZADO' ? `Rechazado: ${justificacion}` : null
        }
      });

      await tx.auditoria.create({
        data: {
          usuarioId: coordinatorId,
          accion: estado === 'APROBADO' ? 'APROBO_EVENTO' : 'RECHAZO_EVENTO',
          detalles: `Coordinador ${req.user.nombre} actualizó evento "${evento.titulo}" a ${estado}.${justificacion ? ` Justificación: ${justificacion}` : ''}`
        }
      });

      return evt;
    });

    return res.status(200).json({
      message: `Solicitud de evento ${estado.toLowerCase()} con éxito.`,
      evento: updatedEvento
    });
  } catch (error) {
    console.error('[EventoCtrl] Error al actualizar estado de evento:', error);
    return res.status(500).json({ error: 'Error interno al procesar la aprobación/rechazo.' });
  }
}

// Obtener mis solicitudes de evento (Solicitante +)
export async function getMisEventos(req, res) {
  try {
    const eventos = await prisma.evento.findMany({
      where: { usuarioId: req.user.id },
      include: {
        espacio: true,
        espacioSugerido: true
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.status(200).json(eventos);
  } catch (error) {
    console.error('[EventoCtrl] Error al obtener eventos del usuario:', error);
    return res.status(500).json({ error: 'Error al obtener tus solicitudes.' });
  }
}

// Proponer cambio de espacio (Coordinador y ROOT)
export async function proponerCambioEspacio(req, res) {
  const { id } = req.params;
  const { nuevoEspacioId, motivo, sugerenciaIA } = req.body;

  if (!nuevoEspacioId) {
    return res.status(400).json({ error: 'Debe especificar el nuevo espacio sugerido.' });
  }

  try {
    const evento = await prisma.evento.findUnique({
      where: { id },
      include: { espacio: true, usuario: true }
    });

    if (!evento) {
      return res.status(404).json({ error: 'El evento no existe.' });
    }

    if (evento.estado !== 'PENDIENTE') {
      return res.status(400).json({ error: 'Solo se pueden proponer cambios para eventos en estado PENDIENTE.' });
    }

    const nuevoEspacio = await prisma.espacio.findUnique({ where: { id: nuevoEspacioId } });
    if (!nuevoEspacio) {
      return res.status(404).json({ error: 'El espacio sugerido no existe.' });
    }

    const updatedEvento = await prisma.$transaction(async (tx) => {
      const evt = await tx.evento.update({
        where: { id },
        data: {
          estado: 'PROPUESTA_CAMBIO',
          espacioSugeridoId: nuevoEspacioId,
          motivoPropuesta: motivo || `Sugerencia de reasignación a ${nuevoEspacio.nombre}`,
          sugerenciaIA: sugerenciaIA || null
        },
        include: {
          espacio: true,
          espacioSugerido: true
        }
      });

      await tx.auditoria.create({
        data: {
          usuarioId: req.user.id,
          accion: 'PROPUSO_CAMBIO_ESPACIO',
          detalles: `Coordinador ${req.user.nombre} propuso cambiar espacio de "${evento.espacio.nombre}" a "${nuevoEspacio.nombre}" para el evento "${evento.titulo}".`
        }
      });

      return evt;
    });

    // Enviar notificación por correo al solicitante afectado (fuera de la transacción)
    const frontendUrl = process.env.FRONTEND_URL || 'https://frontend-facyt-eventhub.vercel.app';
    sendReassignmentProposalNotification({
      email: evento.usuario.email,
      usuarioNombre: evento.usuario.nombre,
      eventoTitulo: evento.titulo,
      espacioOriginalNombre: evento.espacio.nombre,
      espacioPropuestoNombre: nuevoEspacio.nombre,
      sugerenciaIA: motivo || `Sugerencia de reasignación a ${nuevoEspacio.nombre}`,
      linkRespuesta: `${frontendUrl}/eventos/${evento.id}/responder-propuesta`
    }).catch(err => console.error(`[EventoCtrl] Error al enviar notificación de propuesta a ${evento.usuario.email}:`, err));

    return res.status(200).json({
      message: 'Propuesta de cambio enviada exitosamente al solicitante.',
      evento: updatedEvento
    });
  } catch (error) {
    console.error('[EventoCtrl] Error al proponer cambio de espacio:', error);
    return res.status(500).json({ error: 'Error interno al enviar la propuesta de cambio.' });
  }
}

// Responder a la propuesta de cambio de espacio (Solicitante propietario)
export async function responderPropuestaCambio(req, res) {
  const { id } = req.params;
  const { respuesta } = req.body; // 'ACEPTAR' o 'RECHAZAR'

  if (!['ACEPTAR', 'RECHAZAR'].includes(respuesta)) {
    return res.status(400).json({ error: 'La respuesta debe ser ACEPTAR o RECHAZAR.' });
  }

  try {
    const evento = await prisma.evento.findUnique({
      where: { id },
      include: { espacio: true, espacioSugerido: true }
    });

    if (!evento) {
      return res.status(404).json({ error: 'El evento no existe.' });
    }

    if (evento.usuarioId !== req.user.id && !['COORDINADOR', 'ROOT'].includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para responder a esta propuesta.' });
    }

    if (evento.estado !== 'PROPUESTA_CAMBIO') {
      return res.status(400).json({ error: 'Este evento no se encuentra en estado de propuesta de cambio.' });
    }

    if (respuesta === 'ACEPTAR') {
      // Validar choque de horarios en el nuevo espacio
      const overlapping = await checkOverlap(evento.espacioSugeridoId, evento.fecha, evento.horaInicio, evento.horaFin, evento.id);
      if (overlapping) {
        return res.status(409).json({
          error: 'No se puede aceptar el cambio. El nuevo espacio acaba de ser reservado por otro evento.'
        });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const evt = await tx.evento.update({
          where: { id },
          data: {
            espacioId: evento.espacioSugeridoId,
            espacioSugeridoId: null,
            estado: 'APROBADO'
          },
          include: { espacio: true }
        });

        await tx.auditoria.create({
          data: {
            usuarioId: req.user.id,
            accion: 'ACEPTO_CAMBIO_ESPACIO',
            detalles: `El solicitante ${req.user.nombre} aceptó la reasignación al espacio "${evt.espacio.nombre}" para el evento "${evento.titulo}". Evento APROBADO.`
          }
        });

        return evt;
      });

      return res.status(200).json({
        message: 'Has aceptado la propuesta de cambio. ¡Tu evento ha sido APROBADO!',
        evento: updated
      });
    } else {
      // RECHAZAR
      const updated = await prisma.$transaction(async (tx) => {
        const evt = await tx.evento.update({
          where: { id },
          data: {
            espacioSugeridoId: null,
            estado: 'CANCELADO'
          },
          include: { espacio: true }
        });

        await tx.auditoria.create({
          data: {
            usuarioId: req.user.id,
            accion: 'RECHAZO_CAMBIO_ESPACIO',
            detalles: `El solicitante ${req.user.nombre} rechazó la propuesta de reasignación para el evento "${evento.titulo}". Evento CANCELADO.`
          }
        });

        return evt;
      });

      return res.status(200).json({
        message: 'Has rechazado la propuesta de cambio. La solicitud fue cancelada.',
        evento: updated
      });
    }
  } catch (error) {
    console.error('[EventoCtrl] Error al responder propuesta de cambio:', error);
    return res.status(500).json({ error: 'Error interno al procesar la respuesta.' });
  }
}

export async function responderPropuesta(req, res) {
  const { id } = req.params;
  const { aceptar } = req.body;

  if (typeof aceptar !== 'boolean') {
    return res.status(400).json({ error: 'El campo "aceptar" debe ser un booleano.' });
  }

  try {
    const updatedEvento = await responderPropuestaReasignacion(id, req.user.id, aceptar);
    return res.status(200).json({
      message: aceptar ? 'Propuesta aceptada, evento reprogramado.' : 'Propuesta rechazada, evento cancelado.',
      evento: updatedEvento
    });
  } catch (error) {
    console.error('[EventoCtrl] Error al responder propuesta:', error);
    return res.status(400).json({ error: error.message || 'Error al procesar la respuesta.' });
  }
}

// Calendario de eventos aprobados (Público)
export async function getCalendario(req, res) {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const eventos = await prisma.evento.findMany({
      where: {
        estado: 'APROBADO',
        fecha: { gte: today }
      },
      include: {
        espacio: true,
        usuario: { select: { nombre: true, email: true } }
      },
      orderBy: { fecha: 'asc' }
    });
    return res.status(200).json(eventos);
  } catch (error) {
    console.error('[EventoCtrl] Error al obtener calendario:', error);
    return res.status(500).json({ error: 'Error al obtener el calendario.' });
  }
}

// Obtener el catálogo de espacios (Público)
export async function getEspacios(req, res) {
  try {
    const espacios = await prisma.espacio.findMany({
      include: { escuela: true },
      orderBy: { nombre: 'asc' }
    });
    return res.status(200).json(espacios);
  } catch (error) {
    console.error('[EventoCtrl] Error al obtener espacios:', error);
    return res.status(500).json({ error: 'Error al obtener el catálogo de espacios.' });
  }
}

// Obtener el listado de escuelas (Público)
export async function getEscuelas(req, res) {
  try {
    const escuelas = await prisma.escuela.findMany({
      orderBy: { nombre: 'asc' }
    });
    return res.status(200).json(escuelas);
  } catch (error) {
    console.error('[EventoCtrl] Error al obtener escuelas:', error);
    return res.status(500).json({ error: 'Error al obtener el listado de escuelas.' });
  }
}

export async function editarEvento(req, res) {
  const { id } = req.params;
  const {
    titulo,
    descripcion,
    tipo,
    carrera,
    materia,
    fecha,
    horaInicio,
    horaFin,
    asistentesEstimados,
    espacioId
  } = req.body;

  if (!titulo || !tipo || !fecha || !horaInicio || !horaFin || !asistentesEstimados || !espacioId) {
    return res.status(400).json({ error: 'Todos los campos excepto la descripción son obligatorios.' });
  }

  try {
    const user = req.user;

    const eventoExistente = await prisma.evento.findUnique({
      where: { id },
      include: { espacio: true, usuario: true }
    });

    if (!eventoExistente) {
      return res.status(404).json({ error: 'El evento no existe.' });
    }

    const esCoordinador = ['COORDINADOR', 'ROOT'].includes(user.rol);
    const esPropietario = eventoExistente.usuarioId === user.id;

    if (!esCoordinador && !esPropietario) {
      return res.status(403).json({ error: 'No tienes permisos para editar este evento.' });
    }

    // Solicitante solo puede editar si está PENDIENTE o PROPUESTA_CAMBIO
    if (!esCoordinador && !['PENDIENTE', 'PROPUESTA_CAMBIO'].includes(eventoExistente.estado)) {
      return res.status(400).json({ error: 'Solo puedes editar eventos en estado PENDIENTE o PROPUESTA_CAMBIO.' });
    }

    const espacioObj = await prisma.espacio.findUnique({
      where: { id: espacioId },
      include: { escuela: true }
    });

    if (!espacioObj) {
      return res.status(400).json({ error: 'El espacio solicitado no existe.' });
    }

    const numAsistentes = parseInt(asistentesEstimados);

    // Validación de capacidad con IA
    if (numAsistentes > espacioObj.capacidad) {
      const espaciosCompatibles = await findAlternativeSpacesForCapacity(
        eventoExistente.usuario,
        espacioObj,
        tipo,
        numAsistentes,
        fecha,
        horaInicio,
        horaFin
      );

      const aiSuggestion = await generateCapacityAlternativeSuggestion(
        espacioObj.nombre,
        espacioObj.capacidad,
        numAsistentes,
        espaciosCompatibles
      );

      return res.status(409).json({
        error: `Capacidad insuficiente: El espacio "${espacioObj.nombre}" tiene capacidad para ${espacioObj.capacidad} personas y se estiman ${numAsistentes} asistentes.`,
        tipoConflicto: 'CAPACIDAD',
        sugerenciaIA: aiSuggestion.sugerencia,
        espacioSugeridoId: aiSuggestion.espacioSugeridoId,
        espacioSugeridoNombre: aiSuggestion.espacioSugeridoNombre,
        espaciosSugeridos: espaciosCompatibles
      });
    }

    // Validaciones de negocio
    let espacio;
    try {
      espacio = await validateRequest(
        eventoExistente.usuario,
        espacioId,
        tipo,
        numAsistentes,
        fecha,
        horaInicio,
        horaFin,
        carrera
      );
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    // Validación de solapamiento omitiendo este mismo evento
    const overlapping = await checkOverlap(espacioId, fecha, horaInicio, horaFin, id);
    if (overlapping) {
      if (overlapping.conflictType === 'PROPOSED_REASSIGNMENT') {
        return res.status(409).json({
          error: `Este espacio no se puede solicitar en este horario porque se encuentra pre-reservado a la espera de la aceptación o cancelación de una propuesta de reasignación previa para el evento: "${overlapping.titulo}".`,
          tipoConflicto: 'ESPERA_REASIGNACION_PREVIA',
          eventoConflicto: {
            id: overlapping.id,
            titulo: overlapping.titulo,
            tipo: overlapping.tipo
          }
        });
      }

      const structuredAlternatives = await findApplicantConflictAlternatives(
        user,
        espacio,
        tipo,
        numAsistentes,
        fecha,
        horaInicio,
        horaFin
      );

      const details = {
        fecha,
        horaInicio,
        horaFin,
        reason: 'El bloque horario ya cuenta con una reserva aprobada.'
      };
      const aiSuggestion = await generateAlternativeSuggestion(espacio.nombre, details, structuredAlternatives);

      return res.status(409).json({
        error: 'Conflicto de horario: El espacio ya está reservado para el nuevo horario solicitado.',
        tipoConflicto: 'HORARIO',
        sugerenciaIA: aiSuggestion.sugerencia,
        fechaPropuesta: aiSuggestion.fechaPropuesta,
        horaInicioPropuesta: aiSuggestion.horaInicioPropuesta,
        horaFinPropuesta: aiSuggestion.horaFinPropuesta,
        espacioPropuestoId: aiSuggestion.espacioPropuestoId || null,
        espacioPropuestoNombre: aiSuggestion.espacioPropuestoNombre || null,
        alternativasEstructuradas: structuredAlternatives
      });
    }

    const prioridad = getPriority(tipo);
    const targetDate = new Date(fecha);
    targetDate.setUTCHours(0, 0, 0, 0);

    // Si edita el solicitante cuando estaba en PROPUESTA_CAMBIO o RECHAZADO, pasa a PENDIENTE
    let nuevoEstado = eventoExistente.estado;
    if (!esCoordinador && ['PROPUESTA_CAMBIO', 'RECHAZADO'].includes(eventoExistente.estado)) {
      nuevoEstado = 'PENDIENTE';
    }

    // Registrar cambios detallados para la auditoría
    const cambios = [];
    if (eventoExistente.titulo !== titulo) cambios.push(`título: "${eventoExistente.titulo}" ➔ "${titulo}"`);
    if (eventoExistente.tipo !== tipo) cambios.push(`tipo: "${eventoExistente.tipo}" ➔ "${tipo}"`);
    if (eventoExistente.espacioId !== espacioId) cambios.push(`espacio ID: "${eventoExistente.espacioId}" ➔ "${espacioId}"`);
    if (eventoExistente.fecha.toISOString().split('T')[0] !== targetDate.toISOString().split('T')[0]) {
      cambios.push(`fecha: ${eventoExistente.fecha.toISOString().split('T')[0]} ➔ ${fecha}`);
    }
    if (eventoExistente.horaInicio !== horaInicio || eventoExistente.horaFin !== horaFin) {
      cambios.push(`horario: ${eventoExistente.horaInicio}-${eventoExistente.horaFin} ➔ ${horaInicio}-${horaFin}`);
    }
    if (eventoExistente.asistentesEstimados !== numAsistentes) {
      cambios.push(`asistentes: ${eventoExistente.asistentesEstimados} ➔ ${numAsistentes}`);
    }

    const detallesAuditoria = cambios.length > 0
      ? `Usuario ${user.nombre} (${user.rol}) editó el evento "${titulo}". Cambios: ${cambios.join(', ')}.`
      : `Usuario ${user.nombre} (${user.rol}) actualizó detalles del evento "${titulo}".`;

    const result = await prisma.$transaction(async (tx) => {
      const eventoActualizado = await tx.evento.update({
        where: { id },
        data: {
          titulo,
          descripcion,
          tipo,
          materia: materia || null,
          prioridad,
          fecha: targetDate,
          horaInicio,
          horaFin,
          asistentesEstimados: numAsistentes,
          espacioId,
          estado: nuevoEstado,
          espacioSugeridoId: null,
          motivoPropuesta: null
        },
        include: {
          espacio: true
        }
      });

      await tx.auditoria.create({
        data: {
          usuarioId: user.id,
          accion: 'EDITO_EVENTO',
          detalles: detallesAuditoria
        }
      });

      return eventoActualizado;
    });

    return res.status(200).json({
      message: 'Evento actualizado correctamente y registrado en auditoría.',
      evento: result
    });
  } catch (error) {
    console.error('[EventoCtrl] Error al editar evento:', error);
    return res.status(500).json({ error: 'Error interno al editar el evento.' });
  }
}

// Generar material de difusión (copys para redes y banner visual) para un evento APROBADO
export async function obtenerPromocionEvento(req, res) {
  const { id } = req.params;
  try {
    const evento = await prisma.evento.findUnique({
      where: { id },
      include: {
        espacio: true,
        usuario: {
          include: {
            escuela: true
          }
        }
      }
    });

    if (!evento) {
      return res.status(404).json({ error: 'Evento no encontrado.' });
    }

    // Verificar permisos: Propietario o rol de administración/coordinación
    const user = req.user;
    const esPropietario = evento.usuarioId === user.id;
    const esCoordinadorOAdmin = ['COORDINADOR', 'ROOT', 'ADMINISTRADOR'].includes(user.rol);

    if (!esPropietario && !esCoordinadorOAdmin) {
      return res.status(403).json({ error: 'No tienes permisos para promocionar este evento. Solo el solicitante creador o los coordinadores/administradores están autorizados.' });
    }

    if (evento.estado !== 'APROBADO') {
      return res.status(400).json({ error: 'Solo se pueden promocionar eventos que hayan sido APROBADOS.' });
    }

    // Generar copys con IA
    const promos = await generateSocialMediaPromos(evento);

    // Generar banner SVG
    const bannerSvg = generateEventBannerSVG(evento, promos.tema);

    return res.json({
      eventoId: evento.id,
      titulo: evento.titulo,
      instagramCopy: promos.instagramCopy,
      facebookCopy: promos.facebookCopy,
      bannerSvg: bannerSvg
    });
  } catch (error) {
    console.error('[EventoCtrl] Error al generar promoción de evento:', error);
    return res.status(500).json({ error: 'Error al generar material promocional para el evento.' });
  }
}

