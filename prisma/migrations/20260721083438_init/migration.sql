-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ROOT', 'COORDINADOR', 'SOLICITANTE');

-- CreateEnum
CREATE TYPE "TipoEspacio" AS ENUM ('AUDITORIO', 'LABORATORIO_DOCENCIA', 'LABORATORIO_INVESTIGACION', 'SALON');

-- CreateEnum
CREATE TYPE "EstadoEspacio" AS ENUM ('ACTIVO', 'MANTENIMIENTO', 'INHABILITADO');

-- CreateEnum
CREATE TYPE "EstadoEvento" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'SOLICITANTE',
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "escuelaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escuela" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Escuela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Espacio" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoEspacio" NOT NULL,
    "capacidad" INTEGER NOT NULL,
    "diasPermitidos" TEXT NOT NULL,
    "horaApertura" TEXT NOT NULL,
    "horaCierre" TEXT NOT NULL,
    "estado" "EstadoEspacio" NOT NULL DEFAULT 'ACTIVO',
    "escuelaId" TEXT,

    CONSTRAINT "Espacio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evento" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" TEXT NOT NULL,
    "prioridad" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,
    "asistentesEstimados" INTEGER NOT NULL,
    "estado" "EstadoEvento" NOT NULL DEFAULT 'PENDIENTE',
    "sugerenciaIA" TEXT,
    "espacioId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "detalles" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResetCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResetCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_escuelaId_fkey" FOREIGN KEY ("escuelaId") REFERENCES "Escuela"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Espacio" ADD CONSTRAINT "Espacio_escuelaId_fkey" FOREIGN KEY ("escuelaId") REFERENCES "Escuela"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_espacioId_fkey" FOREIGN KEY ("espacioId") REFERENCES "Espacio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
