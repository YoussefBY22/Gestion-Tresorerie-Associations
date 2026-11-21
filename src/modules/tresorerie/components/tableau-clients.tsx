"use client";

import { useRef, useState } from "react";
import {
  Check,
  ExternalLink,
  Lock,
  Paperclip,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import {
  deposerPieceClient,
  majFicheClient,
  supprimerFicheClient,
  supprimerPieceClient,
} from "@/modules/tresorerie/actions/registres-clients";
import { majAffaire } from "@/modules/tresorerie/actions/affaires";
import {
  LIBELLES_STATUT_PROJET,
  STATUTS_PROJET,
} from "@/modules/base/constantes";
import { Input } from "@/components/ui/input";

/**
 * Registre des clients, ligne par ligne.
 *
 * Tout se corrige ici, à une exception près : la **créance** porte un
 * cadenas, parce qu'elle se déduit des factures émises et non encaissées. La
 * saisir à la main la ferait contredire le journal au premier encaissement.
 *
 * Le **montant convenu**, en revanche, se modifie : il n'existe plus de
 * module commercial qui le détiendrait, et un avenant signé doit pouvoir
 * être reporté. La correction est journalisée avec l'ancienne valeur, ce qui
 * permet de comprendre plus tard pourquoi le reste à facturer a changé.
 */

export type LigneClient = {
  projetId: string;
  client: string;
  projet: string;
  statut: string;
  caSigne: number | null;
  /** Reste dû, calculé depuis les factures — jamais saisi. */
  creance: number | null;
  contact: string;
  email: string;
  telephone: string;
  adresse: string;
  matriculeFiscal: string;
  tranche1: number | null;
  tranche2: number | null;
  notes: string;
  aFiche: boolean;
  pieces: { id: string; nom: string; libelle: string }[];
};

function dt(n: number | null): string {
  return n === null ? "—" : `${n.toLocaleString("fr-FR")} DT`;
}

export function TableauClients({
  lignes,
  peutEcrire,
}: {
  lignes: LigneClient[];
  peutEcrire: boolean;
}) {
  const [enEdition, setEnEdition] = useState<string | null>(null);
  // Refus de l'enregistrement, rendu sur la ligne concernée : une règle
  // métier qui dit non doit se lire là où la saisie a eu lieu.
  const [refus, setRefus] = useState<{
    projetId: string;
    message: string;
  } | null>(null);
  const fichiers = useRef<Record<string, HTMLInputElement | null>>({});

  if (lignes.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        Aucun projet client sur ce mandat.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <th className="py-2 pr-3 font-medium">
              <span className="inline-flex items-center gap-1">
                <Lock size={11} aria-hidden /> Client / projet
              </span>
            </th>
            <th className="py-2 pr-3 text-right font-medium">
              Montant convenu
            </th>
            <th className="py-2 pr-3 font-medium">Contact</th>
            <th className="py-2 pr-3 font-medium">Coordonnées</th>
            <th className="py-2 pr-3 text-right font-medium">1re tranche</th>
            <th className="py-2 pr-3 text-right font-medium">2e tranche</th>
            <th className="py-2 pr-3 text-right font-medium">
              <span className="inline-flex items-center gap-1">
                <Lock size={11} aria-hidden /> Créance
              </span>
            </th>
            <th className="py-2 pr-3 font-medium">Pièces</th>
            {peutEcrire ? <th className="w-20 py-2" /> : null}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) =>
            enEdition === l.projetId ? (
              <tr key={l.projetId} className="border-b border-border/60 bg-muted/40">
                <td colSpan={peutEcrire ? 9 : 8} className="py-2">
                  <form
                    action={async (donnees) => {
                      /*
                       * Deux entités derrière une seule ligne : l'affaire
                       * (nom, statut, montant convenu) et la fiche de
                       * facturation. L'affaire passe en premier ; si elle
                       * refuse, on s'arrête là et on le dit, plutôt que
                       * d'enregistrer la moitié de la saisie en silence.
                       */
                      const r = await majAffaire(donnees);
                      if (!r.ok) {
                        setRefus({ projetId: l.projetId, message: r.message });
                        return;
                      }
                      setRefus(null);
                      await majFicheClient(donnees);
                      setEnEdition(null);
                    }}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="projetId" value={l.projetId} />
                    <Input
                      name="nomProjet"
                      required
                      minLength={2}
                      defaultValue={l.projet}
                      placeholder="Nom du projet"
                      className="h-8 w-44 text-xs font-medium"
                    />
                    <select
                      name="statut"
                      defaultValue={l.statut}
                      aria-label="Statut de l'affaire"
                      className="h-8 rounded-md border border-border bg-card px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {STATUTS_PROJET.map((st) => (
                        <option key={st} value={st}>
                          {LIBELLES_STATUT_PROJET[st] ?? st}
                        </option>
                      ))}
                    </select>
                    <Input
                      name="caSigne"
                      type="number"
                      step="0.001"
                      min="0"
                      defaultValue={l.caSigne ?? ""}
                      placeholder="Montant convenu"
                      className="h-8 w-32 text-right text-xs"
                    />
                    <Input
                      name="contact"
                      defaultValue={l.contact}
                      placeholder="Contact facturation"
                      className="h-8 w-44 text-xs"
                    />
                    <Input
                      name="email"
                      type="email"
                      defaultValue={l.email}
                      placeholder="E-mail"
                      className="h-8 w-52 text-xs"
                    />
                    <Input
                      name="telephone"
                      defaultValue={l.telephone}
                      placeholder="Téléphone"
                      className="h-8 w-32 text-xs"
                    />
                    {/* Adresse et matricule fiscal du client : la facture
                        tunisienne les exige, et ils n'existent nulle part
                        ailleurs dans l'application. */}
                    <Input
                      name="adresse"
                      defaultValue={l.adresse}
                      placeholder="Adresse de facturation"
                      className="h-8 w-56 text-xs"
                    />
                    <Input
                      name="matriculeFiscal"
                      defaultValue={l.matriculeFiscal}
                      placeholder="Matricule fiscal"
                      className="h-8 w-40 text-xs"
                    />
                    <Input
                      name="tranche1"
                      type="number"
                      step="0.001"
                      min="0"
                      defaultValue={l.tranche1 ?? ""}
                      placeholder="1re tranche"
                      className="h-8 w-28 text-right text-xs"
                    />
                    <Input
                      name="tranche2"
                      type="number"
                      step="0.001"
                      min="0"
                      defaultValue={l.tranche2 ?? ""}
                      placeholder="2e tranche"
                      className="h-8 w-28 text-right text-xs"
                    />
                    <Input
                      name="notes"
                      defaultValue={l.notes}
                      placeholder="Notes"
                      className="h-8 w-52 text-xs"
                    />
                    <button
                      type="submit"
                      title="Enregistrer"
                      aria-label="Enregistrer la fiche"
                      className="rounded p-1.5 text-success hover:bg-success/10"
                    >
                      <Check size={15} />
                    </button>
                    <button
                      type="button"
                      title="Annuler"
                      aria-label="Annuler"
                      onClick={() => setEnEdition(null)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                    >
                      <X size={15} />
                    </button>
                    {refus?.projetId === l.projetId ? (
                      <p role="alert" className="w-full text-xs text-danger">
                        {refus.message}
                      </p>
                    ) : null}
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={l.projetId} className="group border-b border-border/60">
                <td className="py-2 pr-3">
                  <p className="font-medium">{l.projet}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.client} · {LIBELLES_STATUT_PROJET[l.statut] ?? l.statut}
                  </p>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{dt(l.caSigne)}</td>
                <td className="py-2 pr-3">{l.contact || "—"}</td>
                <td className="py-2 pr-3 text-xs text-muted-foreground">
                  {[l.email, l.telephone].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{dt(l.tranche1)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{dt(l.tranche2)}</td>
                <td
                  className={`py-2 pr-3 text-right tabular-nums ${
                    l.creance && l.creance > 0 ? "text-danger" : "text-muted-foreground"
                  }`}
                >
                  {dt(l.creance)}
                </td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap items-center gap-1">
                    {l.pieces.map((p) => (
                      <span key={p.id} className="inline-flex items-center">
                        <a
                          href={`/api/tresorerie/registres/clients/${l.projetId}/piece/${p.id}`}
                          target="_blank"
                          rel="noreferrer"
                          title={p.libelle || p.nom}
                          className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs hover:bg-muted"
                        >
                          <ExternalLink size={11} />
                          {(p.libelle || p.nom).slice(0, 18)}
                        </a>
                        {peutEcrire ? (
                          <form
                            action={supprimerPieceClient}
                            onSubmit={(e) => {
                              if (
                                !window.confirm(
                                  `Supprimer la pièce « ${p.libelle || p.nom} » ?\n\nElle part à la corbeille et reste restaurable 30 jours.`
                                )
                              ) {
                                e.preventDefault();
                              }
                            }}
                          >
                            <input type="hidden" name="projetId" value={l.projetId} />
                            <input type="hidden" name="pieceId" value={p.id} />
                            <button
                              type="submit"
                              title="Retirer cette pièce"
                              aria-label={`Retirer la pièce ${p.nom}`}
                              className="rounded p-0.5 text-danger opacity-50 hover:opacity-100"
                            >
                              <X size={11} />
                            </button>
                          </form>
                        ) : null}
                      </span>
                    ))}
                    {peutEcrire ? (
                      <>
                        <input
                          ref={(el) => {
                            fichiers.current[l.projetId] = el;
                          }}
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            const fichier = e.target.files?.[0];
                            e.target.value = "";
                            if (!fichier) return;
                            const donnees = new FormData();
                            donnees.set("projetId", l.projetId);
                            donnees.set("fichier", fichier);
                            void deposerPieceClient(donnees);
                          }}
                        />
                        <button
                          type="button"
                          title="Déposer une pièce de paiement (PDF)"
                          aria-label={`Déposer une pièce pour ${l.projet}`}
                          onClick={() => fichiers.current[l.projetId]?.click()}
                          className="rounded p-1 text-muted-foreground hover:bg-muted"
                        >
                          <Paperclip size={13} />
                        </button>
                      </>
                    ) : null}
                  </div>
                </td>
                {peutEcrire ? (
                  <td className="py-2">
                    <div className="flex items-center justify-end gap-0.5 opacity-40 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        title="Modifier les colonnes du Trésorier"
                        aria-label={`Modifier la fiche de ${l.projet}`}
                        onClick={() => setEnEdition(l.projetId)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil size={14} />
                      </button>
                      {l.aFiche ? (
                        <form
                          action={supprimerFicheClient}
                          onSubmit={(e) => {
                            if (
                              !window.confirm(
                                `Vider la fiche de « ${l.projet} » ?\n\nSeules les colonnes du Trésorier et ses pièces partent à la corbeille — le projet, lui, reste.`
                              )
                            ) {
                              e.preventDefault();
                            }
                          }}
                        >
                          <input type="hidden" name="projetId" value={l.projetId} />
                          <button
                            type="submit"
                            title="Vider la fiche (le projet reste)"
                            aria-label={`Vider la fiche de ${l.projet}`}
                            className="rounded p-1.5 text-danger hover:bg-danger/10"
                          >
                            <Trash2 size={14} />
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            )
          )}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted-foreground">
        <Lock size={11} className="mr-1 inline" aria-hidden />
        La créance se déduit des factures émises et non encaissées : elle ne
        se saisit pas, sans quoi elle contredirait le journal au premier
        encaissement. Tout le reste se corrige sur cette ligne.
      </p>
    </div>
  );
}
