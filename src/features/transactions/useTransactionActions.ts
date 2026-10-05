import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { useRepo } from "@/data";
import type { Transaction } from "@/domain/types";
import { haptic, toast } from "@/ui";

/** Acciones sobre un movimiento, cada una con su «Deshacer». */
export const useTransactionActions = () => {
  const repo = useRepo();
  const navigate = useNavigate();

  return useMemo(
    () => ({
      edit: (transaction: Transaction) =>
        void navigate({ to: "/movimientos/$id", params: { id: transaction.id } }),

      remove: (transaction: Transaction) => {
        repo.deleteTransaction(transaction.id);
        toast({
          message: "Movimiento borrado",
          action: { label: "Deshacer", onClick: () => repo.restoreTransaction(transaction.id) },
        });
      },

      /** Aprueba un pendiente: pasa a confirmado y empieza a contar en los totales. */
      approve: (transaction: Transaction) => {
        repo.approveTransaction(transaction.id);
        haptic();
        toast({
          message: "Aprobado",
          action: { label: "Deshacer", onClick: () => repo.unapproveTransaction(transaction.id) },
        });
      },

      /** Omite un pendiente: borrado lógico, para que la recurrencia no lo regenere. */
      skip: (transaction: Transaction) => {
        repo.deleteTransaction(transaction.id);
        toast({
          message: "Omitido",
          action: { label: "Deshacer", onClick: () => repo.restoreTransaction(transaction.id) },
        });
      },
    }),
    [repo, navigate],
  );
};

export type TransactionActions = ReturnType<typeof useTransactionActions>;
