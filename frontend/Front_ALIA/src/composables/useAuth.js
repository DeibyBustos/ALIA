import { ref, computed, onMounted } from "vue";
import { TOKEN_KEY, USER_KEY } from "@/App/storageKeys";

export function useAuth(baseUrlRef) {
  const user = ref(null);
  const token = ref(null);
  const loading = ref(true);

  onMounted(() => {
    try {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedUser = localStorage.getItem(USER_KEY);

      if (storedToken && storedUser) {
        token.value = storedToken;
        user.value = JSON.parse(storedUser);
      }
    } catch (e) {
      console.error("Error cargando sesión:", e);
    } finally {
      loading.value = false;
    }
  });

  const isAuthenticated = computed(() => !!user.value);

  function getAuthHeaders(extra = {}) {
    const headers = { "Content-Type": "application/json", ...extra };
    if (token.value) headers.Authorization = `Bearer ${token.value}`;
    return headers;
  }

  async function login(correo, contrasena) {
    try {
      const base = (baseUrlRef?.value || "").trim();
      if (!base) throw new Error("Base URL no configurada");

      const res = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo, contrasena }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Error en login");

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.usuario));

      token.value = data.token;
      user.value = data.usuario;

      return { exito: true };
    } catch (err) {
      return { exito: false, mensaje: err?.message || "Error al iniciar sesión" };
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    token.value = null;
    user.value = null;
  }

  function hasRole(rol) {
    return user.value?.roles?.includes(rol) || false;
  }

  function hasAnyRole(roles = []) {
    return roles.some((r) => hasRole(r));
  }

  async function fetchAuth(url, options = {}) {
    const headers = getAuthHeaders(options.headers || {});
    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      const data = await res.json().catch(() => ({}));
      if (data.codigo === "TOKEN_EXPIRADO" || data.codigo === "TOKEN_INVALIDO") {
        logout();
        throw new Error("Sesión expirada. Por favor inicia sesión nuevamente.");
      }
    }

    return res;
  }

  return {
    user,
    token,
    loading,
    isAuthenticated,
    login,
    logout,
    hasRole,
    hasAnyRole,
    getAuthHeaders,
    fetchAuth,
  };
}
