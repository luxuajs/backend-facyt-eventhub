import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Cargar variables de entorno
dotenv.config();

// Importar rutas
import authRoutes from './routes/authRoutes.js';
import eventoRoutes from './routes/eventoRoutes.js';
import coordinadorRoutes from './routes/coordinadorRoutes.js';
import auditoriaRoutes from './routes/auditoriaRoutes.js';
import espacioRoutes from './routes/espacioRoutes.js';
import areaRoutes from './routes/areaRoutes.js';
import materiaRoutes from './routes/materiaRoutes.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de middlewares globales
app.use(cors());
app.use(express.json());

// Registro de endpoints de la API
app.use('/api/auth', authRoutes);
app.use('/api/eventos', eventoRoutes);
app.use('/api/coordinador', coordinadorRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api/espacios', espacioRoutes);
app.use('/api/areas', areaRoutes);
app.use('/api/materias', materiaRoutes);

// Endpoint de verificación de salud
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'UP', timestamp: new Date() });
});

// Soporte para servir el frontend de React en producción
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(distPath));
  
  // Capturar cualquier ruta que no sea de la API y servir el index.html de React
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Middleware global para el manejo de errores HTTP
app.use((err, req, res, next) => {
  console.error('[ErrorGlobal]', err);
  res.status(500).json({
    error: 'Ocurrió un error interno en el servidor.',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`[Servidor] Servidor Express corriendo en http://localhost:${PORT}`);
  console.log(`[Servidor] Entorno de ejecución: ${process.env.NODE_ENV}`);
});

export default app;
