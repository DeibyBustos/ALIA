import { useState, useEffect, useCallback } from 'react';

const TOKEN_KEY = 'alia_token';
const USER_KEY = 'alia_user';

/**
 * Hook personalizado para manejo de autenticación
 */
export function useAuth(baseURL) {
  const [usuario, setUsuario] = useState(null);
  const [token, setToken] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Cargar sesión desde localStorage al iniciar
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedUser = localStorage.getItem(USER_KEY);

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUsuario(JSON.parse(storedUser));
      }
    } catch (err) {
      console.error('Error cargando sesión:', err);
    } finally {
      setCargando(false);
    }
  }, []);

  /**
   * Login con correo y contraseña
   */
  const login = useCallback(async (correo, contrasena) => {
    try {
      const respuesta = await fetch(`${baseURL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, contrasena })
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(datos.error || 'Error en login');
      }

      // Guardar token y usuario
      localStorage.setItem(TOKEN_KEY, datos.token);
      localStorage.setItem(USER_KEY, JSON.stringify(datos.usuario));

      setToken(datos.token);
      setUsuario(datos.usuario);

      return { exito: true };

    } catch (err) {
      console.error('Error en login:', err);
      return {
        exito: false,
        mensaje: err.message || 'Error al iniciar sesión'
      };
    }
  }, [baseURL]);

  /**
   * Logout - limpiar sesión
   */
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUsuario(null);
  }, []);

  /**
   * Verificar si el usuario tiene un rol específico
   */
  const tieneRol = useCallback((rol) => {
    return usuario?.roles?.includes(rol) || false;
  }, [usuario]);

  /**
   * Verificar si el usuario tiene al menos uno de los roles especificados
   */
  const tieneAlgunRol = useCallback((roles) => {
    return roles.some(rol => tieneRol(rol));
  }, [tieneRol]);

  /**
   * Obtener headers con autorización para requests
   */
  const getAuthHeaders = useCallback(() => {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }, [token]);

  /**
   * Hacer fetch con autenticación automática
   */
  const fetchAuth = useCallback(async (url, options = {}) => {
    const headers = {
      ...getAuthHeaders(),
      ...(options.headers || {})
    };

    const respuesta = await fetch(url, {
      ...options,
      headers
    });

    // Si el token expiró, hacer logout automático
    if (respuesta.status === 401) {
      const datos = await respuesta.json().catch(() => ({}));

      if (datos.codigo === 'TOKEN_EXPIRADO' || datos.codigo === 'TOKEN_INVALIDO') {
        logout();
        throw new Error('Sesión expirada. Por favor inicia sesión nuevamente.');
      }
    }

    return respuesta;
  }, [getAuthHeaders, logout]);

  return {
    usuario,
    token,
    cargando,
    autenticado: !!usuario,
    login,
    logout,
    tieneRol,
    tieneAlgunRol,
    getAuthHeaders,
    fetchAuth
  };
}
