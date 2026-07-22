import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

let genAI = null;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'tu_api_key_de_gemini') {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

export async function generateAlternativeSuggestion(espacioNombre, conflictDetails, availableSlots) {
  if (!genAI) {
    console.warn('[Gemini] API Key no configurada o por defecto. Usando fallback de slots locales.');
    const firstSlot = availableSlots[0] || {};
    return {
      sugerencia: `El espacio "${espacioNombre}" no está disponible en la fecha/hora solicitada. Te sugerimos reagendar para el ${firstSlot.fecha || ''} de ${firstSlot.horaInicio || ''} a ${firstSlot.horaFin || ''}.`,
      fechaPropuesta: firstSlot.fecha || null,
      horaInicioPropuesta: firstSlot.horaInicio || null,
      horaFinPropuesta: firstSlot.horaFin || null,
      fallback: true
    };
  }

  // Se utiliza gemini-1.5-pro como modelo por defecto para alta calidad de razonamiento
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

  const prompt = `
    Actúa como el asistente inteligente de FaCyT EventHub.
    Ha ocurrido un conflicto de reserva para el espacio físico: "${espacioNombre}".
    
    Detalles de la reserva que generó el conflicto:
    - Fecha solicitada: ${conflictDetails.fecha}
    - Hora de Inicio: ${conflictDetails.horaInicio}
    - Hora de Fin: ${conflictDetails.horaFin}
    - Causa detallada del conflicto: ${conflictDetails.reason}

    Siguientes 3 bloques de tiempo disponibles en nuestra base de datos (PostgreSQL):
    ${JSON.stringify(availableSlots, null, 2)}

    Tu tarea:
    1. Elige la mejor alternativa de entre los 3 bloques de tiempo disponibles.
    2. Genera una explicación muy amigable, profesional y académica en español recomendando esa opción específica.
    3. Responde única y exclusivamente con un objeto JSON válido con este formato exacto:
    {
      "sugerencia": "Mensaje explicativo y empático con la sugerencia",
      "fechaPropuesta": "La fecha seleccionada (YYYY-MM-DD)",
      "horaInicioPropuesta": "La hora de inicio seleccionada (HH:MM)",
      "horaFinPropuesta": "La hora de fin seleccionada (HH:MM)"
    }
  `;

  // Promesa de la llamada al API
  const apiCall = (async () => {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = result.response.text();
    return JSON.parse(responseText);
  })();

  // Promesa de timeout (4000ms)
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Gemini API Timeout')), 4000)
  );

  try {
    return await Promise.race([apiCall, timeout]);
  } catch (error) {
    console.error('[Gemini] Excepción o Timeout en Gemini SDK, aplicando fallback:', error.message);
    const firstSlot = availableSlots[0] || {};
    return {
      sugerencia: `El espacio "${espacioNombre}" está ocupado o cerrado en ese bloque. Sugerencia automática: reagendar para el ${firstSlot.fecha || ''} en horario de ${firstSlot.horaInicio || ''} a ${firstSlot.horaFin || ''}.`,
      fechaPropuesta: firstSlot.fecha || null,
      horaInicioPropuesta: firstSlot.horaInicio || null,
      horaFinPropuesta: firstSlot.horaFin || null,
      fallback: true
    };
  }
}
