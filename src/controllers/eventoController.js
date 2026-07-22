import prisma from '../config/db.js';
import {
  validateRequest,
  checkOverlap,
  findNextAvailableSlots,
  getPriority,
  parseTimeToMinutes
} from '../services/eventoService.js';
import { generateAlternativeSuggestion } from '../services/geminiService.js';

// Registrar un nuevo evento (Solicitante, Coordinador, Root)
export async function crearEvento(req, res) {
  const {
    titulo,
    descripcion,
    tipo,
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

    // 1. Validaciones de negocio (Capacidad, Exclusividad, Horarios)
    let espacio;
    try {
      espacio = await validateRequest(
        user,
        espacioId,
        tipo,
        parseInt(asistentesEstimados),
        fecha,
        horaInicio,
        horaFin
      );
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    // 2. Validación de choque de horarios (Algoritmo Anti-Solapamiento)
    const overlapping = await checkOverlap(espacioId, fecha, horaInicio, horaFin);

    if (overlapping) {
      // Calcular duración en minutos del evento solicitado
      const durationMins = parseTimeToMinutes(horaFin) - parseTimeToMinutes(horaInicio);

      // Buscar los 3 siguientes bloques de tiempo disponibles
      const slots = await findNextAvailableSlots(espacio, fecha, durationMins);

      // Obtener sugerencia inteligente de Gemini
      const details = {
        fecha,
        horaInicio,
        horaFin,
        reason: 'El bloque horario ya cuenta con una reserva aprobada.'
      };
      const aiSuggestion = await generateAlternativeSuggestion(espacio.nombre, details, slots);

      return res.status(409).json({
        error: 'Conflicto de horario: El espacio ya está reservado para el horario solicitado.',
        sugerenciaIA: aiSuggestion.sugerencia,
        fechaPropuesta: aiSuggestion.fechaPropuesta,
        horaInicioPropuesta: aiSuggestion.horaInicioPropuesta,
        horaFinPropuesta: aiSuggestion.horaFinPropuesta,
        slotsDisponibles: slots
      });
    }

    // 3. Si no hay colisiones, calcular prioridad y crear evento como PENDIENTE
    const prioridad = getPriority(tipo);
    const targetDate = new Date(fecha);
    targetDate.setUTCHours(0, 0, 0, 0);

    const nuevoEvento = await prisma.evento.create({
      data: {
        titulo,
        descripcion,
        tipo,
        prioridad,
        fecha: targetDate,
        horaInicio,
        horaFin,
        asistentesEstimados: parseInt(asistentesEstimados),
        estado: 'PENDIENTE',
        espacioId,
        usuarioId: user.id
      },
      include: {
        espacio: true
      }
    });

    return res.status(201).json({
      message: 'Solicitud de evento registrada con éxito y en cola de aprobación.',
      evento: nuevoEvento
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
      include: { espacio: true },
      orderBy: { createdAt: 'desc' }
    });
    return res.status(200).json(eventos);
  } catch (error) {
    console.error('[EventoCtrl] Error al obtener eventos del usuario:', error);
    return res.status(500).json({ error: 'Error al obtener tus solicitudes.' });
  }
}

// Calendario de eventos aprobados (Público)
export async function getCalendario(req, res) {
  try {
    const eventos = await prisma.evento.findMany({
      where: { estado: 'APROBADO' },
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
