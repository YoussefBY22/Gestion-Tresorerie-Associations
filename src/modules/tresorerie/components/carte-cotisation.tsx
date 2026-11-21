"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Pencil, Trash2, X } from "lucide-react";
import {
  modifierCotisation,
  supprimerCotisation,
} from "@/modules/tresorerie/actions/cotisations";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

/**
 * Une cotisation encaissée dont le reçu reste à établir.
 *
 * Deux gestes manquaient ici : corriger un montant encaissé de travers, et
 * retirer une cotisation entrée par erreur. Sans eux, une ligne fausse
 * restait indéfiniment dans « à émettre » — impossible d'en sortir sans
 * émettre un reçu qu'on ne voulait pas.
 *
 * L'identité du cotisant, elle, se corrige au registre des cotisations : ce
 * n'est pas un champ de plus sur une carte, c'est le registre légal des
 * adhérents, et il se relit en entier.
 */

export type CotisationVue = {
  cotisationId: string;
  nom: string;
  email: string;
  montant: number;
  datePaiement: string;
  dateISO: string;
  precedentAnnule: boolean;
};

export function CarteCotisation({
  cotisation: c,
  peutEcrire,
  children,
}: {
  cotisation: CotisationVue;
  peutEcrire: boolean;
  /** Formulaire d'émission du reçu, rendu côté serveur. */
  children?: React.ReactNode;
}) {
  const [enEdition, setEnEdition] = useState(false);

  if (enEdition) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <form
          action={async (donnees) => {
            await modifierCotisation(donnees);
            setEnEdition(false);
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="cotisationId" value={c.cotisationId} />
          <input type="hidden" name="nom" value={c.nom} />
          <input type="hidden" name="payee" value="true" />
          <span className="min-w-32 text-sm font-medium">{c.nom}</span>
          <Input
            name="montant"
            type="number"
            step="0.001"
            min="0"
            defaultValue={c.montant}
            required
            className="h-8 w-28 text-right text-xs"
            aria-label={`Montant de la cotisation de ${c.nom}`}
          />
          <Input
            name="datePaiement"
            type="date"
            defaultValue={c.dateISO}
            className="h-8 w-36 text-xs"
            aria-label={`Date de paiement de ${c.nom}`}
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
            onClick={() => setEnEdition(false)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X size={15} />
          </button>
          <p className="w-full text-xs text-muted-foreground">
            L&apos;identité du cotisant (CIN, domicile, profession) se corrige
            au{" "}
            <Link
              href="/tresorerie/registres/cotisations"
              className="text-primary hover:underline"
            >
              registre des cotisations
            </Link>
            .
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <Avatar nom={c.nom} taille="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{c.nom}</p>
          <p className="truncate text-xs text-muted-foreground">
            {c.montant.toFixed(3).replace(".", ",")} DT · {c.datePaiement}
          </p>
        </div>
        {c.precedentAnnule ? <Badge variant="danger">Précédent annulé</Badge> : null}
        {peutEcrire ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              title="Corriger cette cotisation"
              aria-label={`Corriger la cotisation de ${c.nom}`}
              onClick={() => setEnEdition(true)}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pencil size={14} />
            </button>
            <form
              action={supprimerCotisation}
              onSubmit={(e) => {
                if (
                  !window.confirm(
                    `Supprimer la cotisation de ${c.nom} (${c.montant} DT) ?\n\nElle part à la corbeille avec son reçu s'il existe, et reste restaurable 30 jours. ${c.nom} reste inscrit au registre des adhérents : on retire un paiement, pas une personne.`
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="cotisationId" value={c.cotisationId} />
              <button
                type="submit"
                title="Supprimer cette cotisation"
                aria-label={`Supprimer la cotisation de ${c.nom}`}
                className="rounded p-1.5 text-danger hover:bg-danger/10"
              >
                <Trash2 size={14} />
              </button>
            </form>
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
