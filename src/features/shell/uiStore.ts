import { create } from "zustand";

/**
 * Estado efímero de la interfaz. El estado de negocio vive en Evolu; aquí solo
 * hay cosas que se pierden sin problema al recargar.
 */
interface UiState {
  /** Alguien pidió enfocar el buscador de Movimientos (atajo «/»). */
  readonly searchFocusRequested: boolean;
  readonly requestSearchFocus: () => void;
  readonly consumeSearchFocus: () => boolean;
  /** Última vez que la sincronización quedó al día (ms). */
  readonly lastSyncedAt: number | null;
  readonly markSynced: (now: number) => void;
}

// Marca de tiempo del estado del dispositivo; no es un dato de negocio.
const SYNC_KEY = "mypocket.lastSyncedAt";

const readLastSynced = (): number | null => {
  try {
    const value = Number(window.localStorage.getItem(SYNC_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};

export const useUi = create<UiState>((set, get) => ({
  searchFocusRequested: false,
  requestSearchFocus: () => set({ searchFocusRequested: true }),
  consumeSearchFocus: () => {
    const requested = get().searchFocusRequested;
    if (requested) set({ searchFocusRequested: false });
    return requested;
  },
  lastSyncedAt: readLastSynced(),
  markSynced: (now) => {
    set({ lastSyncedAt: now });
    try {
      window.localStorage.setItem(SYNC_KEY, String(now));
    } catch {
      // Sin almacenamiento, el dato se mantiene solo durante la sesión.
    }
  },
}));
