import Image from "next/image";
import Link from "next/link";
import { Bell, LogOut, Search, Trash2 } from "lucide-react";
import { auth, signOut } from "@/auth";
import { connectDb } from "@/lib/db";
import { NotificationModel } from "@/modules/core/models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelecteurTheme } from "@/components/layout/selecteur-theme";
import { resoudreTheme } from "@/modules/core/services/theme";

export async function Topbar() {
  const session = await auth();
  const user = session?.user;
  const { theme, verrouille } = await resoudreTheme();

  let nonLues = 0;
  try {
    if (user?.id) {
      await connectDb();
      nonLues = await NotificationModel.countDocuments({
        destinataire: user.id,
        lue: false,
      });
    }
  } catch {
    // DB indisponible → cloche sans compteur, l'app reste utilisable.
  }

  return (
    <header className="flex h-16 items-center gap-4 border-b border-border bg-card px-6">
      <form action="/recherche" className="relative w-full max-w-sm">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          name="q"
          className="pl-9"
          placeholder="Rechercher (membres, jalons, postes…)"
          aria-label="Recherche globale"
          minLength={2}
        />
      </form>

      <div className="ml-auto flex items-center gap-3">
        {verrouille ? null : <SelecteurTheme theme={theme} />}

        {/*
          La corbeille est personnelle, pas propre à un module : chacun y
          retrouve ce qu'il a supprimé, où qu'il l'ait supprimé. Elle vit donc
          ici, à côté du thème, et non dans la barre d'un module — où seul le
          Trésorier l'aurait trouvée, et où elle aurait été à refaire pour
          chacun des dix-huit autres.
        */}
        <Link
          href="/corbeille"
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Ma corbeille"
          aria-label="Ma corbeille"
        >
          <Trash2 size={18} />
        </Link>

        <Link
          href="/notifications"
          className="relative flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-muted"
          title="Notifications"
          aria-label={`Notifications (${nonLues} non lues)`}
        >
          <Bell size={18} />
          {nonLues > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {nonLues > 99 ? "99+" : nonLues}
            </span>
          ) : null}
        </Link>

        <div className="flex items-center gap-2">
          {user?.image ? (
            <Image
              src={user.image}
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-full"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
              {(user?.name ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-medium">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <Button variant="outline" size="sm" title="Se déconnecter">
            <LogOut size={16} />
            <span className="hidden sm:inline">Déconnexion</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
