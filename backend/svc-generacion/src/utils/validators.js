import { logger } from '../../../libreria-compartida/src/logger.js';

/**
 * Valida y sanitiza un número
 */
export function sanitizeNumber(value, defaultValue = 0, min = null, max = null) {
  const num = Number(value);

  // Verificar que sea un número válido
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    logger.warn({ value, defaultValue }, 'Valor numérico inválido, usando valor por defecto');
    return defaultValue;
  }

  // Verificar rangos si se especifican
  if (min !== null && num < min) {
    logger.warn({ value: num, min, defaultValue }, 'Valor menor al mínimo, usando valor por defecto');
    return defaultValue;
  }

  if (max !== null && num > max) {
    logger.warn({ value: num, max, defaultValue }, 'Valor mayor al máximo, usando valor por defecto');
    return defaultValue;
  }

  return num;
}

/**
 * Valida y sanitiza un string
 */
export function sanitizeString(value, defaultValue = '', allowEmpty = false) {
  // Valores claramente inválidos
  const invalidValues = [
    null,
    undefined,
    'null',
    'undefined',
    'NaN',
    '[object Object]'
  ];

  // Verificar si es un valor inválido
  if (invalidValues.includes(value)) {
    logger.warn({ value, defaultValue }, 'Valor de string inválido, usando valor por defecto');
    return defaultValue;
  }

  // Convertir a string y limpiar
  const str = String(value).trim();

  // Verificar si está vacío
  if (!allowEmpty && str === '') {
    logger.warn({ defaultValue }, 'String vacío no permitido, usando valor por defecto');
    return defaultValue;
  }

  return str;
}

/**
 * Valida etiqueta de grado (formato: número + letra, ej: 6A, 10B)
 */
export function validateGradoEtiqueta(etiqueta) {
  const sanitized = sanitizeString(etiqueta);

  if (!sanitized) {
    return { valid: false, error: 'Etiqueta de grado no puede estar vacía' };
  }

  // Formato esperado: 1-2 dígitos + 1 letra mayúscula
  const regex = /^([1-9]|1[0-1])[A-Z]$/;

  if (!regex.test(sanitized)) {
    return {
      valid: false,
      error: 'Formato de grado inválido. Use formato como: 6A, 7B, 10C (número 1-11 + letra)'
    };
  }

  return { valid: true, value: sanitized };
}

/**
 * Valida ID (debe ser número entero positivo)
 */
export function validateId(id, fieldName = 'id') {
  const numId = sanitizeNumber(id, -1);

  if (numId < 1 || !Number.isInteger(numId)) {
    return {
      valid: false,
      error: `${fieldName} debe ser un número entero positivo`
    };
  }

  return { valid: true, value: numId };
}

/**
 * Valida período ID
 */
export function validatePeriodoId(periodoId) {
  // Si no se proporciona, usar período 1 por defecto
  if (!periodoId || periodoId === null || periodoId === undefined) {
    logger.info('No se proporcionó periodo_id, usando período 1 por defecto');
    return { valid: true, value: 1 };
  }

  return validateId(periodoId, 'periodo_id');
}

/**
 * Valida objeto de parámetros completo
 */
export function validateExcelEstudiantesParams(params) {
  const errors = [];
  const validated = {};

  // Validar grado (requerido)
  if (!params.grado) {
    errors.push('El parámetro "grado" es requerido');
  } else {
    const gradoValidation = validateGradoEtiqueta(params.grado);
    if (!gradoValidation.valid) {
      errors.push(gradoValidation.error);
    } else {
      validated.grado = gradoValidation.value;
    }
  }

  // Validar periodo_id (opcional, usa 1 por defecto)
  const periodoValidation = validatePeriodoId(params.periodo_id);
  if (!periodoValidation.valid) {
    errors.push(periodoValidation.error);
  } else {
    validated.periodo_id = periodoValidation.value;
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, params: validated };
}

/**
 * Sanitiza resultado de base de datos
 */
export function sanitizeDatabaseRow(row) {
  const sanitized = {};

  for (const [key, value] of Object.entries(row)) {
    // Si es un número, validar
    if (typeof value === 'number') {
      sanitized[key] = sanitizeNumber(value, null);
    }
    // Si es string, validar
    else if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value, null, true);
    }
    // Otros tipos, dejar como están
    else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Valida formato de fecha
 */
export function validateDate(dateValue) {
  if (!dateValue) {
    return { valid: true, value: null };
  }

  const date = new Date(dateValue);

  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Formato de fecha inválido' };
  }

  return { valid: true, value: date };
}
