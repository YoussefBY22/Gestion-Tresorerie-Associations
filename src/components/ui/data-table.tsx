"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, Download, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { versCsv, telechargerCsv } from "@/lib/csv";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export type ColonneTable<T> = {
  cle: string;
  libelle: string;
  rendu: (ligne: T) => React.ReactNode;
  /** Valeur comparable pour le tri par clic sur l'en-tête ; colonne non triable si absent. */
  valeurTri?: (ligne: T) => string | number | Date;
  /** Valeur texte pour l'export CSV ; par défaut on n'exporte pas la colonne. */
  valeurCsv?: (ligne: T) => string | number;
  className?: string;
};

export type FiltreTable<T> = {
  cle: string;
  libelle: string;
  options: { valeur: string; libelle: string }[];
  predicat: (ligne: T, valeur: string) => boolean;
};

/**
 * Table de données générique : recherche, filtres à facettes, tri par
 * colonne, pagination et export CSV — le socle manquant sur toutes les
 * listes de l'application (prospects, cibles, membres, factures…).
 */
export function DataTable<T>({
  lignes,
  cleLigne,
  colonnes,
  rechercheTexte,
  placeholderRecherche = "Rechercher…",
  filtres = [],
  lienLigne,
  exportCsv,
  parPage = 25,
  titreVide = "Aucun résultat",
  descriptionVide = "Aucune donnée pour l'instant.",
  icone,
}: {
  lignes: T[];
  cleLigne: (ligne: T) => string;
  colonnes: ColonneTable<T>[];
  rechercheTexte?: (ligne: T) => string;
  placeholderRecherche?: string;
  filtres?: FiltreTable<T>[];
  lienLigne?: (ligne: T) => string | undefined;
  exportCsv?: { nomFichier: string };
  parPage?: number;
  titreVide?: string;
  descriptionVide?: string;
  icone?: React.ReactNode;
}) {
  const [terme, setTerme] = useState("");
  const [valeursFiltres, setValeursFiltres] = useState<Record<string, string>>({});
  const [tri, setTri] = useState<{ cle: string; sens: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);

  const colonnesCsv = useMemo(() => colonnes.filter((c) => c.valeurCsv), [colonnes]);

  const filtrees = useMemo(() => {
    let resultat = lignes;
    if (terme.trim().length > 0 && rechercheTexte) {
      const t = terme.trim().toLowerCase();
      resultat = resultat.filter((l) => rechercheTexte(l).toLowerCase().includes(t));
    }
    for (const f of filtres) {
      const v = valeursFiltres[f.cle];
      if (v) resultat = resultat.filter((l) => f.predicat(l, v));
    }
    if (tri) {
      const colonne = colonnes.find((c) => c.cle === tri.cle);
      if (colonne?.valeurTri) {
        resultat = [...resultat].sort((a, b) => {
          const va = colonne.valeurTri!(a);
          const vb = colonne.valeurTri!(b);
          if (va < vb) return -1 * tri.sens;
          if (va > vb) return 1 * tri.sens;
          return 0;
        });
      }
    }
    return resultat;
  }, [lignes, terme, rechercheTexte, filtres, valeursFiltres, tri, colonnes]);

  const totalPages = Math.max(1, Math.ceil(filtrees.length / parPage));
  const pageBornee = Math.min(page, totalPages);
  const visibles = filtrees.slice((pageBornee - 1) * parPage, pageBornee * parPage);

  function changerFiltre(cle: string, valeur: string) {
    setValeursFiltres((prev) => ({ ...prev, [cle]: valeur }));
    setPage(1);
  }

  function changerTri(colonne: ColonneTable<T>) {
    if (!colonne.valeurTri) return;
    setTri((prev) =>
      prev?.cle === colonne.cle ? { cle: colonne.cle, sens: prev.sens === 1 ? -1 : 1 } : { cle: colonne.cle, sens: 1 }
    );
  }

  function exporter() {
    if (!exportCsv) return;
    const entetes = colonnesCsv.map((c) => c.libelle);
    const donnees = filtrees.map((l) => colonnesCsv.map((c) => c.valeurCsv!(l)));
    telechargerCsv(exportCsv.nomFichier, versCsv(entetes, donnees));
  }

  if (lignes.length === 0) {
    return <EmptyState icon={icone} title={titreVide} description={descriptionVide} />;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {rechercheTexte ? (
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={terme}
              onChange={(e) => {
                setTerme(e.target.value);
                setPage(1);
              }}
              placeholder={placeholderRecherche}
              className="pl-8"
            />
          </div>
        ) : null}
        {filtres.map((f) => (
          <select
            key={f.cle}
            value={valeursFiltres[f.cle] ?? ""}
            onChange={(e) => changerFiltre(f.cle, e.target.value)}
            className="h-10 rounded-md border border-border bg-card px-2 text-sm text-foreground"
          >
            <option value="">{f.libelle} — tous</option>
            {f.options.map((o) => (
              <option key={o.valeur} value={o.valeur}>
                {o.libelle}
              </option>
            ))}
          </select>
        ))}
        <span className="text-xs text-muted-foreground">
          {filtrees.length} / {lignes.length}
        </span>
        {exportCsv ? (
          <Button type="button" variant="outline" size="sm" onClick={exporter} className="ml-auto">
            <Download size={14} /> Exporter CSV
          </Button>
        ) : null}
      </div>

      {filtrees.length === 0 ? (
        <EmptyState
          icon={icone}
          title="Aucun résultat"
          description="Aucune ligne ne correspond à la recherche ou aux filtres."
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  {colonnes.map((c) => (
                    <th key={c.cle} className={cn("py-2 pr-3 font-medium", c.className)}>
                      {c.valeurTri ? (
                        <button
                          type="button"
                          onClick={() => changerTri(c)}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          {c.libelle}
                          <ArrowUpDown size={12} className={tri?.cle === c.cle ? "text-primary" : "opacity-40"} />
                        </button>
                      ) : (
                        c.libelle
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map((ligne) => {
                  const href = lienLigne?.(ligne);
                  return (
                    <tr key={cleLigne(ligne)} className="border-b border-border/60 hover:bg-muted/40">
                      {colonnes.map((c, i) => (
                        <td key={c.cle} className={cn("py-2 pr-3", c.className)}>
                          {i === 0 && href ? (
                            <Link href={href} className="font-medium text-primary hover:underline">
                              {c.rendu(ligne)}
                            </Link>
                          ) : (
                            c.rendu(ligne)
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Page {pageBornee} / {totalPages} — {filtrees.length} résultat(s)
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pageBornee <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Précédent
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pageBornee >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Suivant
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
