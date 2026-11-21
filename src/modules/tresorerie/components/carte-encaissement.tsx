"use client";

import { useState } from "react";
import { Check, Pencil, Trash2, TriangleAlert, X } from "lucide-react";
import {
  modifierFlux,
  supprimerFlux,
} from "@/modules/tresorerie/actions/tresorerie";
import { COMPTES, LIBELLES_COMPTE } from "@/modules/tresorerie/services/caisse";
import {
  alerteEspeces,
  PLAFOND_ESPECES_DT,
} from "@/modules/tresorerie/services/conformite-especes";
import { AlerteEspeces } from "@/modules/tresorerie/components/formulaire-flux";
import {
  EmissionRecu,
  type ChoixFamille,
} from "@/modules/tresorerie/components/emission-recu";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

/**
 * Un encaissement du journal qui attend son reçu.
 *
 * La carte ne servait qu'à émettre la pièce : une erreur de montant ou de
 * tiers obligeait à repasser par le journal des flux, alors que c'est
 * précisément ici, au moment d'établir le reçu, qu'on relit l'opération et
 * qu'on voit la faute. La correction et le retrait se font donc sur place,
 * avec les mêmes règles et la même corbeille qu'au journal.
 */

export type EncaissementVue = {
  fluxId: string;
  tiers: string;
  categorie: string;
  montant: number;
  date: string;
  dateISO: string;
  modePaiement: string;
  compte: string;
  aJustificatif: boolean;
};

const CHAMP =
  "h-8 rounded-md border border-border bg-card px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CarteEncaissement({
  encaissement: f,
  categories,
  modesPaiement,
  familles,
  peutEcrire,
}: {
  encaissement: EncaissementVue;
  categories: string[];
  modesPaiement: readonly string[];
  familles: ChoixFamille[];
  peutEcrire: boolean;
}) {
  const [enEdition, setEnEdition] = useState(false);

  const alerte = alerteEspeces({
    type: "ENCAISSEMENT",
    modePaiement: f.modePaiement,
    montant: f.montant,
  });

  if (enEdition) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <FormulaireCorrection
          encaissement={f}
          categories={categories}
          modesPaiement={modesPaiement}
          fermer={() => setEnEdition(false)}
        />
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border p-3 ${
        alerte ? "border-danger/40 bg-danger/5" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{f.tiers}</p>
          <p className="truncate text-xs text-muted-foreground">
            {f.categorie} · {f.montant.toFixed(3).replace(".", ",")} DT ·{" "}
            {f.date} · {f.modePaiement}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!f.aJustificatif ? (
            <Badge variant="warning">Sans justificatif</Badge>
          ) : null}
          {peutEcrire ? (
            <>
              <button
                type="button"
                title="Corriger cet encaissement"
                aria-label={`Corriger l'encaissement ${f.tiers}`}
                onClick={() => setEnEdition(true)}
                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil size={14} />
              </button>
              <form
                action={supprimerFlux}
                onSubmit={(e) => {
                  if (
                    !window.confirm(
                      `Supprimer l'encaissement « ${f.tiers} — ${f.montant} DT » ?\n\nIl part à la corbeille de la trésorerie et reste restaurable 30 jours.`
                    )
                  ) {
                    e.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="fluxId" value={f.fluxId} />
                <button
                  type="submit"
                  title="Supprimer cet encaissement"
                  aria-label={`Supprimer l'encaissement ${f.tiers}`}
                  className="rounded p-1.5 text-danger hover:bg-danger/10"
                >
                  <Trash2 size={14} />
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>

      {alerte ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-danger">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Espèces au-delà de {PLAFOND_ESPECES_DT} DT — {alerte.consigne}
          </span>
        </p>
      ) : null}

      {peutEcrire ? (
        <EmissionRecu fluxId={f.fluxId} tiers={f.tiers} familles={familles} />
      ) : null}
    </div>
  );
}

/** Correction sur place, avec les mêmes champs qu'au journal des flux. */
function FormulaireCorrection({
  encaissement: f,
  categories,
  modesPaiement,
  fermer,
}: {
  encaissement: EncaissementVue;
  categories: string[];
  modesPaiement: readonly string[];
  fermer: () => void;
}) {
  const [montant, setMontant] = useState(String(f.montant));
  const [modePaiement, setModePaiement] = useState(f.modePaiement);

  const alerte = alerteEspeces({
    type: "ENCAISSEMENT",
    modePaiement,
    montant: Number(montant) || 0,
  });

  return (
    <form
      action={async (donnees) => {
        await modifierFlux(donnees);
        fermer();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="fluxId" value={f.fluxId} />
      <input type="hidden" name="type" value="ENCAISSEMENT" />
      <Input
        name="date"
        type="date"
        defaultValue={f.dateISO}
        className="h-8 w-36 text-xs"
      />
      <Input
        name="tiers"
        defaultValue={f.tiers}
        required
        placeholder="Tiers"
        className="h-8 w-44 text-xs"
      />
      <select
        name="categorie"
        defaultValue={f.categorie}
        required
        className={CHAMP}
        aria-label="Catégorie budgétaire"
      >
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <Input
        name="montant"
        type="number"
        step="0.001"
        min="0.001"
        value={montant}
        onChange={(e) => setMontant(e.target.value)}
        required
        className="h-8 w-28 text-right text-xs"
      />
      <select
        name="modePaiement"
        value={modePaiement}
        onChange={(e) => setModePaiement(e.target.value)}
        className={CHAMP}
        aria-label="Mode de paiement"
      >
        {modesPaiement.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        name="compte"
        defaultValue={f.compte}
        className={CHAMP}
        aria-label="Avoir mouvementé"
      >
        {COMPTES.map((c) => (
          <option key={c} value={c}>
            {LIBELLES_COMPTE[c]}
          </option>
        ))}
      </select>
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
        onClick={fermer}
        className="rounded p-1.5 text-muted-foreground hover:bg-muted"
      >
        <X size={15} />
      </button>
      {alerte ? (
        <div className="w-full">
          <AlerteEspeces motif={alerte.motif} consigne={alerte.consigne} />
        </div>
      ) : null}
    </form>
  );
}
