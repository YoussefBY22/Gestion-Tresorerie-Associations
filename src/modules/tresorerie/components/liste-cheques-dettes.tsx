"use client";

import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import {
  majStatutChequeOuDette,
  modifierChequeOuDette,
  supprimerChequeOuDette,
} from "@/modules/tresorerie/actions/registres";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Registre des chèques et dettes — une ligne par engagement.
 *
 * Le statut se changeait déjà d'un clic, mais rien d'autre : un numéro de
 * chèque mal saisi ou une échéance décalée obligeait à créer une seconde
 * ligne pour le même engagement, et le registre comptait double.
 */

import {
  PiecesRegistre,
  type PieceVue,
} from "@/modules/tresorerie/components/pieces-registre";

export type LigneChequeDette = {
  id: string;
  type: string;
  tiers: string;
  montant: number;
  dateEmission: string;
  dateEmissionISO: string;
  dateEcheance: string;
  dateEcheanceISO: string;
  statut: string;
  reference: string;
  pieces: PieceVue[];
};

type Options = {
  types: readonly string[];
  libellesType: Record<string, string>;
  statuts: readonly string[];
  libellesStatut: Record<string, string>;
};

const CHAMP =
  "h-8 rounded-md border border-border bg-card px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ListeChequesDettes({
  lignes,
  options,
  peutEcrire,
}: {
  lignes: LigneChequeDette[];
  options: Options;
  peutEcrire: boolean;
}) {
  const [enEdition, setEnEdition] = useState<string | null>(null);

  return (
    <>
      {lignes.map((l) =>
        enEdition === l.id ? (
          <div
            key={l.id}
            className="rounded-md border border-border bg-muted/40 p-3 text-sm"
          >
            <form
              action={async (donnees) => {
                await modifierChequeOuDette(donnees);
                setEnEdition(null);
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="ligneId" value={l.id} />
              <select
                name="type"
                defaultValue={l.type}
                className={CHAMP}
                aria-label="Type d'engagement"
              >
                {options.types.map((t) => (
                  <option key={t} value={t}>
                    {options.libellesType[t]}
                  </option>
                ))}
              </select>
              <Input
                name="tiers"
                defaultValue={l.tiers}
                required
                minLength={2}
                placeholder="Tiers"
                className="h-8 w-44 text-xs"
                aria-label="Tiers"
              />
              <Input
                name="montant"
                type="number"
                min={0.01}
                step="0.001"
                defaultValue={l.montant}
                required
                className="h-8 w-28 text-right text-xs"
                aria-label="Montant"
              />
              <Input
                name="dateEmission"
                type="date"
                defaultValue={l.dateEmissionISO}
                required
                className="h-8 w-36 text-xs"
                aria-label="Date d'émission"
              />
              <Input
                name="dateEcheance"
                type="date"
                defaultValue={l.dateEcheanceISO}
                className="h-8 w-36 text-xs"
                aria-label="Échéance"
              />
              <select
                name="statut"
                defaultValue={l.statut}
                className={CHAMP}
                aria-label="Statut"
              >
                {options.statuts.map((st) => (
                  <option key={st} value={st}>
                    {options.libellesStatut[st]}
                  </option>
                ))}
              </select>
              <Input
                name="reference"
                defaultValue={l.reference}
                placeholder="Référence"
                className="h-8 w-40 text-xs"
                aria-label="Référence"
              />
              <button
                type="submit"
                title="Enregistrer la correction"
                aria-label="Enregistrer la correction"
                className="rounded p-1.5 text-success hover:bg-success/10"
              >
                <Check size={15} />
              </button>
              <button
                type="button"
                title="Annuler"
                aria-label="Annuler la correction"
                onClick={() => setEnEdition(null)}
                className="rounded p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X size={15} />
              </button>
            </form>
          </div>
        ) : (
          <div
            key={l.id}
            className="group rounded-md border border-border p-3 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{options.libellesType[l.type]}</Badge>
              <span className="font-medium">{l.tiers}</span>
              <span className="text-xs text-muted-foreground">
                {l.montant.toLocaleString("fr-FR")} DT
              </span>
              <Badge
                variant={
                  l.statut === "SOLDE"
                    ? "success"
                    : l.statut === "ANNULE"
                      ? "muted"
                      : "warning"
                }
              >
                {options.libellesStatut[l.statut]}
              </Badge>
              {peutEcrire ? (
                <div className="ml-auto flex items-center gap-0.5 opacity-40 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    title="Corriger cette ligne"
                    aria-label={`Corriger la ligne de ${l.tiers}`}
                    onClick={() => setEnEdition(l.id)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil size={14} />
                  </button>
                  <form
                    action={supprimerChequeOuDette}
                    onSubmit={(e) => {
                      if (
                        !window.confirm(
                          `Supprimer « ${l.tiers} — ${l.montant} DT » du registre ?\n\nLa ligne part à la corbeille de la trésorerie et reste restaurable 30 jours.`
                        )
                      ) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="ligneId" value={l.id} />
                    <button
                      type="submit"
                      title="Supprimer cette ligne"
                      aria-label={`Supprimer la ligne de ${l.tiers}`}
                      className="rounded p-1.5 text-danger hover:bg-danger/10"
                    >
                      <Trash2 size={14} />
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Émis le {l.dateEmission}
              {l.dateEcheance ? ` · échéance ${l.dateEcheance}` : ""}
              {l.reference ? ` · réf. ${l.reference}` : ""}
            </p>
            {peutEcrire && l.statut === "EN_COURS" ? (
              <form
                action={majStatutChequeOuDette}
                className="mt-2 flex items-center gap-2"
              >
                <input type="hidden" name="ligneId" value={l.id} />
                <select
                  name="statut"
                  aria-label={`Statut de ${l.tiers}`}
                  className="h-7 rounded-md border border-border bg-card px-2 text-xs"
                >
                  {options.statuts.map((st) => (
                    <option key={st} value={st}>
                      {options.libellesStatut[st]}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="ghost"
                  type="submit"
                  className="h-7 text-xs"
                >
                  Mettre à jour
                </Button>
              </form>
            ) : null}
            {/* Reconnaissance de dette, talon du chèque, échéancier signé :
                une dette sans sa pièce ne s'oppose à personne. */}
            <PiecesRegistre
              registre="cheques-dettes"
              ligneId={l.id}
              pieces={l.pieces}
              peutEcrire={peutEcrire}
            />
          </div>
        )
      )}
    </>
  );
}
