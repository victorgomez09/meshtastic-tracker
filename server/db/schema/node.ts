import { geometry, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const nodes = pgTable('mesh_nodes', {
    // Clave primaria: ID hexadecimal del nodo
    id: varchar('id', { length: 8 }).$type<string>().notNull().primaryKey(),

    // Otros campos de información
    region: varchar('region', { length: 10 }),
    shortName: varchar('short_name', { length: 10 }),
    longName: varchar('long_name', { length: 255 }),
    firmwareVersion: varchar('firmware_version', { length: 20 }),

    // Columna de Posición con PostGIS
    // Usamos 'varchar' (o cualquier tipo simple) solo como marcador de posición 
    // ya que la definición real del tipo se maneja en el SQL del esquema y la migración.
    // La clave es el tipo de datos que Drizzle espera en la aplicación (string, en este caso).
    // position: sql`geometry(Point, 4326)`, 
    position: geometry({ type: "point", srid: 4326 }),

    // Marca de tiempo
    lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
});

export const nodesCreateSchema = createInsertSchema(nodes);