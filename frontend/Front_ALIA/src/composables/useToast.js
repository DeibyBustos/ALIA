import { ref } from "vue";

export function useToast() {
  const toastMessage = ref(null);

  const showToast = (msg) => (toastMessage.value = msg);
  const clearToast = () => (toastMessage.value = null);

  return { toastMessage, showToast, clearToast };
}
