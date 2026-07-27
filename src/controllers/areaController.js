import prisma from '../config/db.js';

// Obtener todas las áreas (opcionalmente filtrando por escuela o solo activas)
export async function getAreas(req, res) {
  try {
    const { escuelaId, soloActivas } = req.query;

    const where = {};
    if (escuelaId) {
      where.escuelaId = escuelaId;
    }
    if (soloActivas === 'true') {
      where.activo = true;
    }

    const areas = await prisma.area.findMany({
      where,
      include: { escuela: true },
      orderBy: { nombre: 'asc' }
    });

    return res.status(200).json(areas);
  } catch (error) {
    console.error('[AreaCtrl] Error al obtener áreas:', error);
    return res.status(500).json({ error: 'Error interno al obtener las áreas.' });
  }
}

// Crear una nueva área
export async function crearArea(req, res) {
  try {
    const { nombre, descripcion, escuelaId } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'El nombre del área es requerido.' });
    }

    const nuevaArea = await prisma.area.create({
      data: {
        nombre: nombre.trim(),
        descripcion: descripcion ? descripcion.trim() : null,
        escuelaId: escuelaId || null,
        activo: true
      },
      include: { escuela: true }
    });

    return res.status(201).json(nuevaArea);
  } catch (error) {
    console.error('[AreaCtrl] Error al crear área:', error);
    return res.status(500).json({ error: 'Error interno al crear el área.' });
  }
}

// Actualizar área existente
export async function actualizarArea(req, res) {
  try {
    const { id } = req.params;
    const { nombre, descripcion, escuelaId } = req.body;

    const areaExistente = await prisma.area.findUnique({ where: { id } });
    if (!areaExistente) {
      return res.status(404).json({ error: 'El área especificada no existe.' });
    }

    const areaActualizada = await prisma.area.update({
      where: { id },
      data: {
        nombre: nombre !== undefined ? nombre.trim() : areaExistente.nombre,
        descripcion: descripcion !== undefined ? descripcion.trim() : areaExistente.descripcion,
        escuelaId: escuelaId !== undefined ? escuelaId : areaExistente.escuelaId
      },
      include: { escuela: true }
    });

    return res.status(200).json(areaActualizada);
  } catch (error) {
    console.error('[AreaCtrl] Error al actualizar área:', error);
    return res.status(500).json({ error: 'Error interno al actualizar el área.' });
  }
}

// Alternar estado activo/inhabilitado (Soft Delete)
export async function toggleEstadoArea(req, res) {
  try {
    const { id } = req.params;
    const { activo } = req.body;

    if (typeof activo !== 'boolean') {
      return res.status(400).json({ error: 'El campo "activo" debe ser un booleano.' });
    }

    const areaActualizada = await prisma.area.update({
      where: { id },
      data: { activo },
      include: { escuela: true }
    });

    return res.status(200).json({
      message: `El área "${areaActualizada.nombre}" fue ${activo ? 'activada' : 'inhabilitada'}.`,
      area: areaActualizada
    });
  } catch (error) {
    console.error('[AreaCtrl] Error al cambiar estado del área:', error);
    return res.status(500).json({ error: 'Error interno al actualizar el estado del área.' });
  }
}
