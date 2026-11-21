"use client";

import { useState } from "react";
import { Check, Pencil, ShieldCheck, Trash2, X } from "lucide-react";
import {
  basculerVerificationFournisseur,
  evaluerFournisseur,
  modifierFournisseur,
  supprimerFournisseur,
} from "@/modules/tresorerie/actions/registres";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Registre des fournisseurs — fiche par fiche, corrigeable sur place.
 *
 * Un matricule fiscal se recopie de travers, et c'est précisément ce champ
 * que l'audit demande de vérifier avant tout engagement : le laisser faux
 * sans possibilité de le reprendre vidait le registre de son intérêt.
 *
 * Un fournisseur qui a déjà des factures reçues ne se supprime pas — l'action
 * serveur le refuse, parce que le registre doit garder la trace de qui a
 * engagé la JE.
 */

import {
  PiecesRegistre,
  type PieceVue,
} from "@/modules/tresorerie/components/pieces-registre";

export type LigneFournisseur = {
  id: string;
  nom: string;
  adresse: string;
  matriculeFiscal: string;
  verifie: boolean;
  naturePrestation: string;
  evaluation: number | null;
  derniereCollaboration: string;
  nbFactures: number;
  pieces: PieceVue[];
};

export function ListeFournisseurs({
  lignes,
  peutEcrire,
}: {
  lignes: LigneFournisseur[];
  peutEcrire: boolean;
}) {
  const [enEdition, setEnEdition] = useState<string | null>(null);

  return (
    <>
      {lignes.map((f) =>
        enEdition === f.id ? (
          <div
            key={f.id}
            className="rounded-md border border-border bg-muted/40 p-3 text-sm"
          >
            <form
              action={async (donnees) => {
                await modifierFournisseur(donnees);
                setEnEdition(null);
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="fournisseurId" value={f.id} />
              <Input
                name="nom"
                defaultValue={f.nom}
                required
                minLength={2}
                placeholder="Nom"
                className="h-8 w-44 text-xs"
                aria-label="Nom du fournisseur"
              />
              <Input
                name="matriculeFiscal"
                defaultValue={f.matriculeFiscal}
                placeholder="Matricule fiscal"
                className="h-8 w-40 text-xs"
                aria-label="Matricule fiscal"
              />
              <Input
                name="naturePrestation"
                defaultValue={f.naturePrestation}
                placeholder="Nature de la prestation"
                className="h-8 w-48 text-xs"
                aria-label="Nature de la prestation"
              />
              <Input
                name="adresse"
                defaultValue={f.adresse}
                placeholder="Adresse"
                className="h-8 w-48 text-xs"
                aria-label="Adresse"
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
            key={f.id}
            className="group rounded-md border border-border p-3 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{f.nom}</span>
              {f.verifie ? (
                <Badge variant="success">
                  <ShieldCheck size={12} className="mr-1" /> Vérifié
                </Badge>
              ) : (
                <Badge variant="warning">Non vérifié</Badge>
              )}
              {f.evaluation !== null ? (
                <Badge variant="outline">{f.evaluation} / 5</Badge>
              ) : null}
              {peutEcrire ? (
                <div className="ml-auto flex items-center gap-0.5 opacity-40 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    title="Corriger cette fiche"
                    aria-label={`Corriger la fiche de ${f.nom}`}
                    onClick={() => setEnEdition(f.id)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil size={14} />
                  </button>
                  <form
                    action={supprimerFournisseur}
                    onSubmit={(e) => {
                      const message =
                        f.nbFactures > 0
                          ? `${f.nom} porte ${f.nbFactures} facture(s) reçue(s) : le registre doit en garder la trace et la suppression sera refusée.\n\nContinuer quand même ?`
                          : `Supprimer ${f.nom} du registre ?\n\nLa fiche part à la corbeille de la trésorerie et reste restaurable 30 jours.`;
                      if (!window.confirm(message)) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="fournisseurId" value={f.id} />
                    <button
                      type="submit"
                      title="Supprimer ce fournisseur"
                      aria-label={`Supprimer le fournisseur ${f.nom}`}
                      className="rounded p-1.5 text-danger hover:bg-danger/10"
                    >
                      <Trash2 size={14} />
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {f.matriculeFiscal
                ? `MF ${f.matriculeFiscal}`
                : "Matricule fiscal non renseigné"}
              {f.naturePrestation ? ` · ${f.naturePrestation}` : ""}
              {f.adresse ? ` · ${f.adresse}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Dernière collaboration : {f.derniereCollaboration}
            </p>

            {peutEcrire ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <form action={basculerVerificationFournisseur}>
                  <input type="hidden" name="fournisseurId" value={f.id} />
                  <Button size="sm" type="submit" className="h-7 text-xs">
                    {f.verifie ? "Marquer non vérifié" : "Marquer vérifié"}
                  </Button>
                </form>
                <form
                  action={evaluerFournisseur}
                  className="flex items-center gap-1"
                >
                  <input type="hidden" name="fournisseurId" value={f.id} />
                  <Input
                    name="evaluation"
                    type="number"
                    min={0}
                    max={5}
                    step={0.5}
                    defaultValue={f.evaluation ?? ""}
                    aria-label={`Évaluation de ${f.nom}`}
                    className="h-7 w-16 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    type="submit"
                    className="h-7 text-xs"
                  >
                    Évaluer
                  </Button>
                </form>
              </div>
            ) : null}
            {/* Devis, bon de livraison, contrat-cadre : la ligne du registre
                ne prouve rien toute seule. */}
            <PiecesRegistre
              registre="fournisseurs"
              ligneId={f.id}
              pieces={f.pieces}
              peutEcrire={peutEcrire}
            />
          </div>
        )
      )}
    </>
  );
}
