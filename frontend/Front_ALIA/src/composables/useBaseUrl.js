import { ref } from "vue";
import { STORAGE_KEY_BASE_URL } from "@/app/storageKeys";

export function useBaseUrl() {
  const envDefault = import.meta.env.VITE_API_BASE || "http://localhost:8080";

  const baseUrl = ref(
    localStorage.getItem(STORAGE_KEY_BASE_URL) || envDefault
  );

  function saveBaseUrl(value) {
    const v = String(value || "").trim().replace(/\/+$/, "");
    baseUrl.value = v;
    localStorage.setItem(STORAGE_KEY_BASE_URL, v);
  }

  return { baseUrl, saveBaseUrl };
}