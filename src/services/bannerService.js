/**
 * BannerService
 * Genera un banner visual estético y profesional para el evento en formato SVG / Data URL.
 */

export function generateEventBannerSVG(evento, forcedTheme) {
  const titulo = evento.titulo || 'Evento FaCyT';
  const tipo = (evento.tipo || 'EVENTO').toUpperCase();
  const fechaStr = evento.fecha
    ? new Date(evento.fecha).toLocaleDateString('es-VE', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }).toUpperCase()
    : '';
  const horario = `${evento.horaInicio || ''} - ${evento.horaFin || ''}`;
  const lugar = evento.espacio?.nombre || 'Espacio FaCyT';
  const organizador = evento.usuario?.nombre || 'FaCyT UC';

  // Escapar XML / HTML chars
  const escapeXml = (unsafe) => String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const safeTitulo = escapeXml(titulo);
  const safeTipo = escapeXml(tipo);
  const safeFecha = escapeXml(fechaStr);
  const safeHorario = escapeXml(horario);
  const safeLugar = escapeXml(lugar);
  const safeOrganizador = escapeXml(organizador);

  // Clasificador de Temas
  const cleanText = (str) => {
    return String(str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  };

  // Definición de paletas de colores y marcas de agua por tema
  const themes = {
    COMPUTACION: {
      bgStop0: '#030712',
      bgStop50: '#0b1329',
      bgStop100: '#1e1b4b',
      accent0: '#06b6d4',
      accent50: '#3b82f6',
      accent100: '#6366f1',
      badgeBg: 'rgba(6, 182, 212, 0.15)',
      badgeBorder: 'rgba(6, 182, 212, 0.3)',
      badgeText: '#22d3ee',
      watermark: `
        <g transform="translate(800, 740)" stroke="rgba(6, 182, 212, 0.05)" stroke-width="4" fill="none">
          <rect x="-100" y="-80" width="200" height="160" rx="12" />
          <path d="M-80 -40 L-20 -40 M-80 -10 L0 -10 M-80 20 L-40 20" />
          <path d="M40 10 L60 -10 L40 -30" stroke-width="6" />
          <circle cx="50" cy="30" r="10" fill="rgba(6, 182, 212, 0.04)" />
        </g>
      `
    },
    QUIMICA: {
      bgStop0: '#021e1a',
      bgStop50: '#042f2b',
      bgStop100: '#115e59',
      accent0: '#10b981',
      accent50: '#14b8a6',
      accent100: '#06b6d4',
      badgeBg: 'rgba(20, 184, 166, 0.15)',
      badgeBorder: 'rgba(20, 184, 166, 0.3)',
      badgeText: '#2dd4bf',
      watermark: `
        <g transform="translate(800, 740)" stroke="rgba(20, 184, 166, 0.05)" stroke-width="4" fill="none">
          <path d="M-30 -100 L30 -100 M-20 -100 L-20 -50 L-80 50 L-80 80 L80 80 L80 50 L20 -50 L20 -100" />
          <line x1="-60" y1="30" x2="60" y2="30" stroke-dasharray="6 6" />
          <circle cx="0" cy="-10" r="8" />
          <circle cx="-30" cy="40" r="6" />
          <circle cx="20" cy="50" r="10" />
          <polygon points="120,-60 160,-80 200,-60 200,-20 160,0 120,-20" stroke-width="2" />
        </g>
      `
    },
    FISICA: {
      bgStop0: '#090514',
      bgStop50: '#180b2a',
      bgStop100: '#3b0764',
      accent0: '#8b5cf6',
      accent50: '#d946ef',
      accent100: '#f97316',
      badgeBg: 'rgba(217, 70, 239, 0.15)',
      badgeBorder: 'rgba(217, 70, 239, 0.3)',
      badgeText: '#f472b6',
      watermark: `
        <g transform="translate(800, 740)" stroke="rgba(217, 70, 239, 0.05)" stroke-width="4" fill="none">
          <ellipse rx="150" ry="50" transform="rotate(30)" />
          <ellipse rx="150" ry="50" transform="rotate(-30)" />
          <ellipse rx="150" ry="50" transform="rotate(90)" />
          <circle r="25" fill="rgba(217, 70, 239, 0.06)" />
          <circle cx="90" cy="50" r="8" fill="rgba(217, 70, 239, 0.1)" />
          <circle cx="-100" cy="-30" r="6" fill="rgba(217, 70, 239, 0.1)" />
        </g>
      `
    },
    BIOLOGIA: {
      bgStop0: '#022c22',
      bgStop50: '#064e3b',
      bgStop100: '#14532d',
      accent0: '#10b981',
      accent50: '#84cc16',
      accent100: '#a3e635',
      badgeBg: 'rgba(16, 185, 129, 0.15)',
      badgeBorder: 'rgba(16, 185, 129, 0.3)',
      badgeText: '#34d399',
      watermark: `
        <g transform="translate(800, 740)" stroke="rgba(16, 185, 129, 0.05)" stroke-width="4" fill="none">
          <path d="M-100 -50 Q-50 50 0 -50 T100 -50" />
          <path d="M-100 50 Q-50 -50 0 50 T100 50" />
          <line x1="-75" y1="-30" x2="-75" y2="30" />
          <line x1="-50" y1="-10" x2="-50" y2="10" />
          <line x1="-25" y1="20" x2="-25" y2="-20" />
          <line x1="25" y1="-20" x2="25" y2="20" />
          <line x1="50" y1="10" x2="50" y2="-10" />
          <line x1="75" y1="30" x2="75" y2="-30" />
          <path d="M -120,-80 C -80,-80 -80,-120 -120,-120 C -160,-120 -160,-80 -120,-80 Z" fill="rgba(16, 185, 129, 0.02)" />
        </g>
      `
    },
    MATEMATICA: {
      bgStop0: '#020617',
      bgStop50: '#0f172a',
      bgStop100: '#1e293b',
      accent0: '#4f46e5',
      accent50: '#6366f1',
      accent100: '#38bdf8',
      badgeBg: 'rgba(99, 102, 241, 0.15)',
      badgeBorder: 'rgba(99, 102, 241, 0.3)',
      badgeText: '#a5b4fc',
      watermark: `
        <g transform="translate(800, 740)" fill="none" stroke="rgba(99, 102, 241, 0.05)" stroke-width="4">
          <text x="0" y="20" font-family="serif" font-size="260" font-weight="bold" fill="rgba(99, 102, 241, 0.04)" stroke="none" text-anchor="middle">π</text>
          <rect x="-120" y="-120" width="240" height="240" rx="4" />
          <circle cx="-120" cy="-120" r="240" />
          <circle cx="120" cy="120" r="120" />
        </g>
      `
    },
    ACADEMICO: {
      bgStop0: '#030712',
      bgStop50: '#0d1527',
      bgStop100: '#111827',
      accent0: '#eab308',
      accent50: '#f59e0b',
      accent100: '#3b82f6',
      badgeBg: 'rgba(234, 179, 8, 0.15)',
      badgeBorder: 'rgba(234, 179, 8, 0.3)',
      badgeText: '#fef08a',
      watermark: `
        <g transform="translate(800, 740)" stroke="rgba(234, 179, 8, 0.05)" stroke-width="4" fill="none">
          <polygon points="0,-80 120,-30 0,20 -120,-30" fill="rgba(234, 179, 8, 0.02)" />
          <path d="M-60,-5 L-60,40 C-60,70 60,70 60,40 L60,-5" />
          <path d="M120,-30 L120,30 C120,40 100,60 100,60" />
          <path d="M-140,50 C-170,0 -120,-60 -100,-70" />
          <path d="M140,50 C170,0 120,-60 100,-70" />
        </g>
      `
    },
    DEPORTES: {
      bgStop0: '#0f0505',
      bgStop50: '#1f0909',
      bgStop100: '#450a0a',
      accent0: '#ea580c',
      accent50: '#dc2626',
      accent100: '#f59e0b',
      badgeBg: 'rgba(234, 88, 12, 0.15)',
      badgeBorder: 'rgba(234, 88, 12, 0.3)',
      badgeText: '#ffedd5',
      watermark: `
        <g transform="translate(800, 740)" stroke="rgba(234, 88, 12, 0.05)" stroke-width="4" fill="none">
          <path d="M-50,-80 L50,-80 M-40,-80 L-40,-20 C-40,20 40,20 40,-20 L40,-80" />
          <path d="M0,15 L0,60 M-30,60 L30,60" />
          <path d="M-40,-60 C-70,-60 -70,-30 -40,-30" />
          <path d="M40,-60 C70,-60 70,-30 40,-30" />
          <polygon points="0,-120 10,-95 35,-95 15,-80 22,-55 0,-70 -22,-55 -15,-80 -35,-95 -10,-95" fill="rgba(234, 88, 12, 0.03)" />
        </g>
      `
    },
    CULTURA: {
      bgStop0: '#0b0214',
      bgStop50: '#1c0734',
      bgStop100: '#4c0519',
      accent0: '#d946ef',
      accent50: '#ec4899',
      accent100: '#f43f5e',
      badgeBg: 'rgba(236, 72, 153, 0.15)',
      badgeBorder: 'rgba(236, 72, 153, 0.3)',
      badgeText: '#fbcfe8',
      watermark: `
        <g transform="translate(800, 740)" stroke="rgba(236, 72, 153, 0.05)" stroke-width="4" fill="none">
          <circle cx="-30" cy="50" r="20" />
          <circle cx="40" cy="20" r="20" />
          <path d="M-10,50 L-10,-50 L60,-80 L60,20" />
          <path d="M-10,-10 L60,-40" />
          <path d="M-100,-40 Q-80,-20 -60,-40 Q-80,-60 -100,-40 Z" fill="rgba(236, 72, 153, 0.03)" />
          <path d="M100,-10 Q120,10 140,-10 Q120,-30 100,-10 Z" fill="rgba(236, 72, 153, 0.03)" />
        </g>
      `
    },
    GENERAL: {
      bgStop0: '#090d16',
      bgStop50: '#0f172a',
      bgStop100: '#1e1b4b',
      accent0: '#6366f1',
      accent50: '#a855f7',
      accent100: '#ec4899',
      badgeBg: 'rgba(99, 102, 241, 0.15)',
      badgeBorder: 'rgba(99, 102, 241, 0.3)',
      badgeText: '#c7d2fe',
      watermark: `
        <g transform="translate(800, 740)" stroke="rgba(99, 102, 241, 0.04)" stroke-width="4" fill="none">
          <circle r="120" />
          <circle cx="60" cy="60" r="100" />
          <path d="M-150,-150 L150,150 M-150,150 L150,-150" stroke-dasharray="10 10" />
        </g>
      `
    }
  };

  const getTheme = () => {
    // 1. Priorizar tema forzado por la IA (Gemini)
    if (forcedTheme && themes[forcedTheme.toUpperCase()]) {
      return forcedTheme.toUpperCase();
    }

    // 2. Verificar escuela del usuario organizador
    const escuela = cleanText(evento.usuario?.escuela?.nombre);
    if (escuela.includes('computacion')) return 'COMPUTACION';
    if (escuela.includes('quimica')) return 'QUIMICA';
    if (escuela.includes('fisica')) return 'FISICA';
    if (escuela.includes('biologia')) return 'BIOLOGIA';
    if (escuela.includes('matematica')) return 'MATEMATICA';

    // 3. Escanear título, descripción y materia localmente
    const content = cleanText(`${evento.titulo} ${evento.descripcion || ''} ${evento.materia || ''} ${evento.tipo || ''}`);
    
    if (/\b(computacion|programacion|software|algoritmo|ia|inteligencia artificial|web|desarrollo|ciberseguridad|tecnologia|redes|datos|sistemas|code|coding|computo|informatica|db|base de datos|cloud|frontend|backend|shader|opengl|webgl|videojuegos)\b/.test(content)) {
      return 'COMPUTACION';
    }
    if (/\b(quimica|reaccion|molecula|compuesto|organica|analitica|laboratorio de quimica|bioquimica|farmacia|quimico|atomo|tabla periodica)\b/.test(content)) {
      return 'QUIMICA';
    }
    if (/\b(fisica|cuantica|particula|energia|relatividad|mecanica|astronomia|termodinamica|optica|magnetismo|fisico)\b/.test(content)) {
      return 'FISICA';
    }
    if (/\b(biologia|celula|genetica|ecologia|botanica|zoologia|biodiversidad|organismo|animal|planta|ecosistema|flora|fauna|salud|medicina|microbiologia)\b/.test(content)) {
      return 'BIOLOGIA';
    }
    if (/\b(matematica|calculo|algebra|geometria|estadistica|teorema|ecuacion|aritmetica|probabilidad|matematico|derivada|integral)\b/.test(content)) {
      return 'MATEMATICA';
    }
    if (/\b(tesis|defensa|grado|doctorado|maestria|academico|induccion|biblioteca|investigacion|proyecto de grado|coloquio|seminario)\b/.test(content)) {
      return 'ACADEMICO';
    }
    if (/\b(deporte|deportivo|futbol|beisbol|basquetbol|ajedrez|ping pong|gimnasio|torneo|campeonato|copa|juego|maraton|atletismo|bienestar)\b/.test(content)) {
      return 'DEPORTES';
    }
    if (/\b(cultura|cultural|teatro|cine|pelicula|musica|concierto|arte|pintura|danza|baile|festival|poesia|literatura|obra|exposicion)\b/.test(content)) {
      return 'CULTURA';
    }

    return 'GENERAL';
  };

  const theme = getTheme();
  const selectedTheme = themes[theme] || themes.GENERAL;

  // SVG 1080x1080 (Formato cuadrado ideal para post de Instagram y Facebook)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
  <defs>
    <!-- Gradiente de fondo con tonos adaptados al tema del evento -->
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${selectedTheme.bgStop0}" />
      <stop offset="50%" stop-color="${selectedTheme.bgStop50}" />
      <stop offset="100%" stop-color="${selectedTheme.bgStop100}" />
    </linearGradient>

    <!-- Gradiente de Acento / Neón adaptado -->
    <linearGradient id="accentGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${selectedTheme.accent0}" />
      <stop offset="50%" stop-color="${selectedTheme.accent50}" />
      <stop offset="100%" stop-color="${selectedTheme.accent100}" />
    </linearGradient>

    <linearGradient id="cardGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(255, 255, 255, 0.08)" />
      <stop offset="100%" stop-color="rgba(255, 255, 255, 0.02)" />
    </linearGradient>

    <!-- Sombras y Resplandores -->
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="25" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>

    <filter id="dropShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.5"/>
    </filter>
  </defs>

  <!-- Fondo Principal -->
  <rect width="1080" height="1080" fill="url(#bgGradient)" />

  <!-- Círculos Decorativos con Blur Neón temáticos -->
  <circle cx="150" cy="150" r="300" fill="${selectedTheme.accent0}" opacity="0.15" filter="url(#glow)" />
  <circle cx="930" cy="930" r="350" fill="${selectedTheme.accent50}" opacity="0.15" filter="url(#glow)" />

  <!-- Malla geométrica de fondo -->
  <path d="M 0 200 L 1080 200 M 0 400 L 1080 400 M 0 600 L 1080 600 M 0 800 L 1080 800" stroke="rgba(255,255,255,0.03)" stroke-width="1.5"/>
  <path d="M 200 0 L 200 1080 M 400 0 L 400 1080 M 600 0 L 600 1080 M 800 0 L 800 1080" stroke="rgba(255,255,255,0.03)" stroke-width="1.5"/>

  <!-- Encabezado Institucional FaCyT -->
  <g transform="translate(80, 80)">
    <!-- Insignia FaCyT adaptada -->
    <rect width="180" height="42" rx="21" fill="${selectedTheme.badgeBg}" stroke="${selectedTheme.badgeBorder}" stroke-width="1.5" />
    <text x="90" y="26" fill="${selectedTheme.badgeText}" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="700" letter-spacing="2" text-anchor="middle">FACYT • UC</text>

    <!-- Subtítulo App -->
    <text x="920" y="26" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" letter-spacing="1" text-anchor="end">EVENTHUB PLATFORM</text>
  </g>

  <!-- Tarjeta Central del Evento (Glassmorphism) -->
  <rect x="80" y="160" width="920" height="760" rx="32" fill="url(#cardGradient)" stroke="rgba(255, 255, 255, 0.15)" stroke-width="2" filter="url(#dropShadow)" />

  <!-- Línea Neón Superior de la Tarjeta -->
  <rect x="140" y="160" width="800" height="4" rx="2" fill="url(#accentGradient)" filter="url(#glow)" />

  <!-- Marca de agua vectorial del tema (dentro de la tarjeta) -->
  ${selectedTheme.watermark}

  <!-- Badge de Tipo de Evento -->
  <g transform="translate(130, 220)">
    <rect width="220" height="48" rx="12" fill="url(#accentGradient)" />
    <text x="110" y="31" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="800" letter-spacing="2" text-anchor="middle">${safeTipo}</text>
  </g>

  <!-- Título Principal del Evento -->
  <foreignObject x="130" y="295" width="820" height="240">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: system-ui, -apple-system, sans-serif; color: #ffffff; font-size: 46px; font-weight: 900; line-height: 1.2; text-shadow: 0 4px 12px rgba(0,0,0,0.4); display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;">
      ${safeTitulo}
    </div>
  </foreignObject>

  <!-- Separador Elegante -->
  <line x1="130" y1="560" x2="950" y2="560" stroke="rgba(255, 255, 255, 0.15)" stroke-width="2" stroke-dasharray="8 8" />

  <!-- Bloque de Información (Fecha, Horario, Ubicación, Organiza) -->
  <g transform="translate(130, 600)">
    <!-- Ícono Fecha + Texto -->
    <g transform="translate(0, 0)">
      <rect width="64" height="64" rx="16" fill="rgba(99, 102, 241, 0.25)" stroke="rgba(129, 140, 248, 0.3)" stroke-width="1.5"/>
      <text x="32" y="40" fill="#818cf8" font-family="system-ui, -apple-system, sans-serif" font-size="28" text-anchor="middle">📅</text>
      
      <text x="88" y="26" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="700" letter-spacing="1">FECHA DEL EVENTO</text>
      <text x="88" y="54" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700">${safeFecha}</text>
    </g>

    <!-- Ícono Horario + Texto -->
    <g transform="translate(430, 0)">
      <rect width="64" height="64" rx="16" fill="rgba(168, 85, 247, 0.25)" stroke="rgba(192, 132, 252, 0.3)" stroke-width="1.5"/>
      <text x="32" y="40" fill="#c084fc" font-family="system-ui, -apple-system, sans-serif" font-size="28" text-anchor="middle">⏰</text>

      <text x="88" y="26" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="700" letter-spacing="1">HORARIO</text>
      <text x="88" y="54" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700">${safeHorario}</text>
    </g>

    <!-- Ícono Lugar + Texto -->
    <g transform="translate(0, 110)">
      <rect width="64" height="64" rx="16" fill="rgba(236, 72, 153, 0.25)" stroke="rgba(244, 114, 182, 0.3)" stroke-width="1.5"/>
      <text x="32" y="40" fill="#f472b6" font-family="system-ui, -apple-system, sans-serif" font-size="28" text-anchor="middle">📍</text>

      <text x="88" y="26" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="700" letter-spacing="1">LUGAR / ESPACIO</text>
      <text x="88" y="54" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700">${safeLugar}</text>
    </g>

    <!-- Ícono Organizador + Texto -->
    <g transform="translate(430, 110)">
      <rect width="64" height="64" rx="16" fill="rgba(34, 197, 94, 0.25)" stroke="rgba(74, 222, 128, 0.3)" stroke-width="1.5"/>
      <text x="32" y="40" fill="#4ade80" font-family="system-ui, -apple-system, sans-serif" font-size="28" text-anchor="middle">👤</text>

      <text x="88" y="26" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="700" letter-spacing="1">ORGANIZA</text>
      <text x="88" y="54" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700">${safeOrganizador}</text>
    </g>
  </g>

  <!-- Pie de Banner e Invitación -->
  <g transform="translate(80, 960)">
    <rect width="920" height="60" rx="16" fill="rgba(15, 23, 42, 0.6)" stroke="rgba(255, 255, 255, 0.1)" stroke-width="1" />
    <text x="460" y="36" fill="#e2e8f0" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="600" text-anchor="middle">
      ✨ Entradas y participación gestionada a través de <tspan fill="${selectedTheme.accent0}" font-weight="800">FaCyT EventHub</tspan>
    </text>
  </g>
</svg>`;

  return svg;
}
