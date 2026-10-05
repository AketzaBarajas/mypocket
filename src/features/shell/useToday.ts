import { useEffect, useState } from "react";

import { todayFrom } from "@/domain/dates";
import type { IsoDate } from "@/domain/types";

/**
 * Fecha de negocio de hoy. Es el punto donde la interfaz lee el reloj: el
 * dominio siempre recibe «hoy» como parámetro. Se actualiza al cambiar de día
 * y al volver a primer plano.
 */
export const useToday = (): IsoDate => {
  const [today, setToday] = useState(() => todayFrom(new Date()));

  useEffect(() => {
    const refresh = () => setToday(todayFrom(new Date()));
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return today;
};
