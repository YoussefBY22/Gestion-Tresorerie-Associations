"use client";

import { useRef, useState, useTransition } from "react";
import { ExternalLink, Paperclip, X } from "lucide-react";
import {
  deposerPieceRegistre,
  supprimerPieceRegistre,
} from "@/modules/tresorerie/actions/pieces-registres";
import {
  ATTENDU_PAR_REGISTRE,
  type RegistreAvecPieces,
} from "@/modules/tresorerie/services/pieces-justificatives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Pièces justificatives d'une ligne de registre.
 *
 * Un même bloc pour les dons, les fournisseurs et les chèques/dettes : les
 * trois attendent la même chose, et ce qui change — l'exemple de pièce
 * attendue — vient du service.
 *
 * L'exemple compte. Un champ « pièce jointe » sans rien dire de ce qu'on y
 * met ne reçoit jamais rien : on ne sait pas si c'est le reçu, le contrat ou
 * le relevé qui va là.
 */

export type PieceVue = {
  id: string;
  nom: string;
  libelle: string;
};

export function PiecesRegistre({
  registre,
  ligneId,
  pieces,
  peutEcrire,
}: {
  registre: RegistreAvecPieces;
  ligneId: string;
  pieces: PieceVue[];
  peutEcrire: boolean;
}) {
  const champFichier = useRef<HTMLInputElement>(null);
  const [libelle, setLibelle] = useState("");
  const [retour, setRetour] = useState<{ ok: boolean; message: string } | null>(
    null
  );
  const [enCours, demarrer] = useTransition();

  function deposer() {
    const fichier = champFichier.current?.files?.[0];
    if (!fichier) {
      setRetour({ ok: false, message: "Choisissez d'abord un fichier PDF." });
      return;
    }
    setRetour(null);
    demarrer(async () => {
      const donnees = new FormData();
      donnees.set("registre", registre);
      donnees.set("ligneId", ligneId);
      donnees.set("fichier", fichier);
      if (libelle.trim()) donnees.set("libelle", libelle.trim());
      try {
        const r = await deposerPieceRegistre(donnees);
        setRetour(r);
        if (r.ok) {
          setLibelle("");
          if (champFichier.current) champFichier.current.value = "";
        }
      } catch (err) {
        setRetour({
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  function retirer(pieceId: string, nom: string) {
    if (
      !window.confirm(
        `Retirer la pièce « ${nom} » ?\n\nLe PDF est supprimé définitivement : il n'y a pas de corbeille pour les justificatifs.`
      )
    ) {
      return;
    }
    setRetour(null);
    demarrer(async () => {
      const donnees = new FormData();
      donnees.set("registre", registre);
      donnees.set("ligneId", ligneId);
      donnees.set("pieceId", pieceId);
      try {
        setRetour(await supprimerPieceRegistre(donnees));
      } catch (err) {
        setRetour({
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  return (
    <div className="mt-2 border-t border-border pt-2">
      {pieces.length > 0 ? (
        <ul className="space-y-1">
          {pieces.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-xs">
              <Paperclip
                className="h-3 w-3 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <a
                href={`/api/tresorerie/registres/${registre}/${ligneId}/piece/${p.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-primary hover:underline"
              >
                {p.libelle || p.nom}
              </a>
              <ExternalLink
                className="h-3 w-3 shrink-0 text-muted-foreground"
                aria-hidden
              />
              {peutEcrire ? (
                <button
                  type="button"
                  title={`Retirer ${p.nom}`}
                  aria-label={`Retirer la pièce ${p.nom}`}
                  disabled={enCours}
                  onClick={() => retirer(p.id, p.nom)}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-danger"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          Aucune pièce. Attendu : {ATTENDU_PAR_REGISTRE[registre].toLowerCase()}.
        </p>
      )}

      {peutEcrire ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <input
            ref={champFichier}
            type="file"
            accept="application/pdf"
            aria-label="Pièce justificative au format PDF"
            className="max-w-56 text-xs text-muted-foreground file:mr-2 file:rounded-md file:border file:border-border file:bg-card file:px-2 file:py-1 file:text-xs file:text-foreground"
          />
          <Input
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder="Libellé (optionnel)"
            aria-label="Libellé de la pièce"
            className="h-8 w-40 text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={enCours}
            onClick={deposer}
          >
            {enCours ? "Dépôt…" : "Déposer"}
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
