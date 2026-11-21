"use client";

import { useState } from "react";
import {
  Check,
  FileDown,
  FileText,
  Pencil,
  Receipt,
  Trash2,
  X,
} from "lucide-react";
import {
  modifierFacture,
  supprimerFacture,
} from "@/modules/tresorerie/actions/tresorerie";
import { emettreFacturePdf } from "@/modules/tresorerie/actions/recus";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DataTable, type ColonneTable, type FiltreTable } from "@/components/ui/data-table";

export type FactureLigne = {
  id: string;
  numero: string;
  projet: string;
  montantHT: number;
  tauxTVA: number;
  timbreFiscal: number;
  ttc: number;
  emission: string;
  echeance: string;
  echeanceISO: string;
  statut: string;
  enRetard: boolean;
  /** Identifiant du PDF émis, s'il existe — le rend consultable. */
  documentId: string | null;
};

export function TableFactures({
  factures,
  peutEcrire,
}: {
  factures: FactureLigne[];
  peutEcrire: boolean;
}) {
  const colonnes: ColonneTable<FactureLigne>[] = [
    {
      cle: "numero",
      libelle: "N°",
      valeurTri: (f) => f.numero,
      valeurCsv: (f) => f.numero,
      rendu: (f) => <span className="font-medium">{f.numero}</span>,
    },
    {
      cle: "projet",
      libelle: "Projet",
      valeurTri: (f) => f.projet,
      valeurCsv: (f) => f.projet,
      rendu: (f) => <span>{f.projet}</span>,
    },
    {
      cle: "montantHT",
      libelle: "Montant HT",
      valeurTri: (f) => f.montantHT,
      valeurCsv: (f) => f.montantHT,
      rendu: (f) => (
        <span className="tabular-nums">{f.montantHT.toLocaleString("fr-FR")} DT</span>
      ),
    },
    {
      cle: "tva",
      libelle: "TVA",
      valeurCsv: (f) => `${f.tauxTVA} %`,
      rendu: (f) => <span className="text-muted-foreground">{f.tauxTVA} %</span>,
    },
    {
      cle: "ttc",
      libelle: "TTC",
      valeurTri: (f) => f.ttc,
      valeurCsv: (f) => f.ttc,
      rendu: (f) => <span className="tabular-nums">{f.ttc.toLocaleString("fr-FR")} DT</span>,
    },
    {
      cle: "echeance",
      libelle: "Échéance",
      valeurTri: (f) => f.echeanceISO,
      valeurCsv: (f) => f.echeance,
      rendu: (f) => <span className="text-muted-foreground">{f.echeance}</span>,
    },
    {
      cle: "statut",
      libelle: "Statut",
      valeurTri: (f) => f.statut,
      valeurCsv: (f) => (f.statut === "PAYEE" ? "Payée" : f.enRetard ? "En retard" : "Émise"),
      rendu: (f) =>
        f.statut === "PAYEE" ? (
          <Badge variant="success">Payée</Badge>
        ) : f.enRetard ? (
          <Badge variant="danger">En retard</Badge>
        ) : (
          <Badge variant="warning">Émise</Badge>
        ),
    },
    {
      cle: "actions",
      libelle: "",
      rendu: (f) => <ActionsFacture facture={f} peutEcrire={peutEcrire} />,
    },
  ];

  const filtres: FiltreTable<FactureLigne>[] = [
    {
      cle: "statut",
      libelle: "Statut",
      options: [
        { valeur: "PAYEE", libelle: "Payée" },
        { valeur: "EMISE", libelle: "Émise" },
        { valeur: "RETARD", libelle: "En retard" },
      ],
      predicat: (f, v) => (v === "RETARD" ? f.enRetard : f.statut === v),
    },
  ];

  return (
    <DataTable
      lignes={factures}
      cleLigne={(f) => f.id}
      colonnes={colonnes}
      rechercheTexte={(f) => `${f.numero} ${f.projet}`}
      placeholderRecherche="Rechercher un numéro, un projet…"
      filtres={filtres}
      exportCsv={{ nomFichier: "factures.csv" }}
      titreVide="Aucune facture"
      descriptionVide="Émettez la première facture depuis un projet."
      icone={<Receipt size={28} />}
    />
  );
}

/**
 * Actions d'une facture, en icônes : voir le PDF (ou l'émettre s'il n'existe
 * pas encore), corriger, supprimer. Discrètes tant que la ligne n'est pas
 * survolée — une liste de factures se lit d'abord, elle s'actionne ensuite.
 */
function ActionsFacture({
  facture,
  peutEcrire,
}: {
  facture: FactureLigne;
  peutEcrire: boolean;
}) {
  const [enEdition, setEnEdition] = useState(false);
  const reglee = facture.statut === "PAYEE";

  if (enEdition) {
    return (
      <form
        action={async (donnees) => {
          await modifierFacture(donnees);
          setEnEdition(false);
        }}
        className="flex flex-wrap items-center gap-1"
      >
        <input type="hidden" name="factureId" value={facture.id} />
        <Input
          name="montantHT"
          type="number"
          step="0.001"
          min="0.001"
          defaultValue={facture.montantHT}
          required
          aria-label="Montant HT"
          className="h-8 w-28 text-right text-xs"
        />
        <Input
          name="tauxTVA"
          type="number"
          min="0"
          max="100"
          defaultValue={facture.tauxTVA}
          aria-label="Taux de TVA"
          className="h-8 w-16 text-right text-xs"
        />
        <Input
          name="timbreFiscal"
          type="number"
          step="0.001"
          min="0"
          defaultValue={facture.timbreFiscal}
          aria-label="Timbre fiscal"
          className="h-8 w-20 text-right text-xs"
        />
        <Input
          name="echeance"
          type="date"
          defaultValue={facture.echeanceISO.slice(0, 10)}
          required
          aria-label="Échéance"
          className="h-8 w-36 text-xs"
        />
        <button
          type="submit"
          title="Enregistrer"
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
      </form>
    );
  }

  return (
    <div className="flex items-center justify-end gap-0.5">
      {facture.documentId ? (
        <a
          href={`/api/documents/${facture.documentId}/fichier`}
          target="_blank"
          rel="noopener noreferrer"
          title="Ouvrir le PDF de la facture"
          aria-label={`Ouvrir le PDF de la facture ${facture.numero}`}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"
        >
          <FileText size={14} />
        </a>
      ) : peutEcrire ? (
        <form action={emettreFacturePdf}>
          <input type="hidden" name="factureId" value={facture.id} />
          <button
            type="submit"
            title="Éditer le PDF de la facture"
            aria-label={`Éditer le PDF de la facture ${facture.numero}`}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"
          >
            <FileDown size={14} />
          </button>
        </form>
      ) : null}

      {peutEcrire && !reglee ? (
        <>
          <button
            type="button"
            title="Corriger cette facture"
            aria-label={`Corriger la facture ${facture.numero}`}
            onClick={() => setEnEdition(true)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil size={14} />
          </button>
          <form
            action={supprimerFacture}
            onSubmit={(e) => {
              if (
                !window.confirm(
                  `Supprimer la facture ${facture.numero} (${facture.montantHT.toLocaleString("fr-FR")} DT HT) ?\n\nElle part à la corbeille de la trésorerie et reste restaurable 30 jours. Son numéro, lui, reste consommé.`
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="factureId" value={facture.id} />
            <button
              type="submit"
              title="Supprimer cette facture"
              aria-label={`Supprimer la facture ${facture.numero}`}
              className="rounded p-1.5 text-danger hover:bg-danger/10"
            >
              <Trash2 size={14} />
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}
