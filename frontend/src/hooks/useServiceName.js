import { useStore } from "../lib/store"

export const useServiceName = () => {
  const { services } = useStore()
  return (id) => services.find((s) => s.id === id)?.name ?? id
}
