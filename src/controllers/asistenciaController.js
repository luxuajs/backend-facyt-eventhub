import prisma from '../config/db.js';

// Registrar asistencia a un evento por QR o botón
export async function registrarAsistencia(req, res) {
  const eventoId = req.params.eventoId || req.params.id || req.body?.eventoId;

  if (!eventoId) {
    return res.status(400).json({ error: 'El ID del evento es obligatorio.' });
  }

  if (!req.user) {
    return res.status(401).json({ error: 'Usuario no autenticado.' });
  }

  try {
    const evento = await prisma.evento.findUnique({
      where: { id: eventoId },
      include: {
        espacio: true,
        _count: { select: { asistencias: true } }
      }
    });

    if (!evento) {
      return res.status(404).json({ error: 'El evento no existe.' });
    }

    if (evento._count.asistencias >= evento.espacio.capacidad) {
      return res.status(400).json({ error: 'Capacidad máxima del sitio alcanzada. No hay cupos disponibles para asistir.' });
    }

    const asistenciaExistente = await prisma.asistencia.findUnique({
      where: {
        eventoId_usuarioId: {
          eventoId,
          usuarioId: req.user.id
        }
      }
    });

    if (asistenciaExistente) {
      return res.status(200).json({
        message: 'Ya estabas registrado como asistente a este evento.',
        asistencia: asistenciaExistente
      });
    }

    const asistencia = await prisma.asistencia.create({
      data: {
        eventoId,
        usuarioId: req.user.id
      }
    });

    return res.status(201).json({
      message: 'Asistencia registrada con éxito al evento.',
      asistencia
    });
  } catch (error) {
    console.error('[AsistenciaCtrl] Error al registrar asistencia:', error);
    return res.status(500).json({ error: 'Error interno del servidor al registrar asistencia.' });
  }
}

// Obtener datos de asistencia para un evento
export async function obtenerAsistenciaEvento(req, res) {
  const eventoId = req.params.eventoId || req.params.id || req.query?.eventoId;

  if (!eventoId) {
    return res.status(400).json({ error: 'El ID del evento es obligatorio.' });
  }

  try {
    const evento = await prisma.evento.findUnique({
      where: { id: eventoId },
      include: {
        espacio: true,
        asistencias: {
          include: {
            usuario: {
              select: {
                id: true,
                nombre: true,
                email: true,
                tipoUsuario: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!evento) {
      return res.status(404).json({ error: 'Evento no encontrado.' });
    }

    const currentUserId = req.user?.id;
    const asistioUsuarioActual = currentUserId
      ? evento.asistencias.some(a => a.usuarioId === currentUserId)
      : false;

    return res.status(200).json({
      totalAsistentes: evento.asistencias.length,
      capacidadMaxima: evento.espacio ? evento.espacio.capacidad : 0,
      asistioUsuarioActual,
      asistentes: evento.asistencias
    });
  } catch (error) {
    console.error('[AsistenciaCtrl] Error al obtener asistencia:', error);
    return res.status(500).json({ error: 'Error interno del servidor al obtener asistencia.' });
  }
}
