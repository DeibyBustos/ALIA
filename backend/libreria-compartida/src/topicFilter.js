export const RESPUESTA_FUERA_ALCANCE =
  "Estoy diseñado exclusivamente para el entorno educativo escolar. " +
  "Solo puedo ayudarte con preguntas relacionadas a la gestión académica del colegio: " +
  "estudiantes, calificaciones, horarios, asistencias y documentos institucionales. " +
  "¿En qué puedo ayudarte?";


// ── NUEVO: términos del dominio de gestión escolar ────────────────────────────
// Si el mensaje contiene cualquiera de estos, se permite sin revisar los filtros.
const DOMINIO_EDUCATIVO = [
  "estudiante", "alumno", "docente", "profesor", "coordinador",
  "rector", "administrativo", "acudiente", "padre de familia", "tutor",
  "calificacion", "nota", "boletin", "certificado", "matricula",
  "grado", "grupo", "curso", "seccion", "jornada",
  "planeacion", "plan de area", "asignatura", "materia",
  "periodo", "trimestre", "bimestre", "evaluacion", "examen",
  "asistencia", "inasistencia", "falta", "ausencia", "permiso",
  "horario", "cronograma", "acta", "circular", "planilla",
  "listado", "registro", "institucion", "colegio", "escuela", "sede",
  "excel", "pdf", "word", "informe", "reporte", "generar",
  "insertar", "eliminar", "consultar", "registrar",
];
// ─────────────────────────────────────────────────────────────────────────────


const GRUPOS_PROHIBIDOS = {
  entretenimiento: [
    "película", "serie", "netflix", "disney", "anime", "manga",
    "videojuego", "fortnite", "minecraft", "roblox", "playstation",
    "xbox", "nintendo", "twitch", "stream", "youtuber", "tiktok",
    "influencer", "meme", "reels",
  ],
  farándula: [
    "cantante", "actor", "actriz", "famoso", "celebrity", "reggaeton",
    "pelea de famosos", "escándalo", "novela", "telenovela",
  ],
  deportes_ocio: [
    "fútbol", "béisbol", "baloncesto", "tenis", "partido", "gol",
    "liga", "champions", "mundial", "olimpiadas", "apuestas deportivas",
  ],
  contenido_adulto: [
    "porno", "sex", "sexo", "nsfw", "OnlyFans", "adulto",
    "violencia explícita", "gore",
  ],
  política_religión: [
    "partido político", "presidente", "elecciones", "votaciones",
    "dios", "religión", "iglesia", "ateísmo", "oración",
  ],
  noticias: [
    "últimas noticias", "noticia de hoy", "breaking news",
    "qué pasó hoy", "periódico de hoy",
  ],
  ocio_general: [
    "receta de cocina", "chiste", "broma", "cuéntame un chiste",
    "horóscopo", "tarot", "lotería", "ruleta",
    "dime algo divertido", "aburro", "háblame de ti",
  ],
};

const PATRONES_INTENCION = [
  /^cuéntame (un|una)/i,
  /^escríbeme (una canción|un poema de amor|una historia de)/i,
  /^¿quién (ganó|va ganando|juega hoy)/i,
  /^(recomiéndame|sugiere|dime)\s+(una|un)\s+(serie|película|canción|juego)/i,
  /^¿cómo se llama el (cantante|actor|jugador)/i,
  /^háblame de (política|farándula|chismes)/i,
];


const MATERIAS_ESCOLARES = [
  "matemática", "algebra", "cálculo", "geometría", "trigonometría",
  "física", "química", "biología", "ciencias naturales",
  "historia", "geografía", "ciencias sociales",
  "lengua", "castellano", "literatura", "gramática", "ortografía",
  "inglés", "francés", "alemán",
  "filosofía", "ética", "educación cívica",
  "informática escolar", "tecnología",
  "economía", "estadística", "probabilidad",
  "educación física", "arte", "música",
];


function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function contienePalabraClave(textoNorm, palabras) {
  return palabras.some((p) => textoNorm.includes(normalizar(p)));
}


export function validarPregunta(pregunta) {
  if (!pregunta || typeof pregunta !== "string") {
    return { bloqueada: false, motivo: null };
  }

  const textoNorm = normalizar(pregunta.trim());

  // ── NUEVO: si es del dominio educativo escolar, permitir siempre ──────────
  if (contienePalabraClave(textoNorm, DOMINIO_EDUCATIVO)) {
    return { bloqueada: false, motivo: null };
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (contienePalabraClave(textoNorm, MATERIAS_ESCOLARES)) {
    return { bloqueada: false, motivo: null };
  }

  for (const patron of PATRONES_INTENCION) {
    if (patron.test(pregunta.trim())) {
      return { bloqueada: true, motivo: `patron: ${patron.source}` };
    }
  }

  for (const [grupo, palabras] of Object.entries(GRUPOS_PROHIBIDOS)) {
    if (contienePalabraClave(textoNorm, palabras)) {
      return { bloqueada: true, motivo: `grupo: ${grupo}` };
    }
  }

  return { bloqueada: false, motivo: null };
}