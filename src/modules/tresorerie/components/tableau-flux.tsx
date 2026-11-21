"use client";

import { useState } from "react";
import { Check, Pencil, Trash2, TriangleAlert, X } from "lucide-react";
import {
  modifierFlux,
  supprimerFlux,
  lierJustificatif,
} from "@/modules/tresorerie/actions/tresorerie";
import { COMPTES, LIBELLES_COMPTE } from "@/modules/tresorerie/services/caisse";
import {
  alerteEspeces,
  PLAFOND_ESPECES_DT,
} from "@/modules/tresorerie/services/conformite-especes";
import { AlerteEspeces } from "@/modules/tresorerie/components/formulaire-flux";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Journal des flux — consultation et correction sur place.
 *
 * Une opération se corrige dans sa propre ligne : la ligne bascule en
 * saisie, on valide, elle redevient du texte. Pas de page intermédiaire ni
 * de boîte de dialogue, parce qu'une correction de montant est un geste
 * courant et qu'un journal se relit ligne à ligne.
 *
 * Une opération en espèces au-delà du plafond légal se lit en rouge : elle
 * est bien enregistrée — le journal dit ce qui s'est passé, pas ce qui
 * aurait dû se passer — mais elle reste signalée comme une anomalie à
 * régulariser tant que le mode de paiement n'est pas corrigé.
 */

export type FluxVue = {
  id: string;
  type: string;
  montant: number;
  date: string;
  dateISO: string;
  tiers: string;
  modePaiement: string;
  categorie: string;
  compte: string;
  justificatifRef: string;
  notes: string;
};

const CHAMP =
  "h-8 rounded-md border border-border bg-card px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function TableauFlux({
  flux,
  categories,
  typesFlux,
  modesPaiement,
  peutEcrire,
}: {
  flux: FluxVue[];
  categories: string[];
  typesFlux: readonly string[];
  modesPaiement: readonly string[];
  peutEcrire: boolean;
}) {
  const [enEdition, setEnEdition] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">Tiers</th>
            <th className="py-2 pr-3 font-medium">Catégorie</th>
            <th className="py-2 pr-3 text-right font-medium">Montant</th>
            <th className="py-2 pr-3 font-medium">Justificatif</th>
            {peutEcrire ? <th className="w-16 py-2 font-medium" /> : null}
          </tr>
        </thead>
        <tbody>
          {flux.map((f) =>
            enEdition === f.id ? (
              <LigneEdition
                key={f.id}
                flux={f}
                categories={categories}
                typesFlux={typesFlux}
                modesPaiement={modesPaiement}
                colonnes={peutEcrire ? 6 : 5}
                fermer={() => setEnEdition(null)}
              />
            ) : (
              <LigneFlux
                key={f.id}
                flux={f}
                peutEcrire={peutEcrire}
                editer={() => setEnEdition(f.id)}
              />
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Une opération en cours de correction, avec l'alerte espèces à la frappe. */
function LigneEdition({
  flux: f,
  categories,
  typesFlux,
  modesPaiement,
  colonnes,
  fermer,
}: {
  flux: FluxVue;
  categories: string[];
  typesFlux: readonly string[];
  modesPaiement: readonly string[];
  colonnes: number;
  fermer: () => void;
}) {
  const [type, setType] = useState(f.type);
  const [montant, setMontant] = useState(String(f.montant));
  const [modePaiement, setModePaiement] = useState(f.modePaiement);

  const alerte = alerteEspeces({
    type: type === "DECAISSEMENT" ? "DECAISSEMENT" : "ENCAISSEMENT",
    modePaiement,
    montant: Number(montant) || 0,
  });

  return (
    <tr className="border-b border-border/60 bg-muted/40">
      <td colSpan={colonnes} className="py-2">
        <form
          action={async (donnees) => {
            await modifierFlux(donnees);
            fermer();
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="fluxId" value={f.id} />
          <select
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={CHAMP}
            aria-label="Sens"
          >
            {typesFlux.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
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
            className="h-8 w-44 text-xs"
            placeholder="Tiers"
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
          <Input
            name="justificatifRef"
            defaultValue={f.justificatifRef}
            placeholder="Justificatif"
            className="h-8 w-40 text-xs"
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
      </td>
    </tr>
  );
}

/** Une opération telle qu'elle se lit au journal. */
function LigneFlux({
  flux: f,
  peutEcrire,
  editer,
}: {
  flux: FluxVue;
  peutEcrire: boolean;
  editer: () => void;
}) {
  const alerte = alerteEspeces({
    type: f.type === "DECAISSEMENT" ? "DECAISSEMENT" : "ENCAISSEMENT",
    modePaiement: f.modePaiement,
    montant: f.montant,
  });

  return (
    <tr className={`group border-b border-border/60 ${alerte ? "bg-danger/5" : ""}`}>
      <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">
        {f.date}
      </td>
      <td className="py-2 pr-3">
        <p className="font-medium">{f.tiers}</p>
        <p
          className={`text-xs ${
            alerte ? "font-medium text-danger" : "text-muted-foreground"
          }`}
        >
          {f.modePaiement} · {LIBELLES_COMPTE[f.compte as "CAISSE"] ?? f.compte}
        </p>
      </td>
      <td className="py-2 pr-3 text-muted-foreground">{f.categorie}</td>
      <td
        className={`whitespace-nowrap py-2 pr-3 text-right font-medium ${
          f.type === "ENCAISSEMENT" ? "text-success" : "text-danger"
        }`}
      >
        {f.type === "ENCAISSEMENT" ? "+" : "−"}
        {f.montant.toLocaleString("fr-FR")} DT
        {alerte ? (
          <Badge
            variant="danger"
            title={`${alerte.motif} ${alerte.consigne}`}
            className="ml-2 gap-1 align-middle"
          >
            <TriangleAlert size={11} aria-hidden />
            Espèces &gt; {PLAFOND_ESPECES_DT} DT
          </Badge>
        ) : null}
      </td>
      <td className="py-2 pr-3">
        {f.justificatifRef ? (
          <Badge variant="success" title={f.justificatifRef}>
            OK
          </Badge>
        ) : peutEcrire ? (
          <form action={lierJustificatif.bind(null, f.id)} className="flex gap-1">
            <Input
              name="justificatifRef"
              required
              placeholder="Lien / réf"
              className="h-8 w-32 text-xs"
            />
            <Button size="sm" type="submit">
              Lier
            </Button>
          </form>
        ) : (
          <Badge variant="warning">En attente</Badge>
        )}
      </td>
      {peutEcrire ? (
        <td className="py-2">
          <div className="flex items-center justify-end gap-0.5 opacity-40 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              title="Corriger cette opération"
              aria-label={`Corriger l'opération ${f.tiers}`}
              onClick={editer}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pencil size={14} />
            </button>
            <form
              action={supprimerFlux}
              onSubmit={(e) => {
                if (
                  !window.confirm(
                    `Supprimer l'opération « ${f.tiers} — ${f.montant} DT » ?\n\nElle part à la corbeille de la trésorerie et reste restaurable 30 jours.\n\nSi elle a encaissé une cotisation, la cotisation et son reçu partent avec elle.`
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="fluxId" value={f.id} />
              <button
                type="submit"
                title="Supprimer cette opération"
                aria-label={`Supprimer l'opération ${f.tiers}`}
                className="rounded p-1.5 text-danger hover:bg-danger/10"
              >
                <Trash2 size={14} />
              </button>
            </form>
          </div>
        </td>
      ) : null}
    </tr>
  );
}
