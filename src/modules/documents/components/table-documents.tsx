"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  DataTable,
  type ColonneTable,
  type FiltreTable,
} from "@/components/ui/data-table";
import {
  LIBELLES_CATEGORIE_DOCUMENT,
  LIBELLES_STATUT_DOCUMENT,
  type CategorieDocument,
  type StatutDocument,
} from "@/modules/documents/constantes";

/**
 * ADR-009 : les colonnes portent des fonctions de rendu, donc la table doit
 * être un composant client à part ; la page serveur ne passe que des lignes
 * sérialisables (pas de Date, pas d'ObjectId, pas de sous-document Mongoose).
 */
export type DocumentLigne = {
  id: string;
  reference: string;
  titre: string;
  modele: string;
  modeleLibelle: string;
  categorie: CategorieDocument;
  statut: StatutDocument;
  emisLe: string;
  emisLeTri: number;
  emisPar: string | null;
  taille: string;
};

const badgeStatut: Record<
  StatutDocument,
  "success" | "muted" | "warning" | "danger" | "outline"
> = {
  BROUILLON: "muted",
  EMIS: "outline",
  A_SIGNER: "warning",
  SIGNE: "success",
  ANNULE: "danger",
};

export function TableDocuments({ documents }: { documents: DocumentLigne[] }) {
  const colonnes: ColonneTable<DocumentLigne>[] = [
    {
      cle: "reference",
      libelle: "Référence",
      valeurTri: (d) => d.reference,
      valeurCsv: (d) => d.reference,
      rendu: (d) => (
        <Link
          href={`/documents/${d.id}`}
          className="font-mono text-xs font-semibold text-primary hover:underline"
        >
          {d.reference}
        </Link>
      ),
    },
    {
      cle: "titre",
      libelle: "Document",
      valeurTri: (d) => d.titre,
      valeurCsv: (d) => d.titre,
      rendu: (d) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{d.titre}</p>
          <p className="truncate text-xs text-muted-foreground">
            {d.modeleLibelle}
          </p>
        </div>
      ),
    },
    {
      cle: "categorie",
      libelle: "Catégorie",
      valeurTri: (d) => d.categorie,
      valeurCsv: (d) => LIBELLES_CATEGORIE_DOCUMENT[d.categorie],
      rendu: (d) => (
        <Badge variant="outline">{LIBELLES_CATEGORIE_DOCUMENT[d.categorie]}</Badge>
      ),
    },
    {
      cle: "statut",
      libelle: "Statut",
      valeurTri: (d) => d.statut,
      valeurCsv: (d) => LIBELLES_STATUT_DOCUMENT[d.statut],
      rendu: (d) => (
        <Badge variant={badgeStatut[d.statut]}>
          {LIBELLES_STATUT_DOCUMENT[d.statut]}
        </Badge>
      ),
    },
    {
      cle: "emisLe",
      libelle: "Émis le",
      valeurTri: (d) => d.emisLeTri,
      valeurCsv: (d) => d.emisLe,
      rendu: (d) => (
        <div>
          <p className="text-sm">{d.emisLe}</p>
          {d.emisPar ? (
            <p className="text-xs text-muted-foreground">{d.emisPar}</p>
          ) : null}
        </div>
      ),
    },
    {
      cle: "fichier",
      libelle: "PDF",
      className: "text-right",
      valeurCsv: (d) => d.taille,
      rendu: (d) => (
        <a
          href={`/api/documents/${d.id}/fichier`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline"
        >
          Ouvrir · {d.taille}
        </a>
      ),
    },
  ];

  const categories = Array.from(new Set(documents.map((d) => d.categorie)));
  const statuts = Array.from(new Set(documents.map((d) => d.statut)));

  const filtres: FiltreTable<DocumentLigne>[] = [
    {
      cle: "categorie",
      libelle: "Catégorie",
      options: categories.map((c) => ({
        valeur: c,
        libelle: LIBELLES_CATEGORIE_DOCUMENT[c],
      })),
      predicat: (d, v) => d.categorie === v,
    },
    {
      cle: "statut",
      libelle: "Statut",
      options: statuts.map((s) => ({
        valeur: s,
        libelle: LIBELLES_STATUT_DOCUMENT[s],
      })),
      predicat: (d, v) => d.statut === v,
    },
  ];

  return (
    <DataTable
      lignes={documents}
      cleLigne={(d) => d.id}
      colonnes={colonnes}
      rechercheTexte={(d) => `${d.reference} ${d.titre} ${d.modeleLibelle}`}
      placeholderRecherche="Rechercher une référence, un titre…"
      filtres={filtres}
      exportCsv={{ nomFichier: "documents" }}
      icone={<FileText className="h-6 w-6" />}
      titreVide="Aucun document émis"
      descriptionVide="Les documents produits par l'application apparaîtront ici, avec leur référence normalisée."
    />
  );
}
