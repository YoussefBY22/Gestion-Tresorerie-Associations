import { redirect } from "next/navigation";
import { FileCheck2, FilePlus2, FileText, Library } from "lucide-react";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { exigerModuleActif } from "@/lib/autorisation";
import { MandatModel } from "@/modules/core/models";
import { DocumentModel } from "@/modules/documents/models";
import { MODELES_PAR_CODE, MODELES_DISPONIBLES } from "@/modules/documents/catalogue";
import { NavDocuments } from "@/modules/documents/components/nav-documents";
import {
  TableDocuments,
  type DocumentLigne,
} from "@/modules/documents/components/table-documents";
import type { CategorieDocument, StatutDocument } from "@/modules/documents/constantes";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { AlerteDb } from "@/components/ui/alerte-db";

export const dynamic = "force-dynamic";

function formaterTaille(octets: number): string {
  if (!octets) return "—";
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

export default async function DocumentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "documents", "lire")) redirect("/");
  await exigerModuleActif("documents");

  let erreurDb: string | undefined;
  let documents: DocumentLigne[] = [];
  let annee = "";

  try {
    await connectDb();
    const mandat = await MandatModel.findOne({ statut: "ACTIF" })
      .select("_id annee")
      .lean();
    annee = mandat?.annee ?? "";

    if (mandat) {
      const bruts = await DocumentModel.find({ mandat: mandat._id })
        .sort({ emisLe: -1 })
        .limit(500)
        .lean();

      documents = bruts.map((d) => ({
        id: String(d._id),
        reference: d.reference,
        titre: d.titre,
        modele: d.modele,
        modeleLibelle: MODELES_PAR_CODE[d.modele]?.libelle ?? d.modele,
        categorie: d.categorie as CategorieDocument,
        statut: d.statut as StatutDocument,
        emisLe: d.emisLe ? new Date(d.emisLe).toLocaleDateString("fr-FR") : "—",
        emisLeTri: d.emisLe ? new Date(d.emisLe).getTime() : 0,
        emisPar: d.emisParNom ?? null,
        taille: formaterTaille(d.tailleOctets ?? 0),
      }));
    }
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  const signes = documents.filter((d) => d.statut === "SIGNE").length;
  const annules = documents.filter((d) => d.statut === "ANNULE").length;

  return (
    <div>
      <PageHeader
        title="Bibliothèque documentaire"
        description={
          annee
            ? `Documents produits par l'application pour le mandat ${annee}. Chaque pièce porte une référence normalisée et son PDF est stocké dans l'application — plus aucun fichier à gérer à la main.`
            : "Documents produits par l'application."
        }
      />
      <NavDocuments actif="/documents" />

      {erreurDb ? (
        <AlerteDb erreur={erreurDb} />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Documents émis"
              value={documents.length}
              hint={annee ? `Mandat ${annee}` : undefined}
              icon={<FileText className="h-5 w-5" />}
            />
            <StatCard
              label="Validés / signés"
              value={signes}
              icon={<FileCheck2 className="h-5 w-5" />}
            />
            <StatCard
              label="Annulés"
              value={annules}
              hint="Référence conservée (piste d'audit)"
              icon={<FilePlus2 className="h-5 w-5" />}
            />
            <StatCard
              label="Modèles disponibles"
              value={MODELES_DISPONIBLES.length}
              hint="Voir le catalogue"
              icon={<Library className="h-5 w-5" />}
            />
          </div>

          <TableDocuments documents={documents} />
        </>
      )}
    </div>
  );
}
