"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, Pencil, Trash2, X } from "lucide-react";
import {
  modifierCotisation,
  supprimerCotisation,
} from "@/modules/tresorerie/actions/cotisations";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

/**
 * Registre des cotisations, ligne par ligne.
 *
 * Le registre se remplit tout seul à l'encaissement — c'est sa qualité — mais
 * il restait en lecture seule, et une CIN mal recopiée au comptoir n'avait
 * alors aucune issue : il fallait supprimer la cotisation et tout ressaisir.
 * Or c'est ici le registre légal des adhérents (décret-loi n° 2011-88,
 * art. 8) : il se corrige, il ne se rejoue pas.
 *
 * L'âge n'est pas une colonne modifiable : il se calcule à partir de la date
 * de naissance. Un âge recopié devient faux au bout d'un an, et le registre
 * est justement ce qu'on présente des années plus tard.
 */

export type LigneCotisation = {
  id: string;
  membre: string;
  cin: string;
  nationalite: string;
  /** Calculé à l'affichage, jamais stocké. */
  age: number | null;
  dateNaissanceISO: string;
  profession: string;
  adresse: string;
  montant: number;
  payee: boolean;
  datePaiement: string;
  datePaiementISO: string;
  recu: { id: string; reference: string } | null;
};

const CHAMP =
  "h-8 rounded-md border border-border bg-card px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function TableauCotisations({
  lignes,
  peutEcrire,
}: {
  lignes: LigneCotisation[];
  peutEcrire: boolean;
}) {
  const [enEdition, setEnEdition] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Membre</th>
            <th className="py-2 pr-3 font-medium">CIN</th>
            <th className="py-2 pr-3 font-medium">Nationalité</th>
            <th className="py-2 pr-3 font-medium">Âge</th>
            <th className="py-2 pr-3 font-medium">Profession</th>
            <th className="py-2 pr-3 font-medium">Domicile</th>
            <th className="py-2 pr-3 font-medium">Montant</th>
            <th className="py-2 pr-3 font-medium">Date de paiement</th>
            <th className="py-2 pr-3 font-medium">Reçu</th>
            <th className="py-2 pr-3 font-medium">Statut</th>
            {peutEcrire ? <th className="w-16 py-2" /> : null}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) =>
            enEdition === l.id ? (
              <tr key={l.id} className="border-b border-border/60 bg-muted/40">
                <td colSpan={peutEcrire ? 11 : 10} className="py-2">
                  <form
                    action={async (donnees) => {
                      await modifierCotisation(donnees);
                      setEnEdition(null);
                    }}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="cotisationId" value={l.id} />
                    <Input
                      name="nom"
                      defaultValue={l.membre}
                      required
                      placeholder="Nom et prénom"
                      className="h-8 w-44 text-xs"
                      aria-label="Nom et prénom"
                    />
                    <Input
                      name="cin"
                      defaultValue={l.cin}
                      placeholder="CIN"
                      className="h-8 w-28 text-xs"
                      aria-label="Numéro de CIN"
                    />
                    <Input
                      name="nationalite"
                      defaultValue={l.nationalite}
                      placeholder="Nationalité"
                      className="h-8 w-32 text-xs"
                      aria-label="Nationalité"
                    />
                    <Input
                      name="dateNaissance"
                      type="date"
                      defaultValue={l.dateNaissanceISO}
                      className="h-8 w-36 text-xs"
                      aria-label="Date de naissance"
                    />
                    <Input
                      name="profession"
                      defaultValue={l.profession}
                      placeholder="Profession"
                      className="h-8 w-36 text-xs"
                      aria-label="Profession"
                    />
                    <Input
                      name="adresse"
                      defaultValue={l.adresse}
                      placeholder="Domicile"
                      className="h-8 w-48 text-xs"
                      aria-label="Domicile"
                    />
                    <Input
                      name="montant"
                      type="number"
                      step="0.001"
                      min="0"
                      defaultValue={l.montant}
                      required
                      className="h-8 w-24 text-right text-xs"
                      aria-label="Montant"
                    />
                    <Input
                      name="datePaiement"
                      type="date"
                      defaultValue={l.datePaiementISO}
                      className="h-8 w-36 text-xs"
                      aria-label="Date de paiement"
                    />
                    <select
                      name="payee"
                      defaultValue={l.payee ? "true" : "false"}
                      className={CHAMP}
                      aria-label="Statut du paiement"
                    >
                      <option value="true">Payée</option>
                      <option value="false">En attente</option>
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
                      onClick={() => setEnEdition(null)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                    >
                      <X size={15} />
                    </button>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={l.id} className="group border-b border-border/60">
                <td className="py-2 pr-3 font-medium">{l.membre}</td>
                <td className="py-2 pr-3 font-mono text-xs">
                  {l.cin || (
                    <span className="text-danger" title="CIN manquante au registre">
                      à compléter
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 text-muted-foreground">
                  {l.nationalite || "—"}
                </td>
                <td className="py-2 pr-3 text-muted-foreground">{l.age ?? "—"}</td>
                <td className="py-2 pr-3 text-muted-foreground">
                  {l.profession || "—"}
                </td>
                <td className="py-2 pr-3 text-muted-foreground">
                  {l.adresse || "—"}
                </td>
                <td className="whitespace-nowrap py-2 pr-3">
                  {l.montant.toLocaleString("fr-FR")} DT
                </td>
                <td className="whitespace-nowrap py-2 pr-3">{l.datePaiement}</td>
                <td className="py-2 pr-3">
                  {l.recu ? (
                    <span className="flex items-center gap-1">
                      <Link
                        href={`/documents/${l.recu.id}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {l.recu.reference}
                      </Link>
                      <a
                        href={`/api/documents/${l.recu.id}/fichier`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ouvrir le PDF du reçu"
                        aria-label={`Ouvrir le PDF ${l.recu.reference}`}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </span>
                  ) : (
                    <Link
                      href="/tresorerie/recus"
                      className="text-xs text-warning hover:underline"
                    >
                      à émettre
                    </Link>
                  )}
                </td>
                <td className="py-2 pr-3">
                  {l.payee ? (
                    <Badge variant="success">Payée</Badge>
                  ) : (
                    <Badge variant="warning">En attente</Badge>
                  )}
                </td>
                {peutEcrire ? (
                  <td className="py-2">
                    <div className="flex items-center justify-end gap-0.5 opacity-40 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        title="Corriger cette ligne"
                        aria-label={`Corriger la cotisation de ${l.membre}`}
                        onClick={() => setEnEdition(l.id)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil size={14} />
                      </button>
                      <form
                        action={supprimerCotisation}
                        onSubmit={(e) => {
                          if (
                            !window.confirm(
                              `Supprimer la cotisation de ${l.membre} (${l.montant} DT) ?\n\nElle part à la corbeille avec son reçu${l.recu ? ` ${l.recu.reference}` : ""}, et reste restaurable 30 jours. ${l.membre} reste inscrit au registre des adhérents : on retire un paiement, pas une personne.`
                            )
                          ) {
                            e.preventDefault();
                          }
                        }}
                      >
                        <input type="hidden" name="cotisationId" value={l.id} />
                        <button
                          type="submit"
                          title="Supprimer cette cotisation"
                          aria-label={`Supprimer la cotisation de ${l.membre}`}
                          className="rounded p-1.5 text-danger hover:bg-danger/10"
                        >
                          <Trash2 size={14} />
                        </button>
                      </form>
                    </div>
                  </td>
                ) : null}
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}
