"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { saisirFlux } from "@/modules/tresorerie/actions/tresorerie";
import {
  alerteEspeces,
  PLAFOND_ESPECES_DT,
} from "@/modules/tresorerie/services/conformite-especes";
import { COMPTES, LIBELLES_COMPTE } from "@/modules/tresorerie/services/caisse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Saisie d'une opération au journal.
 *
 * Le plafond légal des espèces s'affiche pendant la frappe, dès que le
 * montant et le mode de paiement le déclenchent — et n'empêche pas
 * d'enregistrer. Le Trésorier saisit ce qui s'est passé, pas ce qui aurait
 * dû se passer : si le règlement a bien été fait en liquide, le refuser
 * n'aurait fait que sortir l'opération des comptes.
 */
export function FormulaireFlux({
  categories,
  typesFlux,
  modesPaiement,
}: {
  categories: string[];
  typesFlux: readonly string[];
  modesPaiement: readonly string[];
}) {
  const [type, setType] = useState<string>(typesFlux[0] ?? "ENCAISSEMENT");
  const [montant, setMontant] = useState("");
  const [modePaiement, setModePaiement] = useState<string>(
    modesPaiement[0] ?? "VIREMENT"
  );

  const alerte = alerteEspeces({
    type: type === "DECAISSEMENT" ? "DECAISSEMENT" : "ENCAISSEMENT",
    modePaiement,
    montant: Number(montant) || 0,
  });

  return (
    <form action={saisirFlux} className="space-y-3">
      <div className="flex gap-2">
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="flex h-10 flex-1 rounded-md border border-border bg-card px-2 text-sm"
        >
          {typesFlux.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <Input
          name="montant"
          type="number"
          min={0.01}
          step="0.01"
          required
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          placeholder="Montant DT"
          className="w-32"
        />
      </div>
      <Input name="tiers" required placeholder="Tiers (client, fournisseur…) *" />
      <div className="flex gap-2">
        <select
          name="categorie"
          required
          className="flex h-10 flex-1 rounded-md border border-border bg-card px-2 text-sm"
        >
          <option value="">— catégorie budgétaire —</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          name="modePaiement"
          value={modePaiement}
          onChange={(e) => setModePaiement(e.target.value)}
          className="flex h-10 rounded-md border border-border bg-card px-2 text-sm"
        >
          {modesPaiement.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      {/* Laissé vide, l'avoir se déduit du mode de paiement — mais on peut
          encaisser un chèque et le garder en caisse. */}
      <select
        name="compte"
        defaultValue=""
        aria-label="Avoir mouvementé"
        className="flex h-10 w-full rounded-md border border-border bg-card px-2 text-sm"
      >
        <option value="">Avoir : d&apos;après le mode de paiement</option>
        {COMPTES.map((c) => (
          <option key={c} value={c}>
            {LIBELLES_COMPTE[c]}
          </option>
        ))}
      </select>
      <Input name="date" type="date" className="h-10" />
      <Input
        name="justificatifRef"
        placeholder="Justificatif (lien Drive / n° de pièce)"
      />
      <Input name="notes" placeholder="Notes" />

      {alerte ? <AlerteEspeces motif={alerte.motif} consigne={alerte.consigne} /> : null}

      <Button type="submit" className="w-full">
        {alerte ? "Enregistrer malgré le dépassement" : "Enregistrer le flux"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Sans justificatif, le flux reste « en attente » et bloque la clôture
        mensuelle. Au-delà de {PLAFOND_ESPECES_DT} DT, les espèces sont
        signalées mais jamais refusées.
      </p>
    </form>
  );
}

/** Encadré d'alerte partagé par la saisie et la correction d'une opération. */
export function AlerteEspeces({
  motif,
  consigne,
}: {
  motif: string;
  consigne: string;
}) {
  return (
    <div
      role="alert"
      className="flex gap-2 rounded-md border border-danger/40 bg-danger/10 p-3 text-xs text-danger"
    >
      <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        <span className="font-medium">{motif}</span>{" "}
        <span className="text-danger/80">{consigne}</span>
      </span>
    </div>
  );
}
