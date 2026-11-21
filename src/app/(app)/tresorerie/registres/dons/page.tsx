import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Gift } from "lucide-react";
import type { Types } from "mongoose";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { exigerModuleActif } from "@/lib/autorisation";
import { MandatModel } from "@/modules/core/models";
import {
  DonModel,
  LIBELLES_NATURE_DON,
  LIBELLES_ORIGINE_DON,
  LIBELLES_PROVENANCE_DON,
  NATURES_DON,
  ORIGINES_DON,
  PROVENANCES_DON,
} from "@/modules/tresorerie/models";
import { enregistrerDon } from "@/modules/tresorerie/actions/registres";
import {
  ListeDons,
  type LigneDon,
} from "@/modules/tresorerie/components/liste-dons";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlerteDb } from "@/components/ui/alerte-db";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const df = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

/**
 * Registre des aides, dons, donations et legs — décret-loi 2011-88. Le CIN
 * du donateur doit figurer sur le reçu ; c'est ce que l'audit relevait
 * comme manquant.
 */
export default async function RegistreDonsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  await exigerModuleActif("tresorerie");
  const peutEcrire = can(session.user.roles, "tresorerie", "ecrire");

  let erreurDb: string | undefined;
  let lignes: LigneDon[] = [];

  try {
    await connectDb();
    const mandat: { _id: Types.ObjectId } | null = await MandatModel.findOne({
      statut: "ACTIF",
    })
      .select("_id")
      .lean();

    if (mandat) {
      lignes = (
        await DonModel.find({ mandat: mandat._id }).sort({ date: -1 }).lean()
      ).map((d) => ({
        id: String(d._id),
        donateur: d.donateur,
        cin: d.cin ?? "",
        nature: d.nature,
        montant: d.montant ?? null,
        descriptionNature: d.descriptionNature ?? "",
        origine: d.origine,
        provenance: d.provenance,
        date: df.format(new Date(d.date)),
        dateISO: new Date(d.date).toISOString().slice(0, 10),
        objet: d.objet ?? "",
        pieces: (d.justificatifs ?? []).map((j) => ({
          id: String(j._id),
          nom: j.nomFichier ?? "Pièce",
          libelle: j.libelle ?? "",
        })),
      }));
    }
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  const sansCin = lignes.filter((l) => l.nature === "NUMERAIRE" && !l.cin).length;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Registre des dons"
        description="Aides, dons, donations et legs — en numéraire ou en nature, d'origine publique ou privée, nationale ou étrangère."
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
              <CardTitle>{lignes.length} don(s)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {sansCin > 0 ? (
                <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                  {sansCin} don(s) en numéraire sans CIN — le reçu doit pourtant le
                  porter (décret-loi 2011-88).
                </p>
              ) : null}
              {lignes.length === 0 ? (
                <EmptyState icon={<Gift size={28} />} title="Aucun don enregistré" />
              ) : (
                <ListeDons
                  lignes={lignes}
                  peutEcrire={peutEcrire}
                  options={{
                    natures: NATURES_DON,
                    libellesNature: LIBELLES_NATURE_DON,
                    origines: ORIGINES_DON,
                    libellesOrigine: LIBELLES_ORIGINE_DON,
                    provenances: PROVENANCES_DON,
                    libellesProvenance: LIBELLES_PROVENANCE_DON,
                  }}
                />
              )}
            </CardContent>
          </Card>

          {peutEcrire ? (
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Nouveau don</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={enregistrerDon} className="space-y-3">
                  <Input name="donateur" required minLength={2} placeholder="Donateur *" />
                  <Input name="cin" placeholder="CIN (obligatoire si numéraire, personne physique)" />
                  <label className="block text-sm">
                    Nature
                    <select
                      name="nature"
                      className="mt-1 flex h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
                    >
                      {NATURES_DON.map((n) => (
                        <option key={n} value={n}>
                          {LIBELLES_NATURE_DON[n]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Input name="montant" type="number" min={0} step="0.001" placeholder="Montant (DT, si numéraire)" />
                  <Input name="descriptionNature" placeholder="Description du bien (si en nature)" />
                  <label className="block text-sm">
                    Origine
                    <select
                      name="origine"
                      className="mt-1 flex h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
                    >
                      {ORIGINES_DON.map((o) => (
                        <option key={o} value={o}>
                          {LIBELLES_ORIGINE_DON[o]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    Provenance
                    <select
                      name="provenance"
                      className="mt-1 flex h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
                    >
                      {PROVENANCES_DON.map((p) => (
                        <option key={p} value={p}>
                          {LIBELLES_PROVENANCE_DON[p]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    Date
                    <Input name="date" type="date" required className="mt-1" />
                  </label>
                  <Input name="objet" placeholder="Objet du don" />
                  <Button type="submit" className="w-full">
                    Enregistrer
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
