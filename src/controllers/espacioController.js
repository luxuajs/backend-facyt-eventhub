import prisma from '../config/db.js';
import { sendSpaceMaintenanceNotification, sendReassignmentProposalNotification } from '../services/emailService.js';
import { buscarReasignacionEspacio } from '../services/eventoService.js';
import { generarReasignacionInhabilitacion } from '../services/geminiService.js';

// Obtener catálogo completo de espacios con su escuela
export async function getEspacios(req, res) {
  try {
    const espacios = await prisma.espacio.findMany({
      include: { escuela: true, materias: true },
      orderBy: { nombre: 'asc' }
    });
    return res.status(200).json(espacios);
  } catch (error) {
    console.error('[EspacioCtrl] Error al obtener espacios:', error);
    return res.status(500).json({ error: 'Error interno al obtener los espacios.' });
  }
}

// Cambiar estado operativo de un espacio (ACTIVO, MANTENIMIENTO, INHABILITADO)
export async function actualizarEstadoEspacio(req, res) {
  const { id } = req.params;
  const { estado, motivo, duracionTipo, cantidadDias, asignaciones } = req.body;

  if (!['ACTIVO', 'MANTENIMIENTO', 'INHABILITADO'].includes(estado)) {
    return res.status(400).json({ error: 'El estado debe ser ACTIVO, MANTENIMIENTO o INHABILITADO.' });
  }

  if (['MANTENIMIENTO', 'INHABILITADO'].includes(estado) && (!motivo || !motivo.trim())) {
    return res.status(400).json({ error: 'Debe especificar el motivo del mantenimiento o inhabilitación.' });
  }

  try {
    const coordinator = req.user;

    const espacioExistente = await prisma.espacio.findUnique({
      where: { id }
    });

    if (!espacioExistente) {
      return res.status(404).json({ error: 'El espacio especificado no existe.' });
    }

    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);

    let inhabilitadoDesde = null;
    let inhabilitadoHasta = null;
    let inhabilitadoIndeterminado = false;

    if (estado === 'INHABILITADO') {
      inhabilitadoDesde = new Date();
      if (duracionTipo === 'INDETERMINADO') {
        inhabilitadoIndeterminado = true;
      } else if (duracionTipo === 'DIAS' && cantidadDias) {
        inhabilitadoHasta = new Date(inhabilitadoDesde);
        inhabilitadoHasta.setDate(inhabilitadoHasta.getDate() + parseInt(cantidadDias, 10));
      }
    }

    let dateFilter = { gte: hoy };
    if (estado === 'INHABILITADO') {
       if (inhabilitadoHasta) {
          dateFilter = { gte: inhabilitadoDesde, lte: inhabilitadoHasta };
       } else {
          dateFilter = { gte: inhabilitadoDesde };
       }
    }

    // Buscar reservas futuras o vigentes en estado APROBADO o PENDIENTE
    const eventosAfectados = await prisma.evento.findMany({
      where: {
        espacioId: id,
        estado: { in: ['APROBADO', 'PENDIENTE'] },
        fecha: dateFilter
      },
      include: {
        usuario: { select: { nombre: true, email: true, escuelaId: true } },
        espacio: true
      }
    });

    // Transacción ACID para actualizar espacio, procesar reasignaciones/cancelaciones y registrar auditoría
    const result = await prisma.$transaction(async (tx) => {
      // 1. Actualizar estado del espacio
      const espacioActualizado = await tx.espacio.update({
        where: { id },
        data: { 
          estado,
          motivoInhabilitacion: estado === 'INHABILITADO' ? motivo : null,
          inhabilitadoDesde,
          inhabilitadoHasta,
          inhabilitadoIndeterminado
        }
      });

      let eventosProcesadosCount = 0;

      // 2. Si el espacio pasa a mantenimiento o inhabilitado, procesar eventos afectados
      if (['MANTENIMIENTO', 'INHABILITADO'].includes(estado) && eventosAfectados.length > 0) {
        eventosProcesadosCount = eventosAfectados.length;
        
        for (const evt of eventosAfectados) {
           const asignacionElegida = asignaciones ? asignaciones[evt.id] : null;

           if (estado === 'INHABILITADO') {
              if (asignacionElegida && asignacionElegida.action === 'REASSIGN') {
                 // El coordinador seleccionó una opción manual
                 await tx.evento.update({
                   where: { id: evt.id },
                   data: {
                     estado: 'PROPUESTA_CAMBIO',
                     espacioSugeridoId: asignacionElegida.espacioSugeridoId,
                     fechaSugerida: new Date(asignacionElegida.fechaSugerida),
                     horaInicioSugerida: asignacionElegida.horaInicioSugerida,
                     horaFinSugerida: asignacionElegida.horaFinSugerida,
                     motivoPropuesta: motivo,
                     sugerenciaIA: `Propuesta de reasignación manual seleccionada por el coordinador debido a la inhabilitación del espacio original. Espacio sugerido: ${asignacionElegida.espacioSugeridoNombre}.`
                   }
                 });
              } else if (asignacionElegida && asignacionElegida.action === 'CANCEL') {
                 // El coordinador seleccionó cancelar la solicitud
                 await tx.evento.update({
                   where: { id: evt.id },
                   data: {
                     estado: 'CANCELADO',
                     sugerenciaIA: `Cancelado por contingencia de espacio (${estado}): ${motivo}`
                   }
                 });
              } else {
                 // Fallback automático con IA si no viene la asignación específica (retrocompatibilidad)
                 const candidatos = await buscarReasignacionEspacio(evt, espacioExistente);
                 const aiResult = await generarReasignacionInhabilitacion({ evento: evt, espacioOriginal: espacioExistente, candidatos, motivoInhabilitacion: motivo });
                 
                 await tx.evento.update({
                   where: { id: evt.id },
                   data: {
                     estado: 'PROPUESTA_CAMBIO',
                     espacioSugeridoId: aiResult.espacioPropuestoId,
                     fechaSugerida: aiResult.fechaPropuesta,
                     horaInicioSugerida: aiResult.horaInicioPropuesta,
                     horaFinSugerida: aiResult.horaFinPropuesta,
                     motivoPropuesta: motivo,
                     sugerenciaIA: aiResult.sugerencia
                   }
                 });
              }
           } else {
              // MANTENIMIENTO: Por defecto cancela, a menos que se haya indicado una reasignación manual
              if (asignacionElegida && asignacionElegida.action === 'REASSIGN') {
                 await tx.evento.update({
                   where: { id: evt.id },
                   data: {
                     estado: 'PROPUESTA_CAMBIO',
                     espacioSugeridoId: asignacionElegida.espacioSugeridoId,
                     fechaSugerida: new Date(asignacionElegida.fechaSugerida),
                     horaInicioSugerida: asignacionElegida.horaInicioSugerida,
                     horaFinSugerida: asignacionElegida.horaFinSugerida,
                     motivoPropuesta: motivo,
                     sugerenciaIA: `Propuesta de reasignación manual seleccionada por el coordinador debido al mantenimiento del espacio original.`
                   }
                 });
              } else {
                 await tx.evento.update({
                   where: { id: evt.id },
                   data: {
                     estado: 'CANCELADO',
                     sugerenciaIA: `Cancelado por contingencia de espacio (${estado}): ${motivo}`
                   }
                 });
              }
           }
        }
      }

      // 3. Registrar auditoría inmutable
      await tx.auditoria.create({
        data: {
          usuarioId: coordinator.id,
          accion: 'CAMBIO_ESTADO_ESPACIO',
          detalles: `Coordinador ${coordinator.nombre} cambió el estado de "${espacioExistente.nombre}" de ${espacioExistente.estado} a ${estado}.${motivo ? ` Motivo: ${motivo}.` : ''} Eventos afectados: ${eventosProcesadosCount}.`
        }
      });

      return { espacioActualizado, eventosProcesadosCount };
    });

    // Notificar por correo a los usuarios afectados (fuera de la transacción para no bloquear)
    if (['MANTENIMIENTO', 'INHABILITADO'].includes(estado) && eventosAfectados.length > 0) {
      for (const evt of eventosAfectados) {
        const eventoActualizado = await prisma.evento.findUnique({ where: { id: evt.id }, include: { espacioSugerido: true } });

        if (eventoActualizado.estado === 'PROPUESTA_CAMBIO') {
            if (sendReassignmentProposalNotification) {
               const frontendUrl = process.env.FRONTEND_URL || 'https://frontend-facyt-eventhub.vercel.app';
               sendReassignmentProposalNotification({
                  email: evt.usuario.email,
                  usuarioNombre: evt.usuario.nombre,
                  eventoTitulo: evt.titulo,
                  espacioOriginalNombre: espacioExistente.nombre,
                  espacioPropuestoNombre: eventoActualizado.espacioSugerido ? eventoActualizado.espacioSugerido.nombre : null,
                  sugerenciaIA: eventoActualizado.sugerenciaIA,
                  linkRespuesta: `${frontendUrl}/eventos/${evt.id}/responder-propuesta`
               }).catch(err => console.error(`[EspacioCtrl] Error al enviar notificación de propuesta a ${evt.usuario.email}:`, err));
            }
        } else {
            const fechaStr = new Date(evt.fecha).toISOString().split('T')[0];
            sendSpaceMaintenanceNotification({
              email: evt.usuario.email,
              usuarioNombre: evt.usuario.nombre,
              eventoTitulo: evt.titulo,
              espacioNombre: espacioExistente.nombre,
              fecha: fechaStr,
              horaInicio: evt.horaInicio,
              horaFin: evt.horaFin,
              motivo
            }).catch(err => console.error(`[EspacioCtrl] Error al enviar notificación a ${evt.usuario.email}:`, err));
        }
      }
    }

    return res.status(200).json({
      message: `El estado del espacio "${espacioExistente.nombre}" fue actualizado a ${estado}.`,
      espacio: result.espacioActualizado,
      eventosAfectadosCount: result.eventosProcesadosCount
    });
  } catch (error) {
    console.error('[EspacioCtrl] Error al actualizar estado del espacio:', error);
    return res.status(500).json({ error: 'Error interno al actualizar el estado del espacio.' });
  }
}

// Pre-visualizar eventos afectados y calcular las 3 mejores opciones de reasignación
export async function preInhabilitarEspacio(req, res) {
  const { id } = req.params;
  const { estado, duracionTipo, cantidadDias } = req.query;

  try {
    const espacioExistente = await prisma.espacio.findUnique({
      where: { id }
    });

    if (!espacioExistente) {
      return res.status(404).json({ error: 'El espacio especificado no existe.' });
    }

    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);

    let inhabilitadoDesde = null;
    let inhabilitadoHasta = null;

    if (estado === 'INHABILITADO') {
      inhabilitadoDesde = new Date();
      if (duracionTipo === 'DIAS' && cantidadDias) {
        inhabilitadoHasta = new Date(inhabilitadoDesde);
        inhabilitadoHasta.setDate(inhabilitadoHasta.getDate() + parseInt(cantidadDias, 10));
      }
    }

    let dateFilter = { gte: hoy };
    if (estado === 'INHABILITADO') {
       if (inhabilitadoHasta) {
          dateFilter = { gte: inhabilitadoDesde, lte: inhabilitadoHasta };
       } else {
          dateFilter = { gte: inhabilitadoDesde };
       }
    }

    // Buscar reservas afectadas en estado PENDIENTE o APROBADO
    const eventosAfectados = await prisma.evento.findMany({
      where: {
        espacioId: id,
        estado: { in: ['APROBADO', 'PENDIENTE'] },
        fecha: dateFilter
      },
      include: {
        usuario: { select: { nombre: true, email: true, escuelaId: true } },
        espacio: true
      }
    });

    // Calcular las 3 mejores opciones para cada evento afectado
    const eventosConOpciones = [];
    for (const evt of eventosAfectados) {
      const candidatos = await buscarReasignacionEspacio(evt, espacioExistente);
      eventosConOpciones.push({
        id: evt.id,
        titulo: evt.titulo,
        tipo: evt.tipo,
        fecha: evt.fecha,
        horaInicio: evt.horaInicio,
        horaFin: evt.horaFin,
        asistentesEstimados: evt.asistentesEstimados,
        usuario: evt.usuario,
        candidatos: candidatos.map(c => ({
          espacioSugeridoId: c.id,
          espacioSugeridoNombre: c.nombre,
          fechaSugerida: c.fechaSugerida.toISOString().split('T')[0],
          horaInicioSugerida: c.horaInicioSugerida,
          horaFinSugerida: c.horaFinSugerida,
          capacidad: c.capacidad
        }))
      });
    }

    return res.status(200).json({
      eventosAfectados: eventosConOpciones
    });
  } catch (error) {
    console.error('[EspacioCtrl] Error en pre-inhabilitar:', error);
    return res.status(500).json({ error: 'Error al calcular eventos afectados y alternativas.' });
  }
}
