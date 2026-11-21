import { connectDb } from "@/lib/db";
import { UtilisateurModel } from "@/modules/core/models";
import { rolesAttribuables } from "@/modules/core/rbac";
import {
  creerUtilisateur,
  basculerActifUtilisateur,
  majRolesUtilisateur,
  definirMotDePasse,
} from "@/modules/core/actions/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlerteDb } from "@/components/ui/alerte-db";
import { FormulaireAction } from "@/components/ui/formulaire-action";

export const dynamic = "force-dynamic";

/**
 * Comptes d'accès.
 *
 * Trois gestes, et pas un de plus : ouvrir un accès, le retirer, changer ce
 * qu'une personne peut faire. Le bureau d'une association change tous les
 * ans ; cet écran doit se comprendre sans mode d'emploi.
 *
 * Un compte n'est jamais supprimé, seulement désactivé : le journal
 * d'activité doit continuer de nommer l'auteur d'une écriture longtemps
 * après son départ, sinon la piste d'audit devient anonyme.
 */
export default async function UtilisateursPage() {
  let utilisateurs:
    | {
        _id: unknown;
        nom: string;
        email: string;
        roles: string[];
        actif: boolean;
        dernierAcces?: Date | null;
      }[]
    | undefined = undefined;
  let erreurDb: string | undefined;
  try {
    await connectDb();
    utilisateurs = await UtilisateurModel.find().sort({ createdAt: -1 }).lean();
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  const roles = rolesAttribuables();
  const df = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

  return (
    <div>
      <PageHeader
        title="Comptes"
        description="Qui peut ouvrir l'application, et ce qu'il peut y faire. Seuls les comptes actifs peuvent se connecter."
      />

      {erreurDb ? (
        <AlerteDb erreur={erreurDb} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{utilisateurs?.length ?? 0} compte(s)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Nom</th>
                    <th className="py-2 pr-3 font-medium">E-mail</th>
                    <th className="py-2 pr-3 font-medium">Rôles</th>
                    <th className="py-2 pr-3 font-medium">Statut</th>
                    <th className="py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {utilisateurs?.map((u) => (
                    <tr
                      key={String(u._id)}
                      className="border-b border-border/60 align-top"
                    >
                      <td className="py-2 pr-3 font-medium">{u.nom}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {u.email}
                        <span className="block text-xs">
                          {u.dernierAcces
                            ? "vu le " + df.format(new Date(u.dernierAcces))
                            : "jamais connecté"}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((r: string) => (
                            <Badge key={r} variant="outline">
                              {r}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        {u.actif ? (
                          <Badge variant="success">Actif</Badge>
                        ) : (
                          <Badge variant="danger">Désactivé</Badge>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-col gap-1">
                          <FormulaireAction
                            action={basculerActifUtilisateur}
                            confirmation={
                              u.actif
                                ? "Retirer l'accès de " +
                                  u.email +
                                  " ? Ses écritures restent au journal."
                                : "Rendre l'accès à " + u.email + " ?"
                            }
                          >
                            <input
                              type="hidden"
                              name="id"
                              value={String(u._id)}
                            />
                            <Button variant="outline" size="sm" type="submit">
                              {u.actif ? "Désactiver" : "Réactiver"}
                            </Button>
                          </FormulaireAction>

                          <details>
                            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                              Changer les rôles
                            </summary>
                            <FormulaireAction
                              action={majRolesUtilisateur}
                              className="mt-1 space-y-1"
                            >
                              <input
                                type="hidden"
                                name="id"
                                value={String(u._id)}
                              />
                              {roles.map((r) => (
                                <label
                                  key={r.code}
                                  className="flex items-start gap-2 text-xs"
                                  title={r.description}
                                >
                                  <input
                                    type="checkbox"
                                    name="roles"
                                    value={r.code}
                                    defaultChecked={u.roles.includes(r.code)}
                                    className="mt-0.5 accent-primary"
                                  />
                                  <span>{r.libelle}</span>
                                </label>
                              ))}
                              <Button size="sm" type="submit" className="mt-1">
                                Enregistrer
                              </Button>
                            </FormulaireAction>
                          </details>

                          <details>
                            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                              Redéfinir le mot de passe
                            </summary>
                            <FormulaireAction
                              action={definirMotDePasse}
                              className="mt-1 flex gap-1"
                            >
                              <input
                                type="hidden"
                                name="id"
                                value={String(u._id)}
                              />
                              <Input
                                name="motDePasse"
                                type="password"
                                minLength={12}
                                required
                                placeholder="≥ 12 caractères"
                                className="h-8 text-xs"
                              />
                              <Button size="sm" type="submit">
                                OK
                              </Button>
                            </FormulaireAction>
                          </details>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Nouveau compte</CardTitle>
            </CardHeader>
            <CardContent>
              <FormulaireAction action={creerUtilisateur} className="space-y-3">
                <Input
                  name="nom"
                  required
                  minLength={2}
                  placeholder="Nom complet"
                />
                <Input
                  name="email"
                  type="email"
                  required
                  placeholder="prenom.nom@exemple.org"
                />
                <Input
                  name="motDePasse"
                  type="password"
                  required
                  minLength={12}
                  placeholder="Mot de passe provisoire (≥ 12 caractères)"
                />
                <fieldset className="space-y-1">
                  <legend className="mb-1 text-sm font-medium">Rôles</legend>
                  <div className="space-y-1 rounded-md border border-border p-2">
                    {roles.map((r) => (
                      <label
                        key={r.code}
                        className="flex items-start gap-2 text-sm"
                        title={r.description}
                      >
                        <input
                          type="checkbox"
                          name="roles"
                          value={r.code}
                          defaultChecked={r.code === "LECTEUR"}
                          className="mt-0.5 accent-primary"
                        />
                        <span>
                          {r.libelle}
                          <span className="block text-xs text-muted-foreground">
                            {r.description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Button type="submit" className="w-full">
                  Créer le compte
                </Button>
                <p className="text-xs text-muted-foreground">
                  Transmettez le mot de passe par un autre canal que
                  l&apos;application, et demandez à la personne de le changer.
                  Il n&apos;est stocké que haché : personne, pas même vous, ne
                  peut le relire ici.
                </p>
              </FormulaireAction>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
