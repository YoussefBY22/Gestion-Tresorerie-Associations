"use client";

import { useState, useTransition } from "react";
import { ExternalLink, FileMinus2 } from "lucide-react";
import { emettreAvoir } from "@/modules/tresorerie/actions/avoirs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Corriger une facture déjà émise.
 *
 * Une facture ne se modifie pas et ne se supprime pas : elle porte un numéro
 * d'une série continue. On émet une pièce inverse, et les deux restent au
 * registre. L'écran le dit plutôt que de le supposer connu — c'est le genre
 * de règle qu'un Trésorier de JE découvre en audit.
 *
 * Le refus est **rendu**, pas levé : une exception d'action serveur est
 * masquée en production, or c'est le texte du refus qui nomme le montant
 * encore créditable.
 */

export type FacturePourAvoir = {
  id: string;
  numero: string;
  projet: string;
  montantHT: number;
  reste: number;
  avoirs: {
    id: string;
    numero: string;
    montantHT: number;
    motif: string;
    documentId: string | null;
  }[];
};

function dt(montant: number): string {
  return `${montant.toFixed(3).replace(".", ",")} DT`;
}

export function AvoirsFacture({
  facture: f,
  peutEcrire,
}: {
  facture: FacturePourAvoir;
  peutEcrire: boolean;
}) {
  const [montant, setMontant] = useState("");
  const [motif, setMotif] = useState("");
  const [retour, setRetour] = useState<{ ok: boolean; message: string } | null>(
    null
  );
  const [enCours, demarrer] = useTransition();

  const solde = f.reste <= 0;

  function envoyer() {
    setRetour(null);
    demarrer(async () => {
      const donnees = new FormData();
      donnees.set("factureId", f.id);
      donnees.set("montantHT", montant);
      donnees.set("motif", motif);
      try {
        const r = await emettreAvoir(donnees);
        setRetour(r);
        if (r.ok) {
          setMontant("");
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
        <span className="text-sm font-medium">{f.numero}</span>
        <span className="text-xs text-muted-foreground">{f.projet}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {solde ? (
            <span className="text-warning">Entièrement créditée</span>
          ) : (
            <>Créditable : {dt(f.reste)} HT</>
          )}
        </span>
      </div>

      {f.avoirs.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-border pt-2">
          {f.avoirs.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-baseline gap-2 text-xs"
            >
              <FileMinus2
                className="h-3 w-3 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="font-mono">{a.numero}</span>
              <span className="font-medium">− {dt(a.montantHT)} HT</span>
              <span className="min-w-0 truncate text-muted-foreground">
                {a.motif}
              </span>
              {a.documentId ? (
                <a
                  href={`/api/documents/${a.documentId}/fichier`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Ouvrir le PDF ${a.numero}`}
                  className="text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {peutEcrire && !solde ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
          <Input
            type="number"
            step="0.001"
            min="0.001"
            max={f.reste}
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            placeholder="Montant HT"
            aria-label={`Montant de l'avoir sur ${f.numero}`}
            className="h-8 w-32 text-xs"
          />
          <Input
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Motif (erreur de montant, prestation annulée…)"
            aria-label={`Motif de l'avoir sur ${f.numero}`}
            className="h-8 min-w-56 flex-1 text-xs"
          />
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            disabled={enCours || !montant || motif.trim().length < 5}
            onClick={envoyer}
          >
            {enCours ? "Émission…" : "Émettre l'avoir"}
          </Button>
          <button
            type="button"
            onClick={() => setMontant(String(f.reste))}
            className="text-xs text-primary hover:underline"
          >
            Annuler toute la facture
          </button>
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
