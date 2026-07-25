import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A form_version's fields are grouped into sections; sections may optionally
// be grouped under a `tab` label (Metadata Model, §4: "Sections, Tabs,
// Fields..."). `tab` is a plain label rather than its own table — a form only
// needs a two-level grouping (tab -> section -> field), so a denormalized
// text column keeps the schema at the 7 tables listed in §9 instead of
// introducing an 8th. Sections with tab = null render in a single untabbed
// layout.
export const formSectionsTable = pgTable("form_sections", {
  id: serial("id").primaryKey(),
  formVersionId: integer("form_version_id").notNull(),
  tab: text("tab"),
  title: text("title").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertFormSectionSchema = createInsertSchema(formSectionsTable).omit({ id: true });
export type InsertFormSection = z.infer<typeof insertFormSectionSchema>;
export type FormSection = typeof formSectionsTable.$inferSelect;
