import prisma from '../config/db.js';

// Obtener todas las materias (opcionalmente filtrando por escuela o solo activas)
export async function getMaterias(req, res) {
  try {
    const { escuelaId, soloActivas } = req.query;

    const where = {};
    if (escuelaId) {
      where.escuelaId = escuelaId;
    }
    if (soloActivas === 'true') {
      where.activo = true;
    }

    const materias = await prisma.materia.findMany({
      where,
      include: {
        escuela: true,
        espacio: {
          select: { id: true, nombre: true, tipo: true }
        }
      },
      orderBy: { nombre: 'asc' }
    });

    return res.status(200).json(materias);
  } catch (error) {
    console.error('[MateriaCtrl] Error al obtener materias:', error);
    return res.status(500).json({ error: 'Error interno al obtener las materias.' });
  }
}

// Crear una nueva materia
export async function crearMateria(req, res) {
  try {
    const { nombre, codigo, escuelaId } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'El nombre de la materia es requerido.' });
    }

    const nuevaMateria = await prisma.materia.create({
      data: {
        nombre: nombre.trim(),
        codigo: codigo ? codigo.trim().toUpperCase() : null,
        escuelaId: escuelaId || null,
        activo: true
      },
      include: { escuela: true }
    });

    return res.status(201).json(nuevaMateria);
  } catch (error) {
    console.error('[MateriaCtrl] Error al crear materia:', error);
    return res.status(500).json({ error: 'Error interno al crear la materia.' });
  }
}

// Actualizar materia existente
export async function actualizarMateria(req, res) {
  try {
    const { id } = req.params;
    const { nombre, codigo, escuelaId } = req.body;

    const materiaExistente = await prisma.materia.findUnique({ where: { id } });
    if (!materiaExistente) {
      return res.status(404).json({ error: 'La materia especificada no existe.' });
    }

    const materiaActualizada = await prisma.materia.update({
      where: { id },
      data: {
        nombre: nombre !== undefined ? nombre.trim() : materiaExistente.nombre,
        codigo: codigo !== undefined ? (codigo ? codigo.trim().toUpperCase() : null) : materiaExistente.codigo,
        escuelaId: escuelaId !== undefined ? escuelaId : materiaExistente.escuelaId
      },
      include: { escuela: true }
    });

    return res.status(200).json(materiaActualizada);
  } catch (error) {
    console.error('[MateriaCtrl] Error al actualizar materia:', error);
    return res.status(500).json({ error: 'Error interno al actualizar la materia.' });
  }
}

// Alternar estado activo/inhabilitado (Soft Delete)
export async function toggleEstadoMateria(req, res) {
  try {
    const { id } = req.params;
    const { activo } = req.body;

    if (typeof activo !== 'boolean') {
      return res.status(400).json({ error: 'El campo "activo" debe ser un booleano.' });
    }

    const materiaActualizada = await prisma.materia.update({
      where: { id },
      data: { activo },
      include: { escuela: true }
    });

    return res.status(200).json({
      message: `La materia "${materiaActualizada.nombre}" fue ${activo ? 'activada' : 'inhabilitada'}.`,
      materia: materiaActualizada
    });
  } catch (error) {
    console.error('[MateriaCtrl] Error al cambiar estado de la materia:', error);
    return res.status(500).json({ error: 'Error interno al actualizar el estado de la materia.' });
  }
}

// Asignar o actualizar el conjunto de materias asociadas a un laboratorio / espacio
export async function asignarMateriasAEspacio(req, res) {
  try {
    const { espacioId } = req.params;
    const { materiaIds } = req.body; // Array de IDs de materias

    if (!Array.isArray(materiaIds)) {
      return res.status(400).json({ error: 'Debe enviar un arreglo de IDs de materias (materiaIds).' });
    }

    const espacioExistente = await prisma.espacio.findUnique({ where: { id: espacioId } });
    if (!espacioExistente) {
      return res.status(404).json({ error: 'El espacio especificado no existe.' });
    }

    // Actualizar relación N:M con set (reemplaza la lista actual por la nueva)
    const espacioActualizado = await prisma.espacio.update({
      where: { id: espacioId },
      data: {
        materias: {
          set: materiaIds.map((id) => ({ id }))
        }
      },
      include: {
        materias: {
          include: { escuela: true }
        },
        escuela: true
      }
    });

    return res.status(200).json({
      message: `Materias asignadas correctamente al espacio "${espacioExistente.nombre}".`,
      espacio: espacioActualizado
    });
  } catch (error) {
    console.error('[MateriaCtrl] Error al asignar materias a espacio:', error);
    return res.status(500).json({ error: 'Error interno al asignar materias al espacio.' });
  }
}

// Obtener materias asignadas a un espacio
export async function getMateriasPorEspacio(req, res) {
  try {
    const { espacioId } = req.params;

    const espacio = await prisma.espacio.findUnique({
      where: { id: espacioId },
      include: {
        materias: {
          include: { escuela: true },
          orderBy: { nombre: 'asc' }
        }
      }
    });

    if (!espacio) {
      return res.status(404).json({ error: 'El espacio especificado no existe.' });
    }

    return res.status(200).json(espacio.materias);
  } catch (error) {
    console.error('[MateriaCtrl] Error al obtener materias por espacio:', error);
    return res.status(500).json({ error: 'Error interno al obtener materias del espacio.' });
  }
}
