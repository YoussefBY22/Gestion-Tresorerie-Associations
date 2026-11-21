"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectDb } from "@/lib/db";
import { NotificationModel } from "@/modules/core/models";

/** Marquer une de SES notifications comme lue. */
export async function marquerNotificationLue(id: string) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await connectDb();
  await NotificationModel.updateOne(
    { _id: id, destinataire: session.user.id },
    { $set: { lue: true } }
  );
  revalidatePath("/notifications");
  revalidatePath("/");
}

/** Tout marquer comme lu. */
export async function toutMarquerLu() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await connectDb();
  await NotificationModel.updateMany(
    { destinataire: session.user.id, lue: false },
    { $set: { lue: true } }
  );
  revalidatePath("/notifications");
  revalidatePath("/");
}
