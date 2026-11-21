import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const TYPES_NOTIFICATION = [
  "info",
  "echeance",
  "validation",
  "alerte",
] as const;

/**
 * Notification in-app — story 03.1. Les notifications critiques partent
 * aussi par e-mail (story 03.2). `cle` garantit l'idempotence des rappels
 * automatiques (story 03.5) : un même rappel n'est jamais créé deux fois.
 */
const NotificationSchema = new Schema(
  {
    destinataire: {
      type: Schema.Types.ObjectId,
      ref: "Utilisateur",
      required: true,
      index: true,
    },
    titre: { type: String, required: true, trim: true },
    message: { type: String, trim: true },
    lien: { type: String, trim: true },
    type: { type: String, enum: TYPES_NOTIFICATION, default: "info" },
    critique: { type: Boolean, default: false },
    lue: { type: Boolean, default: false },
    cle: { type: String }, // idempotence des rappels automatiques
  },
  { timestamps: true, collection: "notifications" }
);

NotificationSchema.index({ cle: 1 }, { unique: true, sparse: true });
NotificationSchema.index({ destinataire: 1, lue: 1, createdAt: -1 });

export type Notification = InferSchemaType<typeof NotificationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const NotificationModel: Model<Notification> =
  (mongoose.models.Notification as Model<Notification>) ??
  mongoose.model<Notification>("Notification", NotificationSchema);
