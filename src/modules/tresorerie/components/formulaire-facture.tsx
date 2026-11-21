"use client";

import { useState, useTransition } from "react";
import { creerFacture } from "@/modules/tresorerie/actions/tresorerie";
import {
  avertissementDepassement,
  montantProposeFacture,
  type EtatFacturationProjet,
} from "@/modules/tresorerie/services/facturation-projet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Nouvelle facture — le montant vient du projet, il ne se retrouve pas.
 *
 * Le chemin de l'argent est entier en base : le devis chiffre, son
 * acceptation signe l'opportunité, le projet recopie le CA signé. Devant ce
 * formulaire, le Trésorier retapait pourtant ce nombre une troisième fois,
 * de mémoire ou en rouvrant le CRM.
 *
 * L'écran propose donc le **reste à facturer** et montre son calcul : CA
 * signé, déjà facturé, avoirs déduits. Un projet sans CA signé ne propose
 * rien plutôt qu'un zéro, et une facture qui dépasse le signé est signalée
 * sans être refusée — un avenant est un cas réel.
 */

export type ProjetAFacturer = {
  id: string;
  nom: string;
  etat: EtatFacturationProjet;
};

function dt(montant: number): string {
  return `${montant.toFixed(3).replace(".", ",")} DT`;
}

export function FormulaireFacture({
  projets,
}: {
  projets: ProjetAFacturer[];
}) {
  const [projetId, setProjetId] = useState("");
  const [montant, setMontant] = useState("");
  const [tauxTVA, setTauxTVA] = useState("19");
  const [echeance, setEcheance] = useState("");
  const [retour, setRetour] = useState<{ ok: boolean; message: string } | null>(
    null
  );
  const [enCours, demarrer] = useTransition();

  const choisi = projets.find((p) => p.id === projetId);
  const saisi = Number(montant);
  const depassement =
    choisi && Number.isFinite(saisi) && saisi > 0
      ? avertissementDepassement(choisi.etat, saisi)
      : null;

  function changerProjet(id: string) {
    setProjetId(id);
    setRetour(null);
    const propose = projets.find((p) => p.id === id);
    const montantPropose = propose
      ? montantProposeFacture(propose.etat)
      : null;
    // Un projet soldé ou sans CA signé ne propose rien : le champ se vide
    // plutôt que de garder le montant d'un autre projet.
    setMontant(montantPropose === null ? "" : String(montantPropose));
  }

  function envoyer() {
    setRetour(null);
    demarrer(async () => {
      const donnees = new FormData();
      donnees.set("projetId", projetId);
      donnees.set("montantHT", montant);
      donnees.set("tauxTVA", tauxTVA);
      donnees.set("echeance", echeance);
      try {
        const r = await creerFacture(donnees);
        setRetour(r);
        if (r.ok) {
          setProjetId("");
          setMontant("");
          setEcheance("");
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
    <div className="space-y-3">
      <select
        value={projetId}
        onChange={(e) => changerProjet(e.target.value)}
        aria-label="Projet à facturer"
        className="flex h-10 w-full rounded-md border border-border bg-card px-2 text-sm"
      >
        <option value="">— projet —</option>
        {projets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nom}
            {p.etat.resteAFacturer !== null
              ? ` — reste ${dt(p.etat.resteAFacturer)}`
              : ""}
          </option>
        ))}
      </select>

      {choisi ? (
        <p className="rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
          {choisi.etat.caSigne === null ? (
            <>
              Ce projet ne porte pas de CA signé : rien à proposer, saisissez le
              montant. Déjà facturé : {dt(choisi.etat.netFacture)} HT.
            </>
          ) : (
            <>
              CA signé {dt(choisi.etat.caSigne)} · déjà facturé{" "}
              {dt(choisi.etat.netFacture)}
              {choisi.etat.credite > 0
                ? ` (dont ${dt(choisi.etat.credite)} crédités par avoir)`
                : ""}{" "}
              ·{" "}
              {choisi.etat.solde ? (
                <span className="font-medium text-warning">
                  entièrement facturé
                </span>
              ) : choisi.etat.depassement > 0 ? (
                <span className="font-medium text-warning">
                  dépassé de {dt(choisi.etat.depassement)}
                </span>
              ) : (
                <span className="font-medium text-foreground">
                  reste {dt(choisi.etat.resteAFacturer ?? 0)} HT
                </span>
              )}
            </>
          )}
        </p>
      ) : null}

      <Input
        type="number"
        min={0.01}
        step="0.001"
        value={montant}
        onChange={(e) => setMontant(e.target.value)}
        placeholder="Montant HT (DT) *"
        aria-label="Montant HT de la facture"
      />

      {depassement ? (
        <p
          role="status"
          className="rounded-md border border-warning/40 bg-warning/5 px-2 py-1.5 text-xs text-warning"
        >
          {depassement}
        </p>
      ) : null}

      <label className="block text-sm">
        TVA (%)
        <Input
          type="number"
          min={0}
          max={100}
          value={tauxTVA}
          onChange={(e) => setTauxTVA(e.target.value)}
          className="mt-1"
        />
      </label>
      <label className="block text-sm">
        Échéance
        <Input
          type="date"
          value={echeance}
          onChange={(e) => setEcheance(e.target.value)}
          className="mt-1"
        />
      </label>

      <Button
        type="button"
        className="w-full"
        disabled={enCours || !projetId || !montant || !echeance}
        onClick={envoyer}
      >
        {enCours ? "Émission…" : "Émettre la facture"}
      </Button>

      {retour ? (
        <p
          role="status"
          className={`whitespace-pre-line rounded-md px-2 py-1.5 text-xs ${
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
