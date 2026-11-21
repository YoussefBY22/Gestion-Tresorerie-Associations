import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { exigerModuleActif } from "@/lib/autorisation";
import { FournisseurModel, FactureFournisseurModel } from "@/modules/tresorerie/models";
import { creerFournisseur } from "@/modules/tresorerie/actions/registres";
import {
  ListeFournisseurs,
  type LigneFournisseur,
} from "@/modules/tresorerie/components/liste-fournisseurs";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlerteDb } from "@/components/ui/alerte-db";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const df = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

/**
 * Registre des fournisseurs — répond au constat d'audit sur la vérification
 * de la matricule fiscale non formalisée avant tout engagement.
 */
export default async function RegistreFournisseursPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  await exigerModuleActif("tresorerie");
  const peutEcrire = can(session.user.roles, "tresorerie", "ecrire");

  let erreurDb: string | undefined;
  let lignes: LigneFournisseur[] = [];

  try {
    await connectDb();
    const fournisseurs = await FournisseurModel.find().sort({ nom: 1 }).lean();
    const dernieres = await FactureFournisseurModel.aggregate([
      {
        $group: {
          _id: "$fournisseur",
          derniere: { $max: "$date" },
          total: { $sum: 1 },
        },
      },
    ]);
    const facturesParNom = new Map(
      dernieres.map((d: { _id: string; derniere: Date; total: number }) => [
        d._id,
        d,
      ])
    );

    lignes = fournisseurs.map((f) => {
      const factures = facturesParNom.get(f.nom);
      return {
        id: String(f._id),
        nom: f.nom,
        adresse: f.adresse ?? "",
        matriculeFiscal: f.matriculeFiscal ?? "",
        verifie: Boolean(f.verifie),
        naturePrestation: f.naturePrestation ?? "",
        evaluation: f.evaluation ?? null,
        derniereCollaboration: factures?.derniere
          ? df.format(new Date(factures.derniere))
          : "aucune facture reçue",
        // Sert à prévenir avant de cliquer : une fiche qui a déjà engagé la
        // JE ne se supprime pas, et le dire après coup serait tardif.
        nbFactures: factures?.total ?? 0,
        pieces: (f.justificatifs ?? []).map((j) => ({
          id: String(j._id),
          nom: j.nomFichier ?? "Pièce",
          libelle: j.libelle ?? "",
        })),
      };
    });
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Registre des fournisseurs"
        description="Matricule fiscal vérifié avant tout engagement — la dernière collaboration se déduit des factures reçues."
        actions={
          <Link href="/tresorerie/registres">
            <Button size="sm">
              <ArrowLeft size={14} /> Registres
            </Button>
          </Link>
        }
      />
      <NavTresorerie actif="/tresorerie/registres" />

      {erreurDb ? (
        <AlerteDb erreur={erreurDb} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{lignes.length} fournisseur(s)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {lignes.length === 0 ? (
                <EmptyState icon={<Building2 size={28} />} title="Aucun fournisseur enregistré" />
              ) : (
                <ListeFournisseurs lignes={lignes} peutEcrire={peutEcrire} />
              )}
            </CardContent>
          </Card>

          {peutEcrire ? (
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Nouveau fournisseur</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={creerFournisseur} className="space-y-3">
                  <Input name="nom" required minLength={2} placeholder="Nom *" />
                  <Input name="matriculeFiscal" placeholder="Matricule fiscal" />
                  <Input name="naturePrestation" placeholder="Nature de la prestation" />
                  <Input name="adresse" placeholder="Adresse" />
                  <Button type="submit" className="w-full">
                    Ajouter
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
