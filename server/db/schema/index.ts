import * as authSchema from "./auth"
import { nodes } from './node'

export const schema = {
    ...authSchema,
    nodes
}

export type SchemaType = typeof schema
