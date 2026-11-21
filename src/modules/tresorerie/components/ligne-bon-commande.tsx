"use client";

import { useState, useTransition } from "react";
import { ExternalLink, PackageCheck } from "lucide-react";
import {
  annulerBonCommande,
  receptionnerBonCommande,
} from "@/modules/tresorerie/actions/bons-commande";
import { totauxBonCommande } from "@/modules/tresorerie/services/bon-commande";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Un bon de commande au registre, avec les deux seuls gestes qui lui restent.
 *
 * Un bon ne se modifie pas : il est parti chez le fournisseur et porte un
 * numéro d'une série continue. Il se réceptionne quand la commande arrive —
 * son montant cesse alors d'être engagé, c'est la facture qui prend le
 * relais — ou s'annule **avec un motif**, sans quoi il serait inexplicable à
 * la relecture.
 */

export type BonCommandeLigne = {
  id: string;
  numero: string;
  fournisseur: string;
  objet: string;
  lignes: { designation: string; quantite: number; prixUnitaire: number }[];
  tauxTVA: number;
  sectionBudget?: string | null;
  statut: string;
  emission: string;
  livraisonPrevue?: string | null;
  motifAnnulation?: string | null;
  documentId: string | null;
  enRetard: boolean;
};

function dt(montant: number): string {
  return `${montant.toFixed(3).replace(".", ",")} DT`;
}

export function LigneBonCommande({
  bon,
  peutEcrire,
}: {
  bon: BonCommandeLigne;
  peutEcrire: boolean;
}) {
  const [motif, setMotif] = useState("");
  const [annulation, setAnnulation] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; message: string } | null>(
    null
  );
  const [enCours, demarrer] = useTransition();

  const totaux = totauxBonCommande(bon.lignes, bon.tauxTVA);
  const ouvert = bon.statut === "EMIS";

  function agir(action: "receptionner" | "annuler") {
    setRetour(null);
    demarrer(async () => {
      const donnees = new FormData();
      donnees.set("bonId", bon.id);
      if (action === "annuler") donnees.set("motif", motif);
      try {
        const r =
          action === "receptionner"
            ? await receptionnerBonCommande(donnees)
            : await annulerBonCommande(donnees);
        setRetour(r);
        if (r.ok) {
          setAnnulation(false);
          setMotif("");
        }
      } catch (err) {
        setRetour({
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-sm font-medium">{bon.numero}</span>
        <span className="min-w-0 flex-1 truncate text-sm">
          {bon.fournisseur}
        </span>
        <span className="text-sm font-semibold">{dt(totaux.totalTTC)}</span>
        {bon.statut === "EMIS" ? (
          <Badge variant={bon.enRetard ? "danger" : "warning"}>
            {bon.enRetard ? "Livraison en retard" : "Engagé"}
          </Badge>
        ) : bon.statut === "RECEPTIONNE" ? (
          <Badge variant="success">Réceptionné</Badge>
        ) : (
          <Badge variant="outline">Annulé</Badge>
        )}
      </div>

      <p className="mt-1 truncate text-xs text-muted-foreground">
        {bon.objet}
        {bon.sectionBudget ? ` · ${bon.sectionBudget}` : ""}
        {bon.livraisonPrevue ? ` · livraison ${bon.livraisonPrevue}` : ""}
        {bon.motifAnnulation ? ` · motif : ${bon.motifAnnulation}` : ""}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {bon.documentId ? (
          <a
            href={`/api/documents/${bon.documentId}/fichier`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" aria-hidden />
            Ouvrir le bon
          </a>
        ) : null}

        {peutEcrire && ouvert && !annulation ? (
          <>
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              disabled={enCours}
              onClick={() => agir("receptionner")}
            >
              <PackageCheck className="mr-1 h-3.5 w-3.5" aria-hidden />
              {enCours ? "…" : "Réceptionner"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setAnnulation(true)}
            >
              Annuler la commande
            </Button>
          </>
        ) : null}
      </div>

      {peutEcrire && ouvert && annulation ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
          <Input
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Motif (commande non livrée, erreur de référence…)"
            aria-label={`Motif d'annulation de ${bon.numero}`}
            className="h-8 min-w-56 flex-1 text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="danger"
            className="h-8 text-xs"
            disabled={enCours || motif.trim().length < 5}
            onClick={() => agir("annuler")}
          >
            {enCours ? "Annulation…" : "Confirmer l'annulation"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => setAnnulation(false)}
          >
            Revenir
          </Button>
        </div>
      ) : null}

      {retour ? (
        <p
          role="status"
          className={`mt-2 rounded-md px-2 py-1.5 text-xs ${
            retour.ok
              ? "bg-success/10 text-success"
              : "border border-danger/40 bg-danger/5 text-danger"
          }`}
        >
          {retour.message}
        </p>
      ) : null}
    </div>
  );
}
