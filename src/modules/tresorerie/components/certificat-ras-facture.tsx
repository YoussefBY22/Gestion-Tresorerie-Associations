"use client";

import { useState, useTransition } from "react";
import { ExternalLink, ReceiptText } from "lucide-react";
import { emettreCertificatRAS } from "@/modules/tresorerie/actions/certificats-ras";
import { detailRetenue } from "@/modules/tresorerie/services/certificat-ras";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Établir le certificat de retenue d'une facture reçue.
 *
 * La retenue était calculée et déclarée depuis le début, mais le prestataire
 * n'en recevait aucune preuve : il ne pouvait donc pas l'imputer sur son
 * propre impôt. L'écran annonce le montant retenu **avant** le clic, et la
 * date de règlement se corrige — c'est elle qui déclenche la retenue, pas la
 * date de la facture.
 *
 * Le refus est rendu, pas levé : c'est lui qui dit, par exemple, que le type
 * de prestataire manque sur la facture. Et le compte rendu s'affiche dans
 * **tous** les états du composant : une fois le certificat établi, la page se
 * revalide et la ligne change de forme — sans cela le message disparaîtrait
 * au moment même où il a quelque chose à dire.
 */

export type FacturePourCertificat = {
  id: string;
  reference: string;
  fournisseur: string;
  montantTTC: number;
  typePrestataire?: string | null;
  /** Date de la facture, au format AAAA-MM-JJ, proposée par défaut. */
  date: string;
  /** Certificat déjà établi, le cas échéant. */
  certificat: { id: string; reference: string } | null;
};

function dt(montant: number): string {
  return `${montant.toFixed(3).replace(".", ",")} DT`;
}

export function CertificatRasFacture({
  facture,
  peutEcrire,
}: {
  facture: FacturePourCertificat;
  peutEcrire: boolean;
}) {
  const [date, setDate] = useState(facture.date);
  const [ouvert, setOuvert] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; message: string } | null>(
    null
  );
  const [enCours, demarrer] = useTransition();

  const detail = detailRetenue({
    montantTTC: facture.montantTTC,
    typePrestataire: facture.typePrestataire,
  });

  const emis = facture.certificat;

  const message = retour ? (
    <p
      role="status"
      className={`w-full rounded-md px-2 py-1.5 text-xs ${
        retour.ok
          ? "bg-success/10 text-success"
          : "border border-danger/40 bg-danger/5 text-danger"
      }`}
    >
      {retour.message}
    </p>
  ) : null;

  function envoyer() {
    setRetour(null);
    demarrer(async () => {
      const donnees = new FormData();
      donnees.set("factureId", facture.id);
      donnees.set("dateReglement", date);
      try {
        const r = await emettreCertificatRAS(donnees);
        setRetour(r);
        if (r.ok) setOuvert(false);
      } catch (err) {
        setRetour({
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  if (emis) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          Retenue {dt(detail.retenue)} ·{" "}
          <span className="font-mono">{emis.reference}</span>
        </span>
        <a
          href={`/api/documents/${emis.id}/fichier`}
          target="_blank"
          rel="noopener noreferrer"
          title={`Ouvrir le certificat ${emis.reference}`}
          className="text-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
        {message}
      </div>
    );
  }

  if (!peutEcrire) {
    return (
      <span className="text-xs text-muted-foreground">
        Retenue {dt(detail.retenue)} — certificat non établi
      </span>
    );
  }

  if (!ouvert) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-warning">
          Retenue {dt(detail.retenue)} — certificat dû au prestataire
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setOuvert(true)}
        >
          <ReceiptText className="mr-1 h-3.5 w-3.5" aria-hidden />
          Établir
        </Button>
        {message}
      </div>
    );
  }

  return (
    <div className="w-full rounded-md border border-dashed border-border p-2">
      <p className="text-xs text-muted-foreground">
        Assiette {dt(detail.assiette)} ·{" "}
        {String(detail.tauxPourcent).replace(".", ",")} % ·{" "}
        <span className="font-semibold text-foreground">
          retenue {dt(detail.retenue)}
        </span>{" "}
        · net versé {dt(detail.netVerse)}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted-foreground">
          Réglée le{" "}
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label={`Date de règlement de ${facture.reference}`}
            className="ml-1 inline-flex h-8 w-36 text-xs"
          />
        </label>
        <Button
          type="button"
          size="sm"
          className="h-8 text-xs"
          disabled={enCours || !date}
          onClick={envoyer}
        >
          {enCours ? "Établissement…" : "Établir le certificat"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          onClick={() => setOuvert(false)}
        >
          Annuler
        </Button>
      </div>

      {message ? <div className="mt-2">{message}</div> : null}
    </div>
  );
}
